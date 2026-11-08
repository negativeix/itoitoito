-- "ใครไม่รู้" (I Know... You Don't): a second game in the same rooms.
--
-- Cards: 72 animal cards, encoded 0..71 as animal * 18 + (number - 1) * 3 + colour
--   animal 0 pig, 1 dog, 2 crow, 3 hen · number 1..6 · colour 0 pink, 1 blue, 2 yellow
-- Rules: ids 1..60; the text lives in the client (src/data/iknowRules.ts).
--
-- Round flow (rooms.status = 'placing' while it runs, iknow_state.phase says where we are):
--   pick_rule    the keeper picks 1 of 3 random secret rules
--   pick_start   the keeper picks the first table card from the deck (hands are already dealt)
--   turn         the turn player arranges cards (staging is public and live), then submits,
--                or says they can't play
--   judging      the keeper approves (cards join the table) or rejects (cards go back to hand)
--   checking     the keeper looks at the hand of someone who can't play: plays one card for
--                them (they draw 1) or confirms (hand back into the deck, draw one fewer)
--   guessing     a player whose hand is empty picks the rule out of 3 (house rule)
--   guess_wrong  a wrong pick is shown; the chance passes to the next player
--   done         someone guessed right (rooms.status = 'result'); final = game over
--
-- Secrets: the rule, the rule/guess options and the deck live in iknow_secret / iknow_deck,
-- which clients cannot read at all (RPC iknow_secret hands out only what the caller may see).
-- Hands are owner-only, like the ito hands table.

alter table rooms add column game text not null default 'ito' check (game in ('ito', 'iknow'));

create table iknow_state (
  room_id uuid primary key references rooms(id) on delete cascade,
  round int not null default 0,
  phase text not null default 'idle',
  keeper_id uuid,
  turn_id uuid,
  guesser_id uuid,
  check_id uuid,
  emptied_id uuid,                              -- first player to empty their hand this round
  table_cards int[] not null default '{}',      -- accepted cards, in table order
  staging int[] not null default '{}',          -- the turn player's arrangement (public on purpose)
  rejected jsonb not null default '[]',         -- [{p, cards, t}]
  hand_counts jsonb not null default '{}',      -- {player_id: n}
  scores jsonb not null default '{}',           -- {player_id: total}
  keepers_done uuid[] not null default '{}',
  wrong_guesses jsonb not null default '[]',    -- [{p, rule}] this round
  last_check jsonb,                             -- {p, card} or {p, card: null, n}
  result jsonb,                                 -- {guesser, rule, options, deltas, counts} or {aborted: true}
  turn_no int not null default 0,
  version int not null default 0
);

create table iknow_hands (
  room_id uuid not null references rooms(id) on delete cascade,
  card int not null check (card between 0 and 71),
  owner_user_id uuid not null,
  primary key (room_id, card)
);
create index iknow_hands_owner_idx on iknow_hands (owner_user_id);

create table iknow_deck (
  room_id uuid not null references rooms(id) on delete cascade,
  card int not null check (card between 0 and 71),
  primary key (room_id, card)
);

create table iknow_secret (
  room_id uuid primary key references rooms(id) on delete cascade,
  rule_id int,
  rule_options int[] not null default '{}',
  guess_options int[] not null default '{}'
);

alter table iknow_state enable row level security;
alter table iknow_hands enable row level security;
alter table iknow_deck enable row level security;
alter table iknow_secret enable row level security;

create policy iknow_state_select_member on iknow_state for select to authenticated using (public.is_room_member(room_id));
-- Owner only. There must never be any other policy on this table.
create policy iknow_hands_select_owner on iknow_hands for select to authenticated using (owner_user_id = auth.uid());
-- iknow_deck, iknow_secret: no policies at all (RPC access only).

revoke insert, update, delete, truncate on iknow_state, iknow_hands, iknow_deck, iknow_secret from anon, authenticated;
revoke select on iknow_state, iknow_hands, iknow_deck, iknow_secret from anon;
revoke select on iknow_deck, iknow_secret from authenticated;

-- Realtime: the public state only. Hands, deck and secret are never published.
alter publication supabase_realtime add table iknow_state;

-- ---------------------------------------------------------------- helpers

create or replace function public._ik_rule_count() returns int
language sql immutable as $$ select 60 $$;

create or replace function public._ik_state(p_room uuid) returns iknow_state
language plpgsql stable as $$
declare
  s iknow_state;
begin
  select * into s from iknow_state where room_id = p_room;
  if not found then
    raise exception 'wrong_phase';
  end if;
  return s;
end $$;

-- Players dealt into the round (the keeper included), by seat.
create or replace function public._ik_active(p_room uuid) returns setof players
language sql stable as $$
  select * from players where room_id = p_room and left_at is null and not spectating order by seat
$$;

-- Next player by seat after p_after (wrapping), skipping the given ids.
create or replace function public._ik_next(p_room uuid, p_after uuid, p_skip uuid[]) returns uuid
language sql stable as $$
  select a.id from public._ik_active(p_room) a
  where not (a.id = any (p_skip))
  order by a.seat <= coalesce((select seat from players where id = p_after), -1), a.seat
  limit 1
$$;

-- Moves up to n random deck cards into a hand.
create or replace function public._ik_draw(p_room uuid, p_user uuid, n int) returns void
language plpgsql set search_path = public, extensions as $$
begin
  if n <= 0 then
    return;
  end if;
  with picked as (
    delete from iknow_deck d
    where d.room_id = p_room and d.card in (
      select card from iknow_deck where room_id = p_room order by gen_random_bytes(8) limit n)
    returning d.card
  )
  insert into iknow_hands (room_id, card, owner_user_id) select p_room, card, p_user from picked;
end $$;

-- Recounts hands (keeper and p_skip excluded) and bumps the version so clients refetch.
create or replace function public._ik_touch(p_room uuid, p_skip uuid default null) returns void
language plpgsql as $$
declare
  s iknow_state := public._ik_state(p_room);
begin
  update iknow_state set
    hand_counts = coalesce((
      select jsonb_object_agg(p.id, (select count(*) from iknow_hands h where h.room_id = p_room and h.owner_user_id = p.user_id))
      from public._ik_active(p_room) p
      where p.id is distinct from s.keeper_id and p.id is distinct from p_skip), '{}'),
    version = version + 1
  where room_id = p_room;
end $$;

create or replace function public._ik_hand_size(p_room uuid, p_player uuid) returns int
language sql stable as $$
  select count(*)::int from iknow_hands h join players p on p.user_id = h.owner_user_id
  where h.room_id = p_room and p.id = p_player
$$;

create or replace function public._ik_user(p_player uuid) returns uuid
language sql stable as $$ select user_id from players where id = p_player $$;

-- Deals a new round with the next keeper, or ends the game once everyone has kept.
create or replace function public._ik_begin_round(p_room uuid) returns void
language plpgsql set search_path = public, extensions as $$
declare
  s iknow_state := public._ik_state(p_room);
  v_keeper uuid;
  p players;
begin
  delete from players where room_id = p_room and left_at is not null;
  update players set spectating = false where room_id = p_room;

  if s.keeper_id is null then
    select id into v_keeper from public._ik_active(p_room) order by gen_random_bytes(8) limit 1;
  else
    v_keeper := public._ik_next(p_room, s.keeper_id, s.keepers_done);
  end if;
  if v_keeper is null or (select count(*) from public._ik_active(p_room)) < 3 then
    update iknow_state set phase = 'final', version = version + 1 where room_id = p_room;
    update rooms set status = 'game_over' where id = p_room;
    return;
  end if;

  delete from iknow_hands where room_id = p_room;
  delete from iknow_deck where room_id = p_room;
  insert into iknow_deck (room_id, card) select p_room, c from generate_series(0, 71) c;
  for p in select * from public._ik_active(p_room) loop
    if p.id <> v_keeper then
      perform public._ik_draw(p_room, p.user_id, 7);
    end if;
  end loop;

  insert into iknow_secret (room_id) values (p_room) on conflict (room_id) do nothing;
  update iknow_secret set
    rule_id = null,
    rule_options = (select array_agg(x) from (select x from generate_series(1, public._ik_rule_count()) x order by gen_random_bytes(8) limit 3) t),
    guess_options = '{}'
  where room_id = p_room;

  update iknow_state set
    round = round + 1, phase = 'pick_rule', keeper_id = v_keeper, turn_id = null, guesser_id = null,
    check_id = null, emptied_id = null, table_cards = '{}', staging = '{}', rejected = '[]',
    wrong_guesses = '[]', last_check = null, result = null, turn_no = 0,
    keepers_done = keepers_done || v_keeper,
    scores = scores || coalesce((
      select jsonb_object_agg(a.id, 0) from public._ik_active(p_room) a where not (scores ? a.id::text)), '{}')
  where room_id = p_room;
  update rooms set status = 'placing', round = (select round from iknow_state where room_id = p_room) where id = p_room;
  perform public._ik_touch(p_room);
end $$;

create or replace function public._ik_next_turn(p_room uuid, p_skip uuid default null) returns void
language plpgsql as $$
declare
  s iknow_state := public._ik_state(p_room);
  v_next uuid := public._ik_next(p_room, s.turn_id, array[s.keeper_id, coalesce(p_skip, s.keeper_id)]);
begin
  update iknow_state set turn_id = v_next, turn_no = turn_no + 1, phase = 'turn', staging = '{}', check_id = null
  where room_id = p_room;
end $$;

-- Gives p_player the chance to guess: the real rule plus 2 decoys not yet ruled out, shuffled.
create or replace function public._ik_start_guess(p_room uuid, p_player uuid) returns void
language plpgsql set search_path = public, extensions as $$
declare
  s iknow_state := public._ik_state(p_room);
  sec iknow_secret;
  v_wrong int[];
  v_opts int[];
begin
  select * into sec from iknow_secret where room_id = p_room;
  select coalesce(array_agg((e ->> 'rule')::int), '{}') into v_wrong from jsonb_array_elements(s.wrong_guesses) e;
  select array_agg(x) into v_opts from (
    select x from (
      select sec.rule_id as x
      union all
      (select x from generate_series(1, public._ik_rule_count()) x
       where x <> sec.rule_id and not (x = any (v_wrong))
       order by gen_random_bytes(8) limit 2)
    ) u order by gen_random_bytes(8)
  ) t;
  update iknow_secret set guess_options = v_opts where room_id = p_room;
  update iknow_state set phase = 'guessing', guesser_id = p_player, staging = '{}', check_id = null,
    emptied_id = coalesce(emptied_id, p_player)
  where room_id = p_room;
end $$;

-- Scores a correct guess: guesser +2; among the others (keeper excluded) the most cards
-- left -2, the next-most -1, everyone else 0 (ties share).
create or replace function public._ik_score(p_room uuid, p_guesser uuid) returns jsonb
language plpgsql as $$
declare
  s iknow_state := public._ik_state(p_room);
  v_counts jsonb := '{}';
  v_deltas jsonb := '{}';
  v_top int;
  v_second int;
  p players;
  n int;
  d int;
begin
  for p in select * from public._ik_active(p_room) loop
    if p.id <> s.keeper_id and p.id <> p_guesser then
      v_counts := v_counts || jsonb_build_object(p.id::text, public._ik_hand_size(p_room, p.id));
    end if;
  end loop;
  select max(v::int) into v_top from jsonb_each_text(v_counts) e (k, v) where v::int > 0;
  select max(v::int) into v_second from jsonb_each_text(v_counts) e (k, v) where v::int > 0 and v::int < v_top;
  v_deltas := jsonb_build_object(p_guesser::text, 2);
  for p in select * from public._ik_active(p_room) loop
    if p.id <> s.keeper_id and p.id <> p_guesser then
      n := (v_counts ->> p.id::text)::int;
      d := case when n > 0 and n = v_top then -2 when n > 0 and n = v_second then -1 else 0 end;
      v_deltas := v_deltas || jsonb_build_object(p.id::text, d);
    end if;
  end loop;
  update iknow_state set scores = (
    select jsonb_object_agg(k, coalesce((scores ->> k)::int, 0) + coalesce((v_deltas ->> k)::int, 0))
    from (select jsonb_object_keys(scores || v_deltas) k) keys
  ) where room_id = p_room;
  return jsonb_build_object('deltas', v_deltas, 'counts', v_counts);
end $$;

create or replace function public._ik_abort_round(p_room uuid) returns void
language plpgsql as $$
begin
  update iknow_state set phase = 'done', result = jsonb_build_object('aborted', true), staging = '{}'
  where room_id = p_room;
  update rooms set status = 'result' where id = p_room;
end $$;

-- A player left mid-game: their cards go back to the deck and the round moves on without them.
create or replace function public._ik_player_left(r rooms, p players) returns void
language plpgsql as $$
declare
  s iknow_state;
  v_left int;
begin
  select * into s from iknow_state where room_id = r.id;
  if not found then
    return;
  end if;
  insert into iknow_deck (room_id, card)
  select room_id, card from iknow_hands where room_id = r.id and owner_user_id = p.user_id
  on conflict do nothing;
  delete from iknow_hands where room_id = r.id and owner_user_id = p.user_id;
  if r.status <> 'placing' then
    return;
  end if;

  select count(*) into v_left from public._ik_active(r.id) a where a.id <> p.id and a.id <> s.keeper_id;
  if p.id = s.keeper_id or v_left < 2 then
    perform public._ik_abort_round(r.id);
  elsif p.id = s.guesser_id then
    perform public._ik_start_guess(r.id, public._ik_next(r.id, p.id, array[s.keeper_id, p.id]));
  elsif p.id = s.turn_id or p.id = s.check_id then
    perform public._ik_next_turn(r.id, p.id);
  end if;
  perform public._ik_touch(r.id, p.id);
end $$;

-- ---------------------------------------------------------------- lobby

create or replace function public.set_game(p_room uuid, p_game text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
begin
  perform public._require_host(r);
  if r.status not in ('lobby', 'game_over') then
    raise exception 'wrong_phase';
  end if;
  if p_game not in ('ito', 'iknow') then
    raise exception 'invalid_settings';
  end if;
  update rooms set game = p_game, status = 'lobby' where id = p_room;
end $$;

create or replace function public.iknow_start(p_room uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  r rooms := public._lock_room(p_room);
begin
  perform public._require_host(r);
  if r.game <> 'iknow' or r.status not in ('lobby', 'game_over') then
    raise exception 'wrong_phase';
  end if;
  if (select count(*) from players where room_id = p_room and left_at is null) < 3 then
    raise exception 'need_three_players';
  end if;
  update players set spectating = false where room_id = p_room;
  delete from iknow_state where room_id = p_room;
  insert into iknow_state (room_id, scores)
  select p_room, coalesce(jsonb_object_agg(id, 0), '{}') from players where room_id = p_room and left_at is null;
  update rooms set round = 0 where id = p_room;
  perform public._ik_begin_round(p_room);
end $$;

create or replace function public.iknow_next_round(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
begin
  perform public._require_host(r);
  if r.game <> 'iknow' or r.status <> 'result' then
    raise exception 'wrong_phase';
  end if;
  perform public._ik_begin_round(p_room);
end $$;

create or replace function public.iknow_end_game(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
begin
  perform public._require_host(r);
  if r.game <> 'iknow' or r.status not in ('placing', 'result') then
    raise exception 'wrong_phase';
  end if;
  update iknow_state set phase = 'final', staging = '{}', version = version + 1 where room_id = p_room;
  update rooms set status = 'game_over' where id = p_room;
end $$;

-- ---------------------------------------------------------------- keeper setup

create or replace function public.iknow_pick_rule(p_room uuid, p_rule int) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
  s iknow_state := public._ik_state(p_room);
begin
  if s.phase <> 'pick_rule' then
    raise exception 'wrong_phase';
  end if;
  if me.id <> s.keeper_id then
    raise exception 'not_keeper';
  end if;
  if not exists (select 1 from iknow_secret where room_id = p_room and p_rule = any (rule_options)) then
    raise exception 'invalid_rule';
  end if;
  update iknow_secret set rule_id = p_rule where room_id = p_room;
  update iknow_state set phase = 'pick_start' where room_id = p_room;
  perform public._ik_touch(p_room);
end $$;

create or replace function public.iknow_pick_start(p_room uuid, p_card int) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
  s iknow_state := public._ik_state(p_room);
  v_first uuid;
begin
  if s.phase <> 'pick_start' then
    raise exception 'wrong_phase';
  end if;
  if me.id <> s.keeper_id then
    raise exception 'not_keeper';
  end if;
  delete from iknow_deck where room_id = p_room and card = p_card;
  if not found then
    raise exception 'card_not_found';
  end if;
  select id into v_first from public._ik_active(p_room) where id <> s.keeper_id order by gen_random_bytes(8) limit 1;
  update iknow_state set table_cards = array[p_card], phase = 'turn', turn_id = v_first, turn_no = 1
  where room_id = p_room;
  perform public._ik_touch(p_room);
end $$;

-- ---------------------------------------------------------------- turns

-- The turn player's live arrangement (cards still in their hand, shown to everyone).
create or replace function public.iknow_stage(p_room uuid, p_cards int[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
  s iknow_state := public._ik_state(p_room);
  v_cards int[] := coalesce(p_cards, '{}');
begin
  if s.phase <> 'turn' then
    raise exception 'wrong_phase';
  end if;
  if me.id <> s.turn_id then
    raise exception 'not_your_turn';
  end if;
  if cardinality(v_cards) <> (select count(distinct x) from unnest(v_cards) x)
     or cardinality(v_cards) <> (select count(*) from iknow_hands where room_id = p_room and owner_user_id = me.user_id and card = any (v_cards)) then
    raise exception 'card_not_found';
  end if;
  update iknow_state set staging = v_cards, version = version + 1 where room_id = p_room;
end $$;

create or replace function public.iknow_submit(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
  s iknow_state := public._ik_state(p_room);
begin
  if s.phase <> 'turn' then
    raise exception 'wrong_phase';
  end if;
  if me.id <> s.turn_id then
    raise exception 'not_your_turn';
  end if;
  if cardinality(s.staging) = 0 then
    raise exception 'nothing_staged';
  end if;
  update iknow_state set phase = 'judging' where room_id = p_room;
  perform public._ik_touch(p_room);
end $$;

create or replace function public.iknow_judge(p_room uuid, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
  s iknow_state := public._ik_state(p_room);
  v_user uuid := public._ik_user(s.turn_id);
begin
  if s.phase <> 'judging' then
    raise exception 'wrong_phase';
  end if;
  if me.id <> s.keeper_id then
    raise exception 'not_keeper';
  end if;
  if p_ok then
    delete from iknow_hands where room_id = p_room and owner_user_id = v_user and card = any (s.staging);
    update iknow_state set table_cards = table_cards || staging, staging = '{}' where room_id = p_room;
    if public._ik_hand_size(p_room, s.turn_id) = 0 then
      perform public._ik_start_guess(p_room, s.turn_id);
    else
      perform public._ik_next_turn(p_room);
    end if;
  else
    update iknow_state set
      rejected = rejected || jsonb_build_array(jsonb_build_object('p', s.turn_id, 'cards', to_jsonb(s.staging), 't', s.turn_no)),
      staging = '{}'
    where room_id = p_room;
    perform public._ik_next_turn(p_room);
  end if;
  perform public._ik_touch(p_room);
end $$;

create or replace function public.iknow_cant_play(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
  s iknow_state := public._ik_state(p_room);
begin
  if s.phase <> 'turn' then
    raise exception 'wrong_phase';
  end if;
  if me.id <> s.turn_id then
    raise exception 'not_your_turn';
  end if;
  update iknow_state set phase = 'checking', check_id = me.id, staging = '{}' where room_id = p_room;
  perform public._ik_touch(p_room);
end $$;

-- p_card: a card from their hand that fits → it goes on the table and they draw 1.
-- null: they really can't play → their hand goes back into the deck and they draw one fewer.
create or replace function public.iknow_check(p_room uuid, p_card int) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
  s iknow_state := public._ik_state(p_room);
  v_user uuid := public._ik_user(s.check_id);
  v_n int;
begin
  if s.phase <> 'checking' then
    raise exception 'wrong_phase';
  end if;
  if me.id <> s.keeper_id then
    raise exception 'not_keeper';
  end if;
  if p_card is not null then
    delete from iknow_hands where room_id = p_room and owner_user_id = v_user and card = p_card;
    if not found then
      raise exception 'card_not_found';
    end if;
    update iknow_state set table_cards = table_cards || p_card, last_check = jsonb_build_object('p', s.check_id, 'card', p_card, 't', s.turn_no)
    where room_id = p_room;
    perform public._ik_draw(p_room, v_user, 1);
    perform public._ik_next_turn(p_room);
  else
    v_n := public._ik_hand_size(p_room, s.check_id);
    insert into iknow_deck (room_id, card) select room_id, card from iknow_hands where room_id = p_room and owner_user_id = v_user;
    delete from iknow_hands where room_id = p_room and owner_user_id = v_user;
    perform public._ik_draw(p_room, v_user, v_n - 1);
    update iknow_state set last_check = jsonb_build_object('p', s.check_id, 'card', null, 'n', v_n, 't', s.turn_no)
    where room_id = p_room;
    if public._ik_hand_size(p_room, s.check_id) = 0 then
      perform public._ik_start_guess(p_room, s.check_id);
    else
      perform public._ik_next_turn(p_room);
    end if;
  end if;
  perform public._ik_touch(p_room);
end $$;

-- ---------------------------------------------------------------- guessing

create or replace function public.iknow_guess(p_room uuid, p_rule int) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
  s iknow_state := public._ik_state(p_room);
  sec iknow_secret;
  v_score jsonb;
begin
  if s.phase <> 'guessing' then
    raise exception 'wrong_phase';
  end if;
  if me.id <> s.guesser_id then
    raise exception 'not_your_turn';
  end if;
  select * into sec from iknow_secret where room_id = p_room;
  if not (p_rule = any (sec.guess_options)) then
    raise exception 'invalid_rule';
  end if;
  if p_rule = sec.rule_id then
    v_score := public._ik_score(p_room, me.id);
    update iknow_state set phase = 'done', result = jsonb_build_object(
      'guesser', me.id, 'rule', sec.rule_id, 'options', to_jsonb(sec.guess_options),
      'deltas', v_score -> 'deltas', 'counts', v_score -> 'counts')
    where room_id = p_room;
    update rooms set status = 'result' where id = p_room;
  else
    update iknow_state set phase = 'guess_wrong',
      wrong_guesses = wrong_guesses || jsonb_build_array(jsonb_build_object('p', me.id, 'rule', p_rule))
    where room_id = p_room;
  end if;
  perform public._ik_touch(p_room);
end $$;

-- After a wrong guess the chance goes round in seat order: the next player takes it
-- (the host may pass it on for someone who isn't at the screen).
create or replace function public.iknow_pass_guess(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
  s iknow_state := public._ik_state(p_room);
  v_next uuid := public._ik_next(p_room, s.guesser_id, array[s.keeper_id]);
begin
  if s.phase <> 'guess_wrong' then
    raise exception 'wrong_phase';
  end if;
  if me.id <> v_next and me.user_id <> r.host_user_id then
    raise exception 'not_your_turn';
  end if;
  perform public._ik_start_guess(p_room, v_next);
  perform public._ik_touch(p_room);
end $$;

-- What the caller may see right now: the keeper gets the rule (and the options, the deck or a
-- checked hand while those steps run); the guesser gets their 3 options.
create or replace function public.iknow_secret(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me players := public._my_player(p_room);
  s iknow_state := public._ik_state(p_room);
  sec iknow_secret;
begin
  select * into sec from iknow_secret where room_id = p_room;
  if me.id = s.keeper_id and s.phase not in ('final') then
    return jsonb_build_object(
      'rule', sec.rule_id,
      'rule_options', case when s.phase = 'pick_rule' then to_jsonb(sec.rule_options) end,
      'deck', case when s.phase = 'pick_start' then (select coalesce(jsonb_agg(card order by card), '[]') from iknow_deck where room_id = p_room) end,
      'check_hand', case when s.phase = 'checking' then (
        select coalesce(jsonb_agg(h.card order by h.card), '[]') from iknow_hands h
        where h.room_id = p_room and h.owner_user_id = public._ik_user(s.check_id)) end,
      'guess_options', case when s.phase = 'guessing' then to_jsonb(sec.guess_options) end);
  end if;
  if me.id = s.guesser_id and s.phase = 'guessing' then
    return jsonb_build_object('guess_options', to_jsonb(sec.guess_options));
  end if;
  return '{}'::jsonb;
end $$;

-- ---------------------------------------------------------------- shared functions, iknow-aware

-- 0004's version, plus: in a ใครไม่รู้ game the leaver's cards go back and the round moves on.
create or replace function public._remove_player(r rooms, p players) returns void
language plpgsql as $$
declare
  v_new_host uuid;
begin
  if r.game = 'iknow' then
    perform public._ik_player_left(r, p);
  end if;

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

  if r.game = 'ito' and r.status = 'placing' and r.reveal_index >= 0
     and not exists (select 1 from board_cards where room_id = r.id and round = r.round and revealed_value is null) then
    perform public._finish_round(r.id);
  end if;
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
  delete from iknow_hands where room_id = p_room;
  delete from iknow_deck where room_id = p_room;
  delete from iknow_secret where room_id = p_room;
  delete from iknow_state where room_id = p_room;
  update rooms
  set status = 'lobby', level = 1, lives = 3, current_theme = null, reveal_index = -1, last_result = null
  where id = p_room;
end $$;

-- ---------------------------------------------------------------- grants

revoke execute on function
  public._ik_rule_count(), public._ik_state(uuid), public._ik_active(uuid), public._ik_next(uuid, uuid, uuid[]),
  public._ik_draw(uuid, uuid, int), public._ik_touch(uuid, uuid), public._ik_hand_size(uuid, uuid), public._ik_user(uuid),
  public._ik_begin_round(uuid), public._ik_next_turn(uuid, uuid), public._ik_start_guess(uuid, uuid),
  public._ik_score(uuid, uuid), public._ik_abort_round(uuid), public._ik_player_left(rooms, players),
  public._remove_player(rooms, players),
  public.set_game(uuid, text), public.iknow_start(uuid), public.iknow_next_round(uuid), public.iknow_end_game(uuid),
  public.iknow_pick_rule(uuid, int), public.iknow_pick_start(uuid, int), public.iknow_stage(uuid, int[]),
  public.iknow_submit(uuid), public.iknow_judge(uuid, boolean), public.iknow_cant_play(uuid), public.iknow_check(uuid, int),
  public.iknow_guess(uuid, int), public.iknow_pass_guess(uuid), public.iknow_secret(uuid)
from public, anon, authenticated;

grant execute on function
  public.set_game(uuid, text), public.iknow_start(uuid), public.iknow_next_round(uuid), public.iknow_end_game(uuid),
  public.iknow_pick_rule(uuid, int), public.iknow_pick_start(uuid, int), public.iknow_stage(uuid, int[]),
  public.iknow_submit(uuid), public.iknow_judge(uuid, boolean), public.iknow_cant_play(uuid), public.iknow_check(uuid, int),
  public.iknow_guess(uuid, int), public.iknow_pass_guess(uuid), public.iknow_secret(uuid)
to authenticated;
