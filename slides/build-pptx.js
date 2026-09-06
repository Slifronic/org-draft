/* Renders deck.js to a .pptx. Geometry here is the same arithmetic
   build-preview.js uses, so the browser preview is a fair likeness. */
const pptxgen = require('/tmp/node_modules/pptxgenjs');
const { deck, C, F, W, H, M } = require('./deck.js');

const p = new pptxgen();
p.defineLayout({ name: 'STAGE', width: W, height: H });
p.layout = 'STAGE';
p.author = 'The Org System';
p.title  = 'Phi Beta Lambda — Chapter orientation';

const ink   = { color: C.ink };
const muted = { color: C.mute };

/* Every slide but the title and closer wears the same head: a mono eyebrow, a
   light heading, and a short teal rule under them. That rule is the motif. */
function head(s, sl, y = 0.62) {
  sl.addText(s.eyebrow.toUpperCase(), {
    x: M, y, w: W - M * 2, h: 0.26, align: 'left',
    fontFace: F.mono, fontSize: 11, charSpacing: 2.2, color: C.mute, margin: 0,
  });
  sl.addText(s.title, {
    x: M, y: y + 0.3, w: W - M * 2, h: 0.86, align: 'left', valign: 'top',
    fontFace: F.head, fontSize: 34, color: C.ink, margin: 0,
  });
  sl.addShape(p.ShapeType.rect, { x: M, y: y + 1.18, w: 1.15, h: 0.035, fill: { color: C.teal } });
  return y + 1.5;
}

/* Content used to hang off the header and leave two or three inches of dead
   slide underneath. Each block reports its own height and is centred in the
   band between the header rule and the bottom margin instead. */
function contentH(s) {
  if (s.kind === 'stat')     return 1.85 + 0.35 + 1.0;
  if (s.kind === 'anatomy')  return 1.35 + 0.4 + 1.1 + 0.3 + 0.85;
  if (s.kind === 'cupstruct')return s.rows.length * 0.78 - 0.12;
  if (s.kind === 'kindlist') return s.kinds.length * 1.38 - 0.16;
  if (s.kind === 'math')     return 1.75 + 0.4 + 1.0;
  if (s.kind === 'three')    return (s.tail ? 2.5 : 3.0) + (s.tail ? 1.24 : 0);
  if (s.kind === 'steps')    return s.steps.length * 1.32 - 0.2 + (s.tail ? 0.9 : 0);
  if (s.kind === 'callout')  return 0.15 + 3.3;
  if (s.kind === 'table')    return (s.rows.length + 1) * 0.375 + 0.55 + 0.6;
  if (s.kind === 'grid')     return Math.ceil(s.cells.length / 3) * 1.85 - 0.3;
  if (s.kind === 'chips')    return Math.ceil(s.chips.length / 3) * 1.16 - 0.3 + 0.24 + 1.1;
  if (s.kind === 'timeline') return s.phases.length * 0.98 - 0.14;
  return 0;
}

function bg(sl, color) { sl.background = { color: color || C.bg }; }

function card(sl, x, y, w, h, fill) {
  sl.addShape(p.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.06,
    fill: { color: fill || C.card }, line: { color: C.rule, width: 0.75 },
  });
}

