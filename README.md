# MyGuide

A phone-first web app for creating and sharing personal city guides with people whose taste you trust.
Creators name the places they actually love (by voice or by typing), MyGuide pulls in the Maps data,
and the guide can be published, shared with specific people, followed, and forked.

Visual direction: **Warm Journal** — cream background, terracotta and sage accents, Instrument Serif
headlines with Work Sans body. It should feel like a well-travelled friend's notebook.

## Quick start

```bash
npm install
cp .env.example .env        # fill in what you have; everything is optional in development
npm run dev                 # http://localhost:3000
```

On first run the database is created at `data/myguide.db` and (outside production) seeded with six
demo creators and a dozen guides. Log in with any of `yara@myguide.demo`, `marco@…`, `aiko@…`,
`leila@…`, `tomas@…`, `sam@…` and the password `myguide-demo`.

## What's in the build

| Area | Where |
| --- | --- |
| Create a guide by voice (one-shot list → structured places + suggested title) | `/create`, `src/components/VoiceCreate.tsx`, `src/app/api/ai/parse-places` |
| Create a guide by typing (title, then Maps autocomplete per place) | `/create?mode=type`, `src/components/GuideEditor.tsx` |
| Review / edit: notes by typing or voice (transcript **and** raw clip kept), photos from library, reorder, remove, fix a mismatched place, category | `src/components/GuideEditor.tsx`, `NoteEditor.tsx`, `PhotoPicker.tsx` |
| Publish publicly or privately; edit freely after publishing | publish sheet in the editor |
| Auto-generated cover in the app's visual system, replaceable with a photo | `src/components/GuideCover.tsx` |
| Feed (Everyone / Following, city chips), profile, follow | `/`, `/u/[username]` |
| Natural-language voice search ("guides to Mexico City by people I'm following") | `/search`, `src/lib/ai/index.ts` |
| Share via link (private guides get a secret key) or with a specific person → their Notification Centre | share sheet, `/notifications` |
| Fork ("Use this guide") into a private editable copy, notes carried over and credited, "based on @creator" | `forkGuide` in `src/lib/actions/guides.ts` |
| Closed-place flag (stretch): re-checks business status when the owner views their guide, live key only | `src/app/api/places/status` |
| Accounts: email + password | `src/lib/auth.ts`, `/login`, `/signup` |

The nine fixed categories live in `src/lib/places/categories.ts`.

## Configuration

All settings are environment variables (see `.env.example`).

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Signs login cookies. **Required in production.** `openssl rand -hex 32` |
| `DATABASE_URL` | `file:./data/myguide.db` (default) or a `libsql://` Turso URL for hosted persistence |
| `DATABASE_AUTH_TOKEN` | Token for a hosted libSQL database |
| `GOOGLE_MAPS_API_KEY` | Enables live Places API (New) autocomplete, details, photos and business status. Without it the app runs on realistic mock place data and synthesises pins for any place you name. |
| `ANTHROPIC_API_KEY` | Enables Claude for list structuring, natural-language search and note tidy-up. Without it, built-in heuristics keep every flow working. |
| `ANTHROPIC_MODEL` | Optional model override (default `claude-opus-5`) |
| `SEED_DEMO` | `true` to seed demo data into an empty database (default outside production: on; in production: off) |
| `NEXT_PUBLIC_APP_URL` | Public origin for share links (falls back to the request host) |

Nothing hard-fails when a key is missing; the app switches to live data automatically once a key is added.

### Google Maps

Create a key with **Places API (New)** enabled. Photos are served through `/api/places/photo`, so the
key never appears in a page URL. The map itself uses Leaflet with free CARTO/OpenStreetMap tiles, so
it works with or without a Google key.

### Voice

Speech-to-text uses the browser's Web Speech API (Chrome, Safari, Edge; iOS Safari included) and the
raw clip is captured with MediaRecorder. Browsers without speech recognition get a typed fallback in
every voice entry point.

## Deploying

The app is a standard Next.js server (`npm run build && npm start`). It needs a persistent disk for the
SQLite file (Fly.io, Railway, Render, a VPS…) **or** a `libsql://` database URL. Set `AUTH_SECRET`,
and `SEED_DEMO=true` if you want the demo content on a fresh deployment.

Uploaded photos and voice clips are stored in the database (client-side downscaled, 6 MB cap) so the
soft launch needs no object storage. Moving them to a bucket later is a change in `src/app/api/media`.

## Scripts

```bash
npm run dev          # development server
npm run build        # production build
npm start            # production server
npm run lint         # eslint
npm run typecheck    # tsc
npm run db:generate  # generate a migration after editing src/lib/db/schema.ts
npm run db:studio    # browse the database
```

Migrations in `drizzle/` are applied automatically on startup.

## Data model notes for later

- `users.accountType` (`personal` today) leaves room for creator / institutional accounts.
- `guides.visibility` is a free string (`public` | `private`) so a paid tier can be added without a migration on the hot path.
- Forked guides keep `forkedFromGuideId` / `forkedFromUserId`, and every place note keeps its `noteAuthorId`, so attribution survives edits.
- Out of scope by design: comments, likes, ratings, verified badges, subscriptions/paywalls, moderation, third-party sign-in, offline downloads, native apps.
