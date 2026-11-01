// Game flow: menu, run, pause, result. Input is a single tap (or click) on the sea.
(function (root) {
  'use strict';
  const JI = root.JI;
  const E = JI.Engine, R = JI.Render, A = JI.Audio, M = JI.Music;
  const $ = (id) => document.getElementById(id);
  const KEY = 'jokiikan.profile.v1';

  // ---------- profile ----------
  const P = load();
  function load() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { p = null; }
    return Object.assign({ best: 0, bestDist: 0, bestChain: 0, runs: 0, dex: {}, sound: true, music: true }, p || {});
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* private mode */ } }

  // ---------- state ----------
  let g = null, state = 'menu', last = 0, newFish = [], hintT = 0;
  const fmt = (n) => Math.round(n).toLocaleString('id-ID');
  const ic = (name) => `<svg class="ic"><use href="#i-${name}"/></svg>`;

  function show(id, on) { $(id).classList.toggle('hidden', !on); }
  function layout() { document.body.classList.toggle('port', innerHeight > innerWidth); }

  function menuStats() {
    const dex = Object.keys(P.dex).length;
    $('menuStats').innerHTML =
      stat('Koin terbanyak', fmt(P.best), 'coin') + stat('Terjauh', fmt(P.bestDist) + ' m') +
      stat('Rantai terpanjang', fmt(P.bestChain)) + stat('Jenis ikan', dex + ' / ' + E.countFish());
  }
  function stat(label, val, cls) { return `<div class="stat ${cls || ''}"><span>${label}</span><b>${val}</b></div>`; }

  function toMenu() {
    state = 'menu'; g = null;
    show('menu', true); show('pause', false); show('result', false); show('hud', false); show('trip', false); show('hint', false);
    menuStats();
    M.bpm = 74; M.activity = 0; A.setDepth(0);
  }
  function start() {
    A.unlock(); A.click();
    g = E.newRun({ seed: (Date.now() & 0xffffff) + 1, ahead: R.ahead, behind: R.behind });
    newFish = []; state = 'play'; hintT = 0;
    show('menu', false); show('pause', false); show('result', false); show('hud', true); show('trip', true); show('hint', true);
    banner(E.ZONES[0].name, 'Pagi di muara');
    hud(true);
  }
  function pause(on) {
    if (on && state !== 'play') return;
    if (!on && state !== 'pause') return;
    state = on ? 'pause' : 'play';
    show('pause', on);
  }
  function finish() {
    state = 'over';
    A.bottom();
    const rec = g.coins > P.best;
    P.runs++;
    P.best = Math.max(P.best, g.coins); P.bestDist = Math.max(P.bestDist, Math.round(g.dist)); P.bestChain = Math.max(P.bestChain, g.bestChain);
    save();
    $('rCause').textContent = g.cause === 'stall' ? 'Kapal berhenti di ' + E.ZONES[g.zone].name : 'Perjalanan selesai';
    $('rTitle').textContent = rec ? 'Rekor baru!' : 'Perjalanan selesai';
    $('rStats').innerHTML =
      `<div class="stat coin ${rec ? 'rec' : ''}"><span>Koin</span><b>${fmt(g.coins)}</b></div>` +
      stat('Jarak', fmt(g.dist) + ' m') + stat('Ikan masuk ember', fmt(g.landed)) + stat('Rantai terpanjang', fmt(g.bestChain)) +
      stat('Estafet', fmt(g.relays)) + stat('Tali putus', fmt(g.snaps));
    const box = $('rNew');
    box.innerHTML = '';
    if (newFish.length) {
      for (const id of newFish.slice(0, 8)) {
        const d = document.createElement('div');
        d.appendChild(R.icon(E.SPECIES[id].sprite));
        d.appendChild(document.createTextNode(E.SPECIES[id].name));
        box.appendChild(d);
      }
    }
    show('hint', false);
    setTimeout(() => { if (state === 'over') show('result', true); }, 700);
  }

  // ---------- HUD ----------
  let lastCoins = -1, lastMult = 0;
  function hud(force) {
    if (!g) return;
    if (g.coins !== lastCoins || force) { $('coins').textContent = fmt(g.coins); if (!force) bump('pCoin'); lastCoins = g.coins; }
    if (g.mult !== lastMult || force) {
      $('mult').textContent = 'x' + g.mult;
      $('pChain').className = 'pill pill-chain x' + g.mult;
      if (!force && g.mult > lastMult) bump('pChain');
      lastMult = g.mult;
    }
    const nxt = E.CHAIN[g.mult];
    $('chain').textContent = nxt !== undefined ? g.chain + '/' + nxt : g.chain;
    $('dist').textContent = fmt(g.dist) + ' m';
    $('zoneName').textContent = E.ZONES[g.zone].name;
    const MAX = 180;
    $('speedBar').style.width = Math.min(100, (g.v / MAX) * 100) + '%';
    $('mStall').style.left = (E.T.stall / MAX) * 100 + '%';
    $('mRush').style.left = (E.T.rush / MAX) * 100 + '%';
    const slow = g.v < E.T.stall * 2.2 && !g.tow;
    const rush = g.v >= E.T.rush;
    $('speed').className = 'speed' + (slow ? ' slow' : rush ? ' rush' : '');
    $('speedTxt').textContent = 'Laju ' + Math.round(g.v / E.PXM) + ' m/d';
    $('speedNote').innerHTML = slow ? '<span class="warn">Kapal melambat!</span>' : rush ? '<span class="hot">Ngebut: koin x2</span>' : '';
  }
  function bump(id) { const el = $(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function banner(title, sub) {
    const b = $('banner');
    b.innerHTML = title + (sub ? `<small>${sub}</small>` : '');
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  // ---------- engine events -> sound, text, particles ----------
  const ZSUB = ['Pagi di muara', 'Siang di terumbu', 'Sore di laut lepas', 'Senja tiba', 'Malam yang aneh'];
  let warned = false;
  function events() {
    for (const e of g.events) {
      switch (e.k) {
        case 'throw': A.cast(); break;
        case 'miss': A.deny(); break;
        case 'hook':
          if (A.ok()) A.splash(0, 0.6);
          if (e.relay) { R.pop('Estafet!', e.x, e.y - 14, '#f5b82e', true); A.full(); }
          else if (e.sambar) { R.pop('Sambar!', e.x, e.y - 14, '#f5b82e', true); A.full(); }
          if (e.gold) R.pop('Ikan emas!', e.x, e.y + 14, '#ffd257');
          hintT = 99; show('hint', false);
          break;
        case 'steer': if (A.ok()) A.bubble(0, 1); break;
        case 'land': {
          A.catchNote(e.chain, e.gold ? 1 : 0);
          A.coin(e.chain);
          R.pop('+' + fmt(e.got) + (e.rush ? ' ngebut' : ''), 34, -16, '#f5b82e');
          R.burst(-14, -12, '#f5b82e', 6);
          if (!P.dex[e.id]) { newFish.push(e.id); R.pop('Ikan baru: ' + E.SPECIES[e.id].name, 70, 12, '#8fd3e8', true); A.discover(); }
          P.dex[e.id] = (P.dex[e.id] || 0) + 1;
          break;
        }
        case 'snap': R.shake = 1; break;
        case 'cut':
          A.hit();
          R.pop(e.haz === 'jelly' ? 'Tersengat ubur-ubur!' : e.haz === 'mine' ? 'Ranjau!' : 'Kesetrum!', e.x, e.y - 12, '#ff8a7a', true);
          R.pop('Tali putus', e.x, e.y + 6, '#f3ead7');
          R.burst(e.x, e.y, e.haz === 'mine' ? '#ffb347' : '#7af0ff', 14);
          break;
        case 'puff':
          A.hit(); A.deny(); R.shake = 0.8;
          R.pop('Buntal! Tali putus', e.x, e.y - 16, '#ff8a7a', true);
          break;
        case 'trash': if (A.ok()) A.bubble(0, 1); R.pop('Sampah...', e.x, e.y - 12, '#cdb995'); break;
        case 'junk': A.coin(0); break;
        case 'zone': A.zone(); banner(E.ZONES[e.z].name, ZSUB[e.z]); break;
        case 'over': finish(); break;
      }
    }
    g.events.length = 0;
    // a warning tick when you are about to stall
    if (g.stallT > 0 && !warned) { warned = true; A.slow(); }
    if (g.stallT === 0) warned = false;
  }

  // ---------- loop ----------
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (state === 'play') {
      g.ahead = R.ahead; g.behind = R.behind;
      E.step(g, dt);
      events();
      hud();
      M.activity = Math.min(1, g.v / 150);
      M.bpm = 74 + Math.min(1, g.v / 160) * 22;
      A.setDepth(!g.tow && g.v < 40 ? (40 - g.v) / 40 * 0.55 : 0);
      hintT += dt;
      if (hintT > 1 && hintT < 50 && !g.tow) show('hint', true);
    }
    R.frame(state === 'menu' ? null : g, state === 'pause' ? 0 : dt, state);
    requestAnimationFrame(loop);
  }

  // ---------- input ----------
  function onTap(ev) {
    if (state !== 'play') return;
    ev.preventDefault();
    const w = R.toWorld(ev.clientX, ev.clientY);
    E.tap(g, w.x, w.y);
  }

  // ---------- boot ----------
  function boot() {
    layout();
    addEventListener('resize', layout);
    const img = new Image();
    img.onload = () => {
      R.init($('sea'), img);
      const lc = $('logoBoat').getContext('2d');
      lc.drawImage(R.boatCanvas(), 0, 0);
      toMenu();
      requestAnimationFrame((t) => { last = t; loop(t); });
    };
    img.src = JI.ATLAS_PNG;
    $('sea').addEventListener('pointerdown', onTap);
    $('bStart').onclick = start;
    $('bAgain').onclick = start;
    $('bMenu').onclick = () => { A.click(); toMenu(); };
    $('bPause').onclick = () => { A.click(); pause(true); };
    $('bResume').onclick = () => { A.click(); pause(false); };
    $('bQuit').onclick = () => { A.click(); toMenu(); };
    const sync = () => {
      A.configure({ sound: P.sound, music: P.music });
      $('bSound').classList.toggle('off', !P.sound);
      $('bMusic').classList.toggle('off', !P.music);
    };
    $('bSound').onclick = () => { P.sound = !P.sound; save(); sync(); A.click(); };
    $('bMusic').onclick = () => { P.music = !P.music; save(); sync(); };
    sync();
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'p') pause(state === 'play');
      if ((e.key === ' ' || e.key === 'Enter') && (state === 'menu' || state === 'over')) start();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
    // test hook
    root.__joki = { get g() { return g; }, start, E, R, tapFish() { const f = g.ents.find((e) => E.canHook(g, e) && E.SPECIES[e.sp].kind === 'fish'); if (f) E.tap(g, f.x, f.y); return !!f; } };
  }
  boot();
})(this);
