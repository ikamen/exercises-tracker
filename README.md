# Exercise Tracker

A mobile-optimised (430×932) two-tab web app that also fills large screens: log
which muscle groups you worked each day (stored in Supabase), and browse
reference photos for exercises grouped by Arms / Legs / Chest / Core. Walks are
tracked too.

It is plain HTML, CSS and JavaScript with Supabase as the backend. There is no
build step, `package.json`, test suite or linter.

## 1. Set up the Supabase database

1. Create a project at [supabase.com](https://supabase.com) (or use an
   existing one).
2. Create your login: **Authentication > Users > Add user > Create new user**.
   Use the email `<username>@exercises-tracker.kpmv.co.uk` (you log in to the
   app with just the `<username>` part), pick a password, and tick
   **Auto Confirm User**. No mail is ever sent to that address. There is no
   sign-up in the app, so this is the only account.
3. Optionally turn off **Authentication > Sign In / Providers > Allow new users
   to sign up**, so nobody can create another account with the public key.
4. Open **SQL Editor > New query**, paste in
   [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. This creates
   the `exercise_days` table with rules that only let the logged-in user read
   and write their own days. It is safe to re-run, so keep it that way when
   changing it.

   For the one-off move from the Google Sheet, run `supabase/setup.sql`
   instead: it does the same as `schema.sql` and also copies in the days from
   the sheet for the user created in step 2. That file is not in git because
   it holds your exercise log.

## 2. Point the site at your project

Open [`config.js`](config.js) and fill in the project URL (**Project Settings
> Data API**) and publishable key (**Project Settings > API Keys**):

```js
const CONFIG = {
  SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_...",
  USERNAME_EMAIL_DOMAIN: "exercises-tracker.kpmv.co.uk"
};
```

The publishable key is meant to be public; the table rules decide what can be
read and written.

## 3. Add your exercise images

The Exercises tab shows the photos listed in `exercises/manifest.json`, which
records each file's name and size in pixels so the page can lay the list out
before the photos arrive.

To add your own:

1. Drop image files into `exercises/images/`, named like
   `Arms - Biceps.webp` (see [`exercises/images/README.md`](exercises/images/README.md)
   for the naming rules and the recommended size).
2. Regenerate the manifest:
   ```bash
   node tools/generate-manifest.js
   ```
3. Commit and push the updated `exercises/manifest.json` and image files.

## 4. Run it locally

Serve the project root with any static file server over `http://localhost`.

- **Local runs use live data.** `config.js` points at the production Supabase
  project, so saving from a local copy writes to the real exercise log.
- **The service worker also runs locally.** It serves the app's files
  cache-first, so edits may not appear until you unregister it or clear site
  data in the browser's dev tools.

## 5. Hosting

The live site is <https://exercises-tracker.kpmv.co.uk/>, hosted on Cloudflare
Pages from the GitHub repository `ikamen/exercises-tracker`. Response cache
headers are set in [`_headers`](_headers).

## 6. Shipping changes to the app's files

[`sw.js`](sw.js) is a service worker that keeps a copy of the app's files
(`index.html`, `styles.css`, `config.js`, `app.js`, the manifest, the icons and
the supabase-js script) on the device, so the app opens from there on every
launch and works offline. Exercise images are kept the first time they are
shown. Nothing on the Supabase host is ever cached: reads, saves and the login
always go to the network.

| Request | Strategy |
| --- | --- |
| Supabase host | Never cached, always network |
| Page navigations | Cache-first, served as `index.html` |
| `SHELL` files, supabase-js, exercise images | Cache-first |
| `exercises/manifest.json` | Network-first, cached copy when offline |

**Whenever you change any of those files, bump `CACHE_VERSION` in `sw.js`.**
Without the bump, phones that already have the app keep showing the old copy.
With it, the browser notices the changed `sw.js` on the next launch, downloads
the new files in the background, and the launch after that shows the new
version. Changes to the data in Supabase need no bump.

### Files that must change together

| When this changes | Also do this |
| --- | --- |
| Any file in `SHELL` in `sw.js`, including `index.html` (the `./` entry) | Bump `CACHE_VERSION` |
| A new file the app needs at startup | Add it to `SHELL` |
| An exercise image replaced under the same file name | Bump `CACHE_VERSION`, because images are cache-first once seen |
| An exercise image added under a new file name | Regenerate the manifest |
| supabase-js upgraded | Update the `<script>` URL and `integrity` hash in `index.html`, the `SUPABASE_JS` URL in `sw.js`, and bump `CACHE_VERSION` |
| The Supabase project | Update `SUPABASE_URL` in `config.js` and the `preconnect` link in `index.html` |
| A muscle group added to the tracker | Update `GROUPS` and `TABLE_ROWS` in `app.js`, add a column in `supabase/schema.sql`, add `icons/muscle-groups/<group>.svg`, and list that icon in `SHELL`. If it also needs photos, add a `.group-btn` in `index.html` |

## Project structure

```
index.html                    Page markup (both tabs)
styles.css                    Dark theme styling
config.js                     Supabase URL and publishable key (edit this)
app.js                        All front-end logic
sw.js                         Service worker: offline copy of the files above (bump CACHE_VERSION, see step 6)
_headers                      Cloudflare Pages response cache headers
supabase/schema.sql           Run in the Supabase SQL Editor (see step 1)
exercises/manifest.json       List of exercise images and their sizes (regenerate after adding images)
exercises/images/             Put your exercise photos here
tools/generate-manifest.js    Run after adding/renaming images: node tools/generate-manifest.js
```

## Architecture

All front-end logic is in `app.js`, a single IIFE that uses `var`, plain
functions and promise chains with no framework. Match that style when editing
it. `config.js` and the supabase-js UMD bundle load first as globals.

### Tracker state

- `state.realRows` holds the rows from the database, sorted by date.
- `state.displayRows` is `realRows` plus a `_virtual` placeholder for today if
  today isn't saved yet.
- `state.draft` holds the selected date's unsaved taps, and
  `state.originalSnapshot` is what `isDirty()` compares against. Switching
  dates while dirty opens the confirm dialog.
- `renderColumns` updates individual date columns and `renderTable` rebuilds
  everything. Prefer `renderColumns` for selection changes.

### Dates

The app uses `"17-Sep-2026"` strings everywhere and the database uses ISO
`"2026-09-17"`. Convert only at the boundary, in `fromDbRow` and `toDbRow`.
Sort with `toIsoDate`, because the display format doesn't sort correctly as
text.

### How the data flows

- **Login:** the first visit shows a login screen. The form takes a username
  and signs in as `<username>@<USERNAME_EMAIL_DOMAIN>`. The session is
  remembered on the device, so you stay logged in after that.
- **Reading:** on load, `loadTracker` shows the rows kept in localStorage
  instantly, then reads every row of `exercise_days` for the logged-in user.
  `refreshRows` keeps the selection and unsaved edits during that swap, and
  `state.savesCompleted` lets a slow read discard its result if a save finished
  after it started.
- **Writing:** pressing **Save** upserts the row(s) to write — usually just
  the selected date, but if there is a gap between the last saved date and the
  one you are saving, `buildSavePayload` includes blank rows for every day in
  between so the list of dates stays continuous. Rows are never deleted from
  the app: the database rules allow only select, insert and update.
- **Errors:** any failure to read or write shows *"There is a problem
  connecting to the data source"* at the bottom of the screen.

### Exercises tab

The app never scans the images folder. It reads `exercises/manifest.json`, and
each photo's group and label come from its file name, in the form
`<Group> - <Exercise name>.<ext>`.
