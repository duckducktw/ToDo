# Smart Dual-Track ToDo

A private, local-first task planner that keeps application tasks separate from a read-only Google Calendar reference. The interface is in Traditional Chinese and provides two views:

- **今日焦點** for completing today's work alongside a calendar timeline
- **週／月安排** for scheduling and reordering tasks across dates

Tasks are stored as isolated JSON files per Google account. Google Calendar events are fetched on demand and are never copied into the task store.

## Requirements

- Node.js 22 or newer
- npm
- A Google Cloud OAuth 2.0 web client for live sign-in and Calendar access

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

   To run browser tests, install Chromium and Firefox once:

   ```bash
   npx playwright install chromium firefox
   ```

2. Create the local environment file:

   ```bash
   cp .env.example .env
   openssl rand -base64 32
   ```

   Place the generated value in `.env` as `AUTH_SECRET`.

3. Configure a Google OAuth client as described below and set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

4. Start the application:

   ```bash
   npm run dev
   ```

5. Open <http://localhost:3000>.

## Google OAuth configuration

In Google Cloud Console:

1. Create or select a project and enable **Google Calendar API**.
2. Configure the OAuth consent screen. Add the scopes `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/calendar.events.readonly`.
3. Create an **OAuth client ID** with application type **Web application**.
4. Add `http://localhost:3000` as an authorized JavaScript origin.
5. Add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI.
6. During development, add the Google accounts that may sign in as consent-screen test users.

The application asks for offline access so an expired Calendar access token can be refreshed. Revoking the grant, removing the Calendar scope, or losing the refresh token results in a reconnect prompt; task functionality remains available.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `AUTH_URL` | Yes | Public application origin used by Auth.js, normally `http://localhost:3000` |
| `AUTH_SECRET` | Yes | At least 32 random characters used to protect authentication state and the local token vault |
| `AUTH_GOOGLE_ID` | Yes | Google OAuth web client ID |
| `AUTH_GOOGLE_SECRET` | Yes | Google OAuth web client secret |
| `DATA_STORE_DIR` | No | JSON data root; defaults to `src/data` |
| `APP_DEFAULT_TIMEZONE` | No | IANA fallback timezone; defaults to `Asia/Taipei` |
| `VAPID_PUBLIC_KEY` | For Web Push | Stable public VAPID key shared with subscribing browsers |
| `VAPID_PRIVATE_KEY` | For Web Push | Secret VAPID key used only by the server |
| `VAPID_SUBJECT` | For Web Push | Operator contact as `mailto:` or an HTTPS URL |
| `AUTH_TEST_MODE` | Tests only | Enables the hidden deterministic test identity when exactly `true` |
| `TEST_AUTH_SECRET` | Tests only | Additional guard required by the browser-test sign-in flow |
| `CALENDAR_FIXTURE_PATH` | Tests only | Local deterministic Calendar fixture used by automated tests |

Never commit `.env`, OAuth credentials, `AUTH_SECRET`, or a populated data directory. Do not enable `AUTH_TEST_MODE` on a network-accessible instance.

Generate the VAPID key pair once, copy it into `.env`, and keep the same pair for the lifetime of existing device subscriptions:

```bash
npx web-push generate-vapid-keys --json
```

Web Push requires HTTPS outside localhost. On iOS/iPadOS 16.4 or newer, install the app with **Add to Home Screen**, launch it from that icon, then press the in-app **允許** button. The built-in scheduler runs in the single long-lived Node.js server every 30 seconds; do not run multiple application replicas against this JSON store.
Before composing a reminder, the scheduler rolls overdue work forward with the same domain transaction used by Today Focus. Deliveries are tracked per device: expired subscriptions are removed, while temporary provider failures retry with bounded backoff for up to 15 minutes. Pending retries remain paused during Do Not Disturb.

## Data storage

The default data root is `src/data`; it is created on first use and ignored by Git. A deployment should set `DATA_STORE_DIR` to a persistent directory that is readable and writable only by the application process.

```text
<DATA_STORE_DIR>/
├── users.json
├── push-subscriptions.json
├── oauth/
│   └── google_<subject>.json
└── tasks/
    └── google_<subject>.json
```

