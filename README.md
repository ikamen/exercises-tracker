# Exercise Tracker

A mobile-optimised (430×932) two-tab web app: log which muscle groups you
worked each day (stored in Supabase), and browse reference photos for
exercises grouped by Arms / Legs / Chest / Core. Walks are tracked too.

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
   and write their own days. It is safe to re-run.

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
config.js                     Supabase URL and publishable key (edit this)
app.js                        All front-end logic
supabase/schema.sql           Run in the Supabase SQL Editor (see step 1)
exercises/manifest.json       List of exercise image filenames (regenerate after adding images)
exercises/images/             Put your exercise photos here
tools/generate-manifest.js    Run after adding/renaming images: node tools/generate-manifest.js
```

## How the data flows

- **Login:** the first visit shows a login screen. The session is remembered
  on the device, so you stay logged in after that.
- **Reading:** on load, the site reads every row of `exercise_days` for the
  logged-in user. The last copy is kept on the device so the table shows
  instantly while the fresh copy loads.
- **Writing:** pressing **Save** upserts the row(s) to write — usually just
  the selected date, but if there is a gap between the last saved date and the
  one you are saving, blank rows are included for every day in between so the
  list of dates stays continuous.
- **Errors:** any failure to read or write shows *"There is a problem
  connecting to the data source"* at the bottom of the screen.
