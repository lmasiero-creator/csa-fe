# csa-fe — CSA App Frontend

Static site (HTML5 + Vanilla JS + Bootstrap 5.3) served by GitHub Pages.

## Run locally

**Prerequisites:** [Node.js](https://nodejs.org) (any recent LTS, for `npx`)

```bash
# From the csa-fe directory
npx serve -p 5500
```

Then open http://localhost:5500 in your browser.

The backend must also be running on port 3000 (see `csa-be`).
`js/config.js` detects `localhost` automatically — no file edits needed.

## Project structure

```
index.html             — redirect / landing
account/index.html     — /account page (profile & identity)
admin/index.html       — /admin page (quota owners, calendar, recipients)
involvement/index.html — /involvement page (subscribe to field activities)
delivery/index.html    — /delivery page (request delivery changes)
js/
  config.js            — API_BASE_URL + BASE_PATH (auto-detected)
  layout.js            — shared nav injection + showToast()
  owner-picker.js      — reusable searchable quota-owner picker
  account.js / admin.js / involvement.js / delivery.js
css/app.css            — custom styles
```

## Deploy to GitHub Pages

Push to the `main` branch. GitHub Actions deploys automatically.
Update the Render.com URL in `js/config.js` once the backend is live.
