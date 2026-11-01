# Joki Ikan: design notes

> **Kapalmu tidak punya mesin. Ikan yang kamu kail adalah mesinnya.**
> Your boat has no engine. The fish you hook is the engine.

Concept prototype (MVP) by Lav Studio, built on the art, palette, font and sound of
*Gnome, Line & Sinker*. The fishing game is "go down, come back up". This one never goes down:
it is a sideways ride along the surface where every catch is also your fuel.

## 1. The one-sentence loop

Tap a fish, it bolts and drags your boat, it tires out and flops into the bucket, and in that
moment you must already have the next fish on the line, or the boat glides to a stop.

## 2. Why it should be strangely addictive

| Hook | How it shows up |
|---|---|
| **Constant small debt** | The boat loses speed every second you are not towing. You are never "safe", so every tap matters. |
| **Greed vs. safety** | A fish only pays when it lands, but a landed fish stops pulling. Swapping early keeps speed but throws the coins away. |
| **A skill window that feels like music** | The relay (*Estafet*): hook the next fish while the bar of the current one is yellow. Both count, the chain grows, and each landing plays the next note of a pentatonic run. Good players fall into a rhythm. |
| **Readable, self-inflicted failure** | You only stop because a line snapped (you towed through a jellyfish, a mine, an eel, or hooked a puffer) or because you missed the window. Never a random kill. |
| **Speed as reward and risk** | Big fish pull hard (above the gold mark: coins x2, music speeds up) but they fight longer, so the line sweeps through more water and more hazards. |
| **Second verb with a cost** | Tap the water to steer the towing fish. It is how you lift the line over danger, but each steer drains the fish, so it lands sooner. |
| **A journey, not a level** | Distance moves the clock from morning at the estuary to night in the strange sea. Every run you want to see one zone further. |
| **Collection** | 45 species across 5 seas, golden fish (x5), a "new fish" pop the first time you land one. |

## 3. Rules (as built)

- Hook range: dashed arc from the rod tip. Fish outside it are drawn faded. While nothing pulls you,
  hookable fish get a blinking bracket.
- Speed: towing fish pulls toward `size speed x (0.45 + 0.55 x stamina)`. Free coasting:
  `v -= (0.42 v (1 + 0.08 zone) + 8) dt`. Below the red mark for 0.9 s = run over.
- Stamina: small fish 2.4 s, huge fish 6.2 s. Steering costs 7 %.
- Chain: +1 per landing, +1 bonus for *Estafet* (relay below 30 % stamina) or *Sambar*
  (new hook within 0.7 s after a landing). Multiplier x2 / x3 / x4 / x5 at chain 3 / 6 / 10 / 15.
- Snap (jellyfish, mine, electric eel touching the towing line; hooking a puffer): fish escapes,
  chain resets, speed drops to 55 %.
- Trash (cans, bottles) hooks fine but has no pull: a decoy that costs you time.
- Zones by distance: Muara 0 m, Terumbu 450 m, Laut Lepas 1100 m, Laut Senja 2000 m, Laut Aneh 3200 m.
  Further out the water is heavier, fish are rarer and hazards more common.

## 4. Simulation (scripts/sim.js, bot in scripts/bot.js)

200 runs per skill level. The bot reacts with human-like delay and misses hazards by skill.

| skill | median run | median distance | median coins |
|---|---|---|---|
| 0.2 | 92 s | 1,940 m | 1,590 |
| 0.6 | 100 s | 2,130 m | 1,950 |
| 0.95 | 101 s | 2,220 m | 2,240 |

Skill shows mostly in coins (longer chains, more relays). Run length still depends too much on
fish supply after a snap: the first thing to tune with real players.

## 5. What is deliberately not in the MVP

- No shop, upgrades, missions or ads. The question this build answers is only: *is the ride fun
  for one more run?*
- No leaderboard (dropped).

## 6. If the core feels good: next steps

1. **Playtest numbers**: drag, stamina, relay window, hazard density (5 to 10 people, 10 runs each).
2. **Boats as builds**: sampan (light, stops fast), jukung (outrigger: wider reach), pinisi
   (sail: slow drag) using the boats already drawn in Gnome, Line & Sinker.
3. **Baits** that attract one size class, so you can plan a run around big fish.
4. **Daily route**: same seed for everyone each day, one try that counts.
5. **Fishdex with mastery** and outfits from the shells currency of the first game.
