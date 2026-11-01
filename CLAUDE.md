# CLAUDE.md

Joki Ikan: one-tap "your boat has no engine, the hooked fish is the engine" arcade prototype (Lav Studio).
Plain web game, no build step, runs from file://.

- No emoji or text symbols as icons: `#i-*` SVG sprite in `index.html`. `node scripts/check-no-emoji.js` must pass.
- Design system shared with Gnome, Line & Sinker: flat colours, 2px ink outlines, hard shadows, Pixelify font,
  `--accent` = main action, `--gold` = coins, `--red` = danger. No gradients.
- UI copy in Indonesian; code and commits in English.
- `js/engine.js` stays pure (no DOM). After rule changes run `node scripts/test-engine.js` and
  `node scripts/sim.js 300 0.6`, then update the table in `docs/DESIGN.md`.
- Audio: keep `unlock` / `recover` / `duck` in `js/audio.js`.
- Namespace `JI`, profile key `jokiikan.profile.v1`, test hook `window.__joki` (`g`, `start()`, `tapFish()`).
- No leaderboard, no ads in the MVP. Credit Moranovo and PixelGnome packs.
