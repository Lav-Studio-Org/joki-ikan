// Canvas renderer. The world is drawn in art pixels at a whole-number device scale so the
// pixel art stays crisp. The boat sits near the left edge and the sea scrolls past it.
(function (root) {
  'use strict';
  const JI = root.JI;
  const E = JI.Engine;
  const AT = JI.ATLAS;
  const INK = '#14121c';

  // Time of day travels with you: morning at the estuary, night in the strange sea.
  const SKY = [
    { sky: ['#f0c48a', '#f4d19c', '#f7ddb0', '#f9e8c6'], hill: '#d7b48e', isl: '#9bb8a0', sea: ['#4fa3a0', '#3f8f8a', '#2f7479', '#245d68'], bed: '#c9a46a', sun: '#fff1c9', cloud: '#fff6e4' },
    { sky: ['#9fd6e6', '#b5e0ea', '#c9e9ee', '#ddf1f0'], hill: '#9ccbb8', isl: '#6fae8c', sea: ['#3fb0b3', '#2c98a3', '#227d8f', '#1b6478'], bed: '#e2c98e', sun: '#fffbe8', cloud: '#ffffff' },
    { sky: ['#f2a46a', '#f5b97e', '#f7cc96', '#f9dcb0'], hill: '#c98a6a', isl: '#8a8a7a', sea: ['#3a7ea0', '#2c6a8e', '#22567a', '#1a4566'], bed: '#8e7a62', sun: '#ffe2a1', cloud: '#ffe2c4' },
    { sky: ['#5b4a7e', '#7a5a8a', '#a8708a', '#d68f7e'], hill: '#5a4a6e', isl: '#4a3e60', sea: ['#2f4f7a', '#263f68', '#1d3156', '#152444'], bed: '#4a3e52', sun: '#ffb38a', cloud: '#c98fa0' },
    { sky: ['#14162e', '#1b1f3d', '#232955', '#2d3566'], hill: '#232a52', isl: '#2a3260', sea: ['#1d2c4e', '#17233f', '#111a31', '#0b1224'], bed: '#2a2440', sun: '#f4f0d8', cloud: '#3e4780' },
  ];
  const BLEND = 120; // metres over which one look fades into the next

  const R = {
    cv: null, ctx: null, img: null, S: 3, artW: 400, artH: 240, boatX: 70, surfY: 80, t: 0, cache: {},
    shake: 0, pops: [], parts: [], foam: [], camDist: 0,
    get portrait() { return this.cv.height > this.cv.width; },

    init(canvas, img) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.img = img;
      this.resize();
      root.addEventListener('resize', () => this.resize());
    },
    resize() {
      const dpr = Math.min(root.devicePixelRatio || 1, 2);
      const w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);
      this.cv.width = w; this.cv.height = h; this.dpr = dpr;
      // landscape: ~250 art px tall; portrait: ~240 art px wide so you still see fish coming
      this.S = h > w ? Math.max(2, Math.round(w / 230)) : Math.max(2, Math.round(h / 196));
      this.artW = Math.ceil(w / this.S); this.artH = Math.ceil(h / this.S);
      const sea = E.SEA + 14;
      this.surfY = this.portrait ? this.artH - sea - Math.round(this.artH * 0.15) : Math.max(52, this.artH - sea);
      this.boatX = this.portrait ? 40 : Math.min(90, Math.round(this.artW * 0.15));
    },
    get ahead() { return this.artW - this.boatX; },
    get behind() { return this.boatX; },
    toWorld(px, py) { return { x: (px * this.dpr) / this.S - this.boatX, y: (py * this.dpr) / this.S - this.surfY }; },

    // ---------- sprites ----------
    sprite(name, v) {
      const key = name + '|' + (v || '');
      if (this.cache[key]) return this.cache[key];
      const r = AT[name];
      const c = document.createElement('canvas');
      c.width = r[2]; c.height = r[3];
      const x = c.getContext('2d');
      x.drawImage(this.img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
      if (v) recolor(x, r[2], r[3], v);
      return (this.cache[key] = c);
    },
    // small canvas of a sprite at 2x for the DOM
    icon(name) {
      const s = this.sprite(name);
      const c = document.createElement('canvas');
      c.width = s.width * 2; c.height = s.height * 2;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      x.drawImage(s, 0, 0, c.width, c.height);
      return c;
    },
    boatCanvas() {
      const c = document.createElement('canvas'); c.width = 80; c.height = 48;
      const x = c.getContext('2d');
      paintBoat(x, 40, 34, 0);
      x.drawImage(this.sprite('gnome'), 42, 21);
      x.fillStyle = '#5a3a22';
      for (let i = 0; i < 18; i++) x.fillRect(Math.round(50 + Math.cos(-0.73) * i), Math.round(27 + Math.sin(-0.73) * i), 1, 1);
      x.fillStyle = '#3f8f8a';
      for (let i = 6; i < 74; i += 2) x.fillRect(i, 41 + Math.round(Math.sin(i * 0.3)), 2, 3);
      return c;
    },

    look(dist) {
      // pick the two looks around the current distance and blend them
      const Z = E.ZONES;
      let i = E.zoneAt(dist);
      const into = dist - Z[i].at;
      if (i > 0 && into < BLEND) return mix(SKY[i - 1], SKY[i], into / BLEND);
      return SKY[i];
    },

    pop(text, x, y, col, big) { this.pops.push({ text, x, y, col: col || '#f3ead7', t: 0, big: !!big }); },
    burst(x, y, col, n) {
      for (let i = 0; i < n; i++) this.parts.push({ x, y, vx: (Math.random() - 0.5) * 90, vy: -30 - Math.random() * 60, t: 0, col });
    },

    frame(g, dt, state) {
      const c = this.ctx;
      this.t += dt;
      c.setTransform(this.S, 0, 0, this.S, 0, 0);
      c.imageSmoothingEnabled = false;
      const dist = g ? g.dist : this.camDist;
      if (!g) this.camDist += dt * 6; // the menu drifts slowly
      const L = this.look(dist);
      let sx = 0, sy = 0;
      if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 3); sx = Math.round((Math.random() - 0.5) * this.shake * 6); sy = Math.round((Math.random() - 0.5) * this.shake * 4); }
      c.save(); c.translate(sx, sy);
      this.drawSky(c, L, dist);
      this.drawWater(c, L, dist, g);
      if (g) {
        this.drawHazards(c, g);
        this.drawFish(c, g);
        this.drawReach(c, g, state);
        this.drawLine(c, g);
      }
      this.drawBoat(c, g, dist);
      this.drawParts(c, dt, g);
      c.restore();
      this.drawPops(dt);
    },

    // ---------- sky and sea ----------
    drawSky(c, L, dist) {
      const hz = this.surfY, W = this.artW;
      for (let i = 0; i < 4; i++) { c.fillStyle = L.sky[i]; c.fillRect(0, Math.floor(hz * i / 4), W, Math.ceil(hz / 4) + 1); }
      // sun or moon sinks as the day goes on
      const day = Math.min(1, dist / E.ZONES[4].at);
      const sunX = Math.round(W * (0.8 - day * 0.25)), sunY = Math.round(hz * (0.22 + day * 0.45));
      c.fillStyle = L.sun; disc(c, sunX, sunY, 11);
      // clouds, far hills and islands at different parallax
      c.fillStyle = L.cloud;
      for (let i = 0; i < 5; i++) {
        const w = 24 + (i * 13) % 22;
        const x = Math.round(W + 60 - (((dist * 4 * 0.04) + i * 137 + this.t * 2) % (W + 120)));
        const y = Math.round(hz * 0.18) + i * 9 - (i % 2) * 5;
        c.fillRect(x, y, w, 4); c.fillRect(x + 5, y - 3, w - 12, 3); c.fillRect(x + 9, y - 5, 9, 2);
      }
      const px = dist * 4;
      c.fillStyle = L.hill;
      const off1 = px * 0.06;
      for (let x = 0; x < W; x += 3) {
        const wx = x + off1;
        const h3 = Math.max(0, Math.round(9 + 7 * Math.sin(wx * 0.021) + 5 * Math.sin(wx * 0.057 + 1.3) + 3 * hash(Math.floor(wx / 9))));
        c.fillRect(x, hz - h3, 3, h3);
      }
      c.fillStyle = L.isl;
      const off2 = px * 0.18;
      for (let k = Math.floor(off2 / 140) - 1; k < (off2 + W) / 140 + 1; k++) {
        if (hash(k * 3.1) < 0.45) continue;
        const w = 18 + Math.round(hash(k) * 30), h2 = 3 + Math.round(hash(k + 9) * 6);
        const x = Math.round(k * 140 + hash(k + 2) * 60 - off2);
        for (let s = 0; s < h2; s++) c.fillRect(x + s * 2, hz - s - 1, w - s * 4, 1);
      }
      // night stars in the strange sea
      if (dist > E.ZONES[3].at) {
        c.fillStyle = 'rgba(244,240,216,0.7)';
        for (let i = 0; i < 40; i++) { const x = Math.round(hash(i) * W), y = Math.round(hash(i + 50) * hz * 0.8); if (Math.sin(this.t * 2 + i) > -0.3) c.fillRect(x, y, 1, 1); }
      }
    },
    drawWater(c, L, dist, g) {
      const hz = this.surfY, W = this.artW, H = this.artH, sea = E.SEA;
      const band = Math.ceil(sea / 4);
      for (let i = 0; i < 4; i++) { c.fillStyle = L.sea[i]; c.fillRect(0, hz + i * band, W, band + 1); }
      // sea bed: sand with rocks and kelp scrolling at full speed
      const bedY = hz + sea + 4;
      c.fillStyle = L.bed; c.fillRect(0, bedY, W, H - bedY);
      c.fillStyle = 'rgba(20,18,28,0.25)'; c.fillRect(0, bedY, W, 2);
      const px = dist * 4;
      for (let k = Math.floor(px / 23) - 1; k < (px + W) / 23 + 1; k++) {
        const x = Math.round(k * 23 - px + hash(k) * 12);
        const r = hash(k + 7);
        if (r < 0.35) { // kelp strand
          const h = 10 + Math.round(hash(k + 3) * 22);
          c.fillStyle = '#2f6b3a';
          for (let y = 0; y < h; y++) c.fillRect(x + Math.round(Math.sin(y * 0.35 + this.t * 2 + k) * 1.5), bedY - y, 2, 1);
          c.fillStyle = '#4f9a4a';
          for (let y = 3; y < h; y += 4) c.fillRect(x + 1 + Math.round(Math.sin(y * 0.35 + this.t * 2 + k) * 1.5), bedY - y, 2, 1);
        } else if (r < 0.55) { // rock
          const w = 6 + Math.round(hash(k + 5) * 8);
          c.fillStyle = 'rgba(20,18,28,0.35)'; c.fillRect(x, bedY - 4, w, 4); c.fillRect(x + 2, bedY - 6, w - 4, 2);
        }
      }
      // light shafts, motes and speed streaks
      if (dist < E.ZONES[3].at) {
        c.fillStyle = 'rgba(255,255,255,0.05)';
        for (let i = 0; i < 4; i++) {
          const x0 = Math.round(((i * 97 - px * 0.3) % (W + 80) + W + 80) % (W + 80)) - 40;
          for (let y = 0; y < sea; y += 2) c.fillRect(x0 + Math.round(y * 0.35), hz + y, 12, 2);
        }
      }
      c.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 40; i++) {
        const x = Math.round(((hash(i) * W * 3 - px * (0.5 + hash(i + 1) * 0.5)) % W + W) % W);
        const y = hz + 4 + Math.round(hash(i + 20) * (sea - 8));
        c.fillRect(x, y, 1, 1);
      }
      if (g && g.v >= E.T.rush * 0.85) {
        const k = Math.min(1, (g.v - E.T.rush * 0.85) / 40);
        c.fillStyle = `rgba(255,255,255,${0.12 + k * 0.2})`;
        for (let i = 0; i < 14; i++) {
          const len = 10 + Math.round(hash(i + 3) * 26);
          const x = Math.round(((hash(i + 9) * W * 4 - px * 1.6) % (W + len) + W + len) % (W + len)) - len;
          c.fillRect(x, hz + 6 + Math.round(hash(i + 30) * (sea - 12)), len, 1);
        }
      }
      // surface line
      c.fillStyle = 'rgba(255,255,255,0.35)';
      for (let x = 0; x < W; x += 2) c.fillRect(x, hz + Math.round(Math.sin(x * 0.18 + px * 0.18 + this.t * 2) * 0.8), 2, 1);
    },

    // ---------- things in the water ----------
    X(x) { return Math.round(this.boatX + x); },
    Y(y) { return Math.round(this.surfY + y); },
    drawHazards(c, g) {
      for (const e of g.ents) {
        if (e.type !== 'haz') continue;
        const x = this.X(e.x), y = this.Y(e.y);
        if (e.haz === 'mine') {
          // chain down to the bed
          c.fillStyle = 'rgba(20,18,28,0.6)';
          for (let yy = y + 6; yy < this.surfY + E.SEA + 4; yy += 3) c.fillRect(x, yy, 1, 2);
          c.fillStyle = INK; disc(c, x, y, 6);
          c.fillStyle = '#5d6475'; disc(c, x, y, 5);
          c.fillStyle = '#8a92a6'; c.fillRect(x - 3, y - 3, 2, 2);
          c.fillStyle = INK;
          for (const [dx, dy] of [[0, -7], [0, 6], [-7, 0], [6, 0], [-5, -5], [4, -5], [-5, 4], [4, 4]]) c.fillRect(x + dx, y + dy, 2, 2);
          if (Math.sin(this.t * 6 + e.ph) > 0.4) { c.fillStyle = '#e0473a'; c.fillRect(x, y - 1, 1, 1); }
        } else {
          const name = e.haz === 'jelly' ? 'jellyfish' : 'mo_eeel';
          const img = this.sprite(name);
          const w = img.width, h = img.height;
          if (e.vx < 0) { c.save(); c.translate(x + w / 2, y - h / 2); c.scale(-1, 1); c.drawImage(img, 0, 0); c.restore(); }
          else c.drawImage(img, x - w / 2, y - h / 2);
          if (e.haz === 'zap' && Math.sin(this.t * 14 + e.ph) > 0.5) {
            c.fillStyle = '#7af0ff';
            c.fillRect(x - 9 + Math.round(Math.random() * 18), y - 9 + Math.round(Math.random() * 18), 1, 2);
          }
        }
      }
    },
    drawFish(c, g) {
      for (const e of g.ents) {
        if (e.type !== 'fish') continue;
        const sp = E.SPECIES[e.sp];
        const img = this.sprite(sp.sprite, e.gold ? 'gold' : '');
        let sc = sp.size >= 3 ? 2 : 1;
        if (e.st === 'puff') sc = 2 + Math.round((0.35 - e.puffT) * 6);
        const w = img.width * sc, h = img.height * sc;
        let x = this.X(e.x) - Math.round(w / 2), y = this.Y(e.y) - Math.round(h / 2);
        let face = e.vx < 0 ? -1 : 1;
        if (e.st === 'tow' || e.st === 'flee') face = 1;
        if (e.st === 'reel') face = -1;
        if (e.st === 'land') {
          // arc from where it tired out into the bucket on deck
          const k = e.landT;
          const bx = this.boatX - 19, by = this.surfY - 16;
          const sx0 = this.X(e.lx), sy0 = this.Y(e.ly);
          x = Math.round(sx0 + (bx - sx0) * k) - Math.round(w / 2);
          y = Math.round(sy0 + (by - sy0) * k - Math.sin(k * Math.PI) * 50) - Math.round(h / 2);
          face = -1;
        }
        if (e.st === 'swim' && !E.canHook(g, e)) c.globalAlpha = 0.6;
        if (face < 0) { c.save(); c.translate(x + w, y); c.scale(-1, 1); c.drawImage(img, 0, 0, w, h); c.restore(); }
        else c.drawImage(img, x, y, w, h);
        c.globalAlpha = 1;
        if (e.gold && Math.sin(this.t * 5 + e.ph * 3) > 0.6) { c.fillStyle = '#fff6cc'; c.fillRect(x + Math.round(hash(Math.floor(this.t * 5) + e.ph) * w), y + Math.round(hash(Math.floor(this.t * 5) + e.ph + 1) * h), 1, 1); }
        if (e.st === 'tow') {
          // stamina bar above the fish, with the relay window marked
          const bw = 18, bx = this.X(e.x) - 9, by = y - 5;
          c.fillStyle = INK; c.fillRect(bx - 1, by - 1, bw + 2, 4);
          c.fillStyle = '#4a4558'; c.fillRect(bx, by, bw, 2);
          const k = Math.max(0, e.stam);
          const relay = k < E.T.relay;
          c.fillStyle = relay ? (Math.sin(this.t * 20) > 0 ? '#f5b82e' : '#fff1c9') : '#7ed38f';
          c.fillRect(bx, by, Math.round(bw * k), 2);
          c.fillStyle = '#f5b82e'; c.fillRect(bx + Math.round(bw * E.T.relay), by - 1, 1, 4);
        }
      }
    },
    // dashed arc that shows how far the hook reaches; flashes when you have nothing pulling you
    drawReach(c, g, state) {
      const rx = this.X(E.ROD.x), ry = this.Y(E.ROD.y), R0 = E.T.reach;
      const free = !g.tow;
      c.fillStyle = free ? (g.v < E.T.stall * 2.2 && Math.sin(this.t * 14) > 0 ? 'rgba(224,71,58,0.7)' : 'rgba(255,255,255,0.32)') : 'rgba(255,255,255,0.12)';
      for (let a = -0.15; a < 1.5; a += 0.035) {
        const x = Math.round(rx + Math.cos(a) * R0), y = Math.round(ry + Math.sin(a) * R0);
        if (y > this.surfY + 2 && y < this.surfY + E.SEA) c.fillRect(x, y, 1, 1);
      }
      // ring on fish you can hook while nothing pulls you
      if (free && state === 'play') {
        c.fillStyle = 'rgba(255,255,255,0.75)';
        for (const e of g.ents) {
          if (!E.canHook(g, e) || E.SPECIES[e.sp].kind !== 'fish') continue;
          const r = E.SPECIES[e.sp].size >= 3 ? 14 : 9;
          const x = this.X(e.x), y = this.Y(e.y);
          const k = Math.floor(this.t * 8) % 2;
          c.fillRect(x - r, y - r + k, 2, 1); c.fillRect(x - r, y - r + k, 1, 2);
          c.fillRect(x + r - 1, y - r + k, 2, 1); c.fillRect(x + r, y - r + k, 1, 2);
          c.fillRect(x - r, y + r - k, 2, 1); c.fillRect(x - r, y + r - 1 - k, 1, 2);
          c.fillRect(x + r - 1, y + r - k, 2, 1); c.fillRect(x + r, y + r - 1 - k, 1, 2);
        }
      }
    },
    drawLine(c, g) {
      const rx = this.X(E.ROD.x), ry = this.Y(E.ROD.y);
      c.fillStyle = 'rgba(240,250,245,0.9)';
      if (g.tow) {
        const f = g.tow;
        const sp = E.SPECIES[f.sp];
        const fx = this.X(f.x) - (sp.size >= 3 ? 14 : 7), fy = this.Y(f.y);
        // taut line with a hum when the fish pulls hard
        const sag = 3 + (1 - f.stam) * 8;
        curve(c, rx, ry, fx, fy, sag, Math.sin(this.t * 40) * 0.6);
      }
      if (g.hook) {
        const h = g.hook;
        curve(c, rx, ry, this.X(h.x), this.Y(h.y), 6, 0);
        c.drawImage(this.sprite('hook'), this.X(h.x) - 2, this.Y(h.y) - 3);
      }
      if (!g.tow && !g.hook) {
        // idle hook dangling under the rod tip
        for (let y = ry; y < this.surfY + 6; y++) c.fillRect(rx, y, 1, 1);
        c.drawImage(this.sprite('hook'), rx - 2, this.surfY + 5);
      }
    },

    // ---------- boat ----------
    drawBoat(c, g, dist) {
      const v = g ? g.v : 30;
      const bob = Math.round(Math.sin(this.t * (1.4 + v / 60)) * (v > 90 ? 1.5 : 1));
      const s = this.surfY;
      const cx = this.boatX - 7, by = s - 6 + bob;
      // wake behind the stern
      if (v > 8) {
        const n = Math.min(10, Math.round(v / 14));
        c.fillStyle = 'rgba(255,255,255,0.75)';
        for (let i = 0; i < n; i++) {
          const k = ((this.t * (1 + v / 40) + i / n) % 1);
          const x = Math.round(cx - 26 - k * (30 + v * 0.35));
          const y = s + Math.round(Math.sin(i * 2.1) * 2) + (i % 2);
          c.fillRect(x, y, Math.max(1, Math.round(4 - k * 3)), 1);
        }
        if (v > 60) { c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(cx + 24, s - 2 - (Math.sin(this.t * 20) > 0 ? 1 : 0), 2, 1); c.fillRect(cx + 26, s - 1, 1, 1); }
      }
      paintBoat(c, cx, by, this.t);
      // bucket of fish on deck, fills up with every landing
      c.fillStyle = INK; c.fillRect(cx - 19, by - 9, 13, 8);
      c.fillStyle = '#c99a5b'; c.fillRect(cx - 18, by - 8, 11, 6);
      c.fillStyle = '#9b6d3a'; c.fillRect(cx - 18, by - 5, 11, 1);
      const n = g ? Math.min(6, g.landed) : 0;
      for (let i = 0; i < n; i++) { c.fillStyle = ['#ff6b3d', '#8fd3e8', '#f5b82e'][i % 3]; c.fillRect(cx - 17 + (i % 3) * 3, by - 10 - Math.floor(i / 3), 3, 1); }
      // gnome leans back when the boat is being pulled hard
      const lean = g && g.tow && v > 80 ? -1 : 0;
      c.drawImage(this.sprite('gnome'), cx + 2 + lean, by - 13);
      // rod from the gnome's hands to the tip the engine uses
      const bx0 = cx + 10, by0 = by - 7;
      const tx = this.X(E.ROD.x), ty = this.Y(E.ROD.y) + bob;
      const bend = g && g.tow ? 2 : 0;
      c.fillStyle = '#5a3a22';
      const steps = 18;
      for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        const x = bx0 + (tx - bx0) * k + Math.sin(k * Math.PI) * bend * 0.5;
        const y = by0 + (ty - by0) * k + Math.sin(k * Math.PI) * -bend + k * k * bend;
        c.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
      c.fillStyle = '#3f8f8a';
      for (let x = cx - 28; x < cx + 28; x += 2) c.fillRect(x, s + 1 + Math.round(Math.sin(x * 0.3 + this.t * 2.2)), 2, 3);
    },

    // ---------- particles and text ----------
    drawParts(c, dt, g) {
      for (const p of this.parts) {
        p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt;
        c.fillStyle = p.col; c.fillRect(this.X(p.x), this.Y(p.y), 1, 1);
      }
      this.parts = this.parts.filter((p) => p.t < 0.8);
    },
    drawPops(dt) {
      const c = this.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      const base = Math.round(15 * this.dpr);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const p of this.pops) {
        p.t += dt;
        const k = p.t / (p.big ? 1.4 : 1);
        const x = Math.max(80 * this.dpr, (this.boatX + p.x) * this.S), y = (this.surfY + p.y) * this.S - k * 12 * this.S;
        const fs = Math.round(base * (p.big ? 1.35 : 1));
        c.font = `600 ${fs}px Pixelify, monospace`;
        c.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
        c.lineWidth = Math.max(3, fs / 5); c.strokeStyle = INK; c.lineJoin = 'round';
        c.strokeText(p.text, x, y);
        c.fillStyle = p.col; c.fillText(p.text, x, y);
      }
      c.globalAlpha = 1;
      this.pops = this.pops.filter((p) => p.t < (p.big ? 1.4 : 1));
    },
  };

  // ---------- helpers ----------
  function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function disc(c, cx, cy, r) { for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); c.fillRect(cx - w, cy + y, w * 2, 1); } }
  // a sagging line made of 1px squares
  function curve(c, x0, y0, x1, y1, sag, wob) {
    const n = Math.max(4, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const x = x0 + (x1 - x0) * k;
      const y = y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * (sag + wob);
      c.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  function hexRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function lerpHex(a, b, k) {
    const A = hexRgb(a), B = hexRgb(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
  }
  function mix(a, b, k) {
    const o = {};
    for (const key in a) o[key] = Array.isArray(a[key]) ? a[key].map((c, i) => lerpHex(c, b[key][i], k)) : lerpHex(a[key], b[key], k);
    return o;
  }
  const GOLD = ['#3a2400', '#7a4e00', '#b8800c', '#e9ae22', '#ffd257', '#ffef9e', '#fffbe0'];
  function ramp(stops, l) {
    const k = Math.max(0, Math.min(0.999, l / 255)) * (stops.length - 1);
    const i = Math.floor(k), f = k - i;
    const A = hexRgb(stops[i]), B = hexRgb(stops[Math.min(stops.length - 1, i + 1)]);
    return A.map((v, j) => Math.round(v + (B[j] - v) * f));
  }
  function recolor(x, w, h, v) {
    const im = x.getImageData(0, 0, w, h);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (v === 'gold') { const c = L < 28 ? [58, 36, 0] : ramp(GOLD, Math.min(255, L * 1.15 + 20)); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; }
    }
    x.putImageData(im, 0, 0);
  }
  // The little wooden sampan from Gnome, Line & Sinker.
  function paintBoat(c, cx, by) {
    const Rr = (col, x, y, w, h) => { c.fillStyle = col; c.fillRect(cx + x, by + y, w, h); };
    const w = 48;
    Rr(INK, -w / 2, 0, w, 9); Rr(INK, -w / 2 - 2, -2, w + 4, 3);
    Rr('#8a4f2b', -w / 2 + 1, 0, w - 2, 7); Rr('#b8743f', -w / 2 - 1, -1, w + 2, 2);
    Rr('#ff6b3d', -w / 2 + 1, 3, w - 2, 2); Rr('#6a3a1f', -w / 2 + 3, 7, w - 6, 2);
  }

  JI.Render = R;
})(this);
