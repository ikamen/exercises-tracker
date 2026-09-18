# Exercise Tracker

A mobile-optimised (430×932) two-tab web app: log which muscle groups you
worked each day (backed by a Google Sheet), and browse reference photos for
exercises grouped by Arms / Legs / Chest / Core.

## 1. Deploy the Google Apps Script backend

1. Open your **"Exercises tracker"** Google Sheet (the one with the
   `Exercises tracker` tab and headers `Date | Legs | Arms | Chest | Core | Notes`
   in row 1).
2. Go to **Extensions > Apps Script**.
3. Delete any starter code in `Code.gs`, then paste in the contents of
   [`apps-script/Code.gs`](apps-script/Code.gs) from this project.
4. Click **Deploy > New deployment**.
5. Click the gear icon next to "Select type" and choose **Web app**.
6. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
7. Click **Deploy**, and authorise the script when prompted (it needs
   permission to read/write this one sheet).
8. Copy the **Web app URL** you're given — it looks like
   `https://script.google.com/macros/s/AKfycb.../exec`.

> If you edit `Code.gs` later, you'll need to create a **new deployment
> version** (Deploy > Manage deployments > Edit > New version) for the
> changes to go live — updating the code alone isn't enough.

### About the permissions prompt

`Code.gs` includes a `@OnlyCurrentDoc` annotation at the top. This narrows
the permission Google asks for from *"See, edit, create, and delete all your
Google Sheets spreadsheets"* down to just this one sheet. When you authorise
the script, you should see the narrower wording. If you still see the broad
"all your spreadsheets" prompt:

1. In the Apps Script editor, click **Project Settings** (gear icon) and
   check **"Show `appsscript.json` manifest file in editor"**.
2. Open `appsscript.json` and confirm it contains:
   ```json
   "oauthScopes": ["https://www.googleapis.com/auth/spreadsheets.currentonly"]
   ```
   Add this field if it's missing, then save.
3. If you'd already authorised the broad scope once before adding this, go to
   [myaccount.google.com/permissions](https://myaccount.google.com/permissions),
   remove the existing authorisation for this script, then deploy and
   authorise again so it re-prompts with the narrower scope.

## 2. Point the site at your script

Open [`config.js`](config.js) and paste your Web app URL in:

```js
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycb.../exec"
};
```

## 3. Add your exercise images (optional for now)

The site ships with a **sample manifest** (`exercises/manifest.json`) listing
example filenames, but no actual image files — so the Exercises tab will
show broken image icons until you add real photos.

To add your own:

1. Drop image files into `exercises/images/`, named like
   `Arms - Biceps.jpg` (see [`exercises/images/README.md`](exercises/images/README.md)
   for the exact naming rules).
2. Regenerate the manifest:
   ```
   node tools/generate-manifest.js
   ```
3. Commit and push the updated `exercises/manifest.json` and image files.

## 4. Host on GitHub Pages

1. Push this whole folder to a GitHub repository.
2. In the repo, go to **Settings > Pages**.
3. Under "Build and deployment", set **Source** to "Deploy from a branch",
   pick your branch (e.g. `main`) and the root folder (`/`).
4. Save — GitHub will give you a URL like
   `https://<your-username>.github.io/<repo-name>/`.
5. Open that URL on your phone and (optional) add it to your home screen for
   quick access.

## Project structure

```
index.html                    Page markup (both tabs)
styles.css                    Dark theme styling
config.js                     Apps Script URL (edit this)
app.js                        All front-end logic
apps-script/Code.gs           Paste into Google Apps Script (see step 1)
exercises/manifest.json       List of exercise image filenames (regenerate after adding images)
exercises/images/             Put your exercise photos here
tools/generate-manifest.js    Run after adding/renaming images: node tools/generate-manifest.js
```

## How the data flows

- **Reading:** on load, the site calls the Apps Script URL with
  `?action=read`, which returns every row from the sheet as JSON.
- **Writing:** pressing **Save** sends a `POST` with the row(s) to write —
  usually just the selected date, but if there's a gap between the last
  saved date and the one you're saving, blank rows are included for every
  day in between so the sheet stays continuous.
- **Errors:** any failure to read or write shows *"There is a problem
  connecting to the data source"* at the bottom of the screen.
