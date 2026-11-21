# The Parzival Film Profile

A small local web app for drafting and storing LinkedIn profile content: About, Experience, Education, Skills, Certifications, Certificates, Projects, Volunteer, Activities, Organizations, Locations, Domains and Posts. The data is kept in a **Google Sheet**, one tab per section, so you can also view and edit it directly in Sheets.

**Stack:** React + Vite + Tailwind (frontend) · Node + Express (backend) · Google Sheets API (storage) · TypeScript throughout.

```
frontend/  React UI (Vite dev server on :5173, proxies /api → :3001)
backend/   Express server: the core API over HTTP, Google Sheets via a service account
core/      The app's logic (validation, linking, media, login tokens), free of Node and browser APIs
shared/    Section definitions + validation used by every side
```

## Setup

### 1. Google Cloud service account
1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create (or pick) a project.
2. Open **APIs & Services → Library**, then enable the **Google Sheets API**.
3. Open **IAM & Admin → Service Accounts**, then **Create service account**. No roles are needed.
4. Open the service account and go to **Keys → Add key → JSON**. Save the file as `backend/service-account.key.json`. It is git-ignored.

### 2. Google Sheet
1. Create an empty Google Sheet.
2. **Share** it with the service account's email (`…@….iam.gserviceaccount.com`) as **Editor**.
3. Copy the sheet ID from the URL: `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`.

### 3. Configure and run
```bash
cp backend/.env.example backend/.env   # then fill in GOOGLE_SHEET_ID
npm install
npm run dev
```
Open http://localhost:5173. On first start, the server creates any missing tabs (About, Experience, …, Posts) and writes their header rows.

If you can't create a service-account key, your organization may have disabled key creation. This is common with work accounts. Use a personal Google account for the Cloud project instead; it only needs Editor access to the sheet.

Instead of a key file, you can set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` in `.env`.

### 4. Media storage (optional)
Uploaded media (certificates, screenshots, PDFs) is stored in a **Google Drive folder you choose**. The rest of the app works without it; the media block then says storage isn't set up.

The app reaches your Drive through a small **Apps Script** web app that runs as you: [backend/apps-script/media-bridge.gs](backend/apps-script/media-bridge.gs). There's no OAuth client to publish and nothing expires. The service account can't be used instead, because Google gives service accounts no storage space in a personal Drive.

**First time** (the script project is created once in the browser; clasp then uploads the code):

1. Turn on **Google Apps Script API** at [script.google.com/home/usersettings](https://script.google.com/home/usersettings).
2. Run `npx clasp login` and sign in with the Google account that owns the media folder.
3. Open [script.google.com](https://script.google.com), click **New project** and name it, e.g. "Parzival media bridge". Under **⚙️ Project Settings**, copy the **Script ID**.
4. Click **Deploy → New deployment**, click the gear icon next to *Select type* and choose **Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone. The app's server isn't signed in to Google; the secret protects the script.
5. Click **Deploy**, then **Authorize access** and choose your account.
   - Google warns **"Google hasn't verified this app"**. It's your own script: click **Advanced → Go to … (unsafe) → Allow**.
6. In `backend/.env`, set:
   - `MEDIA_SCRIPT_URL`: the **Web app URL** (ends in `/exec`)
   - `MEDIA_SCRIPT_ID`: the Script ID
   - `MEDIA_FOLDER_URL`: your media folder's link
   - `MEDIA_SCRIPT_SECRET`: a long random string, e.g. `openssl rand -hex 24`
   - `MEDIA_OWNER_NAME`: the name that ends every file name, e.g. `Tammasorn`
7. Run `npm run media-script:deploy`. It uploads [media-bridge.gs](backend/apps-script/media-bridge.gs) with a `config.gs` made from your `.env`, updates the deployment from step 4 (same URL), and checks that it answers.
8. Restart `npm run dev`. The log says `[media] Drive folder ready`.

**After the script changes**, run `npm run media-script:deploy` again. Your folder and secret stay in `backend/.env`; the generated `config.gs` and `.clasp.json` are git-ignored.

**Without clasp:** paste media-bridge.gs into the editor, add a script file named `config` from [config.example.gs](backend/apps-script/config.example.gs) with your values, save, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Runs the API and the Vite dev server together |
| `npm run build` | Type-checks all packages and builds the frontend into `frontend/dist` |
| `npm start` | Runs the API only |
| `npm run media-script:deploy` | Uploads the media script with clasp and updates its deployment (same URL) |
| `npm test` | Runs all unit and integration tests |
| `npm run test:unit` / `npm run test:integration` | Runs one kind of test |
| `npm run test:watch` | Re-runs tests as you edit |
| `npm run verify` | Build + all tests (what the pre-push hook and CI check) |

## Testing
Tests use [Vitest](https://vitest.dev) and never touch Google Sheets: the backend runs against in-memory tabs, and the frontend runs in jsdom with a mocked API. No `.env` or key is needed.

```
<workspace>/test/unit/         one module at a time (validation, linking logic, sheet row mapping, sorting/filtering)
<workspace>/test/integration/  pieces working together (the Express API over HTTP; the entry form with its dropdowns)
```

**Before every push**, a git hook ([.githooks/pre-push](.githooks/pre-push)) type-checks, builds and runs both kinds of test; the push is cancelled if anything fails. `npm install` sets it up. Skip it once with `git push --no-verify`.

**On GitHub**, [ci.yml](.github/workflows/ci.yml) runs the same checks on every branch and pull request. On `main`, [docker.yml](.github/workflows/docker.yml) only builds the Docker image and calls Render's deploy hook after they pass.

**Render's own Auto-Deploy** builds every push to `main` by itself, whether or not the tests pass, and on top of the deploy hook. Set it in the Render dashboard → your service → **Settings → Build & Deploy → Auto-Deploy**: **Off** (only tested commits deploy, through the hook), or **After CI Checks Pass**.

## Using it on your phone
The layout adapts to phones. On small screens you get a top bar with a slide-in menu, a tools button (⚙) that slides a list page's tools in from the right, and a floating **+** button, and forms open full screen. To open the app from a phone on the same Wi-Fi:
```bash
npm run dev -w backend
npm run dev -w frontend -- --host   # then open the "Network" URL Vite prints
```
**Security:** the app has no login. Anyone on that network who opens the URL can read and edit your data, so only use `--host` on networks you trust.

## Deploying to Render
One Render **Web Service** runs Express, which serves both the API and the built React app from the same URL. The app requires a password (`APP_PASSWORD`). Tokens last 30 days, and changing the password logs everyone out.

1. In Render, choose **New → Blueprint** and pick this repo. It reads [render.yaml](render.yaml).
2. Set the missing environment variables:
   - `GOOGLE_SHEET_ID`
   - `APP_PASSWORD`: a strong password
   - For media: `MEDIA_SCRIPT_URL` and `MEDIA_SCRIPT_SECRET`, the same values as in your local `.env`. `MEDIA_OWNER_NAME` is set in render.yaml.
3. Under **Environment → Secret Files**, add `service-account.key.json` with the contents of your key file. It is available at `/etc/secrets/service-account.key.json`.
4. Deploy, then open `https://<service>.onrender.com` and log in.

