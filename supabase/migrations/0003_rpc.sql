-- Server-authoritative game logic (ITO_PLAN §4.4).
-- Every client action is one of these security-definer RPCs, running in a single transaction.
-- Errors are raised as short codes (e.g. 'not_host'); the client maps them to Thai messages.

-- ---------------------------------------------------------------- helpers

create or replace function public._me() returns uuid
language plpgsql stable as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  return uid;
end $$;

create or replace function public._palette() returns text[]
language sql immutable as $$
  select array['#E0393E','#F08C2E','#E9B92F','#5BAE4C','#2BA5A0','#3C7DD9','#7A5AD8','#D15BA8','#8B6A4F','#4A4A4A']
$$;

-- Uniform-enough random int in [0, n) from a CSPRNG (bias < 1e-17 for small n).
create or replace function public._rand_int(n int) returns int
language sql volatile set search_path = public, extensions as $$
  select ((('x' || encode(gen_random_bytes(7), 'hex'))::bit(56)::bigint) % n)::int
$$;

create or replace function public._gen_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ'; -- no I, O
  code text := '';
begin
  for i in 1..4 loop
    code := code || substr(alphabet, public._rand_int(24) + 1, 1);
  end loop;
  return code;
end $$;

create or replace function public._clean_name(p_name text) returns text
language plpgsql immutable as $$
declare
  v text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 16);
begin
  v := btrim(v);
  if v = '' then
    raise exception 'invalid_name';
  end if;
  return v;
end $$;

create or replace function public._lock_room(p_room uuid) returns rooms
language plpgsql as $$
declare
  r rooms;
begin
  select * into r from rooms where id = p_room for update;
  if not found then
    raise exception 'room_not_found';
  end if;
  return r;
end $$;

-- The caller's player row (left players excluded).
create or replace function public._my_player(p_room uuid) returns players
language plpgsql stable as $$
declare
  p players;
begin
  select * into p from players where room_id = p_room and user_id = public._me() and left_at is null;
  if not found then
    raise exception 'not_in_room';
  end if;
  return p;
end $$;

create or replace function public._require_host(r rooms) returns void
language plpgsql stable as $$
begin
  if r.host_user_id <> public._me() then
    raise exception 'not_host';
  end if;
end $$;

-- Players taking part in the current round.
create or replace function public._active_count(p_room uuid) returns int
language sql stable as $$
  select count(*)::int from players where room_id = p_room and left_at is null and not spectating
$$;

create or replace function public._cards_per_player(r rooms) returns int
language sql immutable as $$
  select case when r.mode = 'levelup' then r.level else r.cards_per_player end
$$;

-- Picks a random theme from the room's categories, avoiding ones already used in this room.
create or replace function public._pick_theme(p_room uuid) returns jsonb
language plpgsql volatile set search_path = public, extensions as $$
declare
  r rooms;
  t jsonb;
begin
  select * into r from rooms where id = p_room;
  select to_jsonb(th) into t from themes th
  where th.category = any (r.theme_categories) and not (th.id = any (r.used_theme_ids))
  order by gen_random_bytes(8) limit 1;

  if t is null then
    -- Category exhausted: start recycling, but never repeat the current theme back to back.
    select to_jsonb(th) into t from themes th
    where th.category = any (r.theme_categories) and th.id is distinct from (r.current_theme ->> 'id')
    order by gen_random_bytes(8) limit 1;
    update rooms set used_theme_ids = '{}' where id = p_room;
  end if;

  if t is null then
    raise exception 'no_themes';
  end if;

  update rooms
  set current_theme = t, used_theme_ids = array_append(used_theme_ids, t ->> 'id')
  where id = p_room;
  return t;
end $$;

-- Resets per-round state and opens the topic for a new round.
create or replace function public._begin_round(p_room uuid) returns void
language plpgsql as $$
begin
  delete from players where room_id = p_room and left_at is not null;
  update players set spectating = false, locked = false, wants_reroll = false where room_id = p_room;
  delete from hands where room_id = p_room; -- cascades to board_cards
  update rooms
  set round = round + 1, status = 'choosing_theme', theme_rerolls = 0,
      reveal_index = -1, last_reveal_at = null, last_result = null
  where id = p_room;
  perform public._pick_theme(p_room);
