// All sound is synthesized with Web Audio (no audio files): a lo-fi electric piano + kalimba
// loop that gets darker and more muffled the deeper the hook goes, sea ambience, and SFX.
// Keep unlock / recover / duck: they stop the "sound gone after screen off / after an ad" bug.
(function (root) {
  'use strict';
  const JI = (root.JI = root.JI || {});
  const isNative = () => !!(root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform());
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const A = {
    ac: null, master: null, sfx: null, music: null, amb: null, verb: null, mFilter: null, ambLo: null,
    soundOn: true, musicOn: true, ducked: false, depth: 0,

    unlock() {
      if (!this.ac) this.build();
      if (!this.ac) return;
      if (this.ac.state === 'suspended' || this.ac.state === 'interrupted') this.ac.resume().catch(() => {});
      Music.start();
    },
    build() {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      const ac = (this.ac = new AC());
      this.master = ac.createDynamicsCompressor();
      this.master.threshold.value = -14; this.master.ratio.value = 3;
      this.master.connect(ac.destination);
      // shared reverb
      this.verb = ac.createConvolver();
      this.verb.buffer = this.impulse(2.4);
      const verbOut = ac.createGain(); verbOut.gain.value = 0.32;
      this.verb.connect(verbOut).connect(this.master);
      this.sfx = ac.createGain();
      this.sfx.connect(this.master);
      // music goes through a low-pass that closes as you go deeper
      this.mFilter = ac.createBiquadFilter();
      this.mFilter.type = 'lowpass'; this.mFilter.frequency.value = 9000; this.mFilter.Q.value = 0.4;
      this.music = ac.createGain();
      this.music.connect(this.mFilter).connect(this.master);
      this.amb = ac.createGain();
      this.amb.connect(this.master);
      this.buildAmbience();
      this.apply();
      Music.resync();
    },
    // Coming back from the background or a full-screen ad. Android WebView can leave the old
    // context "running" but silent, so in the app we start a fresh one.
    recover() {
      if (!this.ac) return;
      if (isNative()) {
        const old = this.ac;
        this.ac = null;
        old.close().catch(() => {});
        this.build();
      }
      this.unlock();
    },
    configure({ sound, music }) { this.soundOn = sound; this.musicOn = music; this.apply(); },
    duck(on) { this.ducked = on; this.apply(); },
    apply() {
      if (!this.ac) return;
      const t = this.ac.currentTime;
      const s = this.soundOn && !this.ducked;
      this.sfx.gain.setTargetAtTime(s ? 0.7 : 0, t, 0.03);
      this.amb.gain.setTargetAtTime(s ? 0.55 : 0, t, 0.3);
      this.music.gain.setTargetAtTime(this.musicOn && !this.ducked ? 0.42 : 0, t, 0.2);
    },
    // 0 at the surface, 1 in the deepest zone: muffles the music and swaps waves for rumble
    setDepth(d01) {
      if (!this.ac) return;
      this.depth = d01;
      const t = this.ac.currentTime;
      this.mFilter.frequency.setTargetAtTime(9000 * Math.pow(700 / 9000, Math.min(1, d01 * 1.15)), t, 0.4);
      if (this.waveG) this.waveG.gain.setTargetAtTime(Math.max(0, 0.5 - d01 * 6), t, 0.3);
      if (this.deepG) this.deepG.gain.setTargetAtTime(Math.min(0.5, d01 * 6) * (0.6 + d01 * 0.6), t, 0.3);
    },

    impulse(sec) {
      const ac = this.ac, len = Math.floor(ac.sampleRate * sec);
      const b = ac.createBuffer(2, len, ac.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      return b;
    },
    noiseBuf(sec, brown) {
      const ac = this.ac, len = Math.floor(ac.sampleRate * sec);
      const b = ac.createBuffer(1, len, ac.sampleRate);
      const d = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
      return b;
    },
    buildAmbience() {
      const ac = this.ac;
      // surface: slow swells of filtered noise
      const wave = ac.createBufferSource(); wave.buffer = this.noiseBuf(4); wave.loop = true;
      const wf = ac.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 700;
      const swell = ac.createGain(); swell.gain.value = 0.25;
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.11;
      const lfoG = ac.createGain(); lfoG.gain.value = 0.22;
      lfo.connect(lfoG).connect(swell.gain);
      this.waveG = ac.createGain(); this.waveG.gain.value = 0.5;
      wave.connect(wf).connect(swell).connect(this.waveG).connect(this.amb);
      // underwater: brown rumble
      const deep = ac.createBufferSource(); deep.buffer = this.noiseBuf(5, true); deep.loop = true;
      const df = ac.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 260;
      this.deepG = ac.createGain(); this.deepG.gain.value = 0;
      deep.connect(df).connect(this.deepG).connect(this.amb);
      wave.start(); deep.start(); lfo.start();
    },

    // ---------- voices ----------
    env(g, t, a, peak, d) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    },
    osc(type, f, t, dur, vol, out, { slide = 1, a = 0.004, verb = 0 } = {}) {
      if (!this.ac) return;
      const ac = this.ac;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
      this.env(g, t, a, vol, dur);
      o.connect(g).connect(out);
      if (verb) { const s = ac.createGain(); s.gain.value = verb; g.connect(s).connect(this.verb); }
      o.start(t); o.stop(t + a + dur + 0.05);
    },
    noise(t, dur, vol, out, { type = 'bandpass', f = 1200, f2 = 0, q = 1, verb = 0 } = {}) {
      if (!this.ac) return;
      const ac = this.ac;
      const src = ac.createBufferSource();
      src.buffer = this._nb || (this._nb = this.noiseBuf(1.5));
      const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
      if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
      const g = ac.createGain();
      this.env(g, t, 0.01, vol, dur);
      src.connect(fl).connect(g).connect(out);
      if (verb) { const s = ac.createGain(); s.gain.value = verb; g.connect(s).connect(this.verb); }
      src.start(t, Math.random()); src.stop(t + dur + 0.05);
    },
    // kalimba-like tine: fundamental + a quick inharmonic overtone
    tine(f, t, vol, out, verb = 0.35) {
      this.osc('sine', f, t, 1.1, vol, out, { a: 0.002, verb });
      this.osc('sine', f * 5.4, t, 0.08, vol * 0.25, out, { a: 0.001 });
      this.osc('triangle', f * 2, t, 0.25, vol * 0.12, out, { a: 0.002 });
    },

    // ---------- SFX ----------
    now() { return this.ac ? this.ac.currentTime + 0.005 : 0; },
    ok() { return this.ac && this.soundOn && !this.ducked; },
    click() { if (!this.ok()) return; const t = this.now(); this.osc('triangle', 1400, t, 0.03, 0.08, this.sfx); this.noise(t, 0.02, 0.05, this.sfx, { f: 3000 }); },
    cast() {
      if (!this.ok()) return;
      const t = this.now();
      this.noise(t, 0.35, 0.18, this.sfx, { f: 500, f2: 2600, q: 0.8 });
      this.splash(t + 0.42, 0.9);
    },
    splash(t, k = 1) {
      t = t || this.now();
      this.noise(t, 0.4, 0.28 * k, this.sfx, { type: 'lowpass', f: 2200, f2: 300, verb: 0.2 });
      this.osc('sine', 340, t, 0.22, 0.12 * k, this.sfx, { slide: 0.3 });
      for (let i = 0; i < 4; i++) this.bubble(t + 0.08 + i * 0.06 + Math.random() * 0.05, 0.5);
    },
    bubble(t, k = 1) {
      if (!this.ac) return;
      t = t || this.now();
      const f = 500 + Math.random() * 700;
      this.osc('sine', f, t, 0.07, 0.06 * k, this.sfx, { slide: 2.2, a: 0.002 });
    },
    // every catch in a cast is the next note of a pentatonic run, so a good haul sounds like a melody
    catchNote(n, mut) {
      if (!this.ok()) return;
      const t = this.now();
      const scale = [0, 2, 4, 7, 9];
      const k = Math.max(0, n - 1) % 15;
      const m = 72 + Math.floor(k / 5) * 12 + scale[k % 5];
      this.tine(mtof(m), t, 0.22, this.sfx);
      this.bubble(t + 0.03, 0.8);
      if (mut >= 1) [0, 4, 7, 12].forEach((s, i) => this.tine(mtof(m + 12 + s), t + 0.07 + i * 0.06, 0.09, this.sfx, 0.5));
      if (mut === 0) this.osc('sine', mtof(m - 12), t, 0.4, 0.12, this.sfx);
    },
    hit() {
      if (!this.ok()) return;
      const t = this.now();
      this.osc('triangle', 210, t, 0.22, 0.25, this.sfx, { slide: 0.5 });
      this.noise(t, 0.12, 0.12, this.sfx, { type: 'lowpass', f: 900 });
      for (let i = 0; i < 5; i++) this.bubble(t + 0.05 + i * 0.04, 0.7);
    },
    guard() { if (!this.ok()) return; const t = this.now(); this.osc('sine', 1568, t, 0.35, 0.1, this.sfx, { verb: 0.4 }); this.osc('sine', 2349, t + 0.03, 0.3, 0.06, this.sfx); },
    bottom() { if (!this.ok()) return; const t = this.now(); this.osc('sine', 98, t, 0.5, 0.25, this.sfx, { slide: 0.8 }); this.noise(t, 0.2, 0.08, this.sfx, { type: 'lowpass', f: 400 }); },
    slow() { if (!this.ok()) return; const t = this.now(); this.noise(t, 0.5, 0.1, this.sfx, { f: 1800, f2: 300, q: 2 }); },
    full() { if (!this.ok()) return; const t = this.now(); [79, 84, 88].forEach((m, i) => this.tine(mtof(m), t + i * 0.07, 0.12, this.sfx)); },
    surface() { if (!this.ok()) return; this.splash(this.now(), 1.1); },
    coin(i) {
      if (!this.ok()) return;
      const t = this.now();
      const f = 1760 * Math.pow(2, Math.min(i, 12) / 24);
      this.osc('square', f, t, 0.05, 0.035, this.sfx);
      this.osc('sine', f * 1.5, t + 0.04, 0.12, 0.05, this.sfx);
    },
    take(big) {
      if (!this.ok()) return;
      const t = this.now();
      [0, 4, 7, 12].forEach((s, i) => { this.osc('square', mtof(84 + s), t + i * 0.05, 0.06, 0.035, this.sfx); this.tine(mtof(72 + s), t + i * 0.05, 0.1, this.sfx); });
      if (big) [16, 19, 24].forEach((s, i) => this.tine(mtof(72 + s), t + 0.25 + i * 0.07, 0.12, this.sfx, 0.6));
    },
    buy(maxed) {
      if (!this.ok()) return;
      const t = this.now();
      this.osc('sine', 150, t, 0.12, 0.3, this.sfx, { slide: 0.5 });
      this.noise(t, 0.04, 0.12, this.sfx, { f: 2500 });
      this.tine(mtof(76), t + 0.04, 0.16, this.sfx);
      this.tine(mtof(83), t + 0.1, 0.14, this.sfx);
      if (maxed) [88, 91, 96].forEach((m, i) => this.tine(mtof(m), t + 0.2 + i * 0.07, 0.1, this.sfx, 0.6));
    },
    deny() { if (!this.ok()) return; const t = this.now(); this.osc('triangle', 180, t, 0.12, 0.15, this.sfx); this.osc('triangle', 150, t + 0.09, 0.14, 0.15, this.sfx); },
    discover() {
      if (!this.ok()) return;
      const t = this.now();
      [0, 7, 12, 16, 19].forEach((s, i) => this.tine(mtof(67 + s), t + i * 0.08, 0.14, this.sfx, 0.6));
    },
    zone() {
      if (!this.ok()) return;
      const t = this.now();
      this.osc('sine', mtof(43), t, 2.2, 0.18, this.sfx, { a: 0.4, verb: 0.5 });
      [55, 62, 67, 71].forEach((m, i) => this.osc('triangle', mtof(m), t + 0.2 + i * 0.18, 1.4, 0.05, this.sfx, { a: 0.05, verb: 0.7 }));
    },
    season() {
      if (!this.ok()) return;
      const t = this.now();
      for (let i = 0; i < 12; i++) this.tine(mtof(60 + [0, 4, 7, 11, 14][i % 5] + Math.floor(i / 5) * 12), t + i * 0.07, 0.1, this.sfx, 0.8);
      this.osc('sine', mtof(36), t, 3, 0.2, this.sfx, { a: 0.6, verb: 0.6 });
    },
    gull() {
      if (!this.ok() || this.depth > 0.001) return;
      const t = this.now();
      for (let i = 0; i < 2; i++) this.osc('sawtooth', 1700, t + i * 0.22, 0.16, 0.012, this.amb, { slide: 0.62, a: 0.02 });
    },
  };

  // Generative lo-fi loop: Rhodes-ish chords, soft bass, kalimba, brushed hats.
  // Bright progression near the surface, a darker one once the hook is deep.
  const PROG = {
    sun: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],   // Fmaj7 Em7 Dm7 Cmaj7
    deep: [[45, 48, 52, 55, 59], [41, 45, 48, 52, 55], [38, 41, 45, 48, 52], [40, 45, 47, 50]], // Am9 Fmaj9 Dm9 Esus
  };
  const Music = {
    playing: false, timer: 0, nextT: 0, step: 0, bpm: 74, mood: 'sun', activity: 0,
    start() {
      if (this.playing || !A.ac) return;
      this.playing = true;
      this.resync();
      this.timer = setInterval(() => this.schedule(), 90);
    },
    stop() { this.playing = false; clearInterval(this.timer); },
    resync() { if (A.ac) this.nextT = A.ac.currentTime + 0.12; },
    epiano(notes, t, dur, vol) {
      for (const m of notes) {
        const f = mtof(m);
        A.osc('sine', f, t, dur, vol, A.music, { a: 0.012, verb: 0.25 });
        A.osc('triangle', f * 2, t, dur * 0.35, vol * 0.12, A.music, { a: 0.006 });
      }
    },
    schedule() {
      const ac = A.ac;
      if (!ac || !A.musicOn) { if (ac) this.nextT = ac.currentTime + 0.1; return; }
      const eighth = 60 / this.bpm / 2;
      if (this.nextT < ac.currentTime - 0.5 || this.nextT > ac.currentTime + 2) this.nextT = ac.currentTime + 0.05;
      while (this.nextT < ac.currentTime + 0.35) {
        const t = this.nextT;
        const prog = PROG[this.mood];
        const bar = Math.floor(this.step / 8) % 4;
        const e = this.step % 8;
        const chord = prog[bar];
        const deep = this.mood === 'deep';
        // swing the off-beats a little
        const sw = e % 2 ? eighth * 0.12 : 0;
        if (e === 0) this.epiano(chord, t, eighth * 7, deep ? 0.05 : 0.06);
        if (e === 5 && !deep && Math.random() < 0.5) this.epiano(chord.slice(1), t + sw, eighth * 2.5, 0.035);
        if (e === 0 || (e === 4 && !deep)) A.osc('sine', mtof(chord[0] - 12), t, eighth * 3.2, 0.16, A.music, { a: 0.02 });
        if (!deep) {
          if (e === 0 || e === 4) A.osc('sine', 110, t, 0.22, 0.12 + this.activity * 0.06, A.music, { slide: 0.4 });
          if (e % 2) A.noise(t + sw, 0.04, 0.02 + this.activity * 0.015, A.music, { type: 'highpass', f: 7000 });
          if (e === 4) A.noise(t, 0.12, 0.025, A.music, { type: 'bandpass', f: 1800, q: 0.6 });
        }
        const p = deep ? 0.18 : 0.3 + this.activity * 0.15;
        if (Math.random() < (e % 2 ? p * 0.5 : p)) {
          const pool = chord.concat(chord.map((m) => m + 12));
          const m = pool[Math.floor(Math.random() * pool.length)] + 12;
          A.tine(mtof(m), t + sw, deep ? 0.045 : 0.06, A.music, 0.5);
        }
        this.nextT += eighth;
        this.step++;
      }
    },
  };

  JI.Audio = A;
  JI.Music = Music;
  document.addEventListener('pointerdown', () => A.unlock(), { capture: true, passive: true });
  document.addEventListener('keydown', () => A.unlock(), { capture: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { A.recover(); Music.resync(); } });
})(this);
