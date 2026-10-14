# Workout Tracker

My 5-day lifting app, built around my week: Tue–Thu before work at a small work gym, Sat–Sun at a full gym, Mon/Fri off. It's one HTML page with no build step.

- Day-by-day program with supersets, a rest timer that shows what's next, and a swap button for when a machine is taken
- Tap to log a set; empty boxes fill with last week's numbers, and an "add weight" cue appears when you top the rep range
- 5-week cycles (4 weeks + deload), progress history per lift, and weekly sets per muscle
- Works offline; data stays in the phone's browser

## Run it

Open `public/index.html` in a browser.

## Deploy

```
netlify deploy --prod
```

`netlify.toml` publishes `public/`. The function in `netlify/functions/api.mjs` stays out of it, so its code is never served.

## Drop box (optional)

`/api/health` and `/api/log` keep an automatic cloud backup of the log and take sleep, weight and heart-rate numbers from an iPhone Shortcut. Every request must send an `x-lift-key` header matching the `LIFT_KEY` environment variable (16+ characters) set in Netlify; anything else gets a 401. The key never goes in this repo. Paste the same key into the app under Profile.
