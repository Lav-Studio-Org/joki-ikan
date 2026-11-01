// Browser smoke test: loads the game, plays with a simple tapper, saves screenshots.
// Usage: node scripts/smoke.js http://localhost:8130/ [outdir]
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8130/';
const out = process.argv[3] || 'shots';
require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const [name, vp] of [['land', { width: 844, height: 390 }], ['port', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
    await page.goto(url);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${name}-menu.png` });
    await page.click('#bStart');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${name}-start.png` });
    // play: hook a fish whenever nothing pulls, relay when tired
    for (let i = 0; i < 70; i++) {
      await page.evaluate(() => {
        const J = window.__joki, g = J.g;
        if (!g || g.over) return;
        if (!g.tow || g.tow.stam < 0.25) J.tapFish();
      });
      await page.waitForTimeout(150);
      if (i === 25) await page.screenshot({ path: `${out}/${name}-play.png` });
    }
    await page.screenshot({ path: `${out}/${name}-play2.png` });
    await page.evaluate(() => { const g = window.__joki.g; if (g) { g.tow = null; g.v = 0; } });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${out}/${name}-result.png` });
    const st = await page.evaluate(() => { const g = window.__joki.g; return { over: g.over, coins: g.coins, dist: Math.round(g.dist), landed: g.landed }; });
    console.log(name, st);
    await page.close();
  }
  await browser.close();
  if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exit(1); }
  console.log('smoke ok');
})();
