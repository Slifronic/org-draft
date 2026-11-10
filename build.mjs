// Builds the site Vercel serves into dist/: the same files, with the inline
// <script> and <style> blocks of the HTML pages minified. index.html is about
// three-quarters commented JavaScript; phones were downloading and parsing all
// of it on every visit. The source files stay as they are -- edit those, never
// dist/. Run `node build.mjs` to check a build locally.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { transform } from 'esbuild';

const root = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(root, 'dist');

// What the site is made of. Everything else in the repo (apps-script, docs,
// tools, slides) was never served and still is not.
const PAGES = ['index.html', 'orientation.html', 'privacy.html', 'terms.html'];
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
for (const p of PAGES) {
  const src = fs.readFileSync(path.join(root, p), 'utf8');
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

// One script and one stylesheet for the dashboard, named by their content. The
// browser used to re-check twenty files on every visit; now it downloads two
// once and keeps them (vercel.json marks /dash-app/b-* immutable), and a new
// build gets new names, so nobody runs an old copy.
{
  const page = path.join(out, 'index.html');
  let html = fs.readFileSync(page, 'utf8');
  const tags = [...html.matchAll(/<script src="\/dash-app\/([\w-]+\.js)"><\/script>\s*/g)];
  if (!tags.length) throw new Error('index.html: no dashboard scripts found to bundle');
  const js = tags.map((m) => fs.readFileSync(path.join(out, 'dash-app', m[1]), 'utf8')).join(';\n');
  const jh = crypto.createHash('sha256').update(js).digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(out, 'dash-app', `b-${jh}.js`), js);
  html = html.replace(tags[0][0], `<script src="/dash-app/b-${jh}.js"></script>`);
  tags.slice(1).forEach((m) => { html = html.replace(m[0], ''); });
  const css = fs.readFileSync(path.join(out, 'dash-app', 'app.css'), 'utf8');
  const ch = crypto.createHash('sha256').update(css).digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(out, 'dash-app', `b-${ch}.css`), css);
  if (html.indexOf('href="/dash-app/app.css"') < 0) throw new Error('index.html: dashboard stylesheet not found');
  html = html.replace('href="/dash-app/app.css"', `href="/dash-app/b-${ch}.css"`);
  fs.writeFileSync(page, html);
  console.log(`dashboard: ${tags.length} scripts -> b-${jh}.js (${(js.length / 1024).toFixed(0)} KB), app.css -> b-${ch}.css`);
}
