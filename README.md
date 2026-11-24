# GoldenSpots

Find the best sunrise and sunset spots in your city, and the day the sky is most likely to deliver.

It is an installable web app (PWA) with no build step and no API keys. It works on Android and iOS from one codebase.

## What it does

- Starts in the city you are in (browser location), with a button to change city.
- Calculates sunrise, sunset, golden hour and the compass direction of the sun on your device.
- Scores the sky for the next 7 days (0 to 100) from the cloud forecast, and marks the best day.
- Lists named viewpoints, hills, observation towers, beaches and piers from OpenStreetMap, ranked by how open the terrain is toward the sun.
- Shows each spot's best day, an illustrated sky 5 minutes before and 5 minutes after the event, and real sample photos from Wikimedia Commons, preferring ones taken near sunrise or sunset.

## Run it on your computer

```bash
cd goldenspots
python3 -m http.server 8080
# open http://localhost:8080
```

Location and the service worker need HTTPS on a phone, so test on a phone after hosting (below). `localhost` is allowed on your computer.

## Host it with git (GitHub Pages)

```bash
cd goldenspots
git init
git add .
git commit -m "GoldenSpots first version"
git branch -M main
git remote add origin https://github.com/<your-user>/goldenspots.git
git push -u origin main
```

Then on GitHub: **Settings, Pages, Build and deployment, Deploy from a branch, main, / (root)**. After a minute the app is live at `https://<your-user>.github.io/goldenspots/`. Every `git push` updates it.

## Install on a phone

- **Android (Chrome):** open the link, menu, **Install app**.
- **iPhone and iPad (Safari):** open the link, Share, **Add to Home Screen**.

## Later: Play Store and App Store

The app is plain HTML, CSS and JavaScript, so it can be wrapped without a rewrite.

- **Google Play:** [PWABuilder](https://www.pwabuilder.com) turns the hosted URL into a Trusted Web Activity package. It needs your own hosted URL and a Play developer account.
- **App Store and Play Store:** [Capacitor](https://capacitorjs.com) wraps the same files in a native shell. Apple reviews wrapped web apps more strictly, so plan for native features such as saved spots and notifications.
- Before a store release, check the terms of each free data source (Open-Meteo is free for non-commercial use and has a paid plan for commercial apps; Overpass is a shared community server).

## How the sky score works

Colour at sunrise and sunset needs cloud to catch the light and a clear path for the light to arrive. The score uses:

- High and mid-level cloud as the canvas, best at roughly half cover.
- Low cloud as the lid. Heavy low cloud on the horizon cuts the score hard.
- Visibility, very humid air and rain chance as reductions.

It is a rule of thumb, not a measured model. Treat 70 and above as worth the trip.

## How spots are ranked

For each candidate spot the app samples ground height along the compass bearing of the sun (250 m to 5 km out) and finds the steepest rise. A flat or falling horizon scores as fully open. Higher ground, and spots that sit above their surroundings, score better. A spot's score for a day is the sky score reduced when the view is blocked.

## Known limits

- Terrain only. Buildings and trees are not in the data, so a spot can look better here than in person.
- The sun bearing is measured for today and reused for the week. It drifts a few degrees over seven days.
- Only named places in OpenStreetMap appear, so small towns may have few results.
- The 5-minute previews are illustrations of the predicted sky. Wikimedia photos are samples of the place, not a live view at that minute, and many places have none.
- Sunrise and sunset are accurate to about a minute between roughly 70 degrees north and south.

## Project layout

```
index.html            page shell
css/style.css         styles (dark and light)
js/app.js             screens and state
js/sun.js             sunrise, sunset, sun position
js/score.js           sky score and 7-day outlook
js/spots.js           OpenStreetMap spots and horizon check
js/photos.js          Wikimedia Commons photos
js/scene.js, sky.js   illustrated sky
js/geocode.js         city search and location
sw.js                 offline support
manifest.webmanifest  install details
tests/                run with: node --test tests/sun.test.js
```

## Free data sources

- Open-Meteo: forecast, elevation, city search
- OpenStreetMap through the Overpass API: viewpoints and other places
- Wikimedia Commons: photos (credit and licence are shown with each one)
- BigDataCloud: turns your coordinates into a city name
