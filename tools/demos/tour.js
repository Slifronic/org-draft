// The narrated member walkthrough on /orientation, recorded from the dashboard
// as a new member in the demo club. Each step lasts as long as its spoken line
// (voiced locally with Kokoro by howto-voice.py), with the line also shown as a caption.
//   node tour.js lines out-tour                       # writes out-tour/lines.json
//   ~/jarvis/.venv/bin/python howto-voice.py out-tour  # one WAV per line + durations.json
//   node tour.js record out-tour                      # about 3 minutes, in real time
//   python3 tour-build.py out-tour ../../media        # -> member-walkthrough.mp4 + .jpg
// `say` is what is spoken (spelled for the voice), `cap` what is shown.
const fs = require('fs'), path = require('path');
const [MODE, OUT] = process.argv.slice(2);
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const W = 1280, H = 720, PAD = 0.45;

const STEPS = [
 { id: 'intro', as: 'new', cap: 'This is the Org System: De Anza PBL’s home for your Org, homework, teams and SFBLC. Here is a three-minute tour.',
   say: 'This is the Org System: De Anza P B L\'s home for your Org, your homework, your teams and S F B L C. Here is a three-minute tour, as a new member.' },
 { id: 'signin', cap: 'Open <b>org.deanzapbl.com</b> and sign in with Google, with the email you gave PBL.',
   say: 'Open org dot de anza P B L dot com, and sign in with Google, using the email you gave P B L.',
   act: async (p, r, m) => { await m.press(p.locator('[data-act=authDemoGoogle]'), 900); } },
 { id: 'join', cap: 'Pick <b>De Anza PBL</b> and type the <b>join code</b> EBOD gives you at your first meeting.',
   say: 'Pick De Anza P B L, and type the join code the board gives you at your first meeting. That is the only setup.',
   act: async (p, r, m) => { await m.point(p.locator('#authaff'), 700); const c = p.locator('input[name=code]'); if (await m.seen(c)) await r.type(c, 'PBL2026', 120); await m.press(p.locator('button[type=submit]', { hasText: 'Join' }), 600); } },
 { id: 'overview', cap: 'You land on <b>Overview</b>. The top row counts what needs you: SFBLC, homework, your checklist and your inbox.',
   say: 'You land on Overview, your home page. The top row counts what needs you: the days until S F B L C, your homework, your checklist and your inbox.',
   act: async (p, r, m) => { await m.point(m.at('Homework'), 900); } },
 { id: 'week', cap: '<b>Your week</b> lists the next seven days. Beside it: your SFBLC team and your homework, each with <b>Hand in</b>.',
   say: 'Your week lists the next seven days, with times and rooms. Beside it are your S F B L C team, and your homework, each with a hand-in button.',
   act: async (p, r, m) => { await m.point(m.at('Your week'), 700); await r.sleep(1600); await m.point(m.at('Your SFBLC team'), 700); } },
 { id: 'homework', cap: '<b>Homework</b>: attach a file or paste a link, then <b>Hand in</b>. Need more time? Ask 3+ days before it is due.',
   say: 'Homework has every assignment for your track, soonest first. Attach a file or paste a link, and press hand in. Only the board sees it. If you need more time, ask for an extension at least three days before it is due.',
   act: async (p, r, m) => { await m.go('homework'); await m.point(p.locator('#view').getByText('Choose a file').first(), 800); await r.sleep(2500); await m.point(p.locator('[data-act=extAsk]').first(), 700); } },
 { id: 'orgs', cap: '<b>Orgs</b> are your family in the chapter: 8 to 10 members and one EBOD contact.',
   say: 'Orgs are your family in the chapter: eight to ten members, and one board contact to go to with questions.',
   act: async (p, r, m) => { await m.go('orgs'); await m.point(m.at('Your Org'), 800); } },
 { id: 'cup', cap: 'Your Org earns a cup each time <b>80%</b> of its members hand an assignment in on time. Nobody is ranked.',
   say: 'Your Org earns a cup each time eighty percent of its members hand an assignment in on time. Nobody is ranked; the Orgs race together.',
   act: async (p, r, m) => { await m.go('cup'); await m.point(m.at('Your Org'), 800); } },
 { id: 'calendar', cap: 'The <b>Calendar</b> has every meeting, SFBLC and each due date. Tap a day to see what is on.',
   say: 'The calendar has every meeting, S F B L C, and each due date. Tap a day to see what is on.',
   act: async (p, r, m) => { await m.go('calendar'); const d = p.locator('[data-act=calDay]').filter({ hasText: /\S{4,}/ }).first(); await m.press(d, 800); } },
 { id: 'sfblc', cap: '<b>SFBLC</b> has the whole conference. <b>Mine</b> shows only what is for you, including your competition slot.',
   say: 'S F B L C has the whole conference. The schedule is a card per day, and Mine shows only what is for you, including your team\'s competition slot.',
   act: async (p, r, m) => { await m.go('sfblc/schedule'); await m.press(p.locator('[data-act=mine][data-v="1"]'), 800); } },
 { id: 'coaching', cap: '<b>Coaching</b> shows when and where your team is coached. The <b>Checklist</b> has the liability form, GroupMe and packing.',
   say: 'Coaching shows when and where your team is coached. The checklist tracks the liability form, the group chat, and what to pack.',
   act: async (p, r, m) => { await m.go('sfblc/coaching'); await m.point(m.at('Yours'), 700); await r.sleep(2600); await m.go('sfblc/checklist'); } },
 { id: 'about', cap: '<b>About</b> has the links and <b>Need to know</b>: curfew, the buddy system, dress code and the walking radius.',
   say: 'About has the links, and need to know: curfew, the buddy system, the dress code, and the walking radius around the hotel.',
   act: async (p, r, m) => { await m.go('sfblc/about'); await m.point(m.at('Need to know'), 700); await r.scroll(380, 1200); } },
 { id: 'carpools', cap: '<b>Carpools</b>: offer a ride or find one. Your phone and address go only to officers and your car.',
   say: 'Carpools is where you offer a ride, or find one to Emeryville. Your phone number and address only go to officers and the people in your car.',
   act: async (p, r, m) => { await m.go('sfblc/rides'); await r.scroll(500, 1200); await m.point(m.at('Cars'), 700); } },
 { id: 'teams', cap: '<b>Competition teams</b> shows your team. Under <b>Your choices</b>, rank your events and pick roommates.',
   say: 'Competition teams shows your team, and every other one. Under your choices, rank your events and pick who you would like to room with.',
   act: async (p, r, m) => { await m.go('teams/team'); await r.sleep(2200); await m.go('teams/choices'); } },
 { id: 'inbox', cap: 'Your <b>Inbox</b> has every message EBOD sends you.',
   say: 'Your inbox has every message the board sends you.',
   act: async (p, r, m) => { await m.go('messages'); } },
 { id: 'profile', cap: 'In <b>Profile</b>, keep your details current and turn on <b>phone notifications</b> so messages reach you.',
   say: 'In Profile, keep your details current, and turn on phone notifications, so those messages reach you right away.',
   act: async (p, r, m) => { await m.go('profile'); await m.point(m.at('Phone notifications'), 800); } },
 { id: 'watch', cap: 'Stuck? Press <b>Watch</b> at the top of any section for a short clip. See you at the next meeting.',
   say: 'Stuck anywhere? Press Watch at the top of any section for a short clip of how it works. That is the tour. See you at the next meeting!',
   act: async (p, r, m) => { await m.point(p.locator('#watchbtn'), 900); } },
];

