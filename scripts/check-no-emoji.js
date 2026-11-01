// Fails when emoji or symbol characters used as icons appear in UI files.
// Rule (docs/02-desain-visual.md): every icon comes from the #i-* SVG sprite.
// Usage: node scripts/check-no-emoji.js [files or dirs...]   (default: index.html style.css js)
const fs = require('fs');
const path = require('path');
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['index.html', 'style.css', 'js'];
// Emoji (pictographic), plus the text symbols that tend to sneak in as icons.
const BAD = /\p{Extended_Pictographic}|[←-⇿⌀-⏿■-◿☀-➿⬀-⯿️]/u;
const files = [];
const walk = (p) => {
  if (!fs.existsSync(p)) return;
  if (fs.statSync(p).isDirectory()) fs.readdirSync(p).forEach((f) => walk(path.join(p, f)));
  else if (/\.(html|css|js|json|webmanifest)$/.test(p)) files.push(p);
};
targets.forEach(walk);
let bad = 0;
for (const f of files) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const m = line.match(BAD);
    if (m) { bad++; console.log(`${f}:${i + 1}: "${m[0]}" (U+${m[0].codePointAt(0).toString(16).toUpperCase()})  ${line.trim().slice(0, 90)}`); }
  });
}
console.log(bad ? `${bad} emoji/symbol icon(s) found: use the SVG sprite instead` : `no emoji in ${files.length} files`);
process.exit(bad ? 1 : 0);
