// Records one short captioned demo clip per member-facing section of the Org System.
// Usage: node clips.js <outdir> [clipId ...]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const OUT = process.argv[2]; const ONLY = process.argv.slice(3);
const EXE = fs.readFileSync(path.join(__dirname, 'exe.txt'), 'utf8').trim();
const BASE = 'http://127.0.0.1:8791';
const W = 1280, H = 800;

const INIT = `
(() => {
  const css = document.createElement('style');
  css.textContent = \`
    #demobar{display:none!important}
    #__cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-2px,-2px);filter:drop-shadow(0 1px 2px rgba(0,0,0,.4));transition:transform .08s}
    #__cap{position:fixed;left:50%;bottom:34px;transform:translate(-50%,8px);max-width:880px;z-index:2147483646;pointer-events:none;
      background:rgba(20,20,18,.88);color:#fff;font:500 21px/1.35 -apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif;
      padding:14px 24px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;transition:opacity .35s,transform .35s;text-align:center}
    #__cap.on{opacity:1;transform:translate(-50%,0)}
    #__cap b{color:#f3c9c4;font-weight:600}
    #__card{position:fixed;inset:0;z-index:2147483645;pointer-events:none;background:#efeee9;display:flex;align-items:center;justify-content:center;transition:opacity .45s;
      background-image:linear-gradient(rgba(0,0,0,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.045) 1px,transparent 1px);background-size:30px 30px}
    #__card .c{width:860px;padding:52px 60px;background:#f7f6f2;border:1px solid #d9d7d0;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.08);font-family:-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1b1b1b}
    #__card .e{font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:#6b6b66;margin-bottom:18px}
    #__card h1{font-size:62px;line-height:1.02;margin:0 0 18px;font-weight:600;letter-spacing:-.02em}
    #__card p{font-size:24px;line-height:1.4;margin:0;color:#3a3a37}
    #__card .n{display:inline-block;margin-top:26px;background:#7a1f1b;color:#fff;border-radius:999px;padding:7px 16px;font-size:15px;letter-spacing:.06em}
  \`;
  const c = document.createElement('div'); c.id = '__cur';
  c.innerHTML = '<svg width="24" height="28" viewBox="0 0 26 30"><path d="M2 2 L2 24 L8 18 L12 28 L16 26 L12 17 L20 17 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const cap = document.createElement('div'); cap.id = '__cap';
  const add = () => { document.head.appendChild(css); document.body.appendChild(c); document.body.appendChild(cap); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', add) : add();
  window.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  window.addEventListener('mousedown', () => { c.style.transform = 'translate(-2px,-2px) scale(.85)'; }, true);
  window.addEventListener('mouseup', () => { c.style.transform = 'translate(-2px,-2px) scale(1)'; }, true);
  window.__caption = (html) => { cap.classList.remove('on'); setTimeout(() => { cap.innerHTML = html; if (html) cap.classList.add('on'); }, html ? 180 : 0); };
  window.__cardShow = (n, title, line) => { let k = document.getElementById('__card'); if (!k) { k = document.createElement('div'); k.id = '__card'; document.body.appendChild(k); }
    k.innerHTML = '<div class="c"><div class="e">De Anza PBL · The Org System · for members</div><h1>' + title + '</h1><p>' + line + '</p><span class="n">' + n + '</span></div>'; k.style.opacity = '1'; };
  window.__cardHide = () => { const k = document.getElementById('__card'); if (k) { k.style.opacity = '0'; setTimeout(() => k.remove(), 500); } };
})();`;

