-- Play on after the thread snaps: a wrong card no longer ends the round. Everyone keeps flipping
-- until every card is face up, then the round is judged.
--   * Classic: the result counts how many times the thread snapped.
--   * Level Up: each wrong card still costs a heart (never below 0); 0 hearts → game over, but only
--     once the round is played out.
-- Rule §1.1.8 is unchanged: a card is wrong when it is lower than the highest value revealed before it.
create or replace function public._reveal(p_room uuid, p_card uuid) returns void
language plpgsql as $$
declare
  r rooms;
  v_value int;
  v_max int;
  v_floor double precision;
  v_ceil double precision;
begin
  select * into r from rooms where id = p_room;
  select value into v_value from hands where card_id = p_card;

  select coalesce(max(revealed_value), 0), max(position) into v_max, v_floor
  from board_cards where room_id = p_room and round = r.round and revealed_value is not null;
  select min(position) into v_ceil
  from board_cards
  where room_id = p_room and round = r.round and revealed_value is null and position is not null and card_id <> p_card;

  update board_cards
  set position = case
        when v_floor is null and v_ceil is null then 1
        when v_floor is null then v_ceil - 1
        when v_ceil is null then v_floor + 1
        else (v_floor + v_ceil) / 2
      end,
      revealed_value = v_value, is_wrong = v_value < v_max, reveal_order = r.reveal_index + 1
  where card_id = p_card;
  update rooms set reveal_index = reveal_index + 1 where id = p_room;

  if not exists (select 1 from board_cards where room_id = p_room and round = r.round and revealed_value is null) then
    perform public._finish_round(p_room);
  end if;
end $$;
