// Records one short captioned clip per section of the dashboard, as a member
// sees it (the demo club, /?demo&as=member; sign-up uses as=new).
// Usage: node dash-clips.js <outdir> [clipId ...]   then ./encode.sh <outdir> ../../media/demos
// Same rig as clips.js (drawn cursor, title card, captions, 2x screencast).
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs'), path = require('path');
const { INIT, rig } = require('./clips.js');
const OUT = process.argv[2]; const ONLY = process.argv.slice(3);
const EXE = fs.existsSync(path.join(__dirname, 'exe.txt')) ? fs.readFileSync(path.join(__dirname, 'exe.txt'), 'utf8').trim() : undefined;
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const W = +process.env.W || 1280, H = +process.env.H || 800;

/* Helpers on top of the rig. Every step tolerates a missing element, so one
   changed screen does not cost the rest of the clip. */
function more(p, r) {
  const v = p.locator('#view');
  const at = (text) => v.getByText(text, { exact: false }).first();
  const seen = async (loc) => (await loc.count()) && await loc.isVisible().catch(() => false);
  const go = async (hash, ms = 900) => { await p.evaluate(h => { location.hash = h; }, hash); await r.sleep(ms); };
  const point = async (loc, ms = 650) => { if (await seen(loc)) { await r.moveTo(loc, ms); return true; } return false; };
  const press = async (loc, ms = 650) => { if (await seen(loc)) { await r.click(loc, ms); return true; } return false; };
  const top = async () => { await p.evaluate(() => window.scrollTo({ top: 0 })); await r.sleep(300); };
  const sub = async (label) => press(p.locator('.subtabs a, .subtabs button, [role=tablist] a, [role=tablist] button', { hasText: label }).first(), 600);
  return { v, at, seen, go, point, press, top, sub };
}

