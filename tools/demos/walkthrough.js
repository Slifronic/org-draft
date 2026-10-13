// Records the narrated member walkthrough (media/member-walkthrough.mp4) from
// the demo club, one continuous session as a brand-new member, with each part
// started on the narration's own cue so the picture lands on the words.
// Usage: node walkthrough.js <outdir>      then: ./walkthrough.sh <outdir>
// The narration is media/walkthrough-narration.m4a (see README.md).
process.env.W = process.env.W || '1440'; process.env.H = process.env.H || '810';
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs'), path = require('path');
const { INIT, rig } = require('./clips.js');
const OUT = process.argv[2] || 'out';
const EXE = fs.existsSync(path.join(__dirname, 'exe.txt')) ? fs.readFileSync(path.join(__dirname, 'exe.txt'), 'utf8').trim() : undefined;
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const W = +process.env.W, H = +process.env.H, END = 177.6;

// Cue points, in seconds, from the narration (whisper timings).
const CUE = { google: 15.2, club: 17.6, join: 21.4, locked: 26.5, form: 32.6, year: 36.4, track: 38.6,
  mbti: 41.0, avail: 43.0, submit: 49.0, tour: 52.6, orgs: 61.0, orgsList: 69.0, teams: 83.4, flc: 85.4,
  hw: 104.5, hwLink: 108.0, cal: 119.6, calDay: 124.0, calAdd: 128.6, cup: 136.2, cupMore: 146.0,
  profile: 154.4, profileMore: 160.0, card: 166.2 };

const CARD = `(() => {
  const mark = document.querySelector('header .brandmark');
  const k = document.createElement('div'); k.id = '__end';
  k.style.cssText = 'position:fixed;inset:0;z-index:2147483645;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .6s;' +
    'background:#efeee9;background-image:linear-gradient(rgba(0,0,0,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.045) 1px,transparent 1px);background-size:30px 30px';
  k.innerHTML = '<div style="width:1010px;padding:58px 64px;background:#f7f6f2;border:1px solid #d9d7d0;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.09);font-family:-apple-system,\\'Helvetica Neue\\',Helvetica,Arial,sans-serif;color:#1b1b1b">' +
    '<div style="display:flex;align-items:center;gap:12px;font-size:15px;letter-spacing:.2em;color:#5f5f5a;margin-bottom:22px"><span id="__endmark"></span>START HERE</div>' +
    '<div style="font-size:86px;font-weight:700;letter-spacing:-.025em;line-height:1">org.deanzapbl.com</div>' +
    '<p style="font-size:27px;line-height:1.4;margin:26px 0 0;color:#2f2f2c">Sign up with Google, pick De Anza PBL and send the sign-up form. Your Org appears after bootcamp 1 on October 20.</p>' +
    '<div style="display:flex;gap:38px;margin-top:34px;font-size:18px;color:#5f5f5a"><span>Questions: Bryant Vo, VP of Communications</span><span>Written guide: org.deanzapbl.com/orientation</span></div></div>';
  document.body.appendChild(k);
  const cur = document.getElementById('__cur'); if (cur) cur.style.display = 'none';
  if (mark) { const c = mark.cloneNode(true); c.setAttribute('width', '30'); c.setAttribute('height', '30'); document.getElementById('__endmark').appendChild(c); }
  requestAnimationFrame(() => { k.style.opacity = '1'; });
})()`;

