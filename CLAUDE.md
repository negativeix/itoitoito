# CLAUDE.md — ito Online

Full spec: [ITO_PLAN.md](ITO_PLAN.md). Read it before any non-trivial change. Build **one phase at a time** (section 6); each phase must meet its Acceptance Criteria before the next starts.

## Workflow
- Commit after each meaningful step. Plain commit messages — **no Claude co-author / attribution lines**.
- UI text is **Thai**; code, identifiers and comments are **English**.

## Stack (section 0)
Vite + React 18 + TypeScript + Tailwind CSS v4 + `motion` + @dnd-kit + Zustand + Supabase (anonymous auth, Postgres, Realtime, Edge Functions) + vite-plugin-pwa. Deploy: Vercel + Supabase.

## Iron rules
1. **Never send another player's card value to a client before reveal.** Not in queries, not in realtime payloads, not in Edge Function responses.
2. **Server-authoritative.** Every game-state change goes through an Edge Function or Postgres RPC. The only client-initiated writes are moving your own card (`move_card`) and setting your own clue (`set_clue`), both via `security definer` RPCs.

## Security / RLS (section 4.3)
- RLS enabled on **every** table.
- `rooms`, `players`, `board_cards`: `select` only for members of that room (`exists (select 1 from players p where p.room_id = X.room_id and p.user_id = auth.uid())`).
- `hands`: `select` only where `owner_user_id = auth.uid()`. **No other policy on `hands`, ever.**
- `board_cards` client updates only through RPCs `move_card(card_id, position)` / `set_clue(card_id, clue)`: own card only, only while `rooms.status = 'placing'`; `move_card` resets `locked` for everyone.
- All other inserts/updates: Edge Functions with the service role only.
- Tests must prove: user B cannot see user A's `hands` rows, and `board_cards.revealed_value` is null before reveal.

## Game-clarity UI rules (section 2.7) — never violate
1. During a round, the **topic bar + scale** (`1 · low ←→ high · 100`) is pinned at the top of every screen.
2. **One primary button per screen**; everything else is secondary/ghost.
3. A **status line** under the topic bar always says what we're waiting for ("รอ บอส, มิ้นท์ วางการ์ด (4/6)").
4. **Secret numbers never leak by accident**: shown only while pressing and holding, hidden immediately on `visibilitychange`, never in `<title>` or notifications.
5. **My cards** on the table have a red-thread ring + a "ของฉัน" label.
6. Every screen has empty / loading / error states written in plain human Thai ("กำลังต่อเน็ตใหม่…", not "Error 500").
7. Button labels are short verbs: "สร้างห้อง", "เข้าห้อง", "เริ่มเกม", "มั่นใจแล้ว", "เปิดการ์ด".

## Architecture decisions (deviations from the plan, on purpose)
- **Postgres RPCs instead of Edge Functions.** Every action in §4.4 is a `security definer` function in `supabase/migrations/0003_rpc.sql` (one transaction each, CSPRNG via `gen_random_bytes`). `lock` is named `lock_in`. Helpers prefixed `_` are not executable by clients.
- **Realtime can't room-filter DELETE events.** Server bumps `rooms.roster_version` whenever players/cards are removed; clients refetch the snapshot when it changes. Don't rely on DELETE payloads.
- **Never subscribe to `hands`** (not published). Putting an unpublished table in the same channel breaks the whole channel's postgres_changes.
- **Host liveness** for migration uses the `heartbeats` table (RPC `heartbeat` every 10 s), not presence alone, so the server can verify "host gone > 20 s".
- **Drag is custom pointer code** (not @dnd-kit) because one gesture must separate tap (clue), hold (peek) and drag. Keep the dragged card's DOM node mounted during a drag (iOS drops touch events for removed targets).
- **Free flipping (real-life flow, replaces the plan's lock → auto-reveal).** Anyone may flip one of their own face-down cards at any time (`flip_card`, migration 0004): no need for everyone to place first, no turn order. The client flips the player's lowest card, behind a two-tap confirm. A flipped card joins the revealed row; face-down cards can only sit to its right (`move_card`). Classic: the first wrong card ends the round and every number is shown (unflipped cards keep `is_wrong = null`). Level Up: each wrong card costs a heart; 0 hearts ends the game. `reveal_all` is a host shortcut.
- **Topics are custom-first.** Any player sets the topic (`set_theme`); `src/data/themes.ts` is only a client-side suggestion list (no themes table, no reroll votes, no category setting). Played topics are kept per room in `rooms.theme_history` for "วงนี้เคยเล่น".
- Two players dropping at the same spot before seeing each other's move can get equal positions; ties break by card id identically on every client, and players can simply move again.
- Zustand selectors must return stable references — derive arrays with `useMemo` outside the selector.
- Small red/green text uses `--thread-ink` / `--success-ink` / `--danger-ink` (WCAG AA); brand `--thread` stays for large elements.

## Testing
- `npm run test:unit`, `npm run test:db` (needs `npx supabase start`), `npx playwright test` (starts its own server with `--mode e2e`, which reads `.env.e2e.local` → local Supabase; never run tests against production). Run DB tests a few seconds after `db reset` (realtime restarts).
- Migrations 0001–0004 are applied in production: never edit them; add a new migration file instead.
- Any change to RLS or RPCs must keep `supabase/tests/rls.test.ts` green.

## Design quick reference (section 2)
- Colors are CSS variables on `:root` (light + dark): `--bg --surface --surface-2 --ink --ink-muted --thread --success --danger --line`. Player colors always paired with initials.
- Fonts: Anuphan (UI), Fraunces (numbers, tabular-nums). Thai line-height ≥ 1.5.
- Card 5:7, radius 20; buttons radius 16, primary 56px tall full-width at the bottom; touch targets ≥ 48px; 16px side gutter + safe-area insets.
- Motion: spring `{ stiffness: 400, damping: 30 }`; respect `prefers-reduced-motion` (fade instead).
- localStorage access always wrapped in try/catch.
