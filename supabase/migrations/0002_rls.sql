-- Row Level Security (ITO_PLAN §4.3) — the most important file in the project.
-- Clients may only SELECT. Every write goes through security-definer RPCs (0003_rpc.sql).

alter table themes enable row level security;
alter table rooms enable row level security;
alter table players enable row level security;
alter table hands enable row level security;
alter table board_cards enable row level security;
alter table heartbeats enable row level security;

-- Security definer so the players policy can check membership without recursing into itself.
create or replace function public.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players p where p.room_id = p_room and p.user_id = auth.uid())
$$;

create policy themes_select_all on themes for select to anon, authenticated using (true);

create policy rooms_select_member on rooms for select to authenticated using (public.is_room_member(id));
create policy players_select_member on players for select to authenticated using (public.is_room_member(room_id));
create policy board_select_member on board_cards for select to authenticated using (public.is_room_member(room_id));

-- hands: owner only. There must never be any other policy on this table.
create policy hands_select_owner on hands for select to authenticated using (owner_user_id = auth.uid());

-- heartbeats: no policies at all (RPC access only).

-- Defense in depth: no direct writes from client roles, whatever policies exist.
revoke insert, update, delete, truncate on themes, rooms, players, hands, board_cards, heartbeats from anon, authenticated;
revoke select on rooms, players, hands, board_cards, heartbeats from anon;
revoke select on heartbeats from authenticated;

-- Realtime: public tables only. `hands` is deliberately NOT published.
alter publication supabase_realtime add table rooms, players, board_cards;
