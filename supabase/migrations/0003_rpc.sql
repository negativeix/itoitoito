-- Server-authoritative game logic (ITO_PLAN §4.4).
-- Every client action is one of these security-definer RPCs, running in a single transaction.
-- Errors are raised as short codes (e.g. 'not_host'); the client maps them to Thai messages.
--
-- Round flow (played like the real card game):
--   choosing_theme  any player sets the topic (own idea or a suggestion); host deals
--   placing         everyone places their face-down cards; once all are on the table the owner
--                   of the leftmost face-down card flips it. Between flips everyone may keep
--                   rearranging their remaining face-down cards (always right of revealed ones).
--   result          every card revealed (or, in Level Up, hearts ran out)

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

create or replace function public._clean_text(p text, max_len int) returns text
language sql immutable as $$
  select btrim(left(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'), max_len))
$$;

create or replace function public._clean_name(p_name text) returns text
language plpgsql immutable as $$
declare
  v text := public._clean_text(p_name, 16);
begin
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

-- Resets per-round state and opens the topic for a new round.
create or replace function public._begin_round(p_room uuid) returns void
language plpgsql as $$
begin
  delete from players where room_id = p_room and left_at is not null;
  update players set spectating = false where room_id = p_room;
  delete from hands where room_id = p_room; -- cascades to board_cards
  update rooms
  set round = round + 1, status = 'choosing_theme', current_theme = null, reveal_index = -1, last_result = null
  where id = p_room;
end $$;

-- The leftmost face-down card of the round (null when everything is revealed).
create or replace function public._next_card(p_room uuid, p_round int) returns uuid
language sql stable as $$
  select card_id from board_cards
  where room_id = p_room and round = p_round and revealed_value is null and position is not null
  order by position, card_id limit 1
$$;

-- Ends the round: scores it, and reveals any cards left face down (Level Up game over) so the
-- result list is complete. Those cards are shown but not judged (is_wrong stays null).
create or replace function public._finish_round(p_room uuid) returns void
language plpgsql as $$
declare
  r rooms;
  v_wrong int;
  v_total int;
  v_lives int;
begin
  select * into r from rooms where id = p_room;

  update board_cards b set revealed_value = h.value, reveal_order = r.reveal_index + o.rn
  from hands h,
       (select card_id, row_number() over (order by position nulls last, card_id) as rn
        from board_cards where room_id = p_room and round = r.round and revealed_value is null) o
  where b.card_id = o.card_id and h.card_id = b.card_id;

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

-- Flips one card. Rule §1.1.8: wrong when lower than the highest value revealed before it.
create or replace function public._reveal(p_room uuid, p_card uuid) returns void
language plpgsql as $$
declare
  r rooms;
  v_value int;
  v_max int;
  v_wrong int;
begin
  select * into r from rooms where id = p_room;
  select value into v_value from hands where card_id = p_card;
  select coalesce(max(revealed_value), 0) into v_max
  from board_cards where room_id = p_room and round = r.round and revealed_value is not null;

  update board_cards
  set revealed_value = v_value, is_wrong = v_value < v_max, reveal_order = r.reveal_index + 1
  where card_id = p_card;
  update rooms set reveal_index = reveal_index + 1 where id = p_room;

  select count(*) filter (where is_wrong) into v_wrong from board_cards where room_id = p_room and round = r.round;
  if public._next_card(p_room, r.round) is null
     or (r.mode = 'levelup' and r.lives - v_wrong <= 0) then
    perform public._finish_round(p_room);
  end if;
end $$;

-- Removes a player. Once cards have been revealed their revealed cards must stay on the table,
-- so they are only marked as left (face-down cards are taken out) and cleaned up next round.
create or replace function public._remove_player(r rooms, p players) returns void
language plpgsql as $$
declare
  v_new_host uuid;
begin
  if r.status in ('result', 'game_over')
     or (r.status = 'placing' and exists (
       select 1 from board_cards where owner_player_id = p.id and round = r.round and revealed_value is not null)) then
    delete from hands h using board_cards b
    where b.card_id = h.card_id and b.owner_player_id = p.id and b.revealed_value is null;
    update players set left_at = now() where id = p.id;
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

  -- Their face-down cards were the only ones left: the round is over.
  if r.status = 'placing' and r.reveal_index >= 0 and public._next_card(r.id, r.round) is null
     and not exists (select 1 from board_cards where room_id = r.id and round = r.round and position is null) then
    perform public._finish_round(r.id);
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
  v_spectating := r.status = 'placing';

  select * into p from players where room_id = r.id and user_id = uid;
  if found then
    -- Rejoin (refresh, screen lock, or coming back after leaving).
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

create or replace function public.update_settings(p_room uuid, p_mode game_mode, p_cards int) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
begin
  perform public._require_host(r);
  if r.status <> 'lobby' then
    raise exception 'wrong_phase';
  end if;
  if p_cards is null or p_cards not between 1 and 3 then
    raise exception 'invalid_settings';
  end if;
  update rooms set mode = p_mode, cards_per_player = p_cards where id = p_room;
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
  update players set spectating = false where room_id = p_room;
  delete from hands where room_id = p_room;
  update rooms
  set status = 'lobby', level = 1, lives = 3, current_theme = null, reveal_index = -1, last_result = null
  where id = p_room;
end $$;

-- ---------------------------------------------------------------- topic

-- Any player in the round can set the topic: their own idea or a suggestion from the app.
create or replace function public.set_theme(p_room uuid, p_title text, p_low text, p_high text, p_source_id text default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
  v_title text := public._clean_text(p_title, 60);
  v_low text := public._clean_text(p_low, 24);
  v_high text := public._clean_text(p_high, 24);
begin
  if r.status <> 'choosing_theme' then
    raise exception 'wrong_phase';
  end if;
  if v_title = '' or v_low = '' or v_high = '' then
    raise exception 'invalid_theme';
  end if;
  update rooms
  set current_theme = jsonb_build_object(
        'id', coalesce(left(p_source_id, 40), 'custom-' || encode(gen_random_bytes(4), 'hex')),
        'category', case when p_source_id is null then 'custom' else 'suggested' end,
        'title', v_title, 'low', v_low, 'high', v_high, 'set_by', me.name)
  where id = p_room;
end $$;

-- Deals n unique numbers per active player from 1–100, shuffled with a CSPRNG.
create or replace function public.confirm_theme(p_room uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  r rooms := public._lock_room(p_room);
  v_n int := public._cards_per_player(r);
  v_players int := public._active_count(p_room);
  v_entry jsonb;
begin
  perform public._require_host(r);
  if r.status <> 'choosing_theme' then
    raise exception 'wrong_phase';
  end if;
  if r.current_theme is null then
    raise exception 'no_theme';
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

  -- Remember the topic for this room (newest first, deduped by title, max 30).
  v_entry := r.current_theme - 'set_by';
  update rooms
  set status = 'placing',
      theme_history = (
        select coalesce(jsonb_agg(e), '[]'::jsonb) from (
          select e from (
            select v_entry as e, 0 as ord
            union all
            select e, ord from jsonb_array_elements(r.theme_history) with ordinality as t (e, ord)
            where e ->> 'title' <> v_entry ->> 'title'
          ) all_e order by ord limit 30
        ) limited
      )
  where id = p_room;
end $$;

-- ---------------------------------------------------------------- placing & flipping

create or replace function public.move_card(p_card uuid, p_position double precision) returns void
language plpgsql security definer set search_path = public as $$
declare
  b board_cards;
  r rooms;
  me players;
  v_floor double precision;
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
  if b.revealed_value is not null then
    raise exception 'card_revealed';
  end if;
  if p_position is not null then
    if p_position = 'NaN'::float8 or p_position in ('Infinity'::float8, '-Infinity'::float8) then
      raise exception 'invalid_position';
    end if;
    -- Face-down cards always stay to the right of the revealed ones.
    select max(position) into v_floor from board_cards
    where room_id = b.room_id and round = r.round and revealed_value is not null;
    if v_floor is not null and p_position <= v_floor then
      raise exception 'invalid_position';
    end if;
  end if;
  update board_cards set position = p_position where card_id = p_card;
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

-- The owner of the leftmost face-down card flips it (the host may flip for someone offline).
-- p_card is the card the caller saw as next: if someone just moved a card in front of it the
-- call fails with 'order_changed' instead of flipping the wrong card. Repeated calls are no-ops.
create or replace function public.flip_next(p_room uuid, p_card uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
  b board_cards;
  v_next uuid;
begin
  if r.status <> 'placing' then
    raise exception 'wrong_phase';
  end if;
  select * into b from board_cards where card_id = p_card and room_id = p_room and round = r.round;
  if not found then
    raise exception 'card_not_found';
  end if;
  if b.revealed_value is not null then
    return; -- already flipped (double tap)
  end if;
  if exists (select 1 from board_cards where room_id = p_room and round = r.round and position is null) then
    raise exception 'cards_not_placed';
  end if;
  v_next := public._next_card(p_room, r.round);
  if v_next is distinct from p_card then
    raise exception 'order_changed';
  end if;
  if b.owner_player_id <> me.id and r.host_user_id <> me.user_id then
    raise exception 'not_your_turn';
  end if;
  perform public._reveal(p_room, p_card);
end $$;

-- Host shortcut: flip everything that is left, in table order.
create or replace function public.reveal_all(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  v_next uuid;
begin
  perform public._require_host(r);
  if r.status <> 'placing' then
    raise exception 'wrong_phase';
  end if;
  if exists (select 1 from board_cards where room_id = p_room and round = r.round and position is null) then
    raise exception 'cards_not_placed';
  end if;
  for i in 1..100 loop
    select * into r from rooms where id = p_room;
    exit when r.status <> 'placing';
    v_next := public._next_card(p_room, r.round);
    exit when v_next is null;
    perform public._reveal(p_room, v_next);
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
  public.update_settings(uuid, game_mode, int),
  public.transfer_host(uuid, uuid),
  public.heartbeat(uuid),
  public.start_round(uuid),
  public.next_round(uuid),
  public.back_to_lobby(uuid),
  public.set_theme(uuid, text, text, text, text),
  public.confirm_theme(uuid),
  public.move_card(uuid, double precision),
  public.set_clue(uuid, text),
  public.flip_next(uuid, uuid),
  public.reveal_all(uuid)
to authenticated;
