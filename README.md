<p align="center">
  <img src="icons/icon-192.png" alt="Drift app icon" width="128">
</p>

<h1 align="center">Drift · Sleep Planner</h1>

Drift is a sleep planning web app. It asks a few questions about your wake-up time, sleep needs and evening habits, then builds a personal bedtime plan with a wind-down timeline, sleep-cycle bedtimes, weekend options and tips.

**Live site:** https://thelincolnmosley.github.io/drift-sleep-planner/

## Features

- Guided 11-question setup with a name prompt
- "Be in bed by" recommendation with an asleep time
- Tonight's timeline: last caffeine, workout cutoff, wind-down, bed and asleep
- Sleep-cycle bedtimes (4, 5 or 6 cycles) with the best match highlighted
- Weekend plan when your weekend wake-up differs
- "Running late" card: after your planned bedtime, shows how much sleep you can still get before your alarm
- Personal tips based on your answers
- Remembers your answers on the device (localStorage)
- Installable as a home-screen app (PWA) and works offline

## Install on iPhone

1. Open the live site in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.

On Android Chrome, use the **Install** button that appears in the app, or the browser's install prompt.

## Run locally

The app is plain HTML, CSS and JavaScript with no build step. Service workers need `http://localhost` or HTTPS, so use a local server rather than opening the file directly:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Project structure

```
index.html            App shell and metadata
styles.css            All styling
app.js                Questions, plan calculations and rendering
sw.js                 Service worker for offline use
manifest.webmanifest  Install settings (name, icons, colours)
icons/                App icons (192, 512 and Apple touch icon)
```

## How the plan is calculated

- **Asleep** = wake-up time minus sleep need
- **Get in bed** = asleep time minus time to fall asleep
- **Wind-down starts** = bed time minus wind-down length
- **Last caffeine** = asleep time minus 8 hours
- **Sleep-cycle bedtimes** = wake-up time minus (cycles × 90 min) minus time to fall asleep

These are general guidelines, not medical advice. If you have ongoing sleep problems, talk to a doctor.

## Privacy

Your answers are stored only in your browser's local storage on your device. Nothing is sent to a server. Use **Erase everything** in the app to remove them.

## Deploy

GitHub Pages serves the `main` branch at the root. Any push to `main` updates the live site within a minute or two.
