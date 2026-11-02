// Records the narrated how-to videos for the member email: the real site, in the
// demo club, running in a phone on stage.html, with the steps beside it.
//   node howto.js lines <outdir>          writes <outdir>/lines.json for howto-voice.py
//   node howto.js record <outdir> [id..]  records each video once the voice exists
// Each step lasts as long as its line of narration (plus a breath), and its
// action runs while it is spoken, so the picture lands on the words. howto.sh
// encodes the frames and lays the narration back at the recorded times.
const fs = require('fs'), path = require('path');
const MODE = process.argv[2], OUT = process.argv[3] || 'out-howto', ONLY = process.argv.slice(4);
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const EXE = fs.existsSync(path.join(__dirname, 'exe.txt')) ? fs.readFileSync(path.join(__dirname, 'exe.txt'), 'utf8').trim() : undefined;
const SITE = 'org dot, Dee Anza P B L, dot com';   // how the voice should say it
const PAD = 0.55;                                 // seconds of quiet after each line
// The real join code is never written into this repo (it is public): pass it as
// JOIN_CODE=... when voicing and recording. The finished videos carry it, so they
// go to members by email and are never put in media/ or deployed.
const CODE = process.env.JOIN_CODE || '';
if (!CODE && (MODE === 'lines' || MODE === 'record')) { console.error('Set JOIN_CODE to the club\'s join code.'); process.exit(1); }
const CM = CODE.match(/^([A-Z]+)(\d+)$/);
const DIGIT = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const spell = w => w.split('').join(' ');
const SAY_CODE = CM ? `${spell(CM[1])} ${CM[2]}` : spell(CODE);

// The end card: the address, the code and who to ask.
const CARD = (line, code) =>
  '<div class="mark"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round">' +
  '<circle cx="12" cy="12" r="2.2"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5M5.3 5.3l3.5 3.5M15.2 15.2l3.5 3.5M5.3 18.7l3.5-3.5M15.2 8.8l3.5-3.5"/></svg></div>' +
  '<div class="big">org.deanzapbl.com</div><p class="line">' + line + '</p>' +
  (code ? '<div class="code">Join code&nbsp;&nbsp;' + CODE + '</div>' : '') +
  '<div class="foot"><span>Questions: Bryant Vo, VP of Communications</span><span>Written guide: org.deanzapbl.com/orientation</span></div>';

