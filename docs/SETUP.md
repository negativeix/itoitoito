# Setup & deploy

A mobile-first web app for playing **ito** with friends in the same room: everyone's phone is their card, and the conversation happens face to face. Full spec: [ITO_PLAN.md](../ITO_PLAN.md). Project rules for contributors and AI agents: [CLAUDE.md](../CLAUDE.md).

Stack: Vite · React 18 · TypeScript · Tailwind CSS v4 · motion · Zustand · Supabase (anonymous auth, Postgres + RLS, Realtime) · vite-plugin-pwa.

## Run locally

Requires Node 22+ and Docker Desktop.

```bash
npm install
npx supabase start              # local Postgres/Auth/Realtime in Docker
npx supabase status -o env      # copy API_URL and ANON_KEY into .env.local (see below)
npm run dev                     # http://localhost:5173 (also on your LAN for phones)
```

`.env.local`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<ANON_KEY from supabase status>
```

To test on phones over Wi-Fi, set `VITE_SUPABASE_URL` to your computer's LAN IP (e.g. `http://192.168.1.73:54321`) so the phones can reach Supabase too.

## Connect a real Supabase project

1. Create a project at supabase.com.
2. **Authentication → Sign In / Providers → enable "Allow anonymous sign-ins".** The app does not work without this.
3. Push the schema: `npx supabase link --project-ref <ref>` then `npx supabase db push`. This applies `supabase/migrations/*` (tables, RLS, RPCs, and the pg_cron cleanup job).
4. Put the project URL and **anon/publishable** key in Vercel (or `.env.local`) as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Never use the service-role key in the frontend.
5. Realtime: the migration adds `rooms`, `players`, `board_cards` to the `supabase_realtime` publication. `hands` must never be added.

## Deploy (Vercel)

Import the repo; framework preset **Vite**, build `npm run build`, output `dist`. Add the two env vars. `vercel.json` rewrites deep links like `/r/ABCD` to the SPA.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (LAN-exposed) |
| `npm run build` | Typecheck + production build (with PWA service worker) |
| `npm run test:unit` | Rule/ordering/theme unit tests |
| `npm run test:db` | RLS + game-flow tests against local Supabase (needs `supabase start`) |
| `npx playwright test` | Browser E2E: 2–3 simulated phones play full games (needs dev server + local Supabase) |
| `npm run db:reset` | Re-apply all migrations to the local database |

E2E screenshots are written to `docs/screenshots/` (git-ignored).

## Topic ideas

Suggestions live in [src/data/themes.ts](../src/data/themes.ts) (client-side only — edit and redeploy, no migration needed). Players can always type their own topic; topics a room has played are remembered in `rooms.theme_history`.
