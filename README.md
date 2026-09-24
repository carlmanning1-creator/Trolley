# Trolley

The Manning family's shared grocery list. An installable web app (PWA) for Android, iPhone and the kitchen screen, live at https://trolley-iota.vercel.app.

The full build brief and every decision behind it is in `CLAUDE.md`.

## What's in it

- Shared lists with live sync, sorted by supermarket aisle, that keep working with no signal
- Sign-in with a 6-digit email code (invite only)
- Staples, recently bought, and automatic aisle sorting (keyword list, Open Food Facts, then Claude)
- Product pictures found automatically: Open Food Facts, then Wikimedia Commons, then a Claude web search (capped at 150 a month), or your own photos. Renaming an item looks again.
- A link on any item, and export of a list as shared text, a spreadsheet or a printout
- Barcode scanning with the phone camera
- Shopping mode with notifications to the rest of the household
- Receipt scanning that ticks off what you bought
- A full-screen kitchen display at `/kiosk`

## How it fits together

- **Next.js 16** (App Router) on **Vercel**, deployed on every push to `main`
- **Supabase** (Sydney) for the database, sign-in, live updates and photo storage. All schema, security rules and seed data live in `supabase/migrations`.
- The app reads and writes an on-device database (**Dexie**). Changes queue up and sync when there's signal (`src/lib/sync.ts`). The server settles conflicts: the latest edit wins, and the latest tick or untick wins for ticks.
- **Serwist** service worker, so the app opens offline
- Server routes in `src/app/api` handle everything needing a secret: Claude (aisle sorting, receipts), Open Food Facts, and push notifications.

## Running it locally

```bash
npm install
npm run dev            # http://localhost:3000
```

Settings come from `.env.local` (names listed in `.env.example`; values are in Vercel's project settings).

## Checks

```bash
npm run lint
npm run typecheck
npm test                   # unit tests
npm run test:integration   # household isolation and live-sync tests against Supabase
npm run build              # also fails if a server-only secret reaches browser code
npm run test:e2e           # browser tests on Android and iPhone screen sizes (after a build)
E2E_BASE_URL=https://trolley-iota.vercel.app npx playwright test   # against the live site
```

The browser tests create throwaway households and people, never touch the family's lists, and never send real emails.

## Database changes

Add a new file to `supabase/migrations` (never edit an applied one), then:

```bash
npm run db:push
```
