/* A QR code as SVG, written here because the site only runs its own scripts
   (vercel.json's CSP). Byte mode, error correction M, versions 1-10: up to
   about 210 characters, plenty for a form link. Follows the QR spec as laid
   out in Project Nayuki's reference encoder (MIT). */
'use strict';

var QR = (function () {
  /* Per version 1..10 at level M: error-correction codewords per block, and blocks. */
  var ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  var BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
  var FORMAT_M = 0;

  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { var n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
    return r;
  }
  function dataCodewords(ver) { return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * BLOCKS[ver]; }
  function utf8(s) {
    var out = [], e = unescape(encodeURIComponent(s));
    for (var i = 0; i < e.length; i++) out.push(e.charCodeAt(i));
    return out;
  }

  /* Reed-Solomon over GF(256), modulus 0x11D. */
  function mul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z;
  }
  function divisor(deg) {
    var r = []; for (var i = 0; i < deg - 1; i++) r.push(0); r.push(1);
    var root = 1;
    for (var k = 0; k < deg; k++) {
      for (var j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = mul(root, 2);
    }
    return r;
  }
  function remainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift(); r.push(0);
      div.forEach(function (c, i) { r[i] ^= mul(c, f); });
    });
    return r;
  }

  function encode(text) {
    var bytes = utf8(String(text)), ver = 0;
    for (var v = 1; v <= 10; v++) {
      if (4 + (v < 10 ? 8 : 16) + 8 * bytes.length <= dataCodewords(v) * 8) { ver = v; break; }
    }
    if (!ver) throw new Error('Too long for a QR code here.');
    var cap = dataCodewords(ver) * 8, bits = [];
    var put = function (val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) { var x = 0; for (var j = 0; j < 8; j++) x = (x << 1) | bits[i + j]; data.push(x); }

    /* Split into blocks, add error correction, interleave. */
    var nb = BLOCKS[ver], el = ECC_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8);
    var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = divisor(el), blocks = [], k = 0;
    for (var b = 0; b < nb; b++) {
      var dat = data.slice(k, k + shortLen - el + (b < nShort ? 0 : 1));
      k += dat.length;
      var ecc = remainder(dat, div);
      if (b < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var cw = [];
    for (var c = 0; c < blocks[0].length; c++)
      blocks.forEach(function (bl, j) { if (c !== shortLen - el || j >= nShort) cw.push(bl[c]); });
    return draw(ver, cw);
  }

  function draw(ver, cw) {
    var size = ver * 4 + 17, m = [], fn = [];
    for (var y = 0; y < size; y++) { m.push([]); fn.push([]); for (var x = 0; x < size; x++) { m[y].push(false); fn[y].push(false); } }
    var set = function (x, y, d) { m[y][x] = d; fn[y][x] = true; };
    for (var i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (p) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var xx = p[0] + dx, yy = p[1] + dy, dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, dist !== 2 && dist !== 4);
      }
    });
    var pos = [];
    if (ver > 1) {
      var na = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
      pos = [6];
      for (var q = size - 7; pos.length < na; q -= step) pos.splice(1, 0, q);
    }
    pos.forEach(function (ax, a) {
      pos.forEach(function (ay, b2) {
        if ((a === 0 && b2 === 0) || (a === 0 && b2 === pos.length - 1) || (a === pos.length - 1 && b2 === 0)) return;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      });
    });
    var bit = function (v, n) { return ((v >>> n) & 1) !== 0; };
    var format = function (mask) {
      var d = FORMAT_M << 3 | mask, r = d;
      for (var t = 0; t < 10; t++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var f = (d << 10 | r) ^ 0x5412;
      for (var u = 0; u <= 5; u++) set(8, u, bit(f, u));
      set(8, 7, bit(f, 6)); set(8, 8, bit(f, 7)); set(7, 8, bit(f, 8));
      for (u = 9; u < 15; u++) set(14 - u, 8, bit(f, u));
      for (u = 0; u < 8; u++) set(size - 1 - u, 8, bit(f, u));
      for (u = 8; u < 15; u++) set(8, size - 15 + u, bit(f, u));
      set(8, size - 8, true);
    };
    format(0);
    if (ver >= 7) {
      var r = ver;
      for (var t = 0; t < 12; t++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
      var vb = ver << 12 | r;
      for (var w = 0; w < 18; w++) { var a2 = size - 11 + w % 3, b3 = Math.floor(w / 3); set(a2, b3, bit(vb, w)); set(b3, a2, bit(vb, w)); }
    }
    /* The codewords, zigzagging up and down in two-module columns from the right. */
    var n = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (var j = 0; j < 2; j++) {
        var x2 = right - j, up = ((right + 1) & 2) === 0, y2 = up ? size - 1 - vert : vert;
        if (!fn[y2][x2] && n < cw.length * 8) { m[y2][x2] = bit(cw[n >>> 3], 7 - (n & 7)); n++; }
      }
    }
    /* Try all eight masks and keep the one the spec's penalty rules like best. */
    var flip = function (mask) {
      for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) {
        if (fn[yy][xx]) continue;
        var inv = [(xx + yy) % 2, yy % 2, xx % 3, (xx + yy) % 3, (Math.floor(xx / 3) + Math.floor(yy / 2)) % 2,
                   xx * yy % 2 + xx * yy % 3, (xx * yy % 2 + xx * yy % 3) % 2, ((xx + yy) % 2 + xx * yy % 3) % 2][mask] === 0;
        if (inv) m[yy][xx] = !m[yy][xx];
      }
    };
    var best = 0, low = Infinity;
    for (var mk = 0; mk < 8; mk++) {
      flip(mk); format(mk);
      var p = penalty(m, size);
      if (p < low) { low = p; best = mk; }
      flip(mk);
    }
    flip(best); format(best);
    return m;
  }

  function penalty(m, size) {
    var score = 0, dark = 0;
    var line = function (get) {
      for (var a = 0; a < size; a++) {
        var run = 1, s = '';
        for (var b = 0; b < size; b++) {
          var c = get(a, b);
          s += c ? '1' : '0';
          if (b > 0) { if (c === get(a, b - 1)) run++; else { if (run >= 5) score += run - 2; run = 1; } }
        }
        if (run >= 5) score += run - 2;
        var at = -1;
        while ((at = s.indexOf('1011101', at + 1)) > -1)
          if (s.substr(at - 4, 4) === '0000' || s.substr(at + 7, 4) === '0000') score += 40;
      }
    };
    line(function (y, x) { return m[y][x]; });
    line(function (x, y) { return m[y][x]; });
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      if (m[y][x]) dark++;
      if (y < size - 1 && x < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
    }
    var total = size * size;
    return score + Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  }

  /* The code as an SVG string, with the four-module quiet zone scanners need. */
  function svg(text, px) {
    var m = encode(text), n = m.length, q = 4, d = '';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m[y][x]) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
    return '<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 2 * q) + ' ' + (n + 2 * q) + '"' + (px ? ' width="' + px + '" height="' + px + '"' : '') +
      ' shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  return {svg: svg, matrix: encode};
})();
