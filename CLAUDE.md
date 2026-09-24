# Trolley: Family Grocery List App

Build brief for Claude Code. Read this whole file before doing anything. It holds every decision already made with Carl, the owner. Do not re-ask anything answered here.

The working name is **Trolley**. Carl can rename it later; keep the name in one config constant so a rename touches one place.

---

## 1. How to work on this build

**Operate autonomously.** Carl wants maximum automation. Create the GitHub repo, the Supabase project, the Vercel project, environment variables, database migrations, seed data and deployments yourself using the CLIs. Only stop for the items in Section 2, or when a step would cost money beyond free tiers, delete data, or cannot be undone.

**Carl's standing rules for code:**
- Self-test and self-debug until you are 95% or more confident there are no errors before calling anything done.
- After any code is written or pushed, immediately review the changed files and everything they touch for breaks, errors, conflicts or downstream impacts. Fix critical and high issues automatically. Report medium and low risks in a short list.
- Plain language in all messages to Carl. Lead with the result, one short paragraph of explanation at most.
- No placeholders in committed code or config. If a value is missing, ask for it.

**Before using any library**, check its current stable version and current docs. Do not rely on remembered APIs for Next.js, Supabase, Serwist or the Anthropic SDK; confirm them.

---

## 2. What Claude Code needs from Carl (ask once, at the start)

Ask for all of these in a single message, then work unattended:

