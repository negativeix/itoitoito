-- ito Online — schema (ITO_PLAN §4.2)

create extension if not exists pgcrypto with schema extensions;

create type room_status as enum ('lobby', 'choosing_theme', 'placing', 'result', 'game_over');
create type game_mode as enum ('classic', 'levelup');

create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,               -- 4 letters A–Z without I, O
  status room_status not null default 'lobby',
  mode game_mode not null default 'classic',
  host_user_id uuid not null,
  cards_per_player int not null default 1 check (cards_per_player between 1 and 10), -- classic setting
  level int not null default 1,
  lives int not null default 3,
  round int not null default 0,
  current_theme jsonb,                      -- {id, category, title, low, high, set_by}; set by players each round
  theme_history jsonb not null default '[]', -- topics this room has played (newest first), for reuse
  reveal_index int not null default -1,     -- reveal_order of the last revealed card (-1 = none yet)
  last_result jsonb,                        -- {wrong, total, perfect, lives_before, lives_after, level, deck_complete}
  -- Bumped whenever players/cards are deleted. Realtime cannot filter DELETE events by room,
  -- so clients watch this (filterable) rooms UPDATE and refetch instead.
  roster_version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 16),
  color text not null,
  seat int not null,
  spectating boolean not null default false, -- joined mid-round; plays from the next round
  left_at timestamptz,                       -- left after cards were revealed; removed at the next round
  joined_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, color)
);
create index players_user_idx on players (user_id);

-- Secret part: the real numbers (readable by the owner only).
create table hands (
  card_id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  round int not null,
  owner_user_id uuid not null,
  value int not null check (value between 1 and 100)
);
create index hands_room_idx on hands (room_id, round);
create index hands_owner_idx on hands (owner_user_id);

-- Public part on the table (no number until the server reveals it).
create table board_cards (
  card_id uuid primary key references hands(card_id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  round int not null,
  owner_player_id uuid not null references players(id) on delete cascade,
  position double precision,                -- null = still in hand; fractional index
  clue text check (char_length(clue) <= 24),
  reveal_order int,                         -- set when this card is flipped (0, 1, 2, ...)
  revealed_value int,                       -- null until revealed by the server
  is_wrong boolean
);
create index board_room_idx on board_cards (room_id, round);

-- Server-visible liveness for host migration (§4.6). Not readable by clients, not in realtime.
create table heartbeats (
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create or replace function public._touch_updated_at() returns trigger
language plpgsql as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger rooms_touch before update on rooms
for each row execute function public._touch_updated_at();