const VIDEOS = [
 { id: 'join', as: 'new', tag: 'New members', title: 'Join the<br>Org System',
   steps: [
   { say: `Here's how to join the Org System. Do it on your phone. It takes about two minutes.`,
     act: async (s) => { await s.point('#demogoogle', 1.6); } },
   { t: 'Open <b>org.deanzapbl.com</b>', sub: 'Tap <b>Sign up with Google</b> and pick your own Google account.',
     say: `Open ${SITE}, and tap Sign up with Google. Pick your own Google account when it asks.`,
     act: async (s) => { await s.point('#demogoogle'); await s.until(-1.2); await s.tap('#demogoogle'); } },
   { t: 'Choose <b>De Anza PBL</b>', sub: 'Under <b>Which club are you in?</b>',
     say: `Under which club are you in, choose Dee Anza P B L.`,
     act: async (s) => { await s.f.locator('#jn-code').fill(''); await s.point('#jn-aff'); await s.until(-0.6); await s.tap('#jn-aff', true); } },
   { t: `Type the join code <b>${CODE}</b>`, sub: CM ? `Capital <b>${CM[1]}</b>, then <b>${CM[2]}</b>. No spaces.` : 'Exactly as written. No spaces.',
     say: `Then type the join code: ${SAY_CODE}. ` + (CM ? `Capital ${spell(CM[1])}, then ${CM[2].split('').map(d => DIGIT[d]).join(' ')}, with no spaces.` : 'Exactly as written, with no spaces.'),
     act: async (s) => { await s.until(1.2); await s.tap('#jn-code'); await s.type(CODE, 230); } },
   { t: 'Tap <b>Join this club</b>', sub: 'If it says the code does not match, check the capitals.',
     say: `Tap Join this club. If it says the code doesn't match, ` + (CM ? `check that ${spell(CM[1])} is in capitals.` : 'check every character.'),
     act: async (s) => { await s.until(0.4); await s.tap('#jn-go'); } },
   { t: 'Fill in the <b>sign-up form</b>', sub: 'Your name and email are already in. Choose your year and track.',
     say: `Now the sign-up form opens, with your name and email already filled in from Google. Choose your year, and the track you're most interested in.`,
     act: async (s) => { await s.point('#ff_0', 0.8); await s.until(4.6); await s.tap('input[name="ff_2"][value="1st year"]');
       await s.until(7.2); await s.tap('input[name="ff_3"][value="Case competition (FLC)"]'); } },
   { t: 'Add your type and free times', sub: 'Your four MBTI letters, and when you are usually free.',
     say: `Add your four M B T I letters, and tick the times you're usually free.`,
     act: async (s) => { await s.tap('#ff_4'); await s.type('ENFP', 140); await s.tap('input[name="ff_5"][value="Tue/Thu evenings"]');
       await s.tap('input[name="ff_5"][value="Weekends"]'); } },
   { t: 'Tap <b>Submit to the club</b>', sub: 'Once it is sent, the rest of the site opens.',
     say: `Then tap Submit to the club. Once it's sent, the rest of the site opens up.`,
     act: async (s) => { await s.point('#formsubmit'); await s.until(1.6); await s.tap('#formsubmit'); } },
   { t: 'Add it to your <b>home screen</b>', sub: 'One last step, and it opens like an app.',
     say: `Last step: put it on your home screen, so it opens like an app. Here's how.`,
     act: async (s) => { await s.f.locator('#v-home').waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
       await s.until(1.5); await s.scrollTo('#homesteps'); } },
   ] },
 { id: 'join-end', as: 'new', card: true, steps: [
   { say: `That's it. Next time, open it from your home screen, and tap Sign in with Google. If you get stuck, ask Bryant, or your E-bod contact.`,
     act: async (s) => { await s.card(CARD('Next time, open it from your home screen and tap <b>Sign in with Google</b>.', true)); } },
   ] },
 { id: 'homework', as: 'member', tag: 'Members', title: 'Hand in<br>homework',
   steps: [
   { say: `Here's how to hand in homework in the Org System.`,
     act: async (s) => { await s.point('.weekpanel .wk', 1); } },
   { t: 'Open the <b>Org System</b>', sub: 'What is due next is at the top, under <b>This week</b>.',
     say: `Open the Org System from your home screen. What's due next is right at the top, under This week.`,
     act: async (s) => { await s.until(2.6); await s.point('button[data-wk="hw"]'); } },
   { t: 'Tap <b>Hand it in</b>', sub: 'Or open the menu at the top and choose <b>Homework</b>.',
     say: `Tap Hand it in. You can also open the menu at the top, and choose Homework.`,
     act: async (s) => { await s.until(0.3); await s.tap('button[data-wk="hw"]'); } },
   { t: 'Read the brief', sub: 'Each assignment shows its due date and what EBOD wants.',
     say: `Each assignment shows when it's due, and the brief from E-bod.`,
     act: async (s) => { await s.scrollTo(s.hw + ' .hwbrief'); await s.point(s.hw + ' .hwdue'); } },
   { t: 'Hand in a <b>file</b>', sub: 'PDF, Word, slides or a photo, up to 8 MB.',
     say: `To hand in a file, tap Choose a file, and pick your P D F, document, slides or photo. Then tap Hand it in.`,
     act: async (s) => { await s.scrollTo(s.hw + ' .hwup'); await s.until(1.2); await s.pickFile(s.hw + ' .linkbtn', s.file);
       await s.until(-1.3); await s.tap(s.hw + ' .hwsend'); } },
   { t: 'Or paste a <b>link</b>', sub: 'Share your Google Doc or Slides first, then paste its link.',
     say: `Working in Google Docs or Slides? Share it first, paste the link here, and tap Hand in link.`,
     act: async (s) => { if (!s.link) return; await s.scrollTo(s.link + ' .hwurl'); await s.until(2.6); await s.tap(s.link + ' .hwurl');
       await s.paste(s.link + ' .hwurl', 'https://docs.google.com/document/d/case-brief'); await s.until(-0.9); await s.tap(s.link + ' .hwsendlink', s.linkDone);
       if (s.linkDone) await s.f.locator(s.link + ' .hwurl').fill(''); } },
   { t: 'Look for <b>Handed in ✓</b>', sub: 'You can hand in a new version until the due date.',
     say: `When you see Handed in, with a check mark, you're done. You can hand in a new version until the due date, and E-bod sees the latest one.`,
     act: async (s) => { await s.scrollTo(s.hw + ' .hwmsg2'); } },
   ] },
 { id: 'homework-end', as: 'member', card: true, steps: [
   { say: `Only E-bod sees what you hand in. And handing in on time helps your Org earn the Org Cup.`,
     act: async (s) => { await s.card(CARD('Only EBOD sees what you hand in. On time counts toward your <b>Org&rsquo;s cup</b>.', false)); } },
   ] },
];