const CLIPS = [
 { id: 'signup', title: 'Sign up', line: 'Sign in with Google and join De Anza PBL with the code from EBOD.', as: 'new', hash: '',
   run: async (p, r, m) => {
     await r.caption('Open <b>org.deanzapbl.com</b> and choose <b>Sign in with Google</b>, with the email you use for PBL.');
     await m.press(p.locator('[data-act=authDemoGoogle]'), 700); await r.sleep(1400);
     await r.caption('Signed in, but not in a club yet. Pick <b>De Anza PBL</b>…');
     await m.point(p.locator('#authaff'));
     const code = p.locator('input[name=code]');
     if (await m.seen(code)) { await r.type(code, 'PBL2026', 110); }
     await r.caption('…and enter the <b>join code</b> EBOD gives you at the first meeting.');
     await m.press(p.locator('button[type=submit]', { hasText: 'Join' }), 600); await r.sleep(2600);
     await r.caption('You are in. The dashboard opens on your <b>Overview</b>: your week, homework and SFBLC at a glance.', 400);
   } },
 { id: 'overview', title: 'Overview', line: 'Your week, your homework and SFBLC on one page.', hash: 'overview',
   run: async (p, r, m) => {
     await r.caption('<b>Overview</b> is your home page. The top row counts what needs you: homework, the checklist and your inbox.');
     await m.point(m.at('Notices'));
     await r.caption('<b>Notices</b> from EBOD sit at the top until they are old news.');
     await m.point(m.at('Your week'));
     await r.caption('<b>Your week</b> lists the next seven days: meetings, SFBLC and due dates, with the room.');
     await r.scroll(420);
     await m.point(m.at('Your SFBLC team'));
     await r.caption('Your <b>SFBLC team</b> and your <b>Homework</b>, each with a <b>Hand in</b> button.');
     await r.scroll(420);
     await m.point(m.at('Your checklist'));
     await r.caption('Tick off your <b>SFBLC checklist</b> here. Your <b>Org</b> and the <b>Quick links</b> are below.', 300);
   } },
 { id: 'calendar', title: 'Calendar', line: 'Meetings, SFBLC and due dates, month by month.', hash: 'calendar',
   run: async (p, r, m) => {
     await r.caption('The <b>Calendar</b> shows the month: chapter meetings, SFBLC and homework due dates.');
     const day = p.locator('[data-act=calDay]').filter({ hasText: /\S{4,}/ }).first();
     if (await m.press(day, 700)) await r.sleep(900);
     await r.caption('Tap a day to see what is on and where.');
     await m.press(m.at('Whole month'), 600); await r.sleep(600);
     await m.point(m.at('Coming up this month'));
     await r.caption('<b>Coming up this month</b> lists everything in order, colour-coded by kind.');
     await r.scroll(500);
     await r.caption('Use the arrows to move between months, or <b>Today</b> to come back.', 300);
   } },
 { id: 'links', title: 'Links', line: 'Every link the chapter uses, in one place.', hash: 'links',
   run: async (p, r, m) => {
     await r.caption('<b>Links</b> keeps the Discord, forms, folders and calendars together, grouped by what they are for.');
     await m.point(m.at('Most used'));
     await r.caption('<b>Most used</b> is first: the Discord server and the attendance ticket.');
     await m.press(p.locator('[data-act=lkCopy]').first(), 600);
     await r.caption('<b>Copy</b> puts a link on your clipboard to paste anywhere.');
     await r.scroll(400);
     await r.caption('Below: orientation, meetings, homework folders, community and dues.', 300);
   } },
 { id: 'inbox', title: 'Inbox', line: 'Messages from EBOD and the automatic reminders.', hash: 'messages',
   run: async (p, r, m) => {
     await r.caption('Your <b>Inbox</b> has every message EBOD sends you, newest first.');
     await m.point(p.locator('#view .msg, #view li').first());
     await r.caption('Some are <b>automatic</b>: your SFBLC team, schedule reminders, checklist deadlines.');
     await m.point(m.at('phone notifications'));
     await r.caption('Turn on <b>phone notifications</b> under Profile so they reach you right away.', 300);
   } },
 { id: 'ebod', title: 'EBOD', line: 'Who is on the board, and who to ask for what.', hash: 'board',
   run: async (p, r, m) => {
     await r.caption('<b>EBOD</b> starts with your own contact: the officer for your Org.');
     await m.point(m.at('Your Org contact'));
     await r.caption('Every board member and director, with their position.');
     await r.scroll(450);
     await m.point(m.at('Who to ask'));
     await r.caption('<b>Who to ask</b>: extensions go to the President 3+ days ahead; can’t make it, an attendance ticket 3+ hours ahead.', 400);
   } },
 { id: 'orgchart', title: 'Org chart', line: 'Who does what in the chapter.', hash: 'orgchart',
   run: async (p, r, m) => {
     await r.caption('The <b>Org chart</b> shows the whole chapter: the board, Org leads, client team PMs and SFBLC teams.');
     const who = p.locator('[data-act=rlWho]').nth(1);
     if (await m.press(who, 700)) { await r.sleep(1100); await r.caption('Press a name to open their card.'); await p.keyboard.press('Escape'); await r.sleep(500); }
     await m.press(p.locator('[data-act=rlAll]', { hasText: 'Expand all' }), 600); await r.sleep(800);
     await r.caption('<b>Expand all</b> opens every branch; the zoom buttons fit it to your screen.', 300);
   } },
 { id: 'orgs', title: 'Orgs', line: 'Your Org of 8 to 10 members, and the other five.', hash: 'orgs',
   run: async (p, r, m) => {
     await r.caption('<b>Orgs</b>: six Orgs of 8 to 10 members, each with one EBOD contact.');
     await m.point(m.at('Your Org'));
     await r.caption('Yours comes first, with its cups and how often its members hand homework in on time.');
     const org = p.locator('[data-act=org]').first();
     if (await m.press(org, 700)) { await r.sleep(1100); await r.caption('Open an Org to see who is in it.'); await r.scroll(380); await r.sleep(600); }
     await r.caption('Everyone in an Org earns its cups together.', 300);
   } },
 { id: 'homework', title: 'Homework', line: 'Hand in a file or a link before the due date.', hash: 'homework',
   run: async (p, r, m) => {
     await r.caption('<b>Homework</b> lists what is yours, soonest due first, with the brief from EBOD.');
     await m.point(m.at('Due'));
     await r.caption('Each one says when it is due, or how long ago it was.');
     await m.point(p.locator('#view').getByText('Choose a file').first());
     await r.caption('<b>Choose a file</b> (PDF, document, slides) or paste a link, then <b>Hand in</b>.');
     await m.point(p.locator('[data-act=extAsk]').first());
     await r.caption('Need more time? <b>Ask for an extension</b> three or more days before it is due.', 300);
   } },
 { id: 'cup', title: 'Org Cup', line: 'Cups your Org earns together. Nobody is ranked.', hash: 'cup',
   run: async (p, r, m) => {
     await r.caption('The <b>Org Cup</b> is the Orgs’ race, not a ranking of members.');
     await m.point(m.at('Your Org'));
     await r.caption('An Org earns a cup each time <b>80%</b> of its members hand an assignment in on time.');
     await r.scroll(380);
     await m.point(m.at('Awarded by EBOD'));
     await r.caption('EBOD awards cups too, for things like winning the mock case stations.', 300);
   } },
 { id: 'sfblc', title: 'SFBLC', line: 'The schedule, your coaching, the checklist and what to know, Nov 13–15.', hash: 'sfblc/schedule',
   run: async (p, r, m) => {
     await r.caption('<b>SFBLC</b> has everything for the conference. <b>Schedule</b> is the cue sheet, a card per day.');
     await m.press(p.locator('[data-act=mine][data-v="1"]'), 600); await r.sleep(600);
     await r.caption('<b>Mine</b> shows only what is for you, including your team’s competition slot.');
     await m.press(p.locator('[data-act=mine][data-v="0"]'), 600); await r.sleep(500);
     await m.go('sfblc/coaching');
     await m.point(m.at('Yours'));
     await r.caption('<b>Coaching</b>: when and where your team is coached, and by whom. Yours is marked.');
     await m.go('sfblc/checklist');
     await m.point(m.at('Liability form'));
     await r.caption('The <b>Checklist</b>: the liability form, GroupMe, Life360 and what to pack. Tick each off.');
     await m.press(p.locator('[data-act=tick]').nth(1), 600); await r.sleep(700);
     await m.go('sfblc/about');
     await r.caption('<b>About</b> has the conference, its links and the rubric for each event.');
     await m.point(m.at('Need to know')); await r.scroll(360);
     await r.caption('<b>Need to know</b>: curfew, buddy system, dress code, budget and the walking-radius map.', 300);
   } },
 { id: 'carpools', title: 'Carpools', line: 'Offer a ride or find one to Emeryville.', hash: 'sfblc/rides',
   run: async (p, r, m) => {
     await r.caption('<b>Carpools</b> starts with your answers: driving, riding, or getting there your own way.');
     await m.point(m.at('Your carpool form'));
     await r.scroll(500);
     await m.point(m.at('Cars'));
     await r.caption('<b>Cars</b> shows every driver, their seats and where they start.');
     await m.point(m.at('Your ride'));
     await r.caption('<b>Your ride</b> shows your car. Phone numbers and addresses are shared only with officers and your car.', 300);
   } },
 { id: 'teams', title: 'Competition teams', line: 'Your SFBLC team, and your event choices.', hash: 'teams/team',
   run: async (p, r, m) => {
     await r.caption('<b>Competition teams</b> opens on <b>Your team</b>: your event and your teammates.');
     await m.point(m.at('Every SFBLC team'));
     await r.caption('Below it, every SFBLC team in the chapter, by event.');
     await m.go('teams/choices');
     await r.caption('<b>Your choices</b>: rank the events you want and pick who you would like to room with.');
     await m.point(p.locator('#view').getByRole('button', { name: /Update my choices|Send my choices/ }).first());
     await r.caption('EBOD forms the teams and the rooms from these answers.', 300);
   } },
 { id: 'consulting', title: 'Client teams', line: 'Your consulting client team, its PMs and initiatives.', hash: 'consulting',
   run: async (p, r, m) => {
     await r.caption('<b>Client teams</b> is the consulting track: student analysts working for real Bay Area organizations.');
     await r.caption('Your team is first, with its two PMs, its stage and who works on which initiative.');
     await m.point(m.at('Reach your team'));
     await r.caption('<b>Copy names</b> or <b>Start an email</b> to reach your teammates.');
     await m.point(m.at('Your client ranking'));
     await r.caption('Rank the clients you most want to work with, then <b>Send my client ranking</b>.', 300);
   } },
 { id: 'members', title: 'Internal Members', line: 'Everyone in the chapter, and how to find them.', hash: 'members',
   run: async (p, r, m) => {
     await r.caption('<b>Internal Members</b> lists everyone in the chapter.');
     await m.press(p.locator('[data-act=toggleFilters]'), 600); await r.sleep(500);
     await r.caption('<b>Filter by tag</b>: your event, your Org, the consulting PMs, who is going to SFBLC.');
     const tag = p.locator('#view button', { hasText: 'Finance' }).first();
     if (await m.press(tag, 600)) { await r.sleep(700); await r.caption('Pick one to see just those people.'); }
     await r.caption('Members see names, Orgs and teams. Personality types, points and notes stay private.', 300);
   } },
 { id: 'profile', title: 'Profile', line: 'Your details, notifications and commitment log.', hash: 'profile',
   run: async (p, r, m) => {
     await r.caption('<b>Profile</b> is your own page: your Org, teams and positions at the top.');
     await m.point(m.at('Your details'));
     await r.caption('Keep <b>Your details</b> up to date. You can read them back from the sign-up form.');
     await m.point(m.at('Phone notifications'));
     await r.caption('<b>Phone notifications</b>: turn them on to get EBOD’s messages and reminders.');
     await m.point(m.at('Commitment log'));
     await r.caption('Your <b>commitment log</b> is private to you and EBOD, not a ranking.');
     await m.point(m.at('Look and comfort'));
     await r.caption('Change the theme, text size and motion under <b>Look and comfort</b>.', 300);
   } },
];