1. Confirm `gh auth status` works (GitHub CLI logged in). If not, ask Carl to run `gh auth login`.
2. Confirm `vercel whoami` works. If not, ask Carl to run `vercel login`.
3. A Supabase personal access token (from supabase.com, Account, Access Tokens) and which Supabase organisation to use. Store the token only in the local shell environment, never in the repo.
4. The Anthropic API key. Store it only in Vercel env vars and local `.env.local` (gitignored).
5. Email addresses and display names for the three users: Carl, Bec and Grace.
6. A contact email for the Open Food Facts User-Agent header (Carl's email is fine).

Everything else in this file is decided. Proceed.

---

## 3. What the app is

A shared grocery and shopping list for a household of three adults. Carl and Bec use Android, Grace uses iPhone. It replaces a shared Google Keep note, so it must feel at least as fast as Keep for adding and ticking items, then go further.

It later runs on a 32 inch Android touch screen in the kitchen (Fully Kiosk Browser), so the layout must scale well to a large landscape screen.

**Platform:** Progressive Web App. Installed via "Add to Home Screen" on iOS Safari and Android Chrome. No app stores.

---

## 4. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router), TypeScript, strict mode | Deploys natively on Vercel |
| Styling | Tailwind CSS | Fast, consistent, easy responsive layouts |
| Database, auth, realtime, file storage | Supabase | Live sync across phones, row level security, storage for photos |
| Offline | Serwist service worker plus Dexie (IndexedDB) local store and outbox queue | Works with no signal in the shop, syncs later |
| Barcode scanning | `@zxing/browser` (or current maintained equivalent) | iOS Safari lacks the native BarcodeDetector API |
| Product data and images | Open Food Facts API | Free, no key, decent Australian coverage |
| AI | Anthropic API via server route only | Receipt reading and item categorisation |
| Push notifications | Web Push with VAPID via the `web-push` package | Works on Android and on iOS 16.4+ when installed to home screen |
| Tests | Vitest for units, Playwright for end to end | Includes offline and mobile viewport tests |
| Hosting | Vercel, deployed from GitHub on push to `main` | |

---

## 5. Setup automation (do this yourself)

1. `gh repo create trolley --private --clone` and initialise the Next.js app inside it.
2. Create the Supabase project with the Supabase CLI using the token from Section 2. Region: Sydney (`ap-southeast-2`). Link it locally.
3. Write all schema, policies, storage buckets and seed data as SQL migrations under `supabase/migrations`. Push them with the CLI. Never change the database by hand.
4. Generate VAPID keys with `npx web-push generate-vapid-keys`.
5. Create and link the Vercel project with `vercel link`, connect it to the GitHub repo, and add every environment variable in Section 12 for Production, Preview and Development with `vercel env add`.
6. In Supabase Auth settings (via CLI config or Management API): set the Site URL to the Vercel production URL, disable public sign-ups, enable email OTP codes.
7. Create the three user accounts with the Supabase admin API using the emails from Section 2, and seed their profiles and the household.
8. Push to `main` and confirm the Vercel deployment succeeds. Report the live URL to Carl.

---

## 6. Authentication

- Separate sign-in for each person, so the app shows who added and ticked what.
- **Use 6-digit email OTP codes, not magic links.** Magic links open in Safari instead of the installed app on iPhone, which breaks sign-in for Grace.
- Invite only. Public sign-up disabled. Only the three seeded emails can sign in.
- Sessions persist so nobody signs in again after the first time.
- Each person has a display name and a colour, used on items they add.

---

## 7. Data model

Use client-generated UUIDs for every row so records can be created offline. Every table has `created_at`, `updated_at` and, where rows can be removed, `deleted_at` for soft deletes (needed so deletions sync correctly after being offline).

- **households**: `id`, `name`
- **profiles**: `id` (auth user id), `household_id`, `display_name`, `colour`
- **lists**: `id`, `household_id`, `name`, `icon`, `sort_order`. Seed with Groceries, Bunnings, Other, Wish List (Carl's choice, replacing the original Chemist and Kmart).
- **aisles**: `id`, `household_id`, `name`, `sort_order`. Seed in this order: Fruit & Veg, Bakery, Deli, Meat & Seafood, Dairy & Eggs, Fridge, Frozen, Pantry, Breakfast, Snacks & Lollies, Drinks, Health & Beauty, Baby, Cleaning & Household, Pet, Other. Users can reorder and rename.
- **products** (the household's own catalogue, built up as items get added): `id`, `household_id`, `name`, `barcode`, `aisle_id`, `image_path`, `image_source` (`off`, `photo`, `upload`, `none`), `off_code`, `is_staple`, `default_quantity`, `default_unit`, `times_bought`, `last_bought_at`
- **list_items**: `id`, `list_id`, `product_id`, `name`, `quantity`, `unit`, `note`, `added_by`, `checked`, `checked_by`, `checked_at`, plus timestamps
- **shopping_sessions**: `id`, `list_id`, `started_by`, `started_at`, `ended_at`
- **push_subscriptions**: `id`, `profile_id`, `endpoint`, `keys` (jsonb), `device_label`
- **receipts**: `id`, `household_id`, `uploaded_by`, `image_path`, `store_name`, `purchased_at`, `total`, `status` (`processing`, `review`, `confirmed`, `failed`), `raw_ai_json`
- **receipt_lines**: `id`, `receipt_id`, `product_id` (nullable), `description`, `quantity`, `unit_price`, `line_total`

**Row level security on every table:** a user can read and write only rows belonging to their household. Write and run tests that prove a user from another household cannot read anything.

**Storage buckets** (private, household-scoped policies): `product-images`, `receipts`.

---

## 8. Version 1 features

### 8.1 Core list
- Add an item in one tap from a text box at the top. Typing shows matching products from the catalogue and staples as suggestions.
- Tick to mark bought, untick to restore. Ticked items drop to a collapsed "In the trolley" section.
- Swipe or long-press to edit quantity, unit and note, or delete.
- Items grouped and sorted by aisle so the list follows a walk through the shop.
- Each item shows the product picture, the name, quantity, note, and a small coloured dot plus initial for who added it.
- Changes appear on everyone's device within about a second (Supabase Realtime).
- "Clear ticked items" button.

### 8.2 Multiple lists
- Switch lists from a tab bar or dropdown. Add, rename, reorder and delete lists.
- Aisles apply to the Groceries list. Other lists can use aisles or a flat order (per-list setting).

### 8.3 Aisle auto-sort
When an item is added without an aisle, assign one in this order and stop at the first hit:
1. The product already exists in the catalogue: use its aisle.
2. A built-in keyword map (write a solid Australian supermarket map, for example "milk" to Dairy & Eggs, "snags" to Meat & Seafood, "Weet-Bix" to Breakfast).
3. Open Food Facts categories, if the item came from a barcode or OFF search.
4. Claude fallback: send only the item name to the server route, which asks the model to pick one aisle name from the household's list and returns it. Cache the result on the product so each name is classified once.

Users can move an item to another aisle, and that choice updates the product so it sticks next time.

### 8.4 Staples and history
- Mark any product as a staple.
- A "Staples" sheet shows all staples with one-tap add, and greys out ones already on the list.
- A "Recent" sheet shows products bought in the last eight weeks, most frequent first.

### 8.5 Shopping mode
- "Start shopping" button on a list. It creates a shopping session and sends a push notification to the other two users: "Carl is at the shops. Add anything you need now."
- While a session is active, any item added by someone else triggers a push to the shopper and highlights in the list.
- "Finish shopping" ends the session, offers to clear ticked items, and prompts "Scan the receipt?"
- A banner shows on everyone's screen while someone is shopping.

### 8.6 Product pictures
- On add, look for a picture: first the catalogue, then Open Food Facts (barcode lookup if a barcode exists, otherwise a name search restricted to results that include an image).
- Any user can replace a picture by taking a photo or uploading one. Resize client-side to max 800px and compress to WebP or JPEG before upload.
- If no picture exists, show a clean placeholder tile with the aisle icon.
- Proxy all Open Food Facts calls through a Next.js server route that sends the required User-Agent (`Trolley/1.0 (contact email)`) and caches responses. Respect their rate limits (product lookups roughly 100 per minute, searches roughly 10 per minute); debounce search as the user types.
- Copy the chosen OFF image into the `product-images` bucket rather than hotlinking, so pictures keep working offline and if OFF changes URLs.

### 8.7 Barcode scanning
- Scan button opens the rear camera with a viewfinder.
- On a successful read: look the barcode up in the catalogue, then Open Food Facts. Pre-fill name, picture and aisle, then add to the current list with one confirm tap.
- If the barcode is unknown, open the add form with the barcode attached so the next scan works instantly.
- Must work in iOS Safari as an installed PWA and in Android Chrome. Test both viewports.

### 8.8 Receipt scanning
1. User photographs or uploads a receipt. Compress client-side, upload to the `receipts` bucket, create a `receipts` row with status `processing`.
2. A server route sends the image to the Anthropic API and asks for strict JSON: store name, purchase date, total, and line items (description, quantity, unit price, line total). Validate the JSON with Zod. On a parse failure, retry once, then mark `failed` with a friendly message.
3. Fuzzy-match each receipt line to products and to unticked items on the list. Australian receipts abbreviate heavily ("WW F/C MLK 2L"), so include the household catalogue names in the prompt and let the model propose matches.
4. Show a review screen: matched lines with the list item they tick off, unmatched lines, and list items that stayed unbought. The user confirms or adjusts.
5. On confirm: tick the matched list items, save receipt lines with prices, update each product's `times_bought` and `last_bought_at`, and set status `confirmed`.
6. Prices are stored for the version 2 spend tracking. No spending screens in version 1.

Receipt scanning needs a connection. If offline, save the photo locally and process it when back online, with a clear "Waiting for signal" badge.

---

## 9. Offline and sync

The shop often has poor reception. The app must stay fully usable offline for list work.

- Serwist precaches the app shell so it opens with no connection.
- Dexie mirrors the household's lists, list items, products and aisles locally. The UI always reads from Dexie, never directly from the network.
- Every change writes to Dexie immediately and adds an entry to an outbox table.
- A sync worker flushes the outbox to Supabase in order when online, and also on app focus and on the `online` event.
- Pull remote changes via Realtime when connected, plus a catch-up query using `updated_at` after reconnecting.
- Conflict rule: last write wins per row by `updated_at`, except `checked`: if either side ticked an item, keep it ticked unless the untick is newer.
- Show a small status pill: "Synced", "Offline, 3 changes waiting", "Syncing".
- Test offline behaviour with Playwright's offline mode: add, tick and delete while offline on two simulated users, reconnect, and assert both end in the same state.

---

## 10. Push notifications

- Ask for notification permission only after a user taps "Start shopping" or an explicit "Turn on notifications" button, never on first load (iOS rejects prompts that are not tied to a tap).
- On iPhone, push only works once the app is installed to the home screen. Detect iOS Safari not in standalone mode and show a short "Add to Home Screen" guide.
- Store subscriptions per device. Remove subscriptions that return 404 or 410 when sending.
- Send from a server route using the service role key and the `web-push` package.

---

## 11. Screens and layout

- **Phone:** single column. Add box pinned top, list grouped by aisle, bottom bar with Lists, Scan, Staples, Receipts, Settings.
- **Large screen (the kitchen display, landscape, around 1920px wide):** two or three columns, bigger touch targets and text, readable from across the room. Add a `/kiosk` route that shows the Groceries list full screen with the add box and scan button, no settings clutter, and never times out.
- Dark mode following the system setting.
- Settings: display name and colour, manage lists, reorder and rename aisles, notification toggle, sign out.
- Accessible: proper labels, 44px minimum touch targets, good contrast.

---

## 12. Environment variables

Set these in Vercel (all environments) and in a gitignored `.env.local`. Commit only a `.env.example` listing the names with no values.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or the current publishable key name Supabase uses)
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `ANTHROPIC_API_KEY` (server only)
- `ANTHROPIC_RECEIPT_MODEL` set to `claude-haiku-4-5-20251001`. If receipt accuracy tests fail, switch to `claude-sonnet-5` and report the change to Carl.
- `ANTHROPIC_CATEGORY_MODEL` set to `claude-haiku-4-5-20251001`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY` (server only)
- `VAPID_SUBJECT` as `mailto:` plus Carl's email
- `OFF_USER_AGENT` as `Trolley/1.0 (Carl's email)`

Never expose server-only keys to the client. Add a test that fails the build if any server-only variable name appears in client bundles.

---

## 13. Build order

Work through these phases in order. Finish each phase's checks before starting the next, and commit and push at the end of every phase so Vercel deploys it.

1. **Foundations:** repo, Next.js, Tailwind, Supabase project, migrations, RLS, seed data, auth with OTP, three users signed in. Deploy.
2. **Core list and realtime:** lists, items, aisles, add, tick, edit, delete, live sync between two browsers.
3. **Offline:** Dexie, outbox, service worker, status pill, offline Playwright tests.
4. **Catalogue, staples, history and aisle auto-sort.**
5. **Product pictures and barcode scanning.**
6. **Shopping mode and push notifications.**
7. **Receipt scanning.**
8. **Large-screen and kiosk layout, polish, accessibility pass.**
9. **Final review:** full test run, Lighthouse PWA check, security review of RLS and server routes, then send Carl the URL, install steps for iPhone and Android, and a short list of any medium or low risks.

---

## 14. Definition of done for version 1

- All three users can sign in on their own phones and see the same lists update live.
- Grace can install it on iPhone, sign in with a code, scan a barcode and receive a shopping-mode notification.
- Adding, ticking and deleting work with no signal and sync correctly afterwards.
- A photographed Woolworths or Coles receipt ticks off the matching items after review.
- Every item has a picture or a clean placeholder, and any picture can be replaced.
- All tests pass, the Vercel production build is green, and no secrets sit in the repo.

---

## 15. Parked for version 2 (do not build now)

- AI add from a meal or recipe ("tacos for 4", paste a recipe link)
- Weekly meal planner feeding the list
- Spend tracking per shop and per month, with an export for Carl's household budget workbook

Design the data model so these slot in later without migrations that break existing data.

---

## Current status notes (kept up to date by Claude Code)

- **Bec and Grace are held back.** At Carl's request (preliminary testing), only Carl's account exists. Their accounts were removed so no sign-in code can be sent to them. Do not run `npm run seed:users` until Carl says to add them; that command recreates both accounts and profiles.
- Supabase project ref: `bfcmyfpubbxqlidyuxqd` (Sydney). Vercel project: `trolley` (team "Carl's projects"), production URL https://trolley-iota.vercel.app.
- Browser tests (`npm run test:e2e`) use throwaway households and never send real emails.
- The Anthropic key reaches this container as `TROLLEY_ANTHROPIC_KEY` (the harness reserves `ANTHROPIC_API_KEY`); the app itself reads `ANTHROPIC_API_KEY` from `.env.local` and Vercel.
- Receipt reading passes its accuracy test on `claude-haiku-4-5-20251001`, so `ANTHROPIC_RECEIPT_MODEL` stays on Haiku.
- Pictures (Carl's request, Sept 2026): sources in order are Open Food Facts (barcode, then strict name + aisle match), Wikimedia Commons (free), then Claude web search via the Anthropic key, capped at 150 lookups per household per month (`usage_counters`). Coles and Woolworths are deliberately excluded (their terms forbid scraping). A name that finds nothing isn't retried for 30 days. Renaming an item links it to the product with the new name and looks for that picture; photos people took are never replaced automatically.
- Items have an optional `link`; lists export as shared text, CSV or print (Lists sheet).
- In this cloud container, browser WebSockets are blocked and Open Food Facts images are slow; live push is proven by `tests/integration/realtime.test.ts` and picture tests are best judged against the live site.

---

@AGENTS.md
