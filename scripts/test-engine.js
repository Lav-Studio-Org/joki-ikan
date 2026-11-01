// Engine checks: rules behave as designed and simulated runs stay in the pacing window.
const E = require('../js/engine.js');
const bot = require('./bot.js');
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const dt = 1 / 60;

// 1. without a fish the boat coasts to a stop and the run ends
{
  const g = E.newRun({ seed: 3 }); g.ents = [];
  let t = 0; while (!g.over && t < 20) { E.step(g, dt); g.ents = []; t += dt; }
  ok(g.over && g.cause === 'stall' && t < 6, `coasting stops the boat (${t.toFixed(1)} s)`);
}
// 2. a hooked fish pulls the boat and lands with coins
{
  const g = E.newRun({ seed: 5 });
  const f = g.ents.find((e) => E.canHook(g, e) && E.SPECIES[e.sp].kind === 'fish');
  E.tap(g, f.x, f.y);
  let t = 0; while (!g.tow && t < 2) { E.step(g, dt); t += dt; }
  ok(g.tow && g.tow.id === f.id, 'tap on a fish hooks it');
  const v0 = g.v; for (let i = 0; i < 30; i++) E.step(g, dt);
  ok(g.v > v0 - 1, 'a towing fish keeps the boat moving');
  t = 0; while (g.tow && t < 10) { E.step(g, dt); t += dt; }
  ok(g.landed === 1 && g.coins > 0 && g.chain === 1, 'a tired fish lands in the bucket');
}
// 3. relay: hooking the next fish while the old one is spent counts both
{
  const g = E.newRun({ seed: 9 });
  const fs = g.ents.filter((e) => E.canHook(g, e) && E.SPECIES[e.sp].kind === 'fish');
  E.tap(g, fs[0].x, fs[0].y); while (g.hook) E.step(g, dt);
  g.tow.stam = 0.2;
  const nx = { id: 997, type: 'fish', sp: 'sardine', x: 50, y: 20, baseY: 20, vx: 0, ph: 0, st: 'swim', stam: 1 };
  g.ents.push(nx);
  g.ents.forEach((e) => { if (e.type === 'haz') e.dead = true; });
  E.tap(g, nx.x, nx.y); let t = 0; while (g.hook && t < 2) { E.step(g, dt); t += dt; }
  ok(g.landed === 1 && g.relays === 1 && g.chain === 2, 'relay lands the old fish and adds a bonus link');
}
// 4. a hazard across the line snaps it and resets the chain
{
  const g = E.newRun({ seed: 11 });
  const f = g.ents.find((e) => E.canHook(g, e) && E.SPECIES[e.sp].kind === 'fish');
  E.tap(g, f.x, f.y); while (g.hook) E.step(g, dt);
  g.chain = 4;
  g.ents.push({ id: 999, type: 'haz', haz: 'jelly', x: (E.ROD.x + g.tow.x) / 2, y: (E.ROD.y + g.tow.y) / 2, baseY: (E.ROD.y + g.tow.y) / 2, vx: 0, ph: 0, r: 8 });
  E.step(g, dt);
  ok(!g.tow && g.chain === 0 && g.snaps === 1, 'jellyfish on the line snaps it');
}
// 5. hooking a puffer snaps too
{
  const g = E.newRun({ seed: 13 });
  g.ents.push({ id: 998, type: 'fish', sp: 'pufferfish', x: 60, y: 30, baseY: 30, vx: 0, ph: 0, st: 'swim', stam: 1 });
  g.v = 200; E.tap(g, 60, 30); let t = 0; while (g.hook && t < 1) { E.step(g, dt); t += dt; }
  ok(!g.tow && g.snaps === 1, 'puffer pops the line');
}
// 6. steering moves the towing fish and costs stamina
{
  const g = E.newRun({ seed: 15 });
  const f = g.ents.find((e) => E.canHook(g, e) && E.SPECIES[e.sp].kind === 'fish');
  E.tap(g, f.x, f.y); while (g.hook) E.step(g, dt);
  const s0 = g.tow.stam; E.tap(g, 300, 10);
  for (let i = 0; i < 60; i++) E.step(g, dt);
  ok(g.tow && g.tow.y < 30 && g.tow.stam < s0 - E.T.steerCost, 'tapping water steers the fish up');
}
// 7. pacing: median simulated run (skill 0.6) lasts 60..180 s and reaches the reef
{
  const ts = [], zs = [];
  for (let s = 1; s <= 120; s++) {
    const g = E.newRun({ seed: s * 7919 }); const act = bot(E, g, { skill: 0.6 });
    while (!g.over && g.t < 900) { act(dt); E.step(g, dt); g.events.length = 0; }
    ts.push(g.t); zs.push(g.zone);
  }
  ts.sort((a, b) => a - b); zs.sort((a, b) => a - b);
  const med = ts[60];
  ok(med > 60 && med < 180, `median run ${med.toFixed(0)} s`);
  ok(zs[60] >= 1, `median run reaches zone ${zs[60]}`);
}
console.log(fail ? `${fail} failed` : 'all engine checks passed');
process.exit(fail ? 1 : 0);
