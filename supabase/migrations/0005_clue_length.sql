-- Clues may be up to 60 characters (was 24). Same function as 0003 otherwise.
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
  if char_length(v_clue) > 60 then
    raise exception 'clue_too_long';
  end if;
  update board_cards set clue = v_clue where card_id = p_card;
end $$;

alter table public.board_cards drop constraint board_cards_clue_check;
alter table public.board_cards add constraint board_cards_clue_check check (char_length(clue) <= 60);
