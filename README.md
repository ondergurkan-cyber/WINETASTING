# Tasting

A wine tasting app for iPhone and iPad, built around the WSET Systematic Approach to Tasting (SAT).

It is an installable web app (PWA): plain HTML, CSS and JavaScript with no build step. Open it in Safari, tap **Share → Add to Home Screen**, and it runs full screen and offline like a normal app. All data (events, wines, tastings, photos, videos) is stored on the device in IndexedDB.

## What's in this prototype

- **Settings:** tasting method (WSET SAT now; Beyond Flavour and CMS grids shown as "coming soon"), then the level within it: **Level 2, Level 3 (default) or Diploma (Level 4)**. Structure+ on/off, default scoring scale (100 or 20), note format, your own lexicon, backup export/import.
- **Events:** name, date, place, scale, blind mode, host, theme. Each event has **Wines** (in tasting order, reorderable), **Standings** (sorted by your score, medals, ties share a rank) and **Notes & media** (text, photos, videos).
- **Add wine:** label photo plus details. In a blind event the label is stored blurred and details stay hidden until **Reveal**.
- **Tasting:** Style → Appearance → Nose → Palate → Conclusions → Wrap-up. The form is drawn from the SAT level and filtered by colour and type (tannin only for reds unless switched on, mousse only for sparkling, colour options per colour). Lexicon clusters for the wine's colour show first; the rest sit under "More clusters". Add your own descriptors. "Copy from nose" for the palate. BLIC helper suggests a quality level.
- **Structure+ (optional):** acid shape and feel, tannin location and texture, phenolic bitterness, brightness and rim (from Beyond Flavour). Not part of the SAT; they feed the guess.
- **Wrap-up:** GUESS (ranked candidates with reasons), SCORE (suggested range from the SAT quality level), my notes, generated tasting note in three formats (WSET full, short, social) with Copy and Share, photos, and Reveal with "right / close / wrong".
- **Standings tab on Home** across all events and My Wines, filterable by colour, event or My Wines.
- **New tasting:** choose **Event** or **Single wine**, or open a bottle from the cellar.
- **My Wines:** single tastings (a restaurant, a dinner) outside events, grouped by month, each with date, place (plus optional saved location and map link), score scale, photos and the same tasting sheet.
- **AI label scan:** take a label photo and Claude reads producer, wine, vintage, region, country, grapes, ABV, style (and a drinking-window estimate for the cellar). Uncertain fields are marked "check". Uses your own Anthropic API key, entered in Settings, stored only on the device and never exported. Works for event wines (hidden in blind events), single wines and cellar bottles.
- **Cellar:** bottles you own with quantity, location, price, merchant, purchase date, drinking window ("Drink soon" filter), history log. **Open a bottle and taste it** takes one out and starts a My Wines tasting linked to the bottle.
- **Merchants:** shops, importers and producers you buy from, with contact links (call, email, website, map), notes, purchases, bottles bought and total spent.

## Not yet

- Outside scores and prices (Vivino has no public API; a licensed source such as the Wine-Searcher API needs approval). When other people use the app, the AI key should move to a small server.
- Sync between iPhone and iPad (use Export/Import for now).
- Guess knowledge base is v0 (~45 classic profiles in `js/profiles.js`), no LLM explanations yet, no accuracy stats.

## Running it

Any static file host works. Locally:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

To use it on iPhone/iPad, host it over HTTPS, for example with GitHub Pages (Settings → Pages → Deploy from branch → `main` / root), then open the Pages URL in Safari and Add to Home Screen.

## Structure

```
index.html, manifest.webmanifest, sw.js   app shell, install metadata, offline cache
css/app.css                               styles (light/dark, iPhone and iPad)
js/app.js                                 views, routing, actions
js/db.js                                  IndexedDB storage, photo compression
js/methods/wset.js                        WSET SAT L2 / L3 / Diploma definitions and lexicons
js/methods/index.js                       method registry; add new methods here
js/note.js                                tasting note generator
js/guess.js, js/profiles.js               rule-based guess engine and its knowledge base
```

A new tasting method is a new file like `js/methods/wset.js` (sections, fields, options, which styles they apply to, lexicon) registered in `js/methods/index.js`.

## Copyright

The WSET Systematic Approach to Tasting Wine® and Wine-Lexicons are copyright Wine & Spirit Education Trust and are used here for personal study. Publishing or selling the app needs WSET's written permission.
