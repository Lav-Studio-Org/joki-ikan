// Builds one self-contained HTML file (CSS and JS inlined) for sharing a playable preview.
// Usage: node scripts/bundle.js out.html [--fragment]   (--fragment drops doctype/html/head/body tags)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = process.argv[2] || 'joki-ikan.html';
const frag = process.argv.includes('--fragment');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => '<style>\n' + fs.readFileSync(path.join(root, 'style.css'), 'utf8') + '\n</style>');
html = html.replace(/<script src="(js\/[a-z]+\.js)"><\/script>/g, (m, f) => '<script>\n' + fs.readFileSync(path.join(root, f), 'utf8').replace(/<\/script/g, '<\\/script') + '\n</script>');
html = html.replace(/\s*<link rel="icon"[^>]*>/, '');
if (frag) {
  html = html.replace(/<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, '').replace(/<\/head>\s*<body>/i, '').replace(/<\/body>\s*<\/html>\s*$/i, '');
  html = html.replace(/\s*<meta charset="utf-8">/, '').replace(/\s*<meta name="viewport"[^>]*>/, '');
  // title first so it is found in the first 8 KB
  const t = html.match(/<title>.*?<\/title>/)[0];
  html = t + '\n' + html.replace(t, '');
}
fs.writeFileSync(out, html);
console.log(out, Math.round(fs.statSync(out).size / 1024) + ' KB');