// The add-to-home-screen part reuses media/demos/homescreen.mp4, voiced: each
// line is laid over that clip's own stretch [from, to) in seconds, which is held
// on its last frame if the line runs longer.
const HOME = [
  { from: 4, to: 7, say: `On an iPhone, open ${SITE} in Safari. It has to be Safari for this step.` },
  { from: 7, to: 10, say: `Tap the three dots at the bottom, then Share.` },
  { from: 10, to: 14, say: `Scroll down, and choose Add to Home Screen.` },
  { from: 14, to: 17, say: `Tap Add.` },
  { from: 17, to: 23, say: `Now open it from your home screen. Look for the red Dee Anza P B L icon.` },
  { from: 23, to: 25, say: `On Android, open the site in Chrome.` },
  { from: 25, to: 30, say: `Tap the three-dot menu, then Add to Home screen. Some phones say Install app.` },
  { from: 30, to: 33, say: `Tap Add.` },
  { from: 33, to: 40, say: `Then open it from your home screen, like any other app. Opening it from the icon finishes this step on its own.` },
];
module.exports = { VIDEOS, HOME };

if (MODE === 'lines') {
  fs.mkdirSync(OUT, { recursive: true });
  const lines = [];
  for (const v of VIDEOS) v.steps.forEach((st, i) => lines.push({ id: `${v.id}-${i}`, text: st.say }));
  HOME.forEach((h, i) => lines.push({ id: `home-${i}`, text: h.say }));
  fs.writeFileSync(path.join(OUT, 'lines.json'), JSON.stringify(lines, null, 1));
  console.log(lines.length, 'lines ->', path.join(OUT, 'lines.json'));
  process.exit(0);
}

// Inside the phone: the live site as a member sees it at org.deanzapbl.com,
// without the demo's banner, its "(demo)" labels or the theme switch (the
// chapter address has no switch).
const FRAME_INIT = `(() => { if (window.top === window) return;
  const css = document.createElement('style');
  css.textContent = '.demobar,#demobar,#themebtn,#themebtn2{display:none!important}';
  const strip = () => document.querySelectorAll('button,option,span,b,p').forEach(e => {
    if (e.children.length === 0 && /\\s*\\(demo\\)/.test(e.textContent)) e.textContent = e.textContent.replace(/\\s*\\(demo\\)/, '');
    else if (e.id === 'demogoogle') e.querySelectorAll('span').forEach(x => { if (/demo/.test(x.textContent)) x.remove(); }); });
  const go = () => { document.head.appendChild(css); strip(); new MutationObserver(strip).observe(document.body, { childList: true, subtree: true }); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', go) : go();
})();`;

