# Where We Are

A private web app for two people to share **where they'll be** (AM / PM / Evening
each day) and see each other's **Google + Outlook calendar events** at a glance.
It also writes a daily summary to a shared **"Life" Google calendar**, and sends a
**weekly push reminder** to fill in the week ahead.

- **Stack:** Next.js (App Router) · Supabase (Auth + Postgres + RLS) · Vercel
- **Reads (read-only):** multiple Google calendars + Microsoft 365 calendars per person
- **Writes (only):** one summary event per person per day to the shared Life calendar,
  via a Google **service account** — the app cannot touch personal calendars.

---

## How it fits together

| Piece | Where |
|---|---|
| Code | GitHub `CCMAPP-LIVE/whereweare` → auto-deploys to Vercel |
| Hosting | Vercel project `whereweare` → `https://whereweare.vercel.app` |
| Database/Auth | Supabase project `gvmxwywuukzptvnttnzv` (London) |

The database schema + Row Level Security are already applied. Remaining work is
mostly **external configuration** (Google, Microsoft, env vars), below.

---

## Setup checklist

### 1. Google OAuth (read personal Google calendars)
1. [Google Cloud Console](https://console.cloud.google.com) → create/pick a project.
2. **APIs & Services → Library →** enable **Google Calendar API**.
3. **OAuth consent screen:** User type **External**; add scope
   `…/auth/calendar.readonly`; set **Publishing status → In production**
   (this stops refresh tokens expiring every 7 days). You + your wife will see an
   "unverified app" warning on first sign-in — click **Advanced → continue**.
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   Authorized redirect URI:
   `https://gvmxwywuukzptvnttnzv.supabase.co/auth/v1/callback`
5. Copy **Client ID/secret** → Supabase **Authentication → Providers → Google**
   (enable it), and into env vars `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### 2. Google service account (write to the shared Life calendar)
1. Same Google project → **IAM & Admin → Service Accounts → Create.**
2. Create a **JSON key**; base64 it: `base64 -i key.json` → `GOOGLE_SERVICE_ACCOUNT_KEY`.
3. In Google Calendar, open the **Life** calendar's settings → **Share with
   specific people** → add the service-account email with **"Make changes to
   events"**.
4. Copy the Life calendar's **Calendar ID** (Settings → Integrate calendar) →
   `LIFE_CALENDAR_ID`.

### 3. Microsoft 365 (read Outlook work/school calendars)
1. [Entra admin](https://entra.microsoft.com) → **App registrations → New.**
   Supported accounts: **work/school (any org)**.
2. **Authentication → Add platform → Web**, redirect URI:
   `https://gvmxwywuukzptvnttnzv.supabase.co/auth/v1/callback`
3. **API permissions → Microsoft Graph → Delegated →** `Calendars.Read`,
   `offline_access`, `openid`, `email`. (If your org blocks user consent, an admin
   clicks **Grant admin consent**.)
4. **Certificates & secrets → New client secret.**
5. Copy into Supabase **Authentication → Providers → Azure** (enable it) and into
   env `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` (and tenant if not
   `organizations`).
6. In Supabase **Authentication → Settings**, enable **Manual linking** (lets you
   add Outlook from the Settings page while signed in with Google).

### 4. Supabase service role + Web Push
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase **Project Settings → API → service_role**.
- VAPID keys: `npx web-push generate-vapid-keys` →
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`; set `VAPID_SUBJECT` to a
  `mailto:` address. (A dev pair is already in `.env.local`.)
- `CRON_SECRET`: any long random string.

### 5. Vercel
- Set **all** env vars from `.env.local.example` in **Project → Settings →
  Environment Variables**.
- Rename the project to `whereweare`; add domain `whereweare.vercel.app`
  (**Settings → Domains**).
- Push to `main` → Vercel builds and deploys. The weekly cron in `vercel.json`
  runs automatically.

### 6. On each phone
Open the site in Safari (iPhone) / Chrome (Android) → **Add to Home Screen** →
open from the icon → **Settings → Enable weekly reminders**.

---

## Local development

```bash
npm install
cp .env.local.example .env.local   # already created; fill in the blanks
npm run dev                         # http://localhost:3000
```

For local Google/Microsoft sign-in to redirect back, add
`http://localhost:3000/auth/callback` to Supabase **Authentication → URL
Configuration → Redirect URLs**.

---

## Project map

```
app/
  page.tsx                       Glanceable week view (both people, AM/PM/Eve + events)
  settings/page.tsx              Name, connect accounts, calendar picker, push, install
  login/page.tsx                 Sign in with Google
  auth/callback/route.ts         Captures provider_refresh_token (the load-bearing bit)
  auth/signout/route.ts
  api/availability/route.ts      Save a slot → re-sync that day to the Life calendar
  api/calendars/route.ts         List/refresh calendars · toggle which are shown
  api/push/subscribe/route.ts    Store/remove a web-push subscription
  api/cron/weekly-reminder/route.ts   Sunday 18:00 London push (gated; CRON_SECRET)
  manifest.ts · apple-icon.tsx · icons/[size]/route.tsx   PWA icons/manifest
components/                      NavBar, WeekView, settings widgets
lib/
  supabase/{client,server,admin,middleware}.ts
  google/{auth,calendar,lifeCalendar}.ts
  microsoft/calendar.ts
  calendars.ts                   Merge events across providers · refresh calendar list
  availabilitySummary.ts         AM/PM/Eve → one event title
  time.ts                        Europe/London week math + DST-aware 18:00 check
public/sw.js                     Service worker (push + click)
vercel.json                      Weekly cron
```

## Security notes
- The repo is **public**: no secrets in code — everything is env vars.
- Refresh tokens live in `calendar_oauth_tokens`, which has **no RLS policies**, so
  only the service-role (server) can read them.
- After both of you have signed in, consider disabling new sign-ups in Supabase
  (**Authentication → Settings**) to keep the app to just the two of you.
