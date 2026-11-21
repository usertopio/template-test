# The Parzival Film Profile

## Project Overview

A small web app for drafting and storing LinkedIn profile content (About,
Experience, Education, Skills, Certifications, Certificates, Projects,
Volunteer, Activities, Organizations, Posts). Each section is a tab of a
**Google Sheet**, so the data can also be read and edited by hand in Sheets.
Uploaded media lives in a Google Drive folder, reached through a small Apps
Script bridge.

It is a solo hobby project. `README.md` is the full reference for setup,
features, the data model and the API. Read it before changing behaviour, and
keep it up to date. This file covers only what an agent needs on top of it.

## Tech Stack

TypeScript throughout, as an npm workspaces monorepo.

| Workspace | What it is | Key dependencies |
| --------- | ---------- | ---------------- |
| `shared/` | Section definitions and validation, used by every side | zod 4 |
| `core/` | The app's logic: validation, linking, media, login tokens | none (no Node or browser APIs) |
| `backend/` | Express 5 server: HTTP to `createApi()`, Sheets via a service account | `@googleapis/sheets`, multer, tsx |
| `frontend/` | React 19 UI | Vite 7, Tailwind 4, React Router 7, TanStack Query 5, lucide-react |

Plus Vitest 5 for every workspace and Node 24 (CI, Docker and Render all pin 24).

The frontend's export libraries (`docx`, `exceljs`, `pdfmake`), the zip
library (`fflate`, in `zip.worker.ts`), the PDF renderer (`pdfjs-dist`, in
`credentialFiles.ts`) and the calendar (`@fullcalendar/react`, in
`CalendarView.tsx`) are loaded only when used. Keep them
out of the main bundle. FullCalendar is v7: write against its v7 docs, since
most examples online are for v6 and won't work.

Do not add or upgrade dependencies without asking first, and say why in the
commit message.

## Development Commands

```bash
npm install                  # also points git at .githooks (pre-push)
npm run dev                  # API on :3001 + Vite on :5173 (proxies /api)
npm run build                # type-checks every workspace, builds frontend/dist
npm test                     # all unit and integration tests
npm run test:unit            # or: npm run test:integration
npm run verify               # build + all tests: what pre-push and CI run
npm run media-script:deploy  # upload backend/apps-script/media-bridge.gs with clasp
```

Tests need no `.env` and never touch Google: the backend runs on in-memory
tabs (`core/test/helpers`, exported as `@profile/core/testing`), and the
frontend runs in jsdom with a mocked API. Tests live in
`<workspace>/test/unit/` and `<workspace>/test/integration/`.

## Validation

Before committing, run:

```bash
npm run verify
```

Fix all errors first. Add or update tests with any behaviour change: unit
tests for one module, integration tests for the API over HTTP or a component
with its dropdowns and dialogs. A bug fix gets a test that reproduces it (see
the overlapping-writes case in `backend/test/unit/sheetRepository.test.ts`).

Comments explain *why*, not what: a constraint, a Google quirk, or the bug
that a line prevents. Match that density in new code.

## Architecture

- **Logic goes in `core/`**, behind the `Repository` and `FileStore`
  interfaces. `backend/` only translates HTTP requests into `createApi()`
  calls. `core/tsconfig.json` sets `"types": []` and `"lib": ["ES2022"]`, so
  `node:*`, `Buffer`, `process` or DOM APIs there fail the build. Do not
  loosen that to make something compile. Move the runtime-specific part
  behind an interface instead.
- **Errors carry their status.** Throw `HttpError` (with `fields` for
  per-field validation messages), `NotFoundError` or `ConfigError` from
  `core/src/errors.ts`. The Express error handler turns them into responses.
- **Sections and fields are defined once**, in `shared/src/sections.ts`. The
  sheet header, validation, form and export all follow from it. New columns are
  appended to existing tabs on the next server start.
- **`shared` stays side-effect free** (`"sideEffects": false`). zod is only
  used on the server: the frontend bundle drops it, and that only works if
  nothing in `shared` runs on import.
- **The sheet must stay safe to edit by hand.** Columns are matched by header
  name, rows without an `id` are ignored, values are written `RAW`, and an
  entry names its organization rather than storing an id.
- **Writes to a tab run one at a time** (`SheetRepository.exclusive` in
  `backend/src/sheets/repo.ts`). Updates and deletes address rows by number,
  so two overlapping writes can make a delete shift the rows under an update,
  and the update then overwrites a different entry. Every write must go
  through `exclusive`. Reads are cached for 10 seconds (`CACHE_TTL_MS`).