end $$;

-- When every active player is locked in, freeze the order and start revealing.
create or replace function public._maybe_start_reveal(p_room uuid) returns boolean
language plpgsql as $$
declare
  r rooms;
begin
  select * into r from rooms where id = p_room;
  if r.status <> 'placing' then
    return false;
  end if;
  if public._active_count(p_room) = 0
     or exists (select 1 from players where room_id = p_room and left_at is null and not spectating and not locked)
     or exists (select 1 from board_cards where room_id = p_room and round = r.round and position is null) then
    return false;
  end if;

  update board_cards b set reveal_order = o.rn - 1
  from (
    select card_id, row_number() over (order by position, card_id) as rn
    from board_cards where room_id = p_room and round = r.round
  ) o
  where b.card_id = o.card_id;

  update rooms set status = 'revealing', reveal_index = -1, last_reveal_at = now() where id = p_room;
  return true;
end $$;

create or replace function public._finish_round(p_room uuid) returns void
language plpgsql as $$
declare
  r rooms;
  v_wrong int;
  v_total int;
  v_lives int;
begin
  select * into r from rooms where id = p_room;
  select count(*) filter (where is_wrong), count(*) into v_wrong, v_total
  from board_cards where room_id = p_room and round = r.round;

  v_lives := r.lives;
  if r.mode = 'levelup' then
    v_lives := greatest(0, r.lives - v_wrong);
    if v_lives > 0 and v_wrong = 0 then
      v_lives := least(3, v_lives + 1);
    end if;
  end if;

  update rooms
  set lives = v_lives,
      status = case when r.mode = 'levelup' and v_lives = 0 then 'game_over'::room_status else 'result'::room_status end,
      last_result = jsonb_build_object(
        'wrong', v_wrong, 'total', v_total, 'perfect', v_wrong = 0,
        'lives_before', r.lives, 'lives_after', v_lives, 'level', r.level, 'deck_complete', false)
  where id = p_room;
end $$;

-- Reveals the card with reveal_order = reveal_index + 1. Rule §1.1.8: a card is wrong
-- when it is lower than the highest value revealed before it.
create or replace function public._reveal_one(p_room uuid) returns void
language plpgsql as $$
declare
  r rooms;
  v_card uuid;
  v_value int;
  v_max int;
  v_total int;
begin
  select * into r from rooms where id = p_room;
  select b.card_id, h.value into v_card, v_value
  from board_cards b join hands h on h.card_id = b.card_id
  where b.room_id = p_room and b.round = r.round and b.reveal_order = r.reveal_index + 1;
  if v_card is null then
    return;
  end if;

  select coalesce(max(revealed_value), 0) into v_max
  from board_cards where room_id = p_room and round = r.round and revealed_value is not null;

  update board_cards set revealed_value = v_value, is_wrong = v_value < v_max where card_id = v_card;
  update rooms set reveal_index = reveal_index + 1, last_reveal_at = now() where id = p_room;

  select count(*) into v_total from board_cards where room_id = p_room and round = r.round;
  if r.reveal_index + 1 >= v_total - 1 then
    perform public._finish_round(p_room);
  end if;
end $$;

-- Removes a player. During reveal/result their cards must stay on the table, so they are only
-- marked as left and cleaned up when the next round begins.
create or replace function public._remove_player(r rooms, p players) returns void
language plpgsql as $$
declare
  v_new_host uuid;
begin
  if r.status in ('revealing', 'result', 'game_over') then
    update players set left_at = now(), locked = false where id = p.id;
  else
    delete from hands where room_id = r.id and owner_user_id = p.user_id;
    delete from players where id = p.id;
  end if;
  delete from heartbeats where room_id = r.id and user_id = p.user_id;

  if not exists (select 1 from players where room_id = r.id and left_at is null) then
    delete from rooms where id = r.id;
    return;
  end if;

  update rooms set roster_version = roster_version + 1 where id = r.id;

  if r.host_user_id = p.user_id then
    select user_id into v_new_host from players
    where room_id = r.id and left_at is null order by spectating, seat limit 1;
    update rooms set host_user_id = v_new_host where id = r.id;
  end if;

  if r.status = 'placing' then
    perform public._maybe_start_reveal(r.id);
  end if;
