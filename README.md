# Skincare & Makeup Routine Analyzer

Built by **Swetha** at Walk & Hack, the AI Tinkerers NYC × Twilio build-while-you-walk event in Central Park on October 24, 2026. The app was built by texting a coding agent from the park; this repo is the code that came out, packaged so it runs on your own machine.

A single-page skincare and makeup routine app: morning and evening routine tabs, a product shelf with expiry warnings (mascara at 6 months, everything else at 12), a skin-type quiz, reminders that fire while the page is open, and a streak for days where a full routine was checked off. All state is in the browser's localStorage. A standalone chess game lives at `/chess/` from an earlier build on the same walk.

## Run it

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. No network calls, no keys. `pnpm build` writes `dist/`.

## Layout

- `index.html`, `src/app.js`, `src/style.css` the app, vanilla JS (the React scaffold was replaced; Vite is kept as dev server and bundler).
- `src/analyze.js`, `src/advice.js`, `src/photos.js` the face-photo heuristics from an earlier version, no longer wired to the page.
- `public/chess/index.html` the chess game; `vite.config.ts` has a small route so `/chess` serves it in dev.
- `NOTES.md` the builder's working notes from the event, kept as-is.