(async () => {
  const dir = path.join(OUT, 'walkthrough'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(path.join(dir, 'f'), { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: 'light' });
  await ctx.addInitScript(INIT);
  await ctx.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('orgsystem.theme', 'light'); } catch (e) {} });
  const p = await ctx.newPage(); const r = rig(p);
  const cdp = await ctx.newCDPSession(p), frames = [];
  cdp.on('Page.screencastFrame', f => {
    const file = path.join(dir, 'f', String(frames.length).padStart(5, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64')); frames.push({ file, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await p.goto(`${BASE}/demo?as=new`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  const at = async (t) => { const wait = (t0 + t) * 1000 - Date.now(); if (wait > 0) await p.waitForTimeout(wait); else if (wait < -400) console.log('late by', (-wait / 1000).toFixed(1) + 's', 'for cue', t); };
  const tab = async (label) => { await r.click(p.locator('#nav button', { hasText: label }).first(), 600); };
  try {
    await p.mouse.move(W / 2, H * 0.75);
    await at(CUE.google - 2.6); await r.moveTo(p.getByRole('button', { name: /Sign up with Google/ }), 900);
    await at(CUE.google); await r.click(p.getByRole('button', { name: /Sign up with Google/ }), 250);
    await at(CUE.club); await r.moveTo(p.locator('#jn-aff'), 800);
    await at(CUE.join); await r.click(p.getByRole('button', { name: /Join this club/ }), 700);
    await at(CUE.locked); await r.moveTo(p.locator('#nav button', { hasText: 'Homework' }).first(), 700);
    await r.click(p.locator('#nav button', { hasText: 'Homework' }).first(), 200);
    await at(CUE.form); await r.moveTo(p.locator('#ff_0'), 800);
    await at(CUE.year); await r.click(p.locator('input[name="ff_2"][value="1st year"]'));
    await at(CUE.track); await r.click(p.locator('input[name="ff_3"][value="Case competition (FLC)"]'));
    await at(CUE.mbti); await r.type(p.locator('#ff_4'), 'ENFP', 90);
    await at(CUE.avail); await r.click(p.locator('input[name="ff_5"][value="Tue/Thu evenings"]')); await r.click(p.locator('input[name="ff_5"][value="Weekends"]'));
    await r.moveTo(p.locator('#formsubmit'), 900);
    await at(CUE.submit); await r.click(p.locator('#formsubmit'), 300);
    await at(CUE.tour); const next = p.locator('#tournext');
    if (await next.isVisible().catch(() => false)) { await r.moveTo(next, 700); await at(CUE.orgs - 2); await r.click(p.locator('#tourskip'), 500); }
    await at(CUE.orgs); await tab('Orgs');
    await at(CUE.orgsList); await r.scroll(420, 900);
    await at(CUE.teams); await tab('Teams');
    await r.into(p.locator('#squadbody .squad').first());
    await at(CUE.flc); await r.into(p.locator('#myprefs')); await r.moveTo(p.locator('#myprefs h2'), 600);
    const ev = await p.$$eval('#mp-flc0 option', os => os.map(o => o.textContent).filter(t => t && t !== '—'));
    for (let i = 0; i < 3 && ev[i]; i++) await r.pick('mp-flc' + i, ev[i]);
    await r.name('mp-mate', 'Priya');
    await r.click(p.locator('#mp-save'), 600);
    await at(CUE.hw); await tab('Homework');
    await at(CUE.hwLink); const url = p.locator('#v-work .hwurl').first(); await r.into(url);
    await r.type(url, 'https://docs.google.com/document/d/bootcamp-reflection', 30);
    await r.click(p.locator('#v-work .hwsendlink').first(), 500);
    await at(CUE.cal); await tab('Calendar');
    await at(CUE.calDay); const day = p.locator('.calcell[data-day="2026-10-20"]'); if (await day.count()) await r.click(day, 700);
    await at(CUE.calAdd); const add = p.locator('#dayview .evadd').first(); if (await add.count()) await r.moveTo(add, 700);
    await at(CUE.cup); await tab('Org Cup');
    await at(CUE.cupMore); await r.scroll(320, 900);
    await at(CUE.profile); await tab('Profile');
    await at(CUE.profileMore); await r.scroll(380, 1000);
    await at(CUE.card); await p.evaluate(CARD);
    await at(END);
  } catch (e) { console.log('FAIL', String(e).split('\n')[0]); await p.screenshot({ path: path.join(dir, 'fail.png') }); }
  const end = t0 + END;
  await cdp.send('Page.stopScreencast').catch(() => {});
  await ctx.close(); await browser.close();
  const keep = frames.filter(f => f.t <= end);
  let list = 'ffconcat version 1.0\n';
  keep.forEach((f, i) => {
    const next = i + 1 < keep.length ? keep[i + 1].t : end;
    const from = Math.max(f.t, t0), to = Math.max(from, next);
    if (to - from <= 0 && i + 1 < keep.length) return;
    list += `file '${path.basename(f.file)}'\nduration ${(to - from).toFixed(4)}\n`;
  });
  if (keep.length) list += `file '${path.basename(keep[keep.length - 1].file)}'\n`;
  fs.writeFileSync(path.join(dir, 'f', 'list.txt'), list);
  console.log('walkthrough', keep.length, 'frames');
})().catch(e => { console.error(e); process.exit(1); });
