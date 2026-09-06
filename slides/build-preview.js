/* Renders the same deck to HTML at the same inch geometry, so the layout can
   actually be looked at on a machine with no PowerPoint or LibreOffice on it.
   1in = 96px. Anything that overflows or collides here does so in the .pptx. */
const fs = require('fs');
const { deck, C, F, W, H, M } = require('./deck.js');

const PX = 96;
const px = (n) => (n * PX).toFixed(1) + 'px';
const c = (h) => '#' + h;

let out = `<!doctype html><meta charset="utf-8"><title>Deck preview</title>
<style>
  body{margin:0;background:#0a0a0a;font-family:Calibri,Carlito,'DejaVu Sans',sans-serif;padding:28px}
  .slide{position:relative;width:${px(W)};height:${px(H)};background:${c(C.bg)};
    margin:0 auto 26px;overflow:hidden;box-shadow:0 2px 30px rgba(0,0,0,.6)}
  .n{position:absolute;right:8px;top:-22px;color:#666;font:11px Consolas,monospace}
  .wrapn{position:relative;width:${px(W)};margin:0 auto 26px}
  .t{position:absolute;white-space:pre-wrap;box-sizing:border-box}
  .r{position:absolute}
</style>
<script>
/* #s7 shows slide 7 on its own at the top of the document, because the
   preview pane only reliably paints what is above the fold. */
addEventListener('DOMContentLoaded',function(){
  var m=(location.search||'').match(/[?&]s=(\\d+)/); if(!m)return;
  document.querySelectorAll('.wrapn').forEach(function(w,i){
    if(i!==+m[1]-1)w.style.display='none';
  });
});
</script>`;

function T(txt, o) {
  const st = [
    `left:${px(o.x)}`, `top:${px(o.y)}`, `width:${px(o.w)}`,
    o.h ? `height:${px(o.h)}` : '',
    `font-size:${(o.fs * 1.333).toFixed(1)}px`,
    `color:${c(o.col)}`,
    `font-family:${o.mono ? 'Consolas,monospace' : 'Calibri,Carlito,sans-serif'}`,
    o.mono ? `letter-spacing:${(o.cs || 1.4) * 0.9}px;text-transform:uppercase` : '',
    o.head ? 'font-weight:300' : '',
    `line-height:${o.lh || 1.22}`,
    o.align ? `text-align:${o.align}` : '',
    o.valign === 'middle' ? 'display:flex;align-items:center' : '',
  ].filter(Boolean).join(';');
  return `<div class="t" style="${st}">${txt}</div>`;
}
/* Content used to hang off the header and leave two or three inches of dead
   slide underneath. Each block reports its own height and is centred in the
   band between the header rule and the bottom margin instead. */
function contentH(s) {
  if (s.kind === 'stat')     return 1.85 + 0.35 + 1.0;
  if (s.kind === 'three')    return (s.tail ? 2.5 : 3.0) + (s.tail ? 1.24 : 0);
  if (s.kind === 'steps')    return s.steps.length * 1.32 - 0.2 + (s.tail ? 0.9 : 0);
  if (s.kind === 'callout')  return 0.15 + 3.3;
  if (s.kind === 'table')    return (s.rows.length + 1) * 0.375 + 0.55 + 0.6;
  if (s.kind === 'grid')     return Math.ceil(s.cells.length / 3) * 1.85 - 0.3;
  if (s.kind === 'chips')    return Math.ceil(s.chips.length / 3) * 1.16 - 0.3 + 0.24 + 1.1;
  if (s.kind === 'timeline') return s.phases.length * 0.98 - 0.14;
  return 0;
}

function R(x, y, w, h, fill, radius, border) {
  return `<div class="r" style="left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};
    background:${c(fill)};${radius ? `border-radius:${px(radius)};` : ''}
    ${border ? `border:1px solid ${c(border)};box-sizing:border-box;` : ''}"></div>`;
}
function E(x, y, w, h, fill, border) {
  return `<div class="r" style="left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};
    background:${c(fill)};border-radius:50%;border:1px solid ${c(border)};box-sizing:border-box"></div>`;
}

