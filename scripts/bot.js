// Simulated player for tests and balancing. `skill` 0..1 sets reaction time and how often it
// spots a line hazard in time. Usage: const act = bot(E, g, { skill }); call act(dt) each step.
module.exports = function bot(E, g, { skill = 0.6 } = {}) {
  const react = 0.55 - skill * 0.4;   // seconds before it notices a new situation
  let wait = react;
  let lastState = '';
  return function act(dt) {
    const state = (g.tow ? 'T' + g.tow.id : 'F') + (g.hook ? 'H' : '');
    if (state !== lastState) { lastState = state; wait = react * (0.7 + g.rand() * 0.6); }
    wait -= dt;
    if (wait > 0 || g.hook) return;
    const fish = g.ents.filter((e) => E.canHook(g, e) && E.SPECIES[e.sp].kind === 'fish');
    if (!g.tow) {
      // grab the closest safe fish, preferring big ones a little
      let best = null, bs = -1e9;
      for (const e of fish) {
        const sp = E.SPECIES[e.sp];
        const s = sp.size * 30 - Math.hypot(e.x, e.y) * 0.4 + (e.gold ? 60 : 0);
        if (s > bs) { bs = s; best = e; }
      }
      // a sloppy player sometimes taps a puffer by mistake
      if (best && g.rand() < (1 - skill) * 0.06) {
        const p = g.ents.find((e) => E.canHook(g, e) && e.sp === 'pufferfish');
        if (p) best = p;
      }
      if (best) { E.tap(g, best.x, best.y); wait = react; }
      return;
    }
    // towing: look 0.6 s ahead for a hazard crossing the line
    const f = g.tow;
    for (const h of g.ents) {
      if (h.type !== 'haz') continue;
      const hx = h.x + (h.vx - g.v) * 0.6;
      if (E.segDist(hx, h.y, E.ROD.x, E.ROD.y, f.x, f.y) < h.r + 10) {
        if (g.rand() > skill) return; // did not see it
        // the line always has to pass over a hazard near the boat, so lift the fish above it
        const ny = Math.max(8, h.y - h.r - 22);
        if (f.steerT > 0.4 && Math.abs(f.steerY - ny) < 6) return;
        E.tap(g, f.x + 200, ny); // empty spot far away so it counts as a steer
        wait = react;
        return;
      }
    }
    // relay: hook the next fish while this one is nearly spent, so both count
    if (f.stam < E.T.relay - 0.05 && fish.length && g.rand() < skill * 0.2) {
      const nx = fish.filter((e) => e.id !== f.id).sort((p, q) => E.SPECIES[q.sp].size - E.SPECIES[p.sp].size)[0];
      if (nx) { E.tap(g, nx.x, nx.y); wait = react; return; }
    }
    // swap up to a bigger fish while this one is getting tired
    if (f.stam < 0.45) {
      const big = fish.find((e) => E.SPECIES[e.sp].size > E.SPECIES[f.sp].size && e.id !== f.id);
      if (big && g.rand() < skill) { E.tap(g, big.x, big.y); wait = react; }
    }
  };
};