if (MODE === 'lines') {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'lines.json'), JSON.stringify(STEPS.map(s => ({ id: s.id, text: s.say })), null, 1));
  console.log(STEPS.length + ' lines, ' + STEPS.reduce((n, s) => n + s.say.split(/\s+/).length, 0) + ' words');
  process.exit(0);
}

const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { INIT, rig } = require('./clips.js');
const { more } = require('./dash-clips.js');
const EXE = fs.existsSync(path.join(__dirname, 'exe.txt')) ? fs.readFileSync(path.join(__dirname, 'exe.txt'), 'utf8').trim() : undefined;

(async () => {
  const voice = JSON.parse(fs.readFileSync(path.join(OUT, 'voice', 'durations.json'), 'utf8'));
  const dir = path.join(OUT, 'rec'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(path.join(dir, 'f'), { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: 'dark' });
  await ctx.addInitScript(INIT);
  await ctx.addInitScript(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('orgsystem.dash.theme', 'phi'); } catch (e) {} });
  const page = await ctx.newPage(); const r = rig(page), m = more(page, r);
  const cdp = await ctx.newCDPSession(page), frames = [];
  cdp.on('Page.screencastFrame', f => {
    const file = path.join(dir, 'f', String(frames.length).padStart(5, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await page.goto(`${BASE}/?demo&as=new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '.demobar,#demobar{display:none!important}' });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1 });
  const t0 = Date.now() / 1000, marks = [];
  await page.mouse.move(W / 2, H / 2);
  for (const s of STEPS) {
    const at = Date.now() / 1000 - t0, len = voice[s.id] + PAD;
    marks.push({ id: s.id, at });
    await r.say(s.cap);
    try { if (s.act) await s.act(page, r, m); } catch (e) { console.log('step', s.id, 'failed:', String(e).split('\n')[0]); }
    const left = at + len - (Date.now() / 1000 - t0);
    if (left > 0) await page.waitForTimeout(left * 1000); else console.log(s.id, 'ran over its line by', (-left).toFixed(1) + 's');
  }
  await r.say(''); await page.waitForTimeout(900);
  const end = Date.now() / 1000;
  await cdp.send('Page.stopScreencast').catch(() => {});
  await browser.close();
  const keep = frames.filter(f => f.t <= end);
  let txt = 'ffconcat version 1.0\n';
  keep.forEach((f, k) => {
    const next = k + 1 < keep.length ? keep[k + 1].t : end;
    const from = Math.max(f.t, t0), to = Math.max(from, next);
    if (to - from <= 0 && k + 1 < keep.length) return;
    txt += `file '${path.basename(f.file)}'\nduration ${(to - from).toFixed(4)}\n`;
  });
  if (keep.length) txt += `file '${path.basename(keep[keep.length - 1].file)}'\n`;
  fs.writeFileSync(path.join(dir, 'f', 'list.txt'), txt);
  fs.writeFileSync(path.join(dir, 'marks.json'), JSON.stringify({ marks, total: end - t0 }, null, 1));
  console.log('recorded', (end - t0).toFixed(1) + 's,', keep.length, 'frames');
})().catch(e => { console.error(e); process.exit(1); });