deck.forEach((s, idx) => {
  let b = '';
  const head = (y = 0.62) => {
    b += T(s.eyebrow, { x: M, y, w: W - M * 2, fs: 11, col: C.mute, mono: true, cs: 2.2 });
    b += T(s.title, { x: M, y: y + 0.3, w: W - M * 2, fs: 34, col: C.ink, head: true, lh: 1.1 });
    b += R(M, y + 1.18, 1.15, 0.035, C.teal);
    return y + 1.5;
  };

  if (s.kind === 'title' || s.kind === 'close') {
    b += R(0, 0, 0.16, H, C.teal);
    b += T(s.eyebrow, { x: 1.3, y: 2.25, w: W - 2.6, fs: 12, col: C.mute, mono: true, cs: 2.4 });
    b += T(s.title, { x: 1.3, y: 2.62, w: W - 2.6, fs: s.kind === 'title' ? 60 : 48, col: C.ink, head: true, lh: 1.05 });
    b += R(1.3, 4.06, 1.6, 0.045, C.teal);
    b += T(s.sub, { x: 1.3, y: 4.36, w: 8.6, fs: 17, col: C.slate, lh: 1.3 });
    b += T(s.foot, { x: 1.3, y: H - 1.0, w: 8.6, fs: 11, col: C.mute, mono: true });
  } else {
    const top0 = head();
    const top = top0 + Math.max(0, ((H - 0.7 - top0) - contentH(s)) / 2);

    if (s.kind === 'stat') {
      const gap = 0.36, cw = (W - M * 2 - gap * 2) / 3;
      s.stats.forEach((st, i) => {
        const x = M + i * (cw + gap);
        b += R(x, top, cw, 1.85, C.card, 0.06, C.rule);
        b += T(st.n, { x: x + 0.34, y: top + 0.24, w: cw - 0.68, fs: 54, col: i === 0 ? C.ink : C.slate, head: true, lh: 1.05 });
        b += T(st.l, { x: x + 0.34, y: top + 1.24, w: cw - 0.68, fs: 10.5, col: C.mute, mono: true, cs: 1.6 });
      });
      b += T(s.note, { x: M, y: top + 2.2, w: W - M * 2 - 1.4, fs: 16, col: C.slate, lh: 1.35 });
    }

    if (s.kind === 'three') {
      const gap = 0.36, cw = (W - M * 2 - gap * 2) / 3, ch = s.tail ? 2.5 : 3.0;
      s.items.forEach((it, i) => {
        const x = M + i * (cw + gap);
        b += R(x, top, cw, ch, C.card, 0.06, C.rule);
        b += R(x, top, 0.05, ch, it.c);
        let ty = top + 0.3;
        if (it.n) { b += T(it.n, { x: x + 0.34, y: ty, w: cw - 0.68, fs: 12, col: it.c, mono: true, cs: 1.6 }); ty += 0.36; }
        b += T(it.h, { x: x + 0.34, y: ty, w: cw - 0.68, fs: 25, col: C.ink, head: true });
        b += T(it.p, { x: x + 0.34, y: ty + 0.52, w: cw - 0.68, fs: 15, col: C.slate, lh: 1.32 });
      });
      if (s.tail) b += T(s.tail, { x: M, y: top + ch + 0.34, w: W - M * 2 - 0.6, fs: 15, col: C.mute, lh: 1.32 });
    }

    if (s.kind === 'steps') {
      const rh = 1.12, gap = 0.2;
      s.steps.forEach((st, i) => {
        const y = top + i * (rh + gap);
        b += R(M, y, W - M * 2, rh, C.card, 0.06, C.rule);
        if (st.n) {
          b += E(M + 0.3, y + 0.3, 0.52, 0.52, C.moss, C.teal);
          b += T(st.n, { x: M + 0.3, y: y + 0.36, w: 0.52, fs: 14, col: C.ink, mono: true, align: 'center' });
        }
        const tx = M + (st.n ? 1.06 : 0.34);
        b += T(st.h, { x: tx, y: y + 0.19, w: 3.5, fs: 21, col: C.ink, head: true });
        b += T(st.p, { x: tx + 3.7, y: y + 0.2, w: W - M - tx - 4.04, fs: 14.5, col: C.slate, lh: 1.28 });
      });
      if (s.tail) b += T(s.tail, { x: M, y: top + s.steps.length * (rh + gap) + 0.2, w: W - M * 2 - 0.6, fs: 14.5, col: C.mute, lh: 1.3 });
    }

    if (s.kind === 'callout') {
      const y = top + 0.15, h = 3.3, accent = s.warn ? C.coral : C.teal;
      b += R(M, y, W - M * 2, h, C.void, 0.06, C.rule);
      b += R(M, y, 0.06, h, accent);
      b += T(s.body, { x: M + 0.66, y: y + 0.52, w: W - M * 2 - 1.4, fs: 19, col: C.slate, lh: 1.35 });
      b += T(s.kicker, { x: M + 0.66, y: y + 1.82, w: W - M * 2 - 1.4, fs: 25, col: C.ink, head: true, lh: 1.2 });
    }

    if (s.kind === 'table') {
      const colW = [5.2, 1.6, 1.6, 1.6, 1.633], rowH = 0.375;
      let y = top;
      const drawRow = (cells, isHead) => {
        let x = M;
        cells.forEach((cell, i) => {
          b += R(x, y, colW[i], rowH, isHead ? C.card : C.bg, 0, C.rule);
          const v = isHead ? cell : (i === 0 ? cell : (cell ? 'Yes' : '—'));
          b += T(v, {
            x: x + 0.09, y: y + (isHead ? 0.1 : 0.07), w: colW[i] - 0.18,
            fs: isHead ? 10 : 13.5, mono: isHead, cs: 1.4,
            col: isHead ? C.mute : (i === 0 ? C.ink : (cell ? C.green : C.rule)),
            align: i === 0 ? 'left' : 'center',
          });
          x += colW[i];
        });
        y += rowH;
      };
      drawRow(s.cols, true);
      s.rows.forEach((r) => drawRow(r, false));
      b += T(s.note, { x: M, y: top + 3.55, w: W - M * 2 - 0.6, fs: 14, col: C.mute, lh: 1.3 });
    }

    if (s.kind === 'grid') {
      const cols = 3, gap = 0.3, cw = (W - M * 2 - gap * (cols - 1)) / cols, ch = 1.55;
      s.cells.forEach((cc, i) => {
        const x = M + (i % cols) * (cw + gap), y = top + Math.floor(i / cols) * (ch + gap);
        const isAll = cc.w === 'Everyone';
        b += R(x, y, cw, ch, C.card, 0.06, C.rule);
        b += T(cc.h, { x: x + 0.3, y: y + 0.22, w: cw - 1.74, fs: 22, col: C.ink, head: true });
        b += R(x + cw - 1.32, y + 0.26, 1.02, 0.3, isAll ? C.moss : C.bg, 0.04, isAll ? C.teal : C.rule);
        b += T(cc.w, { x: x + cw - 1.32, y: y + 0.305, w: 1.02, fs: 8.5, col: isAll ? C.ink : C.mute, mono: true, cs: 0.8, align: 'center' });
        b += T(cc.p, { x: x + 0.3, y: y + 0.72, w: cw - 0.6, fs: 13.5, col: C.slate, lh: 1.26 });
      });
    }

    if (s.kind === 'chips') {
      const cols = 3, gap = 0.3, cw = (W - M * 2 - gap * (cols - 1)) / cols, ch = 0.86;
      s.chips.forEach((cc, i) => {
        const x = M + (i % cols) * (cw + gap), y = top + Math.floor(i / cols) * (ch + gap);
        b += R(x, y, cw, ch, C.card, 0.06, C.rule);
        b += R(x + 0.3, y + 0.33, 0.2, 0.2, cc.c);
        b += T(cc.t, { x: x + 0.66, y: y + 0.28, w: cw - 0.96, fs: 21, col: C.ink, head: true });
      });
      b += T(s.note, { x: M, y: top + 2 * (ch + gap) + 0.24, w: W - M * 2 - 0.6, fs: 15, col: C.slate, lh: 1.34 });
    }

    if (s.kind === 'timeline') {
      const rh = 0.84, gap = 0.14;
      s.phases.forEach((ph, i) => {
        const y = top + i * (rh + gap);
        b += R(M, y, 0.04, rh, C.teal);
        b += T(ph.w, { x: M + 0.26, y: y + 0.06, w: 1.5, fs: 10.5, col: C.tealUp, mono: true, cs: 1.4 });
        b += T(ph.h, { x: M + 0.26, y: y + 0.36, w: 1.7, fs: 19, col: C.ink, head: true });
        b += T(ph.p, { x: M + 2.3, y: y + 0.12, w: W - M * 2 - 2.4, fs: 15, col: C.slate, lh: 1.3 });
      });
    }
  }

  out += `<div class="wrapn" id="s${idx+1}"><div class="n">${String(idx + 1).padStart(2, '0')} · ${s.kind}</div>
    <div class="slide">${b}</div></div>`;
});

fs.writeFileSync('/Users/Slifr/org-draft/slides/preview.html', out);
console.log('preview written —', deck.length, 'slides');
