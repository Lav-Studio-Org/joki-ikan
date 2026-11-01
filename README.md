# Joki Ikan

**Kapalmu tidak punya mesin. Ikan yang kamu kail adalah mesinnya.**

A one-tap arcade prototype by Lav Studio. Tap a fish to hook it: it bolts and drags your little
boat across the sea. When it tires out it flops into the bucket, and by then you need the next
fish on the line, or the boat glides to a stop. Hook the next fish while the current one's bar is
yellow for an *Estafet* (relay): both count and your chain multiplier climbs to x5.

Concept MVP. Reuses the pixel art, palette, font and generative audio of *Gnome, Line & Sinker*.
Design notes: [docs/DESIGN.md](docs/DESIGN.md).

Play: https://lav-studio-org.github.io/joki-ikan/

## Controls

- Tap or click a fish inside the dashed arc: hook it (swap if you are already towing one).
- Tap the water while towing: steer the fish to that depth (costs its stamina). Keep the line
  above jellyfish, mines and electric eels.
- Never hook a puffer. Esc pauses.

## Run locally

```sh
python3 -m http.server 8130
# open http://localhost:8130/
```

## Checks

```sh
node scripts/test-engine.js          # rules + pacing (bot simulation)
node scripts/check-no-emoji.js       # icons come from the SVG sprite
node scripts/sim.js 300 0.6          # pacing table for a skill level
node scripts/smoke.js http://localhost:8130/ shots   # Playwright smoke test + screenshots
```

## Files

| Path | What |
|---|---|
| `js/engine.js` | pure game rules (no DOM): species, towing, chain, hazards |
| `js/render.js` | canvas renderer (sky and sea change with distance) |
| `js/main.js` | menu, HUD, result, input, sound cues |
| `js/audio.js` | synthesized music and SFX (from Gnome, Line & Sinker) |
| `js/atlas.js` | sprite sheet (embedded PNG) |
| `scripts/bot.js` | simulated player used by tests and `sim.js` |

## Credits

- **80+ Fishing Icons Asset Pack** by Moranovo: https://moranovo.itch.io/80fishing-icons-asset-pack
- **Pixel Gnome Fishing Pack** (free sample) by PixelGnome: https://pixelgnome.itch.io/fish
- Gnome, boat, hazards, UI, music and sound by Lav Studio.
- Font: Pixelify Sans (SIL Open Font License, `fonts/OFL.txt`).
