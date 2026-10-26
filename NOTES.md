## What this is
Skincare & Makeup Routine Analyzer (renamed from "Petal"; storage keys still `petal.*` on purpose so saved data survives): single-page skincare/makeup routine app (routine tabs, product shelf, skin quiz, streak). Plain HTML/CSS/JS.

## Current state
Routine tabs, product shelf, skin-type quiz, streak. Photo diary REBUILT as face-photo analysis (flaws by region + severity, per-flaw needs, goal summary, AM/PM order): `src/analyze.js` (pixel heuristics), `src/advice.js` (content), `src/photos.js` (UI). The older Q&A skin check / ingredient list are still removed. Reminders (morning/evening times, alert + chime + speech + optional Notification, snooze) added. Logic tested in jsdom only (no real browser available).

## Stack & key choices
- Scaffold was Vite+React; replaced with vanilla JS: `index.html`, `src/app.js`, `src/style.css`. Vite is kept only as dev server/bundler (sandbox.yaml unchanged). Check: `pnpm build`.
- All state in localStorage key `petal.v1`; checked steps reset each local day; streak = list of YYYY-MM-DD days.

## Decisions
- Reminders: state in `petal.reminders.v1`; a 5s `setInterval` + visibilitychange compares the clock, so they ONLY fire while the page is open (no service worker/push by design). Fires within a 2-min catch-up window, once per day per time (`fired` key). Snooze = 10 min. Audio/speech are unlocked on first user tap (browser autoplay rules); Notification only shown when the tab is hidden.
- Task asked to "keep" photo/skin analysis, but they had already been removed on request the turn before (never committed, not restorable). Reminders were built without them; user was told.
- Streak day is granted when all morning OR evening steps are checked. Unchecking revokes it (undo mis-tap); adding/removing steps never revokes.
- Expiry warning: mascara 6 months, others 12; also an early notice within 30 days.

## Gotchas & environment facts
- Verify no network use: `grep -rnE "fetch\(|XMLHttpRequest|https?://" src index.html` should be empty.

## Chess (separate app)
- Standalone `public/chess/index.html` (served at `/chess/`, copied to dist by `pnpm build`). `vite.config.ts` has a small `chess-route` plugin because Vite's dev SPA fallback otherwise serves the Analyzer's index.html at `/chess/`; check: `curl -s 127.0.0.1:3000/chess/ | grep -o '<title>[^<]*'`. Self-contained: no imports, no shared code with the Analyzer. Engine is the pure `Chess` object at the top of its script.
- Verify move rules: perft on start/kiwipete/CPW positions 3-6 all match published counts (run via jsdom `Chess.perft(Chess.fromFEN(fen), depth)`).
- Rules: full legal moves, castling, en passant, promotion picker, check/mate/stalemate, plus K-vs-K/K+minor and 50-move draws. Not implemented: threefold repetition, undo, clocks.

## Dead ends
- Face analysis is a colour/texture HEURISTIC, not an ML model; tuned only on synthetic faces + 1 real portrait (no browser or image viewer here). Real-world accuracy unverified: it can false-flag shadows/beards and miss real acne. Uses browser `FaceDetector` when present, else a skin-colour blob fallback (failed on 4 of 5 stock portraits that were grayscale/odd-coloured). A trained model (e.g. MediaPipe) would be the real fix but needs a bundled model file (no network at runtime by design).
- Photo diary + canvas skin reading + ingredient suggestions: built, then removed by the user (don't rebuild unless asked). `petal.photos.v1` is purged on load.