- **Slow follow-ups run after the response.** `createApp(..., { background:
  true })` queues Drive work (shortcuts, renames) so saves don't wait for it.
  Tests leave `background` off so they can assert on the follow-up's result.
  Add new Drive side effects the same way, not inline in the request.
- **The backend stays on Express on Render.** Moving it onto Apps Script was
  built and measured as too slow. Only the media bridge runs in Apps Script.

## Frontend

- **React Compiler is on** (`vite.config.ts`). Do not write `useMemo` or
  `useCallback` by hand. It silently skips code it cannot compile (for example
  `try … finally` in a component). Check with a build at
  `panicThreshold: 'all_errors'` when unsure.
- **API calls go through `frontend/src/api.ts`** and TanStack Query. It adds
  the login token. A plain `fetch` is only for loading a file URL that the API
  returned (zips, export images, fonts). Small browser-only state (language,
  login token) uses `useSyncExternalStore` stores remembered in
  `localStorage`, with every read and write wrapped in try/catch.
- **Dark is the default theme.** `index.html` ships `class="dark"` and an
  inline script removes it before first paint if the reader chose light, so
  the page never flashes. Do not move that into React. Styling uses Tailwind's
  `dark:` variant (`frontend/src/index.css`). Every new surface needs both
  modes.
- **Phones are a first-class layout:** top bar, slide-in menu, floating **+**,
  full-screen forms. Check new UI at phone width.
- Pages other than the section list (About, Posts, Login) are lazy-loaded.
  Keep heavy features on demand the same way.

## English and Thai

The profile reads in English or Thai, like LinkedIn's "profile in another
language".

- A field marked `translatable: true` in `sections.ts` gets a `<field>_th`
  column. Empty means "same as English". Thai is never required.
- Organization and skill names are not translated per entry. They get their
  Thai name once, on the Organizations and Skills pages (an organization also
  from the Thai side of an entry form, stored on the organization), and
  `localizeEntry` applies it everywhere.
- Dates, links, emails, credential IDs and dropdown choices have no language,
  except an activity's progress: its Thai names are fixed in `PROGRESS_THAI`.
  The sheet and the filters keep the English one.
- Thai has no spaces between words. The PDF export inserts zero-width spaces
  so lines can break, and its Sarabun font carries an added empty glyph for them
  (`frontend/scripts/add-zwsp-glyph.py`). Do not swap the font without
  redoing that.
- **Only the profile content is bilingual.** Interface labels (buttons, field
  labels, messages) are English in both modes. Do not add a translation layer
  for them. Repo docs, code and comments are English too.

## Media

- Files are stored in Drive through `backend/apps-script/media-bridge.gs`,
  which runs as the owner. A service account cannot be used because it has no
  storage quota in a personal Drive. After changing the script, run
  `npm run media-script:deploy`. The generated `config.gs` and `.clasp.json`
  are git-ignored.
- A file's type is checked from its content, not its name.
- Videos, and images or PDFs over 10 MB (`uploadsInPieces`), upload in 8 MB
  resumable chunks straight to Drive, so the server never holds a whole file.
  Do not raise `MEDIA_MAX_BYTES` (the one-request limit): those files pass
  through Apps Script as base64, which takes about 50 MB per call. Videos play
  through signed links that expire after 6 hours.
  The server sets the chunk size (`UPLOAD_CHUNK_BYTES` in `shared/src/media.ts`)
  and sends it as `chunkSize` when an upload starts. The client always uses
  that value and never hard-codes its own.

## Secrets

Never commit or print `.env`, `*.key.json` or the media script secret. They are
git-ignored. Locally, leaving `APP_PASSWORD` empty turns login off. In
production it is required.

## AI Agent Workflow

- Restate the task, look at the affected code, then work on a feature branch
  from `main`.
- **No pull requests.** When the work is done and `npm run verify` passes,
  fast-forward merge it into `main` locally and delete the branch.
- **Ask before pushing `main`.** A push to `main` runs CI and then deploys to
  Render.
- **Another session may be working in the same tree.** Check `git status`, stage
  files by name (never `git add -A`), and leave changes you did not make
  unstaged. Tell the user about them.
- Commit messages match the history: a plain-English subject line, no
  conventional-commit prefix, and for larger changes a bulleted body saying
  what changed for the user.

## Documentation Rules

- Update `README.md` when behaviour, setup, the data model or the API changes.
  The Features, Data model and API sections are the ones that drift.
- Keep this file for rules an agent would otherwise break. Do not copy README
  content into it.