Render redeploys after every push to `main` whose tests pass (see "Testing" for the Auto-Deploy setting).

**Email when it's live:** Render emails only about failed deploys, so the GitHub workflow waits for the deploy instead. Add a repo secret `RENDER_API_KEY` (Render → **Account Settings → API Keys**) next to `RENDER_DEPLOY_HOOK_URL`, and [docker.yml](.github/workflows/docker.yml) waits until Render reports the deploy **live**. The run fails if the deploy fails or isn't live after 30 minutes. Then, in GitHub → **Settings → Notifications → System → Actions**, choose **Email** and untick **Only notify for failed workflows**. GitHub then emails the result of every run, so a green one means the deploy is live.

**Notes**
- **Free plan:** Render's free plan sleeps after about 15 minutes idle, so the first visit afterwards takes 30–60 s.
- **Local development:** unchanged. Without `APP_PASSWORD` there is no login locally.

## Features
- **Tools panel:** a list page's tools sit in a column on the right on wide screens (1280 px and up). On narrower ones it's the same panel, sliding in from the right: the ⚙ button in the top bar (phones) or next to **+ Add** opens it, and shows how many filters are on. The page's heading, with that button and **+ Add**, stays at the top of the screen while the list scrolls. From top to bottom: search and sort (the order in words that fit what's sorted: **Newest first** / **Oldest first** for dates, **A to Z** / **Z to A** for names, **Longest first** / **Shortest first** for duration); **Select**, **Download files** and **Export**; then the filters, grouped under **Topic** (category, domain, subdomain), **When** (year, current, no end date, expiration), **Progress** (activity progress, certifications, certificates, media, drafts, linked, posts, activities, Thai) and **Details** (the rest). A few fixed choices show as pills (several can be picked; **All** clears one), long lists as dropdowns (organizer, location, skills…). **Reset filters** clears them all and keeps the search. While a search or filter narrows the list, "Showing 3 of 10 · Clear" stays above it, panel open or not.
- **Totals:** a list page shows how many entries it has in all (drafts too) next to its name, in the heading or, on phones, the top bar. While a search or filter narrows the list, "Showing 3 of 10" says how many are shown.
- **Search, sort and filter a list page:** search matches every field. The search box is at the top of the page (in the header, or above the list on a phone) as well as in the tools panel; they're the same search. The filters offered, where a section has them and they're in use:
  - choices (employment type, organization type, post status), **Current**, **No end date**, and **Year** (every year an entry was running; just the start year for one with no end date);
  - skills and hashtags, and the organization (company, school, issuer, organizer), plus fields like location, degree, field of study, role, cause, industry and skill category. These list only the values in use, ignoring case and extra spaces;
  - **Certifications** and **Certificates**, a filter each (once some entry has one): entries that **Has** one linked, or **Doesn't have** one yet. Both on *Doesn't have* shows the entries with neither;
  - **Media** (once some entry has a file): entries that **Has** files (photos, videos, detail files or the certificate itself), or **Doesn't have** any. Not on Organizations, whose only file is the logo;
  - **Linked** (posts and activities): entries that link an entry of each section they link, or nothing;
  - **Expiration** for certifications and certificates: still valid, expired, or no expiration (no date, or **No expiration date** ticked);
  - **Sign-up email** for organizations: **Has a sign-up email** (on its website or any of its other links) or **No sign-up email yet** (it has a website or links, but none noted). One with no sites is in neither;
  - **Posts** (Experience, Education, Projects, Volunteer, Activities, Certifications, Certificates): entries a post already links (**In a post**), or none does yet (**Not in a post yet**), to see what hasn't been posted about;
  - **Activities** (Experience, Education, Projects, Volunteer): entries an activity already links (**In an activity**), or none does yet;
  - **Progress** (Activities): Interested, Awaiting Results, Not Started, In Progress, Completed, Cancelled by Organizer, Cancelled by Applicant or Rejected (see **Activities**);
  - **Thai:** entries that still need a translation, or are fully translated;
  - **Status:** drafts or saved entries.

  A field shows up in the filters when its definition in `sections.ts` sets `filter: true` (organization fields always do).
