// Joki Ikan: pure game logic (no DOM). The boat has no engine: whatever fish you hook pulls it.
// Units are art pixels (4 px = 1 m). x is measured from the boat (rod tip side), y from the
// water surface downwards. Speeds are px/s.
(function (root) {
  'use strict';
  const PXM = 4;
  const SEA = 122;                 // water depth in px
  const ROD = { x: 16, y: -22 };   // rod tip relative to the boat anchor (stern of the gnome)
  const T = {
    reach: 122,      // hook range from the rod tip
    hookSpd: 620,    // thrown hook speed
    stall: 14,       // below this the boat is dead in the water
    stallGrace: 0.9, // seconds you may sit below stall before the run ends
    drag: 0.42, drag0: 8, // free coasting: v -= (drag * v + drag0) * dt
    rush: 125,       // at or above this speed coins count double
    snap: 0.55,      // speed kept after the line snaps
    steerCost: 0.07, // stamina spent each time you steer a towing fish
    sambar: 0.7,     // seconds after a landing in which a new hook is a "sambar"
    relay: 0.3,      // hook a new fish while the old one has less stamina than this: both count
    startV: 62,
  };
  const CHAIN = [0, 3, 6, 10, 15]; // chain needed for x1..x5

  const ZONES = [
    { id: 'muara', name: 'Muara', at: 0 },
    { id: 'terumbu', name: 'Terumbu', at: 450 },
    { id: 'lepas', name: 'Laut Lepas', at: 1100 },
    { id: 'senja', name: 'Laut Senja', at: 2000 },
    { id: 'aneh', name: 'Laut Aneh', at: 3200 },
  ];
  // size 1..4: small fish are quick to land but pull weakly; big ones pull hard and fight long
  const SIZE = {
    1: { spd: 78, acc: 2.2, dur: 2.4, val: 3, d: [8, 50] },
    2: { spd: 104, acc: 1.7, dur: 3.4, val: 8, d: [20, 82] },
    3: { spd: 132, acc: 1.3, dur: 4.6, val: 20, d: [48, 106] },
    4: { spd: 162, acc: 1.0, dur: 6.2, val: 50, d: [76, 114] },
  };
  // [atlas sprite, name, zone, size]
  const FISH = [
    ['anchovy', 'Teri', 0, 1], ['sardine', 'Sarden', 0, 1], ['mo_minnow', 'Wader', 0, 1], ['shrimp', 'Udang', 0, 1],
    ['mo_tilapia', 'Nila', 0, 2], ['catfish', 'Lele', 0, 2], ['bass', 'Kakap Muara', 0, 2], ['mo_croaker', 'Gulamah', 0, 2],
    ['rainbow_trout', 'Trout Pelangi', 0, 3], ['mo_cod', 'Kod', 0, 3], ['mo_salmon', 'Salmon Nyasar', 0, 4],
    ['clownfish', 'Badut', 1, 1], ['mo_guppy', 'Gupi', 1, 1], ['mo_tetra', 'Tetra', 1, 1],
    ['surgeonfish', 'Botana', 1, 2], ['angelfish', 'Angel', 1, 2], ['mo_ytang', 'Tang Kuning', 1, 2], ['striped', 'Belang', 1, 2],
    ['mo_snapper', 'Kakap Merah', 1, 3], ['rainbowfish', 'Pelangi', 1, 3], ['mo_grouper', 'Kerapu', 1, 3], ['mo_turtle', 'Penyu', 1, 4],
    ['mo_saury', 'Julung', 2, 1], ['mo_stickleback', 'Duri', 2, 1], ['mo_flying', 'Ikan Terbang', 2, 2], ['mo_mackerel', 'Kembung', 2, 2],
    ['mo_pomfret', 'Bawal', 2, 2], ['mo_tuna', 'Tuna', 2, 3], ['mo_stingray', 'Pari', 2, 3], ['mo_manta', 'Manta', 2, 4], ['mo_sunfish', 'Mola', 2, 4],
    ['lanternfish', 'Lentera', 3, 1], ['squid', 'Cumi', 3, 1], ['silverfish', 'Perak', 3, 2], ['mo_hairtail', 'Layur', 3, 2],
    ['mo_gpomfret', 'Bawal Emas', 3, 3], ['eel', 'Sidat', 3, 3], ['coelacanth', 'Raja Laut', 3, 4],
    ['mo_prawn', 'Lobster Kecil', 4, 1], ['whitefish', 'Ikan Hantu', 4, 2], ['mo_blob', 'Blob', 4, 2], ['mo_octopus', 'Gurita', 4, 3],
    ['mo_angler', 'Pemancing', 4, 3], ['angler', 'Lampu Dalam', 4, 4], ['koi', 'Koi Laut', 4, 4],
  ];
  const SPECIES = {};
  FISH.forEach(([sprite, name, zone, size]) => {
    const s = SIZE[size];
    SPECIES[sprite] = {
      id: sprite, sprite, name, zone, size, kind: 'fish',
      spd: s.spd + zone * 6, acc: s.acc, dur: s.dur, val: Math.round(s.val * (1 + zone * 0.6)), d: s.d,
    };
  });
  // decoys and hazards that can be hooked
  SPECIES.pufferfish = { id: 'pufferfish', sprite: 'pufferfish', name: 'Buntal', kind: 'puff', size: 1, spd: 0, d: [10, 70] };
  SPECIES.rusty_can = { id: 'rusty_can', sprite: 'rusty_can', name: 'Kaleng', kind: 'trash', size: 1, spd: 0, val: 1, d: [8, 40] };
  SPECIES.mo_bottle = { id: 'mo_bottle', sprite: 'mo_bottle', name: 'Botol', kind: 'trash', size: 1, spd: 0, val: 1, d: [8, 40] };
  const HOOKABLE_JUNK = ['pufferfish', 'rusty_can', 'mo_bottle'];
  // line cutters (never hooked): touch the towing line and it snaps
  const HAZ = {
    jelly: { sprite: 'jellyfish', r: 8, zone: 1 },
    mine: { sprite: null, r: 6, zone: 2 },
    zap: { sprite: 'mo_eeel', r: 7, zone: 3 },
  };

  // ---------- helpers ----------
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoneAt = (m) => { let z = 0; for (let i = 0; i < ZONES.length; i++) if (m >= ZONES[i].at) z = i; return z; };
  const multFor = (chain) => { let m = 1; for (let i = 0; i < CHAIN.length; i++) if (chain >= CHAIN[i]) m = i + 1; return m; };
  // distance from point to segment
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L = dx * dx + dy * dy || 1;
    const k = clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1);
    const qx = ax + dx * k - px, qy = ay + dy * k - py;
    return Math.sqrt(qx * qx + qy * qy);
  }

  // ---------- run ----------
  function newRun(opts = {}) {
    const g = {
      seed: opts.seed || 1, rand: rng(opts.seed || 1),
      ahead: opts.ahead || 320, behind: opts.behind || 70,
      t: 0, v: T.startV, dist: 0, zone: 0, coins: 0, chain: 0, bestChain: 0, mult: 1,
      ents: [], id: 0, spawnD: 0, spawnT: 0,
      hook: null, tow: null, lastLand: -9, stallT: 0, over: false, cause: '',
      landed: 0, caught: {}, events: [], rushT: 0, maxV: T.startV, snaps: 0, sambars: 0, relays: 0,
    };
    // a few fish already in view so the first tap has a target
    for (let i = 0; i < 6; i++) spawn(g, 60 + i * 45, 0);
    return g;
  }

  function pickSpecies(g) {
    const r = g.rand;
    const z = g.zone;
    const junk = r();
    if (junk < 0.05 + z * 0.012) return 'pufferfish';
    if (junk < 0.08 + z * 0.012) return r() < 0.5 ? 'rusty_can' : 'mo_bottle';
    // mostly the current zone, sometimes a straggler from the one before
    const zz = z > 0 && r() < 0.25 ? z - 1 : z;
    const pool = FISH.filter((f) => f[2] === zz);
    // smaller fish are more common
    const w = pool.map((f) => [0, 5, 3.2, 1.6, 0.7][f[3]]);
    let k = r() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { k -= w[i]; if (k <= 0) return pool[i][0]; }
    return pool[0][0];
  }

  function spawn(g, x, kind) {
    const r = g.rand;
    if (kind === 'haz') {
      const opts = Object.keys(HAZ).filter((k) => HAZ[k].zone <= g.zone);
      if (!opts.length) return;
      const k = opts[Math.floor(r() * opts.length)];
      const e = { id: ++g.id, type: 'haz', haz: k, x, y: 18 + r() * (SEA - 30), vx: k === 'zap' ? -18 - r() * 12 : 0, ph: r() * 6.28, r: HAZ[k].r };
      if (k === 'mine') e.y = 26 + r() * (SEA - 40);
      e.baseY = e.y;
      g.ents.push(e);
      return;
    }
    const sp = SPECIES[pickSpecies(g)];
    const y = sp.d[0] + r() * (sp.d[1] - sp.d[0]);
    g.ents.push({
      id: ++g.id, type: 'fish', sp: sp.id, x, y, baseY: y,
      vx: sp.kind === 'fish' ? (r() < 0.5 ? -1 : 1) * (8 + r() * 22) : 0,
      ph: r() * 6.28, gold: sp.kind === 'fish' && r() < 0.035, st: 'swim', stam: 1,
    });
  }

  function rodDist(e) { return Math.hypot(e.x - ROD.x, e.y - ROD.y); }
  function canHook(g, e) {
    return e.type === 'fish' && e.st === 'swim' && e.x > ROD.x - 6 && rodDist(e) <= T.reach;
  }

  // The fish nearest to (x, y) within `slop` px that can be hooked, or null.
  function fishAt(g, x, y, slop = 16) {
    let best = null, bd = slop;
    for (const e of g.ents) {
      if (!canHook(g, e)) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // Player tap at world point (x, y). Hooks a fish, or steers the towing fish, or throws empty.
  function tap(g, x, y) {
    if (g.over) return 'over';
    if (g.hook) return 'busy';
    const f = fishAt(g, x, y);
    if (f) {
      g.hook = { x: ROD.x, y: ROD.y, target: f.id, tx: f.x, ty: f.y, back: false };
      g.events.push({ k: 'throw' });
      return 'throw';
    }
    if (g.tow && y > 4) {
      g.tow.steerY = clamp(y, 8, SEA - 8); g.tow.steerT = 1.6;
      g.tow.stam = Math.max(0, g.tow.stam - T.steerCost);
      g.events.push({ k: 'steer', y: g.tow.steerY });
      return 'steer';
    }
    // empty throw: the hook flies to the point (clamped to reach) and comes back
    const dx = x - ROD.x, dy = Math.max(2, y) - ROD.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, T.reach / d);
    g.hook = { x: ROD.x, y: ROD.y, target: 0, tx: ROD.x + dx * k, ty: ROD.y + dy * k, back: false };
    g.events.push({ k: 'throw' });
    return 'miss';
  }

  function release(g, why) {
    const f = g.tow;
    if (!f) return;
    g.tow = null;
    f.st = 'flee';
    f.vx = 60 + Math.abs(f.vx);
    if (why === 'snap') {
      g.chain = 0; g.mult = 1; g.snaps++;
      g.v *= T.snap;
      g.events.push({ k: 'snap', x: f.x, y: f.y });
    }
  }

  function hookFish(g, f) {
    const sp = SPECIES[f.sp];
    let relay = false;
    if (g.tow) {
      // a tired fish is reeled in while the next one takes over: an "estafet"
      if (g.tow.stam < T.relay && sp.kind === 'fish') { relay = true; land(g, g.tow, true); }
      else release(g, 'swap');
    }
    if (sp.kind === 'puff') {
      f.st = 'puff'; f.puffT = 0.35;
      g.chain = 0; g.mult = 1; g.snaps++;
      g.events.push({ k: 'puff', x: f.x, y: f.y });
      return;
    }
    if (sp.kind === 'trash') {
      f.st = 'reel'; f.reelT = 0;
      g.events.push({ k: 'trash', x: f.x, y: f.y });
      return;
    }
    f.st = 'tow'; f.stam = 1; f.steerY = f.y; f.wob = g.rand() * 6.28;
    g.tow = f;
    const sambar = relay || g.t - g.lastLand <= T.sambar;
    if (sambar) { g.chain++; g.sambars++; g.mult = multFor(g.chain); g.bestChain = Math.max(g.bestChain, g.chain); }
    if (relay) g.relays++;
    g.events.push({ k: 'hook', x: f.x, y: f.y, sambar, relay, id: f.sp, gold: f.gold });
  }

  function land(g, f, relay) {
    const sp = SPECIES[f.sp];
    g.tow = null;
    f.st = 'land'; f.landT = 0; f.lx = f.x; f.ly = f.y;
    g.chain++; g.bestChain = Math.max(g.bestChain, g.chain);
    g.mult = multFor(g.chain);
    const rush = g.v >= T.rush ? 2 : 1;
    const got = sp.val * (f.gold ? 5 : 1) * g.mult * rush;
    g.coins += got; g.landed++;
    g.caught[f.sp] = (g.caught[f.sp] || 0) + 1;
    g.lastLand = g.t;
    g.events.push({ k: 'land', relay: !!relay, id: f.sp, got, gold: f.gold, chain: g.chain, mult: g.mult, rush: rush > 1, x: f.x, y: f.y });
  }

  function step(g, dt) {
    if (g.over) return;
    g.t += dt;
    const r = g.rand;
    // ---- boat speed
    const f = g.tow;
    if (f) {
      const sp = SPECIES[f.sp];
      const target = sp.spd * (0.45 + 0.55 * f.stam) * (f.gold ? 1.12 : 1);
      g.v += (target - g.v) * Math.min(1, sp.acc * dt);
      f.stam -= dt / sp.dur;
    } else {
      // water gets heavier further out
      g.v -= (T.drag * (1 + g.zone * 0.08) * g.v + T.drag0) * dt;
    }
    g.v = Math.max(0, g.v);
    g.maxV = Math.max(g.maxV, g.v);
    if (g.v >= T.rush) g.rushT += dt;
    g.dist += (g.v * dt) / PXM;
    const z = zoneAt(g.dist);
    if (z !== g.zone) { g.zone = z; g.events.push({ k: 'zone', z }); }

    // ---- stall
    if (g.v < T.stall && !g.tow && !(g.hook && g.hook.target)) {
      g.stallT += dt;
      if (g.stallT >= T.stallGrace) { g.over = true; g.cause = 'stall'; g.events.push({ k: 'over' }); return; }
    } else g.stallT = 0;

    // ---- spawning: by distance travelled, with a slow trickle when nearly stopped
    g.spawnD += g.v * dt; g.spawnT += dt;
    const gap = 40 + g.zone * 4; // the sea thins out further from shore
    while (g.spawnD >= gap || g.spawnT >= 1.0) {
      g.spawnD = Math.max(0, g.spawnD - gap); g.spawnT = 0;
      const hazP = [0.02, 0.06, 0.09, 0.11, 0.13][g.zone];
      spawn(g, g.ahead + 16, r() < hazP ? 'haz' : 'fish');
    }

    // ---- entities
    for (const e of g.ents) {
      e.ph += dt * 2;
      if (e.type === 'haz') {
        e.x += (e.vx - g.v) * dt;
        if (e.haz === 'jelly') e.y = e.baseY + Math.sin(e.ph * 0.7) * 10;
        if (e.haz === 'zap') e.y = e.baseY + Math.sin(e.ph * 1.3) * 6;
        continue;
      }
      switch (e.st) {
        case 'swim':
          e.x += (e.vx - g.v) * dt;
          e.y = clamp(e.baseY + Math.sin(e.ph) * 3, 6, SEA - 6);
          break;
        case 'tow': {
          const sp = SPECIES[e.sp];
          const tx = 70 + sp.size * 16;
          e.wob += dt * (0.9 + sp.size * 0.15);
          // drift towards where you steered it, then wander
          // a steered fish holds its depth for a moment, then starts to wander again
          e.steerT = Math.max(0, (e.steerT || 0) - dt);
          const calm = e.steerT > 0 ? 0.15 : 1;
          const ty = clamp(e.steerY + Math.sin(e.wob) * (10 + sp.size * 5) * calm, 8, SEA - 8);
          e.x += (tx - e.x) * Math.min(1, 1.6 * dt);
          e.y += (ty - e.y) * Math.min(1, (e.steerT > 0 ? 4.5 : 2.2) * dt);
          if (e.stam <= 0) land(g, e);
          break;
        }
        case 'flee':
          e.x += (e.vx - g.v) * dt; e.y += 20 * dt;
          break;
        case 'puff':
          e.x += -g.v * dt * 0.3;
          e.puffT -= dt;
          if (e.puffT <= 0) { e.st = 'gone'; g.v *= 0.85; }
          break;
        case 'reel':
          e.reelT += dt * 2.5;
          e.x += (ROD.x - e.x) * Math.min(1, 6 * dt); e.y += (ROD.y - e.y) * Math.min(1, 6 * dt);
          if (e.reelT >= 1) { e.st = 'gone'; g.coins += 1; g.events.push({ k: 'junk', id: e.sp }); }
          break;
        case 'land':
          e.landT += dt * 1.8;
          if (e.landT >= 1) e.st = 'gone';
          break;
      }
    }
    // ---- line hazards: the towing line from rod tip to fish
    if (g.tow) {
      for (const e of g.ents) {
        if (e.type !== 'haz') continue;
        if (segDist(e.x, e.y, ROD.x, ROD.y, g.tow.x, g.tow.y) < e.r) {
          g.events.push({ k: 'cut', haz: e.haz, x: e.x, y: e.y });
          if (e.haz === 'mine') { e.dead = true; g.v *= 0.8; }
          release(g, 'snap');
          break;
        }
      }
    }
    // ---- hook flight
    const h = g.hook;
    if (h) {
      let tx = h.tx, ty = h.ty;
      const tgt = h.target && !h.back ? g.ents.find((e) => e.id === h.target) : null;
      if (tgt) { tx = tgt.x; ty = tgt.y; }
      if (h.back) { tx = ROD.x; ty = ROD.y; }
      const dx = tx - h.x, dy = ty - h.y, d = Math.hypot(dx, dy);
      const s = T.hookSpd * dt * (h.back ? 1.3 : 1);
      if (d <= s) {
        h.x = tx; h.y = ty;
        if (h.back) g.hook = null;
        else if (tgt && tgt.st === 'swim' && rodDist(tgt) <= T.reach + 20) { hookFish(g, tgt); g.hook = null; }
        else { h.back = true; h.target = 0; g.events.push({ k: 'miss' }); }
      } else { h.x += (dx / d) * s; h.y += (dy / d) * s; }
    }
    // ---- cleanup
    g.ents = g.ents.filter((e) => !e.dead && e.st !== 'gone' && e.x > -g.behind - 30 && e.x < g.ahead + 60 && e.y < SEA + 40);
  }

  const Engine = {
    PXM, SEA, ROD, T, CHAIN, ZONES, SPECIES, FISH, HAZ, HOOKABLE_JUNK,
    newRun, step, tap, fishAt, canHook, zoneAt, multFor, segDist, rng,
    countFish: () => FISH.length,
  };
  if (typeof module !== 'undefined') module.exports = Engine;
  else { root.JI = root.JI || {}; root.JI.Engine = Engine; }
})(this);
