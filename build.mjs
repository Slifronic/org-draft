// Builds the site Vercel serves into dist/: the same files, with the inline
// <script> and <style> blocks of the HTML pages minified. index.html is about
// three-quarters commented JavaScript; phones were downloading and parsing all
// of it on every visit. The source files stay as they are -- edit those, never
// dist/. Run `node build.mjs` to check a build locally.
import fs from 'node:fs';
import path from 'node:path';
import { transform } from 'esbuild';

const root = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(root, 'dist');

// What the site is made of. Everything else in the repo (apps-script, docs,
// tools, slides) was never served and still is not.
const PAGES = ['index.html', 'classic.html', 'orientation.html', 'privacy.html', 'terms.html'];
const COPY = ['logo.svg', 'icons', 'media', 'sw.js', 'dash-app'];

async function minifyHtml(html, name) {
  const parts = [];
  const re = /<(script|style)>([\s\S]*?)<\/\1>/g;
  let last = 0, m;
  while ((m = re.exec(html))) {
    parts.push(html.slice(last, m.index));
    const [whole, tag, body] = m;
    try {
      const r = await transform(body, tag === 'style'
        ? { loader: 'css', minify: true }
        : { loader: 'js', minify: true, target: 'es2017', charset: 'utf8', legalComments: 'none' });
      parts.push(`<${tag}>${r.code.trim()}</${tag}>`);
    } catch (e) {
      // A block esbuild cannot read is served as written, not dropped.
      console.warn(`${name}: left a <${tag}> block unminified: ${e.message.split('\n')[0]}`);
      parts.push(whole);
    }
    last = m.index + whole.length;
  }
  parts.push(html.slice(last));
  return parts.join('');
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
/* The classic page (the Org System before the dashboard took over, Nov 2026)
   is kept only to look at: its own demo mode is forced on, so every call it
   would make is answered inside the browser and it can never read or change
   a real club. Served at /classic. */
function classicDemo(html) {
  /* It shares this site's storage with the dashboard, so it must not write
     the sign-in keys (its sign-out would sign the dashboard out too) or touch
     this device's real phone-notification subscription. */
  let out = html;
  for (const fn of ['storeAff', 'storeSession', 'storeGoogleToken', 'storeWho', 'pushOn', 'pushOff', 'pushResync', 'pushOffHere', 'keepHomeSession']) {
    const re = new RegExp('function ' + fn + '\\(([^)]*)\\)\\{');
    if (!re.test(out)) throw new Error('classic.html: ' + fn + ' not found');
    out = out.replace(re, 'function ' + fn + '($1){return;');
  }
  out = out
    .replace(/function isDemo\(\)\{[\s\S]*?\n\}/, 'function isDemo(){return true}')
    .replace("function demoUrl(as,extra){return '/demo?as='", "function demoUrl(as,extra){return '/classic?as='")
    .replace('</body>', '<a href="/" style="position:fixed;z-index:99999;left:50%;bottom:14px;transform:translateX(-50%);' +
      'background:#111;color:#fff;font:600 13px/1.2 system-ui,sans-serif;padding:10px 16px;border-radius:999px;text-decoration:none;' +
      'box-shadow:0 4px 18px rgba(0,0,0,.3)">The old Org System, kept as a demo · Open the dashboard</a>\n</body>');
  if (out.indexOf('function isDemo(){return true}') < 0) throw new Error('classic.html: could not force demo mode');
  return out;
}
for (const p of PAGES) {
  let src = fs.readFileSync(path.join(root, p), 'utf8');
  if (p === 'classic.html') src = classicDemo(src);
  const min = await minifyHtml(src, p);
  fs.writeFileSync(path.join(out, p), min);
  console.log(`${p}: ${(src.length / 1024).toFixed(0)} KB -> ${(min.length / 1024).toFixed(0)} KB`);
}
for (const c of COPY) {
  const from = path.join(root, c);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(out, c), { recursive: true, filter: f => !f.endsWith('.DS_Store') });
}
// The dashboard keeps its script and styles in dash-app/, so they are minified where they land.
for (const f of fs.readdirSync(path.join(out, 'dash-app'))) {
  const file = path.join(out, 'dash-app', f), ext = path.extname(f);
  if (ext !== '.js' && ext !== '.css') continue;
  const src = fs.readFileSync(file, 'utf8');
  const r = await transform(src, ext === '.css' ? { loader: 'css', minify: true }
    : { loader: 'js', minify: true, target: 'es2019', charset: 'utf8', legalComments: 'none' });
  fs.writeFileSync(file, r.code);
}