- **Download and Export in the tools panel:** **Download files** zips the files of every entry shown, and **Export** exports them to Word, Excel or PDF. Each shows how many entries it covers. Once entries are ticked with **Select**, both act on just those, and their numbers change to match. A download under way can be stopped with **Cancel download** (also the ✕ by a card's or a file selection's download), and an export or preview with **Cancel** in the Export dialog, which then stays open with its choices. Nothing is saved after a cancel.
- **Select several entries:** **Select** in the tools panel puts a tick box on each card. **Select all** ticks every entry shown (filters and search narrow it), then delete them together after one confirmation. Ticking an entry also ticks its files; click thumbnails (shown while selecting) to untick some, or to tick files of entries you aren't deleting. **Download** zips just the ticked files, in folders named like Drive's. (An entry's own **Select files**, in its popup, still picks files of that one entry.) Entries that fail to delete stay ticked, with the reason.
- **Forms in parts:** a long entry form shows its fields in lightly tinted boxes under small headings, e.g. an activity's *Activity* (name, domain, category, organizer), *Application*, *Where & when*, *Details*, *Links*, *Certifications & certificates*, *Linked to*, then *Activities & posts* for links stored on them. The groups are the fields' `group` in [shared/src/sections.ts](shared/src/sections.ts); short forms (Skills, Locations, Domains) have none. Inside a box, fields that go together share a line, set apart from the rest by a thin line: a start and end date (side by side even on a phone, with **No end date** or **I currently work here** below them) and a domain and its subdomains.
- **Short cards, full details in a popup:** a list shows each entry in brief: its title (with the progress, location type (**Onsite**, **Online**, **Hybrid**), **Online**, **Draft** and **No Thai yet** badges), its category as a tinted tag with a tag icon (activities, skills), set apart from the plain domain and skill pills, then its domain (projects and activities) and subtitle fields (company, school, issuer…), each on a line of its own, then **Start date:** and **End date:** on lines of their own (**Present** while current, no end line while still open, just **Date:** for one with no end date) and how many files it has. Click it to open the full card in a popup. It lists every filled-in field in the order of the entry form (e.g. Domain, Category, Organizer, Location, Start date, End date for an activity), with several organizations one under another, each in a light box of its own (all the same width) with its own copy icon for just that name, then the whole description however long, skills, links, linked certificates, "Linked to" and media, each in a soft box of its own. When posts link the entry, the popup scrolls down to its "Linked to" box as it opens. **Edit** at the bottom of the popup opens the form. A linked entry of another section opened from the popup (an activity's post, a project's certificate) has **Edit** too: its form opens over the popup, so it can be changed without going to its page, and closing the form returns to the popup. **Open in Posts →** (or that section) still goes to its page. The popup has its own **EN | ไทย** switch: it opens in the language the profile is shown in, and switching it changes just the popup (and the previews opened from it), not the page or the profile's language. Edit, delete, download, export and copy stay on the short card too. While selecting (**Select**), the cards show their files' thumbnails so single files can be ticked.
- **Click a value to filter by it:** clicking a value on an entry (its category, a domain or subdomain, the place, a skill, the progress or location type badge, an employment type) shows the list filtered to it, as if picked in the tools panel. On the short card it filters without opening the popup; in the popup it closes the popup first. On that list already, it replaces the filter for that field and keeps the others; from another section's entry it opens that section filtered. The filter matches the English value even while the profile is shown in Thai. Organization names on the short card filter too; in the popup they still open the organization.
- **Dates as dd/mm/yy:** dates show as `21/08/25` (a month alone as `08/25`) on cards, in copied text and in exports. The sheet keeps `YYYY-MM-DD`, so it still sorts and can be edited by hand, and the form uses the browser's date picker.
- **No end date:** Education, Projects and Activities have a **No end date** box for things with a start date only (e.g. a one-day event). Ticking it hides and clears the end date; its card shows just **Date:** with the start date, and it has no duration. Certifications and certificates have a **No expiration date** box that works the same way for the expiration date.
- **Floating forms:** Add and Edit open in a dialog. Adding (**+ Add**, **+ New certificate** and the like, **Add media**) has a **←** back arrow before the title; editing has **×**. It also closes with Esc or a click outside, and asks before discarding anything that would be lost.
- **Auto-save:** editing an entry (and the About page) saves it about 1.5 s after you stop typing, and when the form closes; the footer says *Saving… / Saved*. A draft stays a draft. Organization fields, and the name on the Organizations and Skills pages, save once you leave the field, so a half-typed name isn't registered or renamed everywhere. A refused change shows under its field (*Not saved: …*) and isn't retried until you change it. A **new** entry is kept in this browser as you type and comes back the next time you add one (**Start over** clears it); it reaches the sheet with **Save** or **Save draft**. Files added to a new entry can't be kept, so closing still asks first.
- **Links:** Experience, Education, Projects, Volunteer, Activities, Certifications and Certificates have a **Links** box in the form for any number of web links (a news story, a recording, a photo album), a row each with a title and its address; **Add link** adds a row, × removes one. A bare `www.…` address gets `https://`, and only web (http/https) addresses are accepted. The popup lists them in a **Links** box by title, with the site after it (`news.test`), opening in a new tab, each with its own copy icon; one without a title shows its address. Copied text and exports list them a line each. The title is the same in English and Thai.
- **Certifications and certificates:** two pages. A *certification* is earned by an exam or assessment; a *certificate* shows completion, e.g. of a course.
  - Experience, Education, Projects, Volunteer and Activities entries can link to any number of each ("Linked certifications", "Linked certificates").
  - **+ New certification / + New certificate** next to those pickers creates one (with its files) without leaving the form, and links it. From an activity, it starts with the activity's name (in English and Thai), its organizer as the issuer, and the activity's posts ticked under **Linked posts** (as ticked in the form, even before it's saved), all to change as needed.
  - In those forms they have their own **Certifications & certificates** box (always open), and on the cards their own row with the certificate file's thumbnail, apart from the entry's media.
  - Each certification or certificate card shows where it is used.
  - Deleting one removes it from every entry.
- **Domain:** projects and activities can be grouped by domain, and each domain into subdomains (Engineering → Web Development, DevOps, AI & Data, Cloud…). An entry can have several of each, picked as chips (a reef-tank film: *Film* and *Biology*, *Cinematography* and *Exotic pet*); the popup shows them as pills, and an entry with several shows under each one's filter chip. Chips above the list filter by domain, with labelled rows for subdomain and, on Activities, category. Several chips can be picked at once (*Engineering* and *Film* shows both); **All** clears them. The rows narrow each other (the subdomain row shows only the subdomains under the domains picked), and the picks are kept in the address (`?domain=Engineering&domain=Film`).
  - **Domains page:** the list of domains, each with its subdomains as chips. Add, rename or delete them there. **Domain** offers exactly these, and **Subdomain** only those under the domains picked. Deleting one takes it out of the choices; entries already using it keep it. Renaming a domain renames it on every project and activity. The domain's card lists the entries using it.
  - **Typing a new one** in an entry form adds it to the Domains page when the entry is saved (a new subdomain under the entry's first domain). Saving an old entry unchanged doesn't bring back one you deleted, and a draft's only count once it's saved. Taking a domain off an entry also takes off its subdomains, unless another domain picked has them too.
  - **Starting list:** the Domains tab is filled once, when it's first created: Engineering, Film, Biology, Travelling and Nature with their subdomains (`DOMAINS` and `SUBDOMAINS` in [shared/src/sections.ts](shared/src/sections.ts)), plus every domain and subdomain already used. After that it's yours to edit, even down to nothing.
  - **In Thai:** domains and subdomains get their Thai on the Domains page, like organizations and skills: the domain's name on its ไทย side, with a box per subdomain. Entries show them by these Thai names. (Thai typed on entries before, in `domain_th` / `subdomain_th`, is moved there when the server starts, then cleared on the entries.)
- **Category in Thai:** an activity's category gets its Thai once. Picking **Seminar** fills in the Thai already given with Seminar on any activity, and the ไทย side offers only that one; changing the English swaps the Thai with it. Saving **Seminar = สัมมนา** also gives that Thai to every other activity with Seminar and no Thai yet (Thai set on an entry is never overwritten).
- **Activities:** seminars, trainings, workshops and the like. Chips above the list filter by category (*All · Seminar 2 · Training 1*). **Category** offers Seminar, Training, Workshop, Conference, Webinar, Competition and Meetup, plus every category already used; type any other name to add a new one.
  - **Application:** an activity has an **Application deadline** and a **Results announcement date**, for one you apply to.
  - **Calendar:** **List | Calendar** above the list shows the activities on a month calendar instead (weeks start on Monday). Each one is a bar from its start date through its end date, coloured like its progress badge (struck through when cancelled, faded while a draft): a one-off with **No end date** on its day alone, one whose end isn't known yet on its start day, marked →. Its application deadline and results announcement date show as dots (**Deadline: …**, **Results: …**). An activity dated by month alone (`2026-10`) is listed above the grid as *This month, no exact day* in each month it spans, and those with no dates at all are listed under it, so none is lost.
    - **Highlight and open:** hovering an activity highlights all of it (each week of a long bar, and its deadline and results dots), filled with a deeper shade of its own colour. A click keeps it highlighted, filled with the colour itself and its name bold on it, until it's clicked again; several can be kept at once, from month to month, and **Clear highlights** lets go of them all. A double click opens its popup, as a click on its card does. From the keyboard, Space keeps it highlighted and Enter opens it. On a touch screen, which can't hover, a tap opens it.
    - Click a day's number (a **+** shows on hover) to add an activity starting that day; that form starts empty apart from the date and leaves alone the new activity **+ Add** keeps in this browser.
    - **‹ ›** go from month to month, **Today** back to this one. The view and the month are kept in the address (`?view=calendar&month=2026-11`), so a reload or a link opens the same month. Search and filters apply as on the list, and **Download files** and **Export** still act on every activity shown, not just the month's. Sort is hidden, since the calendar orders by date. **Select** shows the list, to tick entries, and the calendar comes back after.
    - On a phone the month is a list by day instead of a grid, each day's heading adding an activity on it.
    - The calendar is drawn by [FullCalendar](https://fullcalendar.io) v7 (MIT), with its classic theme and colours from [calendar.css](frontend/src/components/calendar.css), which follow the app's dark mode. It loads only when the calendar is shown.
  - **Progress:** each activity shows a coloured badge by its title, worked out from its dates against today: **Interested** through the application deadline, **Awaiting Results** until the results announcement date, **Not Started** before the start date, **In Progress** from the start through the end date (or while it has no end date yet; a one-off with **No end date** on its day only), then **Completed**. A month alone counts as the whole month. **Progress** in the form (under *Where & when*) can instead be set to **Interested** or **Awaiting Results** (the dates can't tell whether you applied yet), **Cancelled by Organizer**, **Cancelled by Applicant** or **Rejected**; what's set wins over the dates, and left on *By date* it follows them. Without any of those dates there's no badge. With the profile in Thai the badge reads in Thai (สนใจเข้าร่วม, รอประกาศผลการคัดเลือก, ยังไม่เริ่มกิจกรรม, กำลังดำเนินกิจกรรม, สิ้นสุดกิจกรรมแล้ว, ยกเลิกโดยผู้จัดกิจกรรม, ยกเลิกโดยผู้สมัคร, ไม่ผ่านการคัดเลือก). The **Progress** filter offers whichever of the eight the activities have; copied text and exports include it.
- **Online, onsite or hybrid:** Activities have a **Location type** in *Where & when*: **Onsite**, **Online** or **Hybrid** (stored in the `locationType` column). Experience has an **Online** box there instead, for a remote job. Either shows as a pill with an icon by the title, on the short card and in the popup, and has a filter under *Details*. Activities ticked Online before Location type existed are moved over on the next server start: **Hybrid** if they name a place, otherwise **Online**.
- **Locations:** Experience, Activities and Organizations pick their **Location** from the **Locations** page, a list of places (a city, a venue). Its card lists every entry there (**Used by:** Activity: AWS Summit, Experience: Editor…), and its popup links to them.
  - **Location detail**, next to it on the entry, takes that entry's own details: building, floor, room. It has a Thai version; short cards show it after the place (`Bangkok · Hall 2`).
  - Add, rename or delete places on the page. Renaming one renames it on every entry; deleting one takes it out of the choices, and entries already there keep it. A new place typed in an entry form is added when the entry is saved (saving an old entry unchanged doesn't bring back one you deleted).
  - A place's Thai name is given on the page and shown wherever it's named. The tab is filled once, when first created, with every place entries already name; Thai typed on entries before (`location_th`) is moved there when the server starts, then cleared on the entries. About me's location stays free text.
- **Organizations:** saving an entry adds its company, school, issuer, volunteer organization or activity organizer to the **Organizations** tab if it isn't listed yet.
  - Names are matched ignoring case and extra spaces.
  - Organization fields suggest names you've already used.
  - **Several organizations:** every organization field (company, school, issuer, organization, organizer) takes one or more, as chips: pick or type one, then Enter (or `;`) for the next. Each is registered, renamed, filtered and named in Thai on its own, and the full card lists them one under another, each linking to its page. In the sheet they're separated by `;` (`Studio X; Acme`), since names like "Acme, Inc." have commas; an organization's own name can't contain `;`.
  - Renaming an organization updates every entry that uses it.
  - **Other links:** beside its website and LinkedIn page, an organization keeps any number of titled links (its course platforms, stores, seminar lists), like an entry's **Links**. Each one, and the website (**Website sign-up email**), can note the email you signed up with there; the card shows it under the link, with a copy button.
  - **Logo:** an organization's form has a **Logo** block (JPG or PNG, picked or dropped on the block; a new one replaces the old, **Remove** trashes it). The logo shows before the organization's name wherever it's named: on the Organizations page, on other entries' short cards, where each organization is a chip of its own (*Organizer: [logo depa] [logo Ministry of …]*), and in their popups, where organizations without one get a faint building so the names still line up. It's stored in Drive like other media, as `Organizations/<Name - Type>/Organization_Logo_<Owner>.png`, and follows a rename. A new organization's logo uploads once it's saved.
  - Organizations from existing entries are added when the server starts.
- **Media:** like LinkedIn's "Add media". Experience, Education, Certifications, Certificates, Projects, Volunteer and Activities entries can have any number of JPG, PNG or PDF files (up to 100 MB each) and MP4, MOV or WebM videos (up to 500 MB each). Text files (detail files only), profile photos, backgrounds and logos are up to 10 MB.
  - Each file has a title and a description. The description has a Thai version too: the dialog's **English | ไทย** switch works like the entry form's (empty shows the English). The title stays the same in both languages, since it names the file. On the full card each file shows its thumbnail with the title and description beside it, like LinkedIn's media (two per row, one on phones). Titles show in full, wrapping onto more lines when long. The description is in the language the profile is shown in, shown in full, however long. Click a file to view it. Under its title each file shows its format and size (`PDF · 240 KB`), and every thumbnail is marked with its format (JPG, PNG, PDF, MP4, MOV, WEBM, TXT). The size also shows under each file in the entry form, beside its file name when it's opened or edited, and beside each file when adding several.
  - **Hide media / Show media (n):** folds an entry's files away on its full card, for entries with many files. Remembered per entry in this browser.
  - The type is checked from the file's content, not its name. A file that is valid UTF-8 text without control characters counts as plain text, whatever its name, and is stored and served as `text/plain`.
  - **Videos**, and images or PDFs over 10 MB, upload in 8 MB pieces straight to Drive (Drive's resumable uploads, with a short-lived token from the media script), so the server never holds a whole file. Smaller files go in one request through the media script, which can't take much more (Apps Script allows about 50 MB per call, and the file travels as base64). An image or PDF sent in pieces must be the type its name says. They play and seek without downloading everything, through signed links that expire after 6 hours.
  - **Filter by type:** when an entry has more than one kind of file, its card shows *All · Images · Videos · PDFs* chips.
  - **Thumbnails** come from Drive's own small previews (about 20× smaller than the files; a PDF shows its first page), through the server. Until Drive has made one, e.g. right after an upload, the file itself is shown.
  - Files are renamed `<Section>_<Title>_<Owner>.<ext>` (e.g. `Project_AWS-Certificate_Tammasorn.png`) and stored in Drive under `<Section tab>/<Entry title - first subtitle>/`, e.g. `Experience/Software Engineer - Depa/`. Same names in one folder get `_2`, `_3`, ….
  - Certifications are filed under `Certifications/` as `Certification_<Title>_<Owner>`, certificates under `Certificates/` as `Certificate_…`.
  - **Detail files**, apart from the media: what details the entry, e.g. an event's agenda, a brochure, slides or a course outline (JPG, PNG, PDF or TXT; text files go only here). **New text file** in the block writes one in the form: a title, which names the file, and the text, saved as a `.txt` like an uploaded one. A text file opens as its text. They have their own block in the form's **Files** box, their own strip on the card, their own order, and a `Details/` subfolder in Drive. Cards and exports label the blocks once an entry has detail files.
  - A certificate or certification has three blocks: **Certificate file** (the certificate itself, JPG/PNG/PDF, e.g. front and back; each one uploaded is saved as PNG, JPG and PDF, made in the browser, with the same title, and the images of a PDF show its first page, drawn at 300 dpi on A4. They're made at the best quality each format allows: the PNG and the PDF lose nothing (an uploaded JPG goes into the PDF byte for byte, a PNG as its exact pixels), and the JPG is at its highest quality, since JPG always loses a little), **Detail files**, and **Media** (anything else, e.g. photos or a video from the course). Other media go in a `Media/` subfolder; only the certificate file is linked into projects. In a popup, a certificate or certification shows itself, each page large (as its JPG, or the PDF if that's all there is; click a page to open and download it): in its own popup, and in the popup of every entry that links it, above its name and credential link.
  - Changing a title renames the file. Renaming an entry renames its folder.
  - The description is also the file's description in Drive (select the file → ⓘ): the English, then the Thai, so Drive search finds either.
  - **Linked certifications in Drive:** when a project, job, school or volunteer role links a certification, each of the certification's certificate files gets a **shortcut** in a `Certifications/` (or `Certificates/`) subfolder of that entry's folder, apart from its own media, and the file's Drive description adds `Linked to: Projects: Parzival Film Profile · …`. Drive search finds certificates by project name this way. Shortcuts follow renames and disappear when unlinked or deleted. The file itself stays in `Certifications/` or `Certificates/`. The server does this after answering, so saves don't wait for Drive. Links from posts don't get shortcuts, since posts have no Drive folder.
  - **Delete:** click a thumbnail on the full card and use the bin icon next to Download, or **Select files**, tick several, then the bin icon (one confirmation); files that fail stay ticked with the reason. In the entry's form, each file has a **×** on its thumbnail (always shown, phones have no hover), and can also be deleted from its dialog. A file still waiting to upload, e.g. one added to a new certificate in **+ New certificate**, goes at once and is never uploaded; an uploaded one asks first. Deleting a file, or its entry, moves it to the Drive trash (recoverable for 30 days). Empty folders are trashed too.
  - **Several at once:** pick several files, or drop them on the Media block. One dialog lists them with a title (from the file name) and description each, with the same **English | ไทย** switch. Put them in order there, by a row's drag handle or its ▲ ▼ arrows: they upload one after another in that order, which is their order on the entry, and any that fail stay in the list with the reason.
  - A file just uploaded shows in the form at once and can be dragged into place straight away, without waiting for the list to reload.
  - On a new entry, added files wait and upload right after the first save.
  - **Order:** drag thumbnails in the form, or use ◀ ▶ under each one (works on phones). The order is saved at once and used on the cards.
  - **Open in Google Drive:** **Drive** next to a list of files (on the full card and in the form) opens their folder in Drive, in a new tab; a file's preview has links to the file itself and to its folder.
  - **Download:** a file from its preview; the download icon on a card zips that entry's files; **Download files** in the tools panel zips the files of every entry shown, or of the ticked ones. Zips are made in the browser.
- **Drafts:** Experience, Education, Certifications, Certificates, Projects, Volunteer and Activities have **Save draft** next to Save. A draft can leave required fields empty (anything filled in is still checked), can have media, and shows a **Draft** badge; the **Status** filter shows drafts only. Its organizations, skills and Drive shortcuts only count once it's saved with **Save**, which also runs the full checks (an organization given a Thai name in the form is added right away). A saved entry can go back to being a draft with **Move to drafts** in its form: it's a draft again (required fields may be emptied), and its Drive shortcuts to linked certificates go until it's saved with **Save** again. Organizations and skills it added stay.
- **Linked activities:** an activity's **Linked to** box links it to any number of projects, experience, education and volunteer entries (a workshop taken during a degree, a seminar for a project). Experience, Education, Projects and Volunteer forms have a matching **Linked activities** picker (with **+ New activity**); either way the link is stored on the activity, so both cards show it: the activity under "Linked entries", the other entry under "Linked to". These links don't get Drive shortcuts: only certificate files are linked in Drive.
- **Linked posts:** Experience, Education, Projects, Volunteer, Activities, Certifications and Certificates forms have a **Linked posts** picker. Ticking a post there is the same as picking the entry in that post's **Linked to** box (always open): the link is stored on the post, so both forms (and both cards) show it. **+ New post** writes a post without leaving the form; it's ticked, and linked when the entry is saved. The new post starts with the entry's name as its title (an activity's or project's name, a job's title, a school), in English and Thai: the Thai one is the entry's Thai name (for a school, its organization's), left empty to mean "same as English" when there isn't one. Change it as needed.
- **Posts:** filter by status, copy the text with hashtags ready to paste into LinkedIn (a blank line, then the hashtags; any already written at the end of the content aren't added twice), and mark a post as posted.
  - **Its own media:** a post takes uploads like other entries (photos, videos and PDFs, in its **Media** block), stored in Drive under `Posts/<post title>/`. Unlike other entries it has no detail files and no shortcuts to linked certificates, and its folder is named after the title alone, so marking it posted moves nothing.
  - **Media from other entries:** a post also picks photos, videos and PDFs already saved with other entries (**Choose media** in the form): files of the entries it's linked to come first, then every other entry's, with a search. They're kept in the order picked (arrows to reorder, **×** to drop one). The files stay with their entries: the post's popup shows them to open and download, not to delete, and **Media** on the post's card downloads its own files and the picked ones together, numbered in that order (its own first), ready to upload to LinkedIn. A file deleted from its entry (or with it) leaves the post too.
  - A post can link to projects, experience, education, volunteer, activity, certification and certificate entries, in the **Linked to** box of the form. Linked entries show as chips on the post, and each linked entry shows the post under "Linked to".
- **English and Thai:** like LinkedIn's "profile in another language". The **EN | ไทย** switch (top bar on phones, sidebar on desktop) shows the whole profile in that language, and is remembered in this browser (unless **Settings** sets a start language).
  - Every text field has a Thai version, marked **ไทย** in the form: names, titles, descriptions, locations, categories, notes, and a post's title, content and hashtags. Dates, links, emails, credential IDs and dropdown choices have no language.
  - Organizations and skills get their Thai name once, on the **Organizations** and **Skills** pages. Every entry naming them then shows that name in Thai.
  - An organization can also get its Thai name right in an entry's form: on the **ไทย** side, the organization field (marked ไทย) is its Thai name, filled in if it has one. Saving stores it on the organization, adding a new organization with it, so there's no need to finish the entry first and go to the Organizations page.
  - The form has its own **English | ไทย** switch. It opens in the language the profile is shown in, and keeps both versions until you save. On the Thai side, the English text shows as the placeholder (or under **English** for long text) for you to translate from.
  - Thai versions follow the same character limits but are never required. Any field left empty shows the English. In Thai, a card with untranslated fields says **No Thai yet: …**.
  - Search finds entries by their English or their Thai text. Names sort as they are shown. **Copy for LinkedIn** copies a post in the language shown.
- **Dark/light mode:** dark is the default. Your choice is remembered in this browser.
- **Settings** (at the bottom of the menu): the **Start page** the app opens on (About by default) and the **Start language** the profile opens in: **English**, **ไทย**, or **Last used** (the default, whichever the switch was on last). Changes take effect on **Apply** (**Discard changes** puts back the saved ones); applying a language also switches to it now. Kept in this browser, so each device can open its own way.
- **Export to Word, Excel or PDF:** **Export** in the tools panel (every entry shown, or the ticked entries and files), the ⎘ icon on a card (that entry), **Export** on About me, or **Export profile** in the sidebar (the whole profile, section by section, like a CV; drafts are left out, and Organizations and Posts start unticked).
  - Every filled-in field with its label, linked entries by name, and each file's title, description (in each exported language) and file name. Images are embedded, centred on the page; videos and PDFs are listed.
  - In English, Thai, or both (Thai rows follow the English wherever they differ). It starts as a PDF in both languages.
  - **Include the original files** gives a .zip of the document and a `media/` folder in folders like Drive's; the document names each file's path, and in Excel the **Media** sheet links to it.
  - Word: a heading per entry with a table of its fields. Excel: a sheet per section (a row per entry, a column per field) and a **Media** sheet with previews. PDF: like Word, in the Sarabun font so Thai shows. Thai has no spaces between words, so the PDF puts a zero width space between them for lines to break at; the font has an empty glyph added for it ([frontend/scripts/add-zwsp-glyph.py](frontend/scripts/add-zwsp-glyph.py), SIL Open Font License in [frontend/src/export/fonts](frontend/src/export/fonts)).
  - **Preview** before saving: a PDF shows the file itself (or, where the browser can't show PDFs inside a page, as on most phones, its layout). Word and Excel show their layout drawn from the same content: a page with headings and field tables, or the workbook's sheets with tabs. **Export** from the preview saves exactly what it showed; **Back to options** changes the choices.
  - Everything is made in the browser; the Word, Excel and PDF libraries load only when you export or preview.
- **Export JSON:** downloads every section as one file.

## Data model
Each tab has `id`, `createdAt` and `updatedAt` columns, plus the fields defined in [shared/src/sections.ts](shared/src/sections.ts).

| Link | Stored as |
|---|---|
| Entry → certifications / certificates | `certificationIds` / `certificateIds` columns with comma-separated ids |
| Post → other entries | `projectIds`, `experienceIds`, `educationIds`, `volunteerIds`, `activityIds`, `certificationIds`, `certificateIds` columns, comma-separated ids |
| Activity → other entries | `projectIds`, `experienceIds`, `educationIds`, `volunteerIds` columns on the activity, comma-separated ids |
| Thai versions | a `<field>_th` column (e.g. `headline_th`) after the fields, for each field with a Thai version. Empty means "same as English" |
| Activity progress | `progress` column on the activity: `Interested`, `Awaiting Results`, `Cancelled by Organizer`, `Cancelled by Applicant`, `Rejected`, or empty to follow the dates (Not Started, In Progress and Completed aren't stored). An old `Cancelled` reads as `Cancelled by Organizer` |
| Activity application | `applicationDeadline` and `resultsDate` columns on the activity, `YYYY-MM-DD` |
| Activity location type | `locationType` column on the activity: `Onsite`, `Online`, `Hybrid`, or empty. The old `online` column is cleared once it has been moved over. |
| Links | `links` column: a link per line, `Title \| https://…` or just the address, so the cell reads and edits easily by hand. On an organization a line can end with the email signed up with: `Title \| https://… \| you@example.com` (`websiteEmail` holds the website's) |
| Drafts | `draft` column (`true` while unfinished) in the tabs of sections with drafts |
| Post → media | `mediaIds` column on the post: ids of rows of the **Media** tab, comma-separated, in the order picked. The files stay with the entries they were uploaded to |
| Entry → media | rows of the **Media** tab: `section`, `entryId`, `title`, `description`, `description_th` (after `role`; empty means "same as English"), `position`, `fileName`, `mimeType`, `size`, the Drive `fileId` and `folderId`, `linkedTo` (text), `shortcuts` (JSON, managed by the app) and `role` (`detail` for a detail file; on certificates: `credential` for the certificate file, `media` for the rest; on About: `photo` or `banner`; on organizations: `logo`) |
| Domains page | a **Domains** tab: `name`, `subdomains` (comma-separated, e.g. `Web Development, DevOps`), `name_th` and `subdomains_th` (English=Thai pairs, e.g. `DevOps=เดฟออปส์, Cloud=คลาวด์`, so their order doesn't matter). Entries store the domain and subdomain **names**, comma-separated, in `domain` / `subdomain` |
| Locations page | a **Locations** tab: `name`, `name_th`. Entries store the place's **name** in `location`, and their own details in `locationDetail` / `locationDetail_th` |
| Entry → organizations | the organizations' **names** in `company` / `school` / `issuer` / `organization` / `organizer`, separated by `;` (e.g. `Studio X; Acme`), so the sheet stays readable when edited by hand |

## API
| Method | Path | |
|---|---|---|
| GET | `/api/health` | Sheets connection status, plus media storage status under `media` |
| GET / PUT | `/api/single/about` | Read / upsert the About row |
| GET / POST | `/api/sections/:section` | List / create; `?draft=1` saves a draft (`experience`, `education`, `skills`, `certifications`, `certificates`, `projects`, `volunteer`, `activities`, `organizations`, `locations`, `domains`, `posts`) |
| GET / PUT / DELETE | `/api/sections/:section/:id` | Read / update / delete one entry. Creating or updating an entry of a section posts link to can also send `"linkedFrom:posts": "<post ids>"` (and, for experience, education, projects and volunteer, `"linkedFrom:activities"`): those posts (activities) then link to it and no others (stored on them). Left out, the posts are unchanged. Likewise `"organizationThai:<organization name>": "<Thai name>"` (e.g. `organizationThai:Studio X`) sets the Thai name of an organization the entry names, adding the organization if it's new |
| GET | `/api/export` | Every section (and the media list) as JSON |
| GET / POST | `/api/media` | List all media / upload one (multipart: `section`, `entryId`, `title`, `description`, `description_th`, `file`) |
| PUT | `/api/media/order` | Save the order of an entry's media: `{ entryId, ids }` |
| PUT / DELETE | `/api/media/:id` | Change title, `description` and `description_th` (a new title renames the file) / delete (trashes the file) |
| GET | `/api/media/:id/file` | The file itself |
| GET | `/api/media/:id/thumb?size=200` | Drive's small preview of the file (404 until Drive has one) |
| GET | `/api/media/:id/stream-url` | A signed link for streaming (valid 6 hours) |
| GET | `/api/media/:id/stream?exp=&sig=` | The file with byte ranges, no login needed (`&download=1` to save it) |
| POST | `/api/media/uploads` | Start a video upload: `{ section, entryId, title, description, description_th, mimeType, size }` → `{ uploadId, chunkSize }` |
| PUT / DELETE | `/api/media/uploads/:id` | Send a piece (raw bytes + `Content-Range`), or cancel |

## Performance
- **React Compiler** (`babel-plugin-react-compiler` in [vite.config.ts](frontend/vite.config.ts)) memoizes components automatically, so there is no hand-written `useMemo`/`useCallback`. It skips code it can't handle (e.g. `try … finally`); check with a build using `panicThreshold: 'all_errors'`.
- **Code splitting:** About, Posts and Login load on demand, and so does the Activities calendar with FullCalendar; zips are built in a Web Worker ([zip.worker.ts](frontend/src/zip.worker.ts)) that also carries the zip library.
- **No zod in the browser:** validation lives in `shared/src/schema.ts` and `shared` is marked side-effect free, so the frontend bundle leaves it out.

## Notes
- **Where logic goes:** anything the app *does* belongs in [core/](core/), behind the `Repository` and `FileStore` interfaces. `backend/` only translates HTTP requests into `createApi()` calls. Core type-checks without Node or browser types, so it can also run in Apps Script.
- **Adding a section or field:** edit [shared/src/sections.ts](shared/src/sections.ts). The sheet header, validation and form update automatically. New columns are appended to an existing tab on the next server start.
- **Editing the sheet by hand:** this is safe. Columns are matched by header name, and rows without an `id` are ignored. The server caches reads for about 10 seconds.
- **Character limits:** fields show a live counter against LinkedIn limits (headline 220, about 2600, descriptions 2000, posts 3000).
- **Values are stored as plain text** (`RAW`), so Sheets won't turn text into formulas or dates.