deck.forEach((s) => {
  const sl = p.addSlide();
  bg(sl);

  /* ---------------- title / close ---------------- */
  if (s.kind === 'title' || s.kind === 'close') {
    sl.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 0.16, h: H, fill: { color: C.teal } });
    sl.addText(s.eyebrow.toUpperCase(), {
      x: 1.3, y: 2.25, w: W - 2.6, h: 0.3,
      fontFace: F.mono, fontSize: 12, charSpacing: 2.4, color: C.mute, margin: 0,
    });
    sl.addText(s.title, {
      x: 1.3, y: 2.62, w: W - 2.6, h: 1.35, valign: 'top',
      fontFace: F.head, fontSize: s.kind === 'title' ? 60 : 48, color: C.ink, margin: 0,
    });
    sl.addShape(p.ShapeType.rect, { x: 1.3, y: 4.06, w: 1.6, h: 0.045, fill: { color: C.teal } });
    sl.addText(s.sub, {
      x: 1.3, y: 4.36, w: 8.6, h: 1.0, valign: 'top',
      fontFace: F.body, fontSize: 17, color: C.slate, lineSpacingMultiple: 1.3, margin: 0,
    });
    sl.addText(s.foot, {
      x: 1.3, y: H - 1.0, w: 8.6, h: 0.3,
      fontFace: F.mono, fontSize: 11, charSpacing: 1.4, color: C.mute, margin: 0,
    });
    return;
  }

  const top0 = head(s, sl);
  const top = top0 + Math.max(0, ((H - 0.7 - top0) - contentH(s)) / 2);


  /* ---------------- what an Org is ---------------- */
  if (s.kind === 'anatomy') {
    const gap = 0.3, cw = 2.3;
    s.facts.forEach((f, i) => {
      const x = M + i * (cw + gap);
      card(sl, x, top, cw, 1.35);
      sl.addText(f.n, {
        x: x + 0.26, y: top + 0.16, w: cw - 0.52, h: 0.7, valign: 'top',
        fontFace: F.head, fontSize: 40, color: C.ink, margin: 0,
      });
      sl.addText(f.l.toUpperCase(), {
        x: x + 0.26, y: top + 0.9, w: cw - 0.52, h: 0.32,
        fontFace: F.mono, fontSize: 10, charSpacing: 1.5, color: C.mute, margin: 0,
      });
    });
    sl.addText(s.body, {
      x: M + 3 * (cw + gap) + 0.2, y: top + 0.05, w: W - M * 2 - 3 * (cw + gap) - 0.2, h: 1.5,
      valign: 'top', fontFace: F.body, fontSize: 16, color: C.slate,
      lineSpacingMultiple: 1.34, margin: 0,
    });
    sl.addShape(p.ShapeType.rect, { x: M, y: top + 1.78, w: 0.06, h: 0.95, fill: { color: C.teal } });
    sl.addText(s.kicker, {
      x: M + 0.34, y: top + 1.8, w: W - M * 2 - 0.6, h: 0.95, valign: 'top',
      fontFace: F.head, fontSize: 23, color: C.ink, lineSpacingMultiple: 1.22, margin: 0,
    });
    return;
  }

  /* ---------------- how the Cup is put together ---------------- */
  if (s.kind === 'cupstruct') {
    const rh = 0.66, gap = 0.12;
    s.rows.forEach((r, i) => {
      const y = top + i * (rh + gap);
      card(sl, M, y, W - M * 2, rh);
      sl.addShape(p.ShapeType.rect, { x: M, y, w: 0.05, h: rh, fill: { color: C.teal } });
      sl.addText(r.k.toUpperCase(), {
        x: M + 0.34, y: y + 0.21, w: 2.1, h: 0.3,
        fontFace: F.mono, fontSize: 10.5, charSpacing: 1.5, color: C.tealUp, margin: 0,
      });
      sl.addText(r.v, {
        x: M + 2.6, y: y + 0.16, w: W - M * 2 - 2.95, h: 0.42, valign: 'top',
        fontFace: F.body, fontSize: 16, color: C.slate, margin: 0,
      });
    });
    return;
  }

  /* ---------------- the kinds of points, described ---------------- */
  if (s.kind === 'kindlist') {
    const rh = 1.22, gap = 0.16;
    s.kinds.forEach((k, i) => {
      const y = top + i * (rh + gap);
      card(sl, M, y, W - M * 2, rh);
      sl.addShape(p.ShapeType.rect, { x: M, y, w: 0.06, h: rh, fill: { color: k.c } });
      sl.addShape(p.ShapeType.rect, { x: M + 0.36, y: y + 0.34, w: 0.2, h: 0.2, fill: { color: k.c } });
      sl.addText(k.t, {
        x: M + 0.7, y: y + 0.23, w: 2.3, h: 0.42,
        fontFace: F.head, fontSize: 23, color: C.ink, margin: 0,
      });
      sl.addText(k.d, {
        x: M + 3.15, y: y + 0.18, w: W - M * 2 - 3.5, h: 0.9, valign: 'top',
        fontFace: F.body, fontSize: 14.5, color: C.slate, lineSpacingMultiple: 1.3, margin: 0,
      });
    });
    return;
  }

  /* ---------------- a point, worked through ---------------- */
  if (s.kind === 'math') {
    const bw = 3.3, gap = 0.9, bh = 1.75;
    const startX = M + 0.35;
    s.parts.forEach((pt, i) => {
      const x = startX + i * (bw + gap);
      const last = i === s.parts.length - 1;
      card(sl, x, top, bw, bh, last ? C.moss : C.card);
      if (last) sl.addShape(p.ShapeType.rect, { x, y: top, w: 0.06, h: bh, fill: { color: C.teal } });
      sl.addText(pt.n, {
        x: x + 0.3, y: top + 0.18, w: bw - 0.6, h: 0.78, valign: 'top',
        fontFace: F.head, fontSize: 44, color: pt.c, margin: 0,
      });
      sl.addText(pt.l.toUpperCase(), {
        x: x + 0.3, y: top + 0.98, w: bw - 0.6, h: 0.3,
        fontFace: F.mono, fontSize: 10, charSpacing: 1.5, color: C.mute, margin: 0,
      });
      sl.addText(pt.s, {
        x: x + 0.3, y: top + 1.26, w: bw - 0.6, h: 0.46, valign: 'top',
        fontFace: F.body, fontSize: 13, color: C.slate, margin: 0,
      });
      if (i < s.parts.length - 1) {
        sl.addText(i === 0 ? '+' : '=', {
          x: x + bw, y: top + 0.55, w: gap, h: 0.6, align: 'center',
          fontFace: F.head, fontSize: 30, color: C.mute, margin: 0,
        });
      }
    });
    sl.addText(s.note, {
      x: M, y: top + bh + 0.4, w: W - M * 2 - 0.6, h: 1.0, valign: 'top',
      fontFace: F.body, fontSize: 15, color: C.mute, lineSpacingMultiple: 1.34, margin: 0,
    });
    return;
  }

  /* ---------------- big numbers ---------------- */
  if (s.kind === 'stat') {
    const gap = 0.36, cw = (W - M * 2 - gap * 2) / 3;
    s.stats.forEach((st, i) => {
      const x = M + i * (cw + gap);
      card(sl, x, top, cw, 1.85);
      sl.addText(st.n, {
        x: x + 0.34, y: top + 0.24, w: cw - 0.68, h: 0.95, valign: 'top',
        fontFace: F.head, fontSize: 54, color: i === 0 ? C.ink : C.slate, margin: 0,
      });
      sl.addText(st.l.toUpperCase(), {
        x: x + 0.34, y: top + 1.24, w: cw - 0.68, h: 0.42,
        fontFace: F.mono, fontSize: 10.5, charSpacing: 1.6, color: C.mute, margin: 0,
      });
    });
    sl.addText(s.note, {
      x: M, y: top + 2.2, w: W - M * 2 - 1.4, h: 1.1, valign: 'top',
      fontFace: F.body, fontSize: 16, color: C.slate, lineSpacingMultiple: 1.35, margin: 0,
    });
    return;
  }

  /* ---------------- three columns ---------------- */
  if (s.kind === 'three') {
    const gap = 0.36, cw = (W - M * 2 - gap * 2) / 3, ch = s.tail ? 2.5 : 3.0;
    s.items.forEach((it, i) => {
      const x = M + i * (cw + gap);
      card(sl, x, top, cw, ch);
      sl.addShape(p.ShapeType.rect, { x, y: top, w: 0.05, h: ch, fill: { color: it.c } });
      let ty = top + 0.3;
      if (it.n) {
        sl.addText(it.n, {
          x: x + 0.34, y: ty, w: cw - 0.68, h: 0.3,
          fontFace: F.mono, fontSize: 12, charSpacing: 1.6, color: it.c, margin: 0,
        });
        ty += 0.36;
      }
      sl.addText(it.h, {
        x: x + 0.34, y: ty, w: cw - 0.68, h: 0.46,
        fontFace: F.head, fontSize: 22, color: C.ink, margin: 0,
      });
      sl.addText(it.p, {
        x: x + 0.34, y: ty + 0.5, w: cw - 0.68, h: ch - (ty - top) - 0.7, valign: 'top',
        fontFace: F.body, fontSize: 15, color: C.slate, lineSpacingMultiple: 1.32, margin: 0,
      });
    });
    if (s.tail) {
      sl.addText(s.tail, {
        x: M, y: top + ch + 0.34, w: W - M * 2 - 0.6, h: 0.9, valign: 'top',
        fontFace: F.body, fontSize: 15, color: C.mute, lineSpacingMultiple: 1.32, margin: 0,
      });
    }
    return;
  }

  /* ---------------- numbered rows ---------------- */
  if (s.kind === 'steps') {
    const rh = 1.12, gap = 0.2;
    s.steps.forEach((st, i) => {
      const y = top + i * (rh + gap);
      card(sl, M, y, W - M * 2, rh);
      if (st.n) {
        sl.addShape(p.ShapeType.ellipse, {
          x: M + 0.3, y: y + 0.3, w: 0.52, h: 0.52,
          fill: { color: C.moss }, line: { color: C.teal, width: 1 },
        });
        sl.addText(st.n, {
          x: M + 0.3, y: y + 0.36, w: 0.52, h: 0.4, align: 'center',
          fontFace: F.mono, fontSize: 14, color: C.ink, margin: 0,
        });
      }
      const tx = M + (st.n ? 1.06 : 0.34);
      sl.addText(st.h, {
        x: tx, y: y + 0.19, w: 3.5, h: 0.42,
        fontFace: F.head, fontSize: 21, color: C.ink, margin: 0,
      });
      sl.addText(st.p, {
        x: tx + 3.7, y: y + 0.2, w: W - M - tx - 4.04, h: 0.78, valign: 'top',
        fontFace: F.body, fontSize: 14.5, color: C.slate, lineSpacingMultiple: 1.28, margin: 0,
      });
    });
    if (s.tail) {
      sl.addText(s.tail, {
        x: M, y: top + s.steps.length * (rh + gap) + 0.2, w: W - M * 2 - 0.6, h: 0.7, valign: 'top',
        fontFace: F.body, fontSize: 14.5, color: C.mute, lineSpacingMultiple: 1.3, margin: 0,
      });
    }
    return;
  }

  /* ---------------- one strong statement ---------------- */
  if (s.kind === 'callout') {
    const y = top + 0.15, h = 3.3, accent = s.warn ? C.coral : C.teal;
    card(sl, M, y, W - M * 2, h, C.void);
    sl.addShape(p.ShapeType.rect, { x: M, y, w: 0.06, h, fill: { color: accent } });
    sl.addText(s.body, {
      x: M + 0.66, y: y + 0.52, w: W - M * 2 - 1.4, h: 1.15, valign: 'top',
      fontFace: F.body, fontSize: 19, color: C.slate, lineSpacingMultiple: 1.35, margin: 0,
    });
    sl.addText(s.kicker, {
      x: M + 0.66, y: y + 1.82, w: W - M * 2 - 1.4, h: 1.05, valign: 'top',
      fontFace: F.head, fontSize: 25, color: C.ink, lineSpacingMultiple: 1.2, margin: 0,
    });
    return;
  }

  /* ---------------- permissions matrix ---------------- */
  if (s.kind === 'table') {
    const rows = [];
    rows.push(s.cols.map((c, i) => ({
      text: c.toUpperCase(),
      options: {
        fontFace: F.mono, fontSize: 10, charSpacing: 1.4, color: C.mute, bold: false,
        align: i === 0 ? 'left' : 'center', fill: { color: C.card }, valign: 'middle',
      },
    })));
    s.rows.forEach((r) => {
      rows.push(r.map((cell, i) => {
        if (i === 0) return { text: cell, options: { fontFace: F.body, fontSize: 13.5, color: C.ink, align: 'left', valign: 'middle' } };
        return {
          text: cell ? 'Yes' : '—',
          options: {
            fontFace: F.body, fontSize: 13.5, align: 'center', valign: 'middle',
            color: cell ? C.green : C.rule,
          },
        };
      }));
    });
    sl.addTable(rows, {
      x: M, y: top, w: W - M * 2,
      colW: [5.2, 1.6, 1.6, 1.6, 1.633],
      rowH: 0.375,
      border: { type: 'solid', color: C.rule, pt: 0.5 },
      fill: { color: C.bg },
      margin: [4, 8, 4, 8],
    });
    sl.addText(s.note, {
      x: M, y: top + 3.55, w: W - M * 2 - 0.6, h: 0.6, valign: 'top',
      fontFace: F.body, fontSize: 14, color: C.mute, lineSpacingMultiple: 1.3, margin: 0,
    });
    return;
  }

  /* ---------------- tab cards ---------------- */
  if (s.kind === 'grid') {
    const cols = 3, gap = 0.3;
    const cw = (W - M * 2 - gap * (cols - 1)) / cols, ch = 1.55;
    s.cells.forEach((c, i) => {
      const x = M + (i % cols) * (cw + gap);
      const y = top + Math.floor(i / cols) * (ch + gap);
      card(sl, x, y, cw, ch);
      sl.addText(c.h, {
        x: x + 0.3, y: y + 0.22, w: cw - 1.74, h: 0.42,
        fontFace: F.head, fontSize: 22, color: C.ink, margin: 0,
      });
      const isAll = c.w === 'Everyone';
      sl.addShape(p.ShapeType.roundRect, {
        x: x + cw - 1.32, y: y + 0.26, w: 1.02, h: 0.3, rectRadius: 0.04,
        fill: { color: isAll ? C.moss : C.bg }, line: { color: isAll ? C.teal : C.rule, width: 0.75 },
      });
      sl.addText(c.w.toUpperCase(), {
        x: x + cw - 1.32, y: y + 0.305, w: 1.02, h: 0.22, align: 'center',
        fontFace: F.mono, fontSize: 8.5, charSpacing: 0.8, color: isAll ? C.ink : C.mute, margin: 0,
      });
      sl.addText(c.p, {
        x: x + 0.3, y: y + 0.72, w: cw - 0.6, h: 0.68, valign: 'top',
        fontFace: F.body, fontSize: 13.5, color: C.slate, lineSpacingMultiple: 1.26, margin: 0,
      });
    });
    return;
  }

  /* ---------------- point kinds ---------------- */
  if (s.kind === 'chips') {
    const cols = 3, gap = 0.3;
    const cw = (W - M * 2 - gap * (cols - 1)) / cols, ch = 0.86;
    s.chips.forEach((c, i) => {
      const x = M + (i % cols) * (cw + gap);
      const y = top + Math.floor(i / cols) * (ch + gap);
      card(sl, x, y, cw, ch);
      sl.addShape(p.ShapeType.rect, { x: x + 0.3, y: y + 0.33, w: 0.2, h: 0.2, fill: { color: c.c } });
      sl.addText(c.t, {
        x: x + 0.66, y: y + 0.22, w: cw - 0.96, h: 0.42, valign: 'middle',
        fontFace: F.head, fontSize: 21, color: C.ink, margin: 0,
      });
    });
    sl.addText(s.note, {
      x: M, y: top + 2 * (ch + gap) + 0.24, w: W - M * 2 - 0.6, h: 1.1, valign: 'top',
      fontFace: F.body, fontSize: 15, color: C.slate, lineSpacingMultiple: 1.34, margin: 0,
    });
    return;
  }

  /* ---------------- semester ---------------- */
  if (s.kind === 'timeline') {
    const rh = 0.84, gap = 0.14;
    s.phases.forEach((ph, i) => {
      const y = top + i * (rh + gap);
      sl.addShape(p.ShapeType.rect, { x: M, y, w: 0.04, h: rh, fill: { color: C.teal } });
      sl.addText(ph.w.toUpperCase(), {
        x: M + 0.26, y: y + 0.06, w: 1.5, h: 0.3,
        fontFace: F.mono, fontSize: 10.5, charSpacing: 1.4, color: C.tealUp, margin: 0,
      });
      sl.addText(ph.h, {
        x: M + 0.26, y: y + 0.36, w: 1.7, h: 0.36,
        fontFace: F.head, fontSize: 19, color: C.ink, margin: 0,
      });
      sl.addText(ph.p, {
        x: M + 2.3, y: y + 0.12, w: W - M * 2 - 2.4, h: 0.68, valign: 'top',
        fontFace: F.body, fontSize: 15, color: C.slate, lineSpacingMultiple: 1.3, margin: 0,
      });
    });
    return;
  }
});

p.writeFile({ fileName: '/Users/Slifr/org-draft/slides/PBL-orientation.pptx' })
  .then((f) => console.log('wrote', f, '—', deck.length, 'slides'));
