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
const PAGES = ['index.html', 'orientation.html', 'privacy.html', 'terms.html'];
const COPY = ['logo.svg', 'icons', 'media'];

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
