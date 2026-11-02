-- Free flipping, like the physical game: anyone who feels their number is the lowest left flips
-- it, at any time. No waiting for every card to be on the table, no fixed turn order.
--   * A flipped card joins the revealed row right after the last revealed card.
--   * Classic: the first wrong card snaps the thread and ends the round (all numbers are shown).
--   * Level Up: each wrong card costs a heart; the game ends when hearts run out.

-- Flips one card and appends it to the revealed row. Rule §1.1.8: wrong when lower than the
-- highest value revealed before it.
create or replace function public._reveal(p_room uuid, p_card uuid) returns void
language plpgsql as $$
declare
  r rooms;
  v_value int;
  v_max int;
  v_floor double precision;
  v_ceil double precision;
  v_wrong boolean;
  v_wrong_total int;
begin
  select * into r from rooms where id = p_room;
  select value into v_value from hands where card_id = p_card;

  select coalesce(max(revealed_value), 0), max(position) into v_max, v_floor
  from board_cards where room_id = p_room and round = r.round and revealed_value is not null;
  select min(position) into v_ceil
  from board_cards
  where room_id = p_room and round = r.round and revealed_value is null and position is not null and card_id <> p_card;

  v_wrong := v_value < v_max;
  update board_cards
  set position = case
        when v_floor is null and v_ceil is null then 1
        when v_floor is null then v_ceil - 1
        when v_ceil is null then v_floor + 1
        else (v_floor + v_ceil) / 2
      end,
      revealed_value = v_value, is_wrong = v_wrong, reveal_order = r.reveal_index + 1
  where card_id = p_card;
  update rooms set reveal_index = reveal_index + 1 where id = p_room;

  select count(*) filter (where is_wrong) into v_wrong_total
  from board_cards where room_id = p_room and round = r.round;

  if not exists (select 1 from board_cards where room_id = p_room and round = r.round and revealed_value is null)
     or (r.mode = 'classic' and v_wrong)
     or (r.mode = 'levelup' and r.lives - v_wrong_total <= 0) then
    perform public._finish_round(p_room);
  end if;
end $$;

-- Flip one of my own face-down cards (from hand or table). Repeated calls are no-ops.
create or replace function public.flip_card(p_room uuid, p_card uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rooms := public._lock_room(p_room);
  me players := public._my_player(p_room);
  b board_cards;
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
  if b.owner_player_id <> me.id then
    raise exception 'not_your_card';
  end if;
  perform public._reveal(p_room, p_card);
end $$;

-- Host shortcut: flip everything left in table order (cards still in hands go last).
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
  for i in 1..100 loop
    select * into r from rooms where id = p_room;
    exit when r.status <> 'placing';
    select card_id into v_next from board_cards
    where room_id = p_room and round = r.round and revealed_value is null
    order by position nulls last, card_id limit 1;
    exit when v_next is null;
    perform public._reveal(p_room, v_next);
  end loop;
end $$;

-- Same as before, except the round now ends when no face-down card is left anywhere.
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
  if r.status = 'placing' and r.reveal_index >= 0
     and not exists (select 1 from board_cards where room_id = r.id and round = r.round and revealed_value is null) then
    perform public._finish_round(r.id);
  end if;
end $$;

drop function if exists public.flip_next(uuid, uuid);
drop function if exists public._next_card(uuid, int);

revoke execute on function public.flip_card(uuid, uuid) from public, anon;
grant execute on function public.flip_card(uuid, uuid) to authenticated;