end $$;

-- ---------------------------------------------------------------- rooms & lobby

create or replace function public.create_room(p_name text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := public._me();
  v_name text := public._clean_name(p_name);
  v_room rooms;
begin
  for i in 1..60 loop
    begin
      insert into rooms (code, host_user_id) values (public._gen_code(), uid) returning * into v_room;
      exit;
    exception when unique_violation then
      v_room := null;
    end;
  end loop;
  if v_room.id is null then
    raise exception 'no_free_code';
  end if;

  insert into players (room_id, user_id, name, color, seat)
  values (v_room.id, uid, v_name, (public._palette())[1], 0);
  insert into heartbeats (room_id, user_id) values (v_room.id, uid);
  return jsonb_build_object('room_id', v_room.id, 'code', v_room.code);
end $$;

create or replace function public.join_room(p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := public._me();
  v_room_id uuid;
  r rooms;
  p players;
  v_base text := public._clean_name(p_name);
  v_name text;
  v_n int := 2;
  v_color text;
  v_spectating boolean;
begin
  select id into v_room_id from rooms where code = upper(btrim(p_code));
  if v_room_id is null then
    raise exception 'room_not_found';
  end if;
  r := public._lock_room(v_room_id);
  v_spectating := r.status in ('placing', 'revealing');

  select * into p from players where room_id = r.id and user_id = uid;
  if found then
    -- Rejoin (refresh, screen lock, or coming back after leaving mid-reveal).
    if p.left_at is not null then
      update players set left_at = null, spectating = v_spectating where id = p.id;
    end if;
    insert into heartbeats (room_id, user_id) values (r.id, uid)
    on conflict (room_id, user_id) do update set seen_at = now();
    return jsonb_build_object('room_id', r.id, 'code', r.code, 'rejoined', true);
  end if;

  if (select count(*) from players where room_id = r.id and left_at is null) >= 10 then
    raise exception 'room_full';
  end if;

  -- Duplicate nickname → "บอส 2", "บอส 3", ...
  v_name := v_base;
  while exists (select 1 from players where room_id = r.id and name = v_name) loop
    v_name := btrim(left(v_base, 16 - char_length(' ' || v_n))) || ' ' || v_n;
    v_n := v_n + 1;
  end loop;

  select c into v_color from unnest(public._palette()) with ordinality as t (c, i)
  where c not in (select color from players where room_id = r.id)
  order by i limit 1;
  if v_color is null then
    raise exception 'room_full';
  end if;

  insert into players (room_id, user_id, name, color, seat, spectating)
  values (r.id, uid, v_name, v_color,
          (select coalesce(max(seat), -1) + 1 from players where room_id = r.id), v_spectating);
  insert into heartbeats (room_id, user_id) values (r.id, uid)
  on conflict (room_id, user_id) do update set seen_at = now();
  update rooms set updated_at = now() where id = r.id;
  return jsonb_build_object('room_id', r.id, 'code', r.code, 'rejoined', false);
end $$;

-- The room this device was last in, for auto-rejoin after refresh / screen lock.
create or replace function public.my_room() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('room_id', r.id, 'code', r.code)
  from players p join rooms r on r.id = p.room_id
  where p.user_id = auth.uid() and p.left_at is null
  order by p.joined_at desc limit 1
$$;

create or replace function public.leave_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  p players := public._my_player(p_room);
begin
  perform public._remove_player(r, p);
end $$;

create or replace function public.kick_player(p_room uuid, p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  p players;
begin
  perform public._require_host(r);
  select * into p from players where id = p_player and room_id = p_room and left_at is null;
  if not found then
    raise exception 'player_not_found';
  end if;
  if p.user_id = r.host_user_id then
    raise exception 'cannot_kick_self';
  end if;
  perform public._remove_player(r, p);
end $$;

create or replace function public.set_color(p_room uuid, p_color text) returns void
language plpgsql security definer set search_path = public as $$
declare
  p players := public._my_player(p_room);
begin
  if not (upper(p_color) = any (public._palette())) then
    raise exception 'invalid_color';
  end if;
  begin
    update players set color = upper(p_color) where id = p.id;
  exception when unique_violation then
    raise exception 'color_taken';
  end;
end $$;

create or replace function public.update_settings(p_room uuid, p_mode game_mode, p_cards int, p_categories text[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  v_categories text[];
begin
  perform public._require_host(r);
  if r.status <> 'lobby' then
    raise exception 'wrong_phase';
  end if;
  if p_cards is null or p_cards not between 1 and 3 then
    raise exception 'invalid_settings';
  end if;
  select array_agg(distinct c order by c) into v_categories
  from unnest(p_categories) c where c in (select category from themes);
  if v_categories is null or cardinality(v_categories) = 0 then
    raise exception 'invalid_settings';
  end if;
  update rooms set mode = p_mode, cards_per_player = p_cards, theme_categories = v_categories where id = p_room;
end $$;

-- Host migration (§4.6). The host may hand over directly; anyone else may only take over
-- when the host has missed heartbeats for 20 seconds.
create or replace function public.transfer_host(p_room uuid, p_to uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
  v_target uuid;
  v_host_seen timestamptz;
begin
  if r.host_user_id = me.user_id then
    select user_id into v_target from players where id = p_to and room_id = p_room and left_at is null;
    if v_target is null then
      raise exception 'player_not_found';
    end if;
  else
    select h.seen_at into v_host_seen
    from heartbeats h join players p on p.room_id = h.room_id and p.user_id = h.user_id and p.left_at is null
    where h.room_id = p_room and h.user_id = r.host_user_id;
    if v_host_seen is not null and v_host_seen > now() - interval '20 seconds' then
      raise exception 'host_still_here';
    end if;
    select p.user_id into v_target
    from players p join heartbeats h on h.room_id = p.room_id and h.user_id = p.user_id
    where p.room_id = p_room and p.left_at is null and p.user_id <> r.host_user_id
      and h.seen_at > now() - interval '20 seconds'
    order by p.spectating, p.seat limit 1;
    v_target := coalesce(v_target, me.user_id);
  end if;
  update rooms set host_user_id = v_target where id = p_room;
end $$;

create or replace function public.heartbeat(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  p players := public._my_player(p_room);
begin
  insert into heartbeats (room_id, user_id) values (p_room, p.user_id)
  on conflict (room_id, user_id) do update set seen_at = now();
end $$;

-- ---------------------------------------------------------------- rounds

create or replace function public.start_round(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
begin
  perform public._require_host(r);
  if r.status not in ('lobby', 'game_over') then
    raise exception 'wrong_phase';
  end if;
  if (select count(*) from players where room_id = p_room and left_at is null) < 2 then
    raise exception 'need_two_players';
  end if;
  update rooms set level = 1, lives = 3, round = 0 where id = p_room;
  perform public._begin_round(p_room);
end $$;

create or replace function public.next_round(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  v_players int;
begin
  perform public._require_host(r);
  if r.status <> 'result' then
    raise exception 'wrong_phase';
  end if;
  v_players := (select count(*) from players where room_id = p_room and left_at is null);
  if v_players < 2 then
    raise exception 'need_two_players';
  end if;
  if r.mode = 'levelup' then
    if v_players * (r.level + 1) > 100 then
      -- Not enough numbers for the next level: the team cleared the whole deck.
      update rooms
      set status = 'game_over',
          last_result = coalesce(last_result, '{}'::jsonb) || jsonb_build_object('deck_complete', true)
      where id = p_room;
      return;
    end if;
    update rooms set level = level + 1 where id = p_room;
  end if;
  perform public._begin_round(p_room);
end $$;

create or replace function public.back_to_lobby(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
begin
  perform public._require_host(r);
  delete from players where room_id = p_room and left_at is not null;
  update players set spectating = false, locked = false, wants_reroll = false where room_id = p_room;
  delete from hands where room_id = p_room;
  update rooms
  set status = 'lobby', level = 1, lives = 3, current_theme = null, theme_rerolls = 0,
      reveal_index = -1, last_reveal_at = null, last_result = null
  where id = p_room;
end $$;

-- ---------------------------------------------------------------- topic

create or replace function public.vote_reroll(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
  v_votes int;
begin
  if r.status <> 'choosing_theme' then
    raise exception 'wrong_phase';
  end if;
  if me.spectating then
    raise exception 'spectating';
  end if;
  if r.theme_rerolls >= 2 and not me.wants_reroll then
    raise exception 'no_rerolls_left';
  end if;
  update players set wants_reroll = not wants_reroll where id = me.id;

  select count(*) into v_votes from players
  where room_id = p_room and left_at is null and not spectating and wants_reroll;
  if r.theme_rerolls < 2 and v_votes * 2 > public._active_count(p_room) then
    perform public._pick_theme(p_room);
    update rooms set theme_rerolls = theme_rerolls + 1 where id = p_room;
    update players set wants_reroll = false where room_id = p_room;
  end if;
end $$;

create or replace function public.set_custom_theme(p_room uuid, p_title text, p_low text, p_high text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  r rooms := public._lock_room(p_room);
  v_title text := btrim(coalesce(p_title, ''));
  v_low text := btrim(coalesce(p_low, ''));
  v_high text := btrim(coalesce(p_high, ''));
begin
  perform public._require_host(r);
  if r.status <> 'choosing_theme' then
    raise exception 'wrong_phase';
  end if;
  if char_length(v_title) not between 1 and 60 or char_length(v_low) not between 1 and 24
     or char_length(v_high) not between 1 and 24 then
    raise exception 'invalid_theme';
  end if;
  update rooms
  set current_theme = jsonb_build_object(
        'id', 'custom-' || encode(gen_random_bytes(4), 'hex'), 'category', 'custom',
        'title', v_title, 'low', v_low, 'high', v_high)
  where id = p_room;
  update players set wants_reroll = false where room_id = p_room;
end $$;

-- Deals n unique numbers per active player from 1–100, shuffled with a CSPRNG.
create or replace function public.confirm_theme(p_room uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  r rooms := public._lock_room(p_room);
  v_n int := public._cards_per_player(r);
  v_players int := public._active_count(p_room);
begin
  perform public._require_host(r);
  if r.status <> 'choosing_theme' then
    raise exception 'wrong_phase';
  end if;
  if v_players < 2 then
    raise exception 'need_two_players';
  end if;
  if v_n * v_players > 100 then
    raise exception 'not_enough_cards';
  end if;

  insert into hands (room_id, round, owner_user_id, value)
  select p_room, r.round, ps.user_id, vals.v
  from (
    select v, row_number() over (order by k) - 1 as idx
    from (select v, gen_random_bytes(8) as k from generate_series(1, 100) v) s
    order by k limit v_n * v_players
  ) vals
  join (
    select user_id, row_number() over (order by seat) - 1 as pi
    from players where room_id = p_room and left_at is null and not spectating
  ) ps on vals.idx / v_n = ps.pi;

  insert into board_cards (card_id, room_id, round, owner_player_id)
  select h.card_id, h.room_id, h.round, p.id
  from hands h join players p on p.room_id = h.room_id and p.user_id = h.owner_user_id
  where h.room_id = p_room and h.round = r.round;

  update players set locked = false, wants_reroll = false where room_id = p_room;
  update rooms set status = 'placing' where id = p_room;
end $$;

-- ---------------------------------------------------------------- placing

create or replace function public.move_card(p_card uuid, p_position double precision) returns void
language plpgsql security definer set search_path = public as $$
declare
  b board_cards;
  r rooms;
  me players;
begin
  select * into b from board_cards where card_id = p_card;
  if not found then
    raise exception 'card_not_found';
  end if;
  r := public._lock_room(b.room_id);
  me := public._my_player(b.room_id);
  if b.owner_player_id <> me.id then
    raise exception 'not_your_card';
  end if;
  if r.status <> 'placing' or b.round <> r.round then
    raise exception 'wrong_phase';
  end if;
  if p_position is not null and (p_position = 'NaN'::float8 or p_position in ('Infinity'::float8, '-Infinity'::float8)) then
    raise exception 'invalid_position';
  end if;

  update board_cards set position = p_position where card_id = p_card;
  -- Any move after people locked in means everyone has to confirm again (§1.1.6).
  update players set locked = false where room_id = b.room_id and locked;
end $$;

create or replace function public.set_clue(p_card uuid, p_clue text) returns void
language plpgsql security definer set search_path = public as $$
declare
  b board_cards;
  r rooms;
  me players;
  v_clue text := nullif(btrim(regexp_replace(coalesce(p_clue, ''), '\s+', ' ', 'g')), '');
begin
  select * into b from board_cards where card_id = p_card;
  if not found then
    raise exception 'card_not_found';
  end if;
  r := public._lock_room(b.room_id);
  me := public._my_player(b.room_id);
  if b.owner_player_id <> me.id then
    raise exception 'not_your_card';
  end if;
  if r.status <> 'placing' or b.round <> r.round then
    raise exception 'wrong_phase';
  end if;
  if char_length(v_clue) > 24 then
    raise exception 'clue_too_long';
  end if;
  update board_cards set clue = v_clue where card_id = p_card;
end $$;

create or replace function public.lock_in(p_room uuid, p_locked boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
begin
  if r.status <> 'placing' then
    raise exception 'wrong_phase';
  end if;
  if me.spectating then
    raise exception 'spectating';
  end if;
  if p_locked and exists (
    select 1 from board_cards where owner_player_id = me.id and round = r.round and position is null
  ) then
    raise exception 'cards_not_placed';
  end if;
  update players set locked = p_locked where id = me.id;
  if p_locked then
    perform public._maybe_start_reveal(p_room);
  end if;
end $$;

-- ---------------------------------------------------------------- reveal

-- Idempotent: only acts when p_expected matches the current reveal_index, so duplicate calls
-- (double taps, two clients driving after a host drop) never reveal twice.
create or replace function public.reveal_next(p_room uuid, p_expected int) returns int
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
begin
  if r.status <> 'revealing' or r.reveal_index <> p_expected then
    return r.reveal_index;
  end if;
  -- Pace guard for non-hosts so a takeover can't machine-gun the reveal.
  if me.user_id <> r.host_user_id and r.last_reveal_at > now() - interval '600 milliseconds' then
    return r.reveal_index;
  end if;
  perform public._reveal_one(p_room);
  return r.reveal_index + 1;
end $$;

create or replace function public.reveal_all(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
begin
  perform public._require_host(r);
  if r.status <> 'revealing' then
    return;
  end if;
  for i in 1..100 loop
    select * into r from rooms where id = p_room;
    exit when r.status <> 'revealing';
    perform public._reveal_one(p_room);
  end loop;
end $$;

-- ---------------------------------------------------------------- maintenance

create or replace function public.cleanup_stale_rooms() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  delete from rooms where updated_at < now() - interval '6 hours';
  get diagnostics n = row_count;
  return n;
end $$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('ito-cleanup-stale-rooms', '*/15 * * * *', 'select public.cleanup_stale_rooms()');
exception when others then
  raise notice 'pg_cron unavailable, schedule cleanup_stale_rooms() another way: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------- grants

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.is_room_member(uuid),
  public.create_room(text),
  public.join_room(text, text),
  public.my_room(),
  public.leave_room(uuid),
  public.kick_player(uuid, uuid),
  public.set_color(uuid, text),
  public.update_settings(uuid, game_mode, int, text[]),
  public.transfer_host(uuid, uuid),
  public.heartbeat(uuid),
  public.start_round(uuid),
  public.next_round(uuid),
  public.back_to_lobby(uuid),
  public.vote_reroll(uuid),
  public.set_custom_theme(uuid, text, text, text),
  public.confirm_theme(uuid),
  public.move_card(uuid, double precision),
  public.set_clue(uuid, text),
  public.lock_in(uuid, boolean),
  public.reveal_next(uuid, int),
  public.reveal_all(uuid)
to authenticated;