The authenticated Google `sub` determines the file name; request parameters never select a user file. Writes use locking and atomic replacement, and mutations use a revision precondition to prevent stale clients from overwriting newer state. OAuth tokens are server-only and encrypted at rest using key material derived from `AUTH_SECRET`.

Back up the entire data root together with the same `AUTH_SECRET`. Changing the secret invalidates sessions and makes an existing token vault unreadable, so users must reconnect Google Calendar.

This JSON store is intentionally designed for a single local Node.js process. Place `DATA_STORE_DIR` on a filesystem that enforces POSIX `0700` directory and `0600` file permissions; FAT/NTFS-style removable mounts may ignore those protections. It is not suitable for serverless, multi-instance, shared-network-filesystem, or untrusted multi-tenant deployment. Migrate to a transactional database and managed secret store before using those topologies.

For Pterodactyl, use a writable persistent path such as
`DATA_STORE_DIR=/home/container/data`. The store tolerates mounted filesystems that
reject `chmod`, but the panel or host must still restrict access to that directory
and allow the container user to create, rename, and delete files in it.

## Behavior

- Dates are interpreted in each user's browser-reported IANA timezone, with `Asia/Taipei` as the initial fallback.
- The interface follows the device light/dark preference until the user chooses a theme; that explicit choice persists in the browser.
- Interface motion is reduced automatically when the device requests reduced motion.
- Loading Today, returning to a visible tab, or crossing a local-day boundary rolls every overdue incomplete task forward to today. Flexible and locked tasks both roll over.
- Completing the last active task today persistently reschedules at most three flexible tasks from the nearest non-empty future date into today. Tomorrow is preferred; if it has no eligible work, the next later date is used. Completing that batch can pull another batch.
- Google Calendar is always read-only. Calendar failures do not block task operations.
- Task titles are 1–120 trimmed characters; descriptions are optional and limited to 1,000 characters.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Load `.env` and serve the standalone production build |
| `npm run lint` | Run ESLint with warnings treated as failures |
| `npm run typecheck` | Run strict TypeScript checking |
| `npm test` | Run unit, component, and backend tests once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:e2e` | Start an isolated test server and run Playwright |
| `npm run check` | Run lint, typecheck, unit/backend/component tests, production build, and Playwright |

Playwright writes only to `tests/.tmp/e2e-data`, removes that directory after the run, and uses `tests/fixtures/google-calendar-events.json`. Its hidden sign-in mechanism is guarded by test-only environment values configured in `playwright.config.ts`. Browser coverage runs at 1440×900, 834×1112, and 390×844.

The production build uses Next.js standalone output. `npm run build` copies static
assets into `.next/standalone` and removes any `.env` files traced there by Next.js.
Keep `.env` outside the deployed standalone directory and start the server from the
directory containing that file. Restart `npm start` after changing it; the file is
loaded afresh whenever the Node.js process starts, so environment changes do not
require a rebuild.

## API overview

All endpoints require an authenticated session, return private/no-store responses, and derive account identity on the server.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/tasks?from=YYYY-MM-DD&to=YYYY-MM-DD` | Read an inclusive task range (maximum 62 days) |
| `POST` | `/api/tasks` | Create a task |
| `POST` | `/api/tasks/rollover` | Apply idempotent overdue rollover |
| `PATCH` | `/api/tasks/:id` | Edit, move, complete, or reopen a task |
| `PUT` | `/api/tasks/reorder` | Reorder or move an active task |
| `DELETE` | `/api/tasks/:id` | Delete a task |
| `PATCH` | `/api/me` | Save the browser's IANA timezone |
| `GET` | `/api/push/config` | Read public Web Push availability and the VAPID public key |
| `GET/POST/DELETE` | `/api/push/subscriptions` | Manage the signed-in user's device subscriptions |
| `GET` | `/api/calendar?from=...&to=...` | Read normalized primary-calendar events |

Task mutations send the current revision in `If-Match`. A `412` response means another request wrote first; clients refetch authoritative state before retrying.

## Current scope

The project targets localhost and a single primary Google Calendar. Calendar writes, reminders, sharing, subtasks, analytics, offline mode, localization beyond Traditional Chinese, Docker, and hosted production deployment are intentionally out of scope.
