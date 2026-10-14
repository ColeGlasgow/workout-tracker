# Workout Tracker

My 5-day lifting app, built around my week: Tue–Thu before work at a small work gym, Sat–Sun at a full gym, Mon/Fri off. It's one HTML page with no build step.

- Day-by-day program with supersets, a rest timer that shows what's next, and a swap button for when a machine is taken
- Tap to log a set; empty boxes fill with last week's numbers, and an "add weight" cue appears when you top the rep range
- 5-week cycles (4 weeks + deload), progress history per lift, and weekly sets per muscle
- Works offline; data stays in the phone's browser

## Run it

Open `public/index.html` in a browser.

## Test

```
npm install
npx playwright install chromium webkit   # first time only
npm test
```

Playwright runs the real page on an iPhone-sized WebKit and an Android-sized Chromium. It logs sets, runs the rest timer, swaps lifts, starts a new cycle, restores a backup, mocks the drop box and loads the app offline. It also checks that no screen scrolls sideways and no card is clipped. Locally it compares three screenshots against the approved ones in `tests/app.spec.js-snapshots/`. After a change you meant to make, approve the new look with `npm run test:update`. GitHub Actions runs the same tests, minus the screenshots, on every push.

## Deploy

`npm run deploy` runs the tests first and only deploys if they pass. Plain `netlify deploy --prod` skips them.

`netlify.toml` publishes `public/`. The function in `netlify/functions/api.mjs` stays out of it, so its code is never served.

## Drop box (optional)

`/api/health` and `/api/log` keep an automatic cloud backup of the log and take sleep, weight and heart-rate numbers from an iPhone Shortcut. Every request must send an `x-lift-key` header matching the `LIFT_KEY` environment variable (16+ characters) set in Netlify; anything else gets a 401. The key never goes in this repo. Paste the same key into the app under Profile.