function minimalPdf() {
  const body = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
  return Buffer.from(body);
}

if (MODE === 'record') (async () => {
  const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
  const voice = JSON.parse(fs.readFileSync(path.join(OUT, 'voice', 'durations.json'), 'utf8'));
  const file = path.join(OUT, 'Case brief - Finn Mendez.pdf'); fs.writeFileSync(file, minimalPdf());
  const browser = await chromium.launch({ executablePath: EXE });
  for (const v of VIDEOS) {
    if (ONLY.length && !ONLY.includes(v.id)) continue;
    const dir = path.join(OUT, v.id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(path.join(dir, 'f'), { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: 'light',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    await ctx.addInitScript(FRAME_INIT);
    const page = await ctx.newPage(); page.setDefaultTimeout(8000);
    page.on('pageerror', e => console.log('page error', e.message));
    await page.goto(`${BASE}/tools/demos/stage.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('orgsystem.theme', 'pbl'); localStorage.setItem('orgsystem.tour', '1'); localStorage.setItem('orgsystem.tourDone', '1'); });
    await page.evaluate(o => stage.setup(o), { tag: v.tag, title: v.title || '', steps: v.steps.filter(s => s.t).map(s => ({ t: s.t, sub: s.sub })) });
    await page.evaluate(u => stage.load(u), `/demo?as=${v.as}`);
    const f = page.frames().find(x => x !== page.mainFrame() && /\/demo\?/.test(x.url()));
    await page.waitForTimeout(1800);
    if (await f.isVisible('#tourskip').catch(() => false)) await f.click('#tourskip');

    // the helpers each action gets
    let stepT0 = 0, stepLen = 0, tapOn = false;
    const sleep = ms => page.waitForTimeout(ms);
    const s = { f, page, file,
      // wait until `sec` into this step's line (negative: from its end)
      until: async (sec) => { const at = stepT0 + (sec < 0 ? stepLen + sec : sec) * 1000; const w = at - Date.now(); if (w > 0) await sleep(w); },
      scrollTo: async (sel) => { await page.evaluate(() => stage.tapHide()); await f.locator(sel).first().evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(700); },
      point: async (sel, hold = 0) => {
        const loc = f.locator(sel).first();
        const inView = await loc.evaluate(e => { const r = e.getBoundingClientRect(); return r.top > 40 && r.bottom < innerHeight - 40; });
        if (!inView) { await loc.evaluate(e => e.scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(700); }
        const b = await loc.boundingBox(); if (!b) return;
        await page.evaluate(([x, y, sh]) => stage.tapAt(x, y, sh), [b.x + Math.min(b.width / 2, 120), b.y + b.height / 2, true]); tapOn = true;
        await sleep(520 + hold * 1000);
      },
      tap: async (sel, noClick) => {
        await s.point(sel);
        const loc = f.locator(sel).first(); const b = await loc.boundingBox();
        await page.evaluate(() => stage.press(true)); await sleep(140);
        if (!noClick) await page.mouse.click(b.x + Math.min(b.width / 2, 120), b.y + b.height / 2);
        await sleep(120); await page.evaluate(() => stage.press(false)); await sleep(300);
      },
      type: async (text, delay) => { await f.locator(':focus').fill(''); await page.keyboard.type(text, { delay }); await sleep(200); },
      paste: async (sel, text) => { await f.locator(sel).first().fill(text); await sleep(300); },
      pickFile: async (sel, fp) => {
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), s.tap(sel)]);
        await sleep(700); await chooser.setFiles(fp); await sleep(500);
      },
      card: async (html) => { await page.evaluate(() => stage.tapHide()); await page.evaluate(h => stage.card(h), html); await sleep(700); },
    };
    if (v.id === 'homework') {
      const go = vw => f.evaluate(x => { document.querySelector('#nav button[data-view="' + x + '"]').click(); scrollTo(0, 0); }, vw);
      await go('v-work'); await sleep(600);
      const cards = await f.$$eval('.hwcard', cs => cs.map(c => ({ id: c.dataset.id, file: !!c.querySelector('.hwfile'), link: !!c.querySelector('.hwurl'),
        done: /Handed in/.test(c.textContent), t: c.querySelector('.hwtitle').textContent })));
      const nextId = await f.getAttribute('button[data-wk="hw"]', 'data-id').catch(() => null);
      // hand in what is due next; a card already handed in would stop on "Replace it?"
      const hw = cards.find(c => c.id === nextId && c.file && !c.done) || cards.find(c => c.file && !c.done);
      const ln = cards.find(c => c.link && !c.done && c.id !== hw.id) || cards.find(c => c.link);
      s.hw = `.hwcard[data-id="${hw.id}"]`; s.link = ln ? `.hwcard[data-id="${ln.id}"]` : null; s.linkDone = !!(ln && ln.done);
      console.log('homework: file ->', hw.t, '| link ->', ln && ln.t, '| due next', nextId, JSON.stringify(cards));
      await go('v-teams'); await sleep(900);
    }

    // every painted frame, with Chrome's own timestamp
    const cdp = await ctx.newCDPSession(page), frames = [];
    cdp.on('Page.screencastFrame', fr => {
      const fp = path.join(dir, 'f', String(frames.length).padStart(5, '0') + '.jpg');
      fs.writeFileSync(fp, Buffer.from(fr.data, 'base64')); frames.push({ file: fp, t: fr.metadata.timestamp });
      cdp.send('Page.screencastFrameAck', { sessionId: fr.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 });
    await sleep(300);
    const t0 = Date.now() / 1000, marks = []; let ok = true, k = 0;
    for (let i = 0; i < v.steps.length; i++) {
      const st = v.steps[i], id = `${v.id}-${i}`;
      if (st.t) await page.evaluate(n => stage.step(n), k++);
      stepT0 = Date.now(); stepLen = voice[id] + PAD;
      marks.push({ id, at: stepT0 / 1000 - t0, len: voice[id] });
      await page.evaluate(() => stage.tapHide());
      try { await st.act(s); } catch (e) { ok = false; console.log('FAIL', id, String(e).split('\n')[0]); await page.screenshot({ path: path.join(dir, 'fail.png') }); }
      const left = stepT0 + stepLen * 1000 - Date.now();
      if (left > 0) await sleep(left); else console.log(`  ${id} ran over its line by ${(-left / 1000).toFixed(1)}s`);
    }
    await sleep(v.card ? 1400 : 500);
    const end = Date.now() / 1000;
    await cdp.send('Page.stopScreencast').catch(() => {});
    await ctx.close();
    const keep = frames.filter(fr => fr.t <= end), off = 0;
    let list = 'ffconcat version 1.0\n';
    keep.forEach((fr, i) => {
      const a = Math.max(fr.t - off, t0), b = i + 1 < keep.length ? Math.max(a, keep[i + 1].t - off) : end;
      if (b - a <= 0 && i + 1 < keep.length) return;
      list += `file '${path.basename(fr.file)}'\nduration ${(Math.min(b, end) - a).toFixed(4)}\n`;
    });
    if (keep.length) list += `file '${path.basename(keep[keep.length - 1].file)}'\n`;
    fs.writeFileSync(path.join(dir, 'f', 'list.txt'), list);
    fs.writeFileSync(path.join(dir, 'marks.json'), JSON.stringify({ ok, length: end - t0, marks }, null, 1));
    console.log(v.id, ok ? 'ok' : 'FAILED', (end - t0).toFixed(1) + 's', keep.length + ' frames');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
