# The Parzival Film Profile

A small local web app for drafting and storing LinkedIn profile content: About, Experience, Education, Skills, Certifications, Projects, Volunteer, Organizations and Posts. The data is kept in a **Google Sheet**, one tab per section, so you can also view and edit it directly in Sheets.

**Stack:** React + Vite + Tailwind (client) · Node + Express (server) · Google Sheets API (storage) · TypeScript throughout.

```
client/  React UI (Vite dev server on :5173, proxies /api → :3001)
server/  Express API talking to Google Sheets via a service account
shared/  Section definitions + validation used by both sides
```

## Setup

### 1. Google Cloud service account
1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create (or pick) a project.
2. Open **APIs & Services → Library**, then enable the **Google Sheets API**.
3. Open **IAM & Admin → Service Accounts**, then **Create service account**. No roles are needed.
4. Open the service account and go to **Keys → Add key → JSON**. Save the file as `server/service-account.key.json`. It is git-ignored.

### 2. Google Sheet
1. Create an empty Google Sheet.
2. **Share** it with the service account's email (`…@….iam.gserviceaccount.com`) as **Editor**.
3. Copy the sheet ID from the URL: `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`.

### 3. Configure and run
```bash
cp server/.env.example server/.env   # then fill in GOOGLE_SHEET_ID
npm install
npm run dev
```
Open http://localhost:5173. On first start, the server creates any missing tabs (About, Experience, …, Posts) and writes their header rows.

If you can't create a service-account key, your organization may have disabled key creation. This is common with work accounts. Use a personal Google account for the Cloud project instead; it only needs Editor access to the sheet.

Instead of a key file, you can set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` in `.env`.

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Runs the API and the Vite dev server together |
| `npm run build` | Type-checks all packages and builds the client into `client/dist` |
| `npm start` | Runs the API only |

## Using it on your phone
The layout adapts to phones. On small screens you get a top bar with a slide-in menu and a floating **+** button, and forms open full screen. To open the app from a phone on the same Wi-Fi:
```bash
npm run dev -w server
npm run dev -w client -- --host   # then open the "Network" URL Vite prints
```
**Security:** the app has no login. Anyone on that network who opens the URL can read and edit your data, so only use `--host` on networks you trust.

## Features
- **Floating forms:** Add and Edit open in a dialog. It closes with Esc or a click outside, and asks before discarding unsaved changes.
- **Certification links:** Experience, Education, Projects and Volunteer entries can link to any number of certifications.
  - Linked certifications appear as chips on those cards.
  - Each certification card shows where it is used.
  - Deleting a certification removes it from every entry.
- **Organizations:** saving an entry adds its company, school, issuer or volunteer organization to the **Organizations** tab if it isn't listed yet.
  - Names are matched ignoring case and extra spaces.
  - Organization fields suggest names you've already used.
  - Renaming an organization updates every entry that uses it.
  - Organizations from existing entries are added when the server starts.
- **Posts:** filter by status, copy the text with hashtags ready to paste into LinkedIn, and mark a post as posted.
- **Dark/light mode:** dark is the default. Your choice is remembered in this browser.
- **Export JSON:** downloads every section as one file.

## Data model
Each tab has `id`, `createdAt` and `updatedAt` columns, plus the fields defined in [shared/src/sections.ts](shared/src/sections.ts).

| Link | Stored as |
|---|---|
| Entry → certifications | `certificationIds` column with comma-separated certification ids |
| Entry → organization | the organization's **name** in `company` / `school` / `issuer` / `organization`, so the sheet stays readable when edited by hand |

## API
| Method | Path | |
|---|---|---|
| GET | `/api/health` | Sheets connection status |
| GET / PUT | `/api/single/about` | Read / upsert the About row |
| GET / POST | `/api/sections/:section` | List / create (`experience`, `education`, `skills`, `certifications`, `projects`, `volunteer`, `organizations`, `posts`) |
| GET / PUT / DELETE | `/api/sections/:section/:id` | Read / update / delete one entry |
| GET | `/api/export` | Every section as JSON |

## Notes
- **Adding a section or field:** edit [shared/src/sections.ts](shared/src/sections.ts). The sheet header, validation and form update automatically. New columns are appended to an existing tab on the next server start.
- **Editing the sheet by hand:** this is safe. Columns are matched by header name, and rows without an `id` are ignored. The server caches reads for about 10 seconds.
- **Character limits:** fields show a live counter against LinkedIn limits (headline 220, about 2600, descriptions 2000, posts 3000).
- **Values are stored as plain text** (`RAW`), so Sheets won't turn text into formulas or dates.