if (require.main === module) (async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  const list = CLIPS.filter(c => !ONLY.length || ONLY.includes(c.id));
  for (const [i, c] of list.entries()) {
    const n = ONLY.length ? '' : (i + 1) + ' of ' + list.length;
    const dir = path.join(OUT, c.id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(path.join(dir, 'f'), { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: 'light',
      permissions: ['clipboard-read', 'clipboard-write'] });
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
    await page.goto(`${BASE}/?demo&as=${c.as || 'member'}${c.hash ? '#' + c.hash : ''}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    // the demo's banner and the onboarding sheets are not part of any section
    await page.addStyleTag({ content: '.demobar,#demobar{display:none!important}' });
    for (const sel of ['[data-act=closeSheet]', '.sheetx']) if (await page.isVisible(sel).catch(() => false)) await page.click(sel).catch(() => {});
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1 });
    await page.evaluate(([n, t, l]) => window.__cardShow(n, t, l), [n || 'Member side', c.title, c.line]);
    const now = () => Date.now() / 1000, start = now();
    await page.mouse.move(W / 2, H / 2);
    await page.waitForTimeout(2600);
    await page.evaluate(() => window.__cardHide()); await page.waitForTimeout(600);
    let ok = true;
    try { await c.run(page, r, m); } catch (e) { ok = false; console.log('FAIL', c.id, String(e).split('\n')[0]); await page.screenshot({ path: path.join(dir, 'fail.png') }); }
    await r.say(''); await page.waitForTimeout(700);
    const end = now();
    await cdp.send('Page.stopScreencast').catch(() => {});
    await ctx.close();
    const keep = frames.filter(f => f.t <= end);
    let txt = 'ffconcat version 1.0\n';
    keep.forEach((f, k) => {
      const next = k + 1 < keep.length ? keep[k + 1].t : end;
      const from = Math.max(f.t, start), to = Math.max(from, next);
      if (to - from <= 0 && k + 1 < keep.length) return;
      txt += `file '${path.basename(f.file)}'\nduration ${(to - from).toFixed(4)}\n`;
    });
    if (keep.length) txt += `file '${path.basename(keep[keep.length - 1].file)}'\n`;
    fs.writeFileSync(path.join(dir, 'f', 'list.txt'), txt);
    fs.writeFileSync(path.join(dir, 'marks.json'), JSON.stringify({ start, end, ok, frames: keep.length }));
    console.log(c.id, ok ? 'ok' : 'FAILED', (end - start).toFixed(1) + 's', keep.length + ' frames');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
module.exports = { CLIPS, more };