function rig(page) {
  let cur = { x: W / 2, y: H / 2 };
  const sleep = ms => page.waitForTimeout(ms);
  async function glide(x, y, ms = 600) { const steps = Math.max(10, Math.round(ms / 16)); for (let i = 1; i <= steps; i++) { const k = i / steps, e = k < .5 ? 2 * k * k : -1 + (4 - 2 * k) * k; await page.mouse.move(cur.x + (x - cur.x) * e, cur.y + (y - cur.y) * e); await sleep(ms / steps); } cur = { x, y }; }
  async function into(loc) { await loc.scrollIntoViewIfNeeded({ timeout: 4000 }); await sleep(250); }
  async function moveTo(loc, ms) { await into(loc); const b = await loc.boundingBox(); if (!b) throw new Error('no box'); await glide(b.x + Math.min(b.width / 2, 140), b.y + b.height / 2, ms); }
  async function click(loc, ms = 600) { await moveTo(loc, ms); await sleep(140); await page.mouse.down(); await sleep(90); await page.mouse.up(); await sleep(250); }
  async function type(loc, text, delay = 45) { await click(loc, 500); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A'); await page.keyboard.type(text, { delay }); await sleep(250); }
  // the app draws its own listbox over each <select>
  async function pick(selectId, optionText) {
    const btn = page.locator(`#${selectId} + .selbtn, #${selectId} ~ .selbtn`).first();
    const wrapBtn = (await btn.count()) ? btn : page.locator(`.selwrap:has(#${selectId}) .selbtn`).first();
    await click(wrapBtn, 550); await sleep(300);
    const opt = page.locator(`.selwrap:has(#${selectId}) [role="option"]`, { hasText: optionText }).first();
    if (await opt.isVisible().catch(() => false)) await click(opt, 400);
    else { await page.keyboard.press('Escape'); await page.selectOption('#' + selectId, { label: optionText }); }
    await sleep(300);
  }
  const say = async (html, ms) => { await page.evaluate(h => window.__caption(h), html); if (ms) await sleep(ms); };
  const read = html => Math.max(2300, Math.round(String(html).replace(/<[^>]+>/g, '').split(/\s+/).length * 330));
  async function caption(html, extra = 0) { await say(html); await sleep(read(html) + extra); }
  const tab = async (label) => { await click(page.locator('#nav button', { hasText: label }).first(), 650); await sleep(700); };
  const scroll = async (dy, ms = 900) => { await page.mouse.wheel(0, dy); await sleep(ms); };
  return { sleep, glide, moveTo, click, type, pick, say, caption, tab, scroll, into };
}

const CLIPS = [
 { id: 'signup', n: '1 of 8', title: 'Sign up', line: 'Create your account, join De Anza PBL and fill in the sign-up form.', as: 'new',
   run: async (p, r) => {
     await r.caption('Open the Org System and choose <b>Sign up with Google</b>, using your own email.');
     await r.click(p.getByRole('button', { name: /Sign up with Google/ })); await r.sleep(1300);
     const join = p.getByRole('button', { name: /Join this club/ }); await join.waitFor({ state: 'visible', timeout: 10000 });
     await r.say('Pick <b>De Anza PBL</b> and enter the join code EBOD gives you.');
     const code = p.locator('#jn-code'); if (await code.isVisible().catch(() => false)) await r.moveTo(code, 700);
     await r.sleep(2600); await r.click(join); await r.sleep(1500);
     await r.say('The <b>sign-up form</b> opens first. Your name and email are filled in for you.', 0); await r.sleep(2800);
     const nm = p.locator('#ff_0'); if ((await nm.inputValue()) === '') await r.type(nm, 'Jordan Rivera');
     await r.say('Choose your year and the track you are most interested in.');
     await r.click(p.locator('input[name="ff_2"][value="1st year"]')); await r.click(p.locator('input[name="ff_3"][value="Case competition (FLC)"]'));
     await r.sleep(900);
     await r.say('Add your MBTI type and when you are usually free.');
     await r.type(p.locator('#ff_4'), 'ENFP'); await r.click(p.locator('input[name="ff_5"][value="Tue/Thu evenings"]'));
     await r.click(p.locator('input[name="ff_5"][value="Weekends"]')); await r.sleep(900);
     await r.say('Press <b>Submit to the club</b>. EBOD uses these answers to place you in an Org.');
     await r.moveTo(p.locator('#formsubmit'), 700); await r.sleep(2400); await r.click(p.locator('#formsubmit')); await r.sleep(1500);
     if (await p.isVisible('#tourskip').catch(() => false)) { await r.caption('A short tour opens the first time. You can replay these clips any time.'); }
   } },
 { id: 'orgs', n: '2 of 8', title: 'Orgs', line: 'Your family in the chapter: who is in it and who to ask.', as: 'member', tab: 'Orgs',
   run: async (p, r) => {
     await r.caption('<b>Orgs</b> shows your Org: 8 to 10 members, a mix of 1st and 2nd years.');
     await r.moveTo(p.locator('#teampick button', { hasText: 'yours' }).first(), 700);
     await r.caption('Your Org is marked <b>yours</b>. You can look at the other Orgs too.');
     await r.moveTo(p.locator('#v-teams').getByText('EBOD contact', { exact: false }).first(), 700);
     await r.caption('Each Org has one <b>EBOD contact</b>, the officer to go to with questions.');
     await r.scroll(380);
     await r.caption('Below is everyone in your Org, with their year, track and team.');
     await r.scroll(-380, 600);
   } },
 { id: 'teams', n: '3 of 8', title: 'Teams', line: 'Your consulting client team, your FLC team, and forming your own.', as: 'member', tab: 'Teams',
   run: async (p, r) => {
     const mine = p.locator('#squadbody .squad.mine').first();
     if (await mine.count()) { await r.into(mine); await r.moveTo(mine, 700); }
     await r.caption('<b>Teams</b> shows the teams you are on, marked <b>your team</b>: a consulting client team, and an FLC team if you compete.');
     await r.caption('Consulting teams list the two PMs and your initiative.');
     const form = p.locator('#myteamreq'); await r.into(form); await r.moveTo(p.locator('#myteamreq h2'), 600);
     await r.caption('Already know who you want to work with? <b>Form your own team</b>.');
     await r.pick('rq-target', 'Marketing');
     await r.type(p.locator('#rq-name'), 'Market Movers');
     const names = await p.$$eval('#rq-names option', os => os.map(o => o.value));
     await r.type(p.locator('#rq-mem'), names.slice(2, 4).join(', '), 30);
     await r.say('Pick the event, client or track, name the team and list your teammates.'); await r.sleep(2600);
     await r.click(p.locator('#rq-send')); await r.sleep(900);
     await r.caption('It goes to EBOD for review. You see <b>Waiting</b>, <b>Approved</b>, or a note if they send it back.', 400);
   } },
 { id: 'flc', n: '4 of 8', title: 'FLC choices and hotel', line: 'Rank your FLC events and ask for a hotel bed for Nov 13–15.', as: 'member', tab: 'Teams',
   run: async (p, r) => {
     const box = p.locator('#myprefs'); await r.into(box); await r.moveTo(p.locator('#myprefs h2'), 600);
     await r.caption('Competing at <b>FLC</b> (Nov 13–15, Emeryville)? Rank the events you want.');
     await r.pick('mp-flc0', 'Marketing'); await r.pick('mp-flc1', 'Management'); await r.pick('mp-flc2', 'Finance');
     await r.type(p.locator('#mp-mate'), 'Priya Nguyen');
     await r.caption('Name a teammate if you have one, and confirm you can be there.');
     const hotel = p.locator('#mp-hotel'); if (!(await hotel.isChecked())) await r.click(hotel);
     await r.sleep(500);
     await r.say('Need a bed? Tick it, choose a <b>rooming group</b> and name up to three roommates.');
     await r.pick('mp-group', 'All-gender room');
     await r.type(p.locator('#mp-roomies'), 'Priya Nguyen, Marcus Vu', 35); await r.sleep(800);
     await r.caption('Anything EBOD should know for rooming goes in the note. Only officers see it.');
     await r.click(p.locator('#mp-save')); await r.sleep(900);
     await r.caption('Press <b>Send my choices</b>. Your room shows up here once EBOD has set it.', 400);
   } },
 { id: 'cup', n: '5 of 8', title: 'Org Cup', line: 'Cups your Org earns together. Nobody is ranked.', as: 'member', tab: 'Org Cup',
   run: async (p, r) => {
     await r.caption('The <b>Org Cup</b> is earned together, not by individuals.');
     const mine = p.locator('#v-cup').getByText('yours', { exact: false }).first();
     if (await mine.count()) await r.moveTo(mine, 700);
     await r.caption('Your Org gets a cup each time <b>80%</b> of its members hand an assignment in on time.');
     await r.scroll(300);
     await r.caption('EBOD can award cups too, for things like full turnout or a mock case win.');
     await r.caption('There is no leaderboard. Your own commitment points stay private on your profile.');
   } },
 { id: 'calendar', n: '6 of 8', title: 'Calendar', line: 'The season, one-click adds, and the org calendar for your phone.', as: 'member', tab: 'Calendar',
   run: async (p, r) => {
     await r.caption('The <b>Calendar</b> already has the season: orientation, bootcamps, mock cases, FLC and finals.');
     const day = p.locator('.calcell[data-day="2026-10-15"]'); if (await day.count()) { await r.click(day); await r.sleep(800); }
     const add = p.locator('#dayview .evadd').first();
     if (await add.count()) await r.moveTo(add, 700);
     await r.caption('Click a day to see what is on. <b>+ Calendar</b> adds one event to your own calendar.');
     await r.click(p.locator('#cal-list')); await r.sleep(900);
     await r.caption('<b>List</b> shows everything coming up in order.');
     await r.moveTo(p.locator('#cal-join'), 700);
     await r.caption('<b>Add the org calendar</b> subscribes you to the chapter calendar, so new events show up on your phone.');
     await r.click(p.locator('#cal-copy')); await r.sleep(600);
     await r.caption('<b>Copy link</b> to add it in Apple or Outlook calendars, or share it.', 300);
   } },
 { id: 'homework', n: '7 of 8', title: 'Homework', line: 'Hand in a file or a link before the due date.', as: 'member', tab: 'Homework',
   run: async (p, r) => {
     await r.caption('<b>Homework</b> lists every assignment, soonest due first, with the brief from EBOD.');
     const card = p.locator('#v-work .hwurl').nth(1).count().then(c => c ? p.locator('#v-work .hwurl').nth(1) : p.locator('#v-work .hwurl').first());
     const url = await card;
     await r.into(url);
     await r.caption('Upload a file, or paste a shared link to a Google Doc or Slides.');
     await r.type(url, 'https://docs.google.com/document/d/mock-case-brief', 28);
     const btn = p.locator('#v-work .hwsendlink').nth(await p.locator('#v-work .hwurl').count() > 1 ? 1 : 0);
     await r.click(btn); await r.sleep(1200);
     await r.caption('Handing in again replaces your earlier version. Your first on-time hand-in still counts.', 300);
   } },
 { id: 'profile', n: '8 of 8', title: 'Profile', line: 'Your details, your commitment log and what others can see.', as: 'member', tab: 'Profile',
   run: async (p, r) => {
     await r.caption('<b>Profile</b> is your own page: your Org, your teams and your commitment log.');
     await r.scroll(420);
     await r.caption('The <b>commitment log</b> and trophy case are a private record for you, not a ranking.');
     const about = p.locator('#me-about'); await r.into(about);
     await r.caption('Keep <b>Your details</b> up to date: track, MBTI, birthday and anything EBOD should know.');
     await r.type(about, 'Free Tue/Thu after 5. Happy to help with tabling.', 30);
     await r.click(p.locator('#me-save')); await r.sleep(900);
     await r.scroll(500);
     await r.caption('<b>What others can see</b> shows exactly what other members see about you.', 300);
   } },
 { id: 'assistant', n: 'Extra', title: 'Assistant', line: 'Ask about dates, your Org or how anything works.', as: 'member', tab: 'Calendar',
   run: async (p, r) => {
     await r.click(p.locator('#chatbtn')); await r.sleep(900);
     await r.caption('The <b>Assistant</b> button opens a helper that answers from the club’s own data.');
     const chip = async (t) => { const c = p.locator('#chatwrap button, .chatpanel button, button', { hasText: t }).first(); await r.click(c, 600); await r.sleep(2400); };
     await r.say('Tap a suggestion, like <b>What is my team?</b>'); await chip('What is my team?');
     await r.sleep(1200);
     await r.say('Or ask where every Org stands on <b>Org Cups</b>.'); await chip('How do Org Cups work?');
     await r.sleep(1400);
     await r.caption('It knows your Orgs, members, teams and the Cup. For anything else, ask your EBOD contact.', 300);
   } },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  for (const c of CLIPS) {
    if (ONLY.length && !ONLY.includes(c.id)) continue;
    const dir = path.join(OUT, c.id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: 'light',
      recordVideo: { dir, size: { width: W, height: H } }, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.addInitScript(INIT);
    await ctx.addInitScript(() => { try { localStorage.setItem('orgsystem.theme', 'light'); localStorage.setItem('orgsystem.tourDone', '1'); } catch (e) {} });
    const page = await ctx.newPage(); const t0 = Date.now(); const r = rig(page);
    const now = () => (Date.now() - t0) / 1000;
    await page.goto(`${BASE}/demo?as=${c.as}`, { waitUntil: 'networkidle' });
    await page.evaluate(([n, t, l]) => window.__cardShow(n, t, l), [c.n, c.title, c.line]);
    const start = now();
    await page.waitForTimeout(400);
    if (await page.isVisible('#tourskip').catch(() => false)) await page.click('#tourskip');
    if (c.tab) { await page.locator('#nav button', { hasText: c.tab }).first().click(); }
    await page.mouse.move(W / 2, H / 2);
    await page.waitForTimeout(2200);
    await page.evaluate(() => window.__cardHide()); await page.waitForTimeout(600);
    let ok = true;
    try { await c.run(page, r); } catch (e) { ok = false; console.log('FAIL', c.id, String(e).split('\n')[0]); await page.screenshot({ path: path.join(dir, 'fail.png') }); }
    await r.say(''); await page.waitForTimeout(700);
    const end = now();
    const v = await page.video().path(); await ctx.close();
    fs.renameSync(v, path.join(dir, 'raw.webm'));
    fs.writeFileSync(path.join(dir, 'marks.json'), JSON.stringify({ start, end, ok }));
    console.log(c.id, ok ? 'ok' : 'FAILED', (end - start).toFixed(1) + 's');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
