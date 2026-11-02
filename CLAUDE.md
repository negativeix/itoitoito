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

## Design quick reference (section 2)
- Colors are CSS variables on `:root` (light + dark): `--bg --surface --surface-2 --ink --ink-muted --thread --success --danger --line`. Player colors always paired with initials.
- Fonts: Anuphan (UI), Fraunces (numbers, tabular-nums). Thai line-height ≥ 1.5.
- Card 5:7, radius 20; buttons radius 16, primary 56px tall full-width at the bottom; touch targets ≥ 48px; 16px side gutter + safe-area insets.
- Motion: spring `{ stiffness: 400, damping: 30 }`; respect `prefers-reduced-motion` (fade instead).
- localStorage access always wrapped in try/catch.
