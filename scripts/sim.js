// Plays many simulated runs and prints pacing numbers.
// Usage: node scripts/sim.js [runs=300] [skill=0.6]
const E = require('../js/engine.js');
const bot = require('./bot.js');
const N = +process.argv[2] || 300, skill = process.argv[3] !== undefined ? +process.argv[3] : 0.6;
const dt = 1 / 60;
const res = [];
for (let s = 1; s <= N; s++) {
  const g = E.newRun({ seed: s * 7919 });
  const act = bot(E, g, { skill });
  while (!g.over && g.t < 900) { act(dt); E.step(g, dt); g.events.length = 0; }
  res.push(g);
}
const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.floor((a.length - 1) * p)]; };
const col = (k) => res.map((g) => (typeof k === 'function' ? k(g) : g[k]));
const row = (name, a) => console.log(name.padEnd(12), 'p10', String(Math.round(q(a, 0.1))).padStart(6), ' p50', String(Math.round(q(a, 0.5))).padStart(6), ' p90', String(Math.round(q(a, 0.9))).padStart(6));
console.log(`runs ${N}, skill ${skill}`);
row('time s', col('t'));
row('distance m', col('dist'));
row('coins', col('coins'));
row('landed', col('landed'));
row('best chain', col('bestChain'));
row('snaps', col('snaps'));
row('relays', col('relays'));
row('max speed', col('maxV'));
row('zone', col('zone'));
console.log('causes', res.reduce((o, g) => ((o[g.cause || 'time'] = (o[g.cause || 'time'] || 0) + 1), o), {}));
