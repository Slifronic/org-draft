/* Member self-service: the sign-up form gate, the home-screen step and tour, the full profile, passwords, phone notifications and the member's Drive folder. */
'use strict';

/* What this file keeps between renders. step is the first-run step a member
   still owes ('form', then 'home'), or null. */
var OB = {
  step: null, wanted: '',
  form: {schema: null, loading: false, err: '', vals: {}, miss: {}, sending: false},
  prof: null, profAsked: false, pulling: false,
  push: {checked: false, checking: false, sub: null, busy: false, demoOn: false},
  driveAsked: false, tourAt: -1
};
var OB_TOUR_KEY = 'orgsystem.tour', OB_PUSH_SYNC = 'orgsys-pushsync', OB_DEMO_KEY = 'orgsystem.dash.ob.demo';
ICONS.welcome = '<path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4H15l4 4v12z"/><path d="M14.5 4v4.5H19M8.5 13l2.5 2.5 4.5-4.5"/>';
var OB_NAV = {id: 'welcome', label: 'Sign-up form', short: 'Start', group: 'Start here'};

/* ---------- keys, the same ones the classic page keeps ---------- */
function obWho() { return String(M.email || M.me.name || '').toLowerCase(); }
function obFormKey() { return 'orgsys-formdone:' + (M.aff || '') + ':' + obWho(); }
function obHomeKey() { return 'orgsys-homedone:' + (M.aff || '') + ':' + obWho(); }
function obClassicHw(id) { return 'orgsys-hw:' + (M.aff || '') + ':' + obWho() + ':' + id; }
/* Hand-ins sent from the classic page were remembered under its own key, so they still show as in. */
var obDashHandIn = myHandIn;
myHandIn = function (id) { return obDashHandIn(id) || (M ? lsGet(obClassicHw(id)) : null); };

function obLaunchedFromHome() {
  try { return !!(navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)); } catch (e) { return false; }
}
function obPhone() {
  var ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return /Android/i.test(ua) ? 'android' : 'computer';
}
/* The demo plays a brand-new member with ?demo&as=member&onboard. */
function obDemoState() { try { return JSON.parse(sessionStorage.getItem(OB_DEMO_KEY) || '{}') || {}; } catch (e) { return {}; } }
function obDemoSet(k) { var s = obDemoState(); s[k] = 1; try { sessionStorage.setItem(OB_DEMO_KEY, JSON.stringify(s)); } catch (e) {} }
function obDemoNew() { return /[?&]onboard(=|&|$)/.test(location.search) || Demo.as === 'new'; }
document.addEventListener('click', function (e) {
  if (e.target.closest && e.target.closest('[data-act="resetDemo"]')) try { sessionStorage.removeItem(OB_DEMO_KEY); } catch (x) {}
}, true);

/* ---------- the first-run gate ----------
   The form is what puts a member on the roster, so a member whose club has
   one sees nothing else until it is sent; then the home-screen step. Officers
   are never held, and a club with no form linked holds nobody. This is a
   page-level gate: the backend still decides what each account may read. */
function obFormOwed() {
  if (!M || M.officer) return false;
  if (M.demo) return obDemoNew() && !obDemoState().form;
  if (!M.cfg.formUrl) return false;
  if (lsGet(obFormKey()) === '1') return false;
  var me = (RAW.all && RAW.all.me) || {}, a = RAW.profile && RAW.profile.answers;
  if (me.formSent || (a && (a.at || a.year || a.track || a.mbti))) { lsSet(obFormKey(), '1'); return false; }
  return true;
}
function obHomeOwed() {
  if (!M || M.officer || obFormOwed()) return false;
  if (M.demo) return obDemoNew() && !obDemoState().home;
  if (obLaunchedFromHome()) { lsSet(obHomeKey(), '1'); return false; }
  return lsGet(obHomeKey()) !== '1';
}
function obApply() {
  OB.step = obFormOwed() ? 'form' : obHomeOwed() ? 'home' : null;
  var i = NAV.indexOf(OB_NAV);
  if (OB.step && i < 0) NAV.unshift(OB_NAV);
  if (!OB.step && i > -1) NAV.splice(i, 1);
  OB_NAV.label = OB.step === 'home' ? 'Home screen' : 'Sign-up form';
  document.body.classList.toggle('obgate', !!OB.step);
}
/* Registered before app.js's own listener, so the address is already back on
   the step when the app routes; where they were heading is kept for later. */
window.addEventListener('hashchange', function () {
  if (!OB.step || !M) return;
  if (/^#?welcome\b/.test(location.hash)) return;
  OB.wanted = location.hash;
  history.replaceState(null, '', location.pathname + location.search + '#welcome');
  toast(OB.step === 'form' ? 'Send the sign-up form first. Everything else opens as soon as it is in.' : 'Add it to your home screen first, then press Done.');
});
function obLift() {
  obApply();
  if (OB.step) { if (ROUTE.view === 'welcome') render(true); else location.hash = '#welcome'; return; }
  var want = OB.wanted; OB.wanted = '';
  if (!want || /^#?welcome\b/.test(want)) want = '#overview';
  if (location.hash === want) route(); else location.hash = want;
  obMaybeTour(true);
}

VIEWS.welcome = function () {
  if (OB.step === 'home') return obHomeStep(true);
  if (OB.step !== 'form') return empty('You are all set', 'Nothing is waiting for you here.', '<a class="btn" href="#overview">Go to the overview</a>');
  var F = OB.form;
  if (!F.schema && !F.loading && !F.err) obLoadForm();
  var h = '<section class="card obform"><header><div><p class="tag">Step 1 of 2</p><h3>' + esc(F.schema ? F.schema.title : 'The club\'s sign-up form') + '</h3></div></header>' +
    '<p class="lede">Fill this in first: it puts you on the roster, and EBOD forms Orgs and teams from these answers. The rest of the dashboard opens as soon as it is sent. Your name and email are already in.</p>';
  if (F.err) {
    var link = safeUrl(M.cfg.formUrl);
    return h + '<p class="note warn">' + esc(F.err) + '</p><div class="rowacts">' +
      (link ? '<a class="btn sm" href="' + esc(link) + '" target="_blank" rel="noopener">' + icon('arrow') + 'Open it on Google</a>' : '') +
      '<button class="btn sm ghost" data-act="obRecheck">I sent it there, check again</button><button class="btn sm ghost" data-act="obReload">Try loading it again</button></div></section>';
  }
  if (!F.schema) return h + '<div class="loading"><span></span><span></span><span></span></div></section>';
  return h + '<form class="form" data-act="obForm" novalidate>' + F.schema.fields.map(obField).join('') +
    '<div class="sendrow"><button class="btn"' + (F.sending ? ' disabled' : '') + '>' + icon('send') + (F.sending ? 'Sending…' : 'Send my answers') + '</button></div></form></section>';
};
function obField(f, i) {
  var id = 'ff_' + i, v = OB.form.vals[id], miss = OB.form.miss[id] ? ' miss' : '';
  var req = f.required ? '<b class="req" title="Required">*</b>' : '';
  var test = safeUrl(M.cfg.mbtiTestUrl);
  var hint = /mbti|personality|four letters/i.test(f.label) && test ? '<small class="cc">Need your four letters? <a href="' + esc(test) + '" target="_blank" rel="noopener">Take the test</a></small>' : '';
  if (f.type === 2 || f.type === 4) {
    return '<fieldset class="fld obset' + miss + '"><legend>' + esc(f.label) + req + '</legend><div class="obopts">' + (f.options || []).map(function (o) {
      var on = f.type === 4 ? (v || []).indexOf(o) > -1 : v === o;
      return '<label class="tick"><input type="' + (f.type === 4 ? 'checkbox' : 'radio') + '" name="' + id + '" value="' + esc(o) + '"' + (on ? ' checked' : '') + '><span>' + esc(o) + '</span></label>';
    }).join('') + '</div>' + hint + '</fieldset>';
  }
  var ctl = f.type === 3 ? '<select id="' + id + '" name="' + id + '"><option value="">Choose…</option>' + (f.options || []).map(function (o) { return '<option' + (v === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>'
    : f.type === 1 ? '<textarea id="' + id + '" name="' + id + '" rows="3" maxlength="3000">' + esc(v || '') + '</textarea>'
    : '<input id="' + id + '" name="' + id + '" maxlength="500" value="' + esc(v || '') + '"' + (/e-?mail/i.test(f.label) ? ' type="email" autocomplete="email"' : '') + '>';
  return '<div class="fld' + miss + '"><label for="' + id + '" class="obl">' + esc(f.label) + req + '</label>' + ctl + hint + '</div>';
}
function obLoadForm() {
  var F = OB.form; F.loading = true; F.err = '';
  call('formSchema', {formUrl: M.cfg.formUrl || ''}).then(function (r) {
    F.loading = false;
    if (!(r && r.ok && r.fields)) { F.err = (r && r.error) || 'The form could not be loaded here.'; return render(); }
    F.schema = r;
    /* Anything plainly asking for a name or an email is filled in already. */
    var nm = String((RAW.all && RAW.all.name) || M.me.name || '');
    if (nm.indexOf('@') > -1) nm = '';
    var first = nm.split(' ')[0] || '', last = nm.split(' ').slice(1).join(' ');
    r.fields.forEach(function (f, i) {
      var id = 'ff_' + i, L = String(f.label || '').toLowerCase();
      if (F.vals[id] != null || f.type === 2 || f.type === 3 || f.type === 4) return;
      if (/e-?mail/.test(L)) F.vals[id] = M.email || '';
      else if (/first/.test(L) && /name/.test(L)) F.vals[id] = first;
      else if (/last|surname|family/.test(L) && /name/.test(L)) F.vals[id] = last;
      else if (/full name|your name|^name$/.test(L)) F.vals[id] = nm;
    });
    render();
  });
}
/* Typed answers are kept here, so a re-render never loses them. */
function obReadField(el) {
  var f = el.closest && el.closest('form[data-act="obForm"]'); if (!f || !el.name) return;
  if (el.type === 'checkbox') OB.form.vals[el.name] = Array.prototype.filter.call(f.querySelectorAll('input[name="' + el.name + '"]'), function (x) { return x.checked; }).map(function (x) { return x.value; });
  else if (el.type === 'radio') { if (el.checked) OB.form.vals[el.name] = el.value; }
  else OB.form.vals[el.name] = el.value;
  if (OB.form.miss[el.name]) { delete OB.form.miss[el.name]; var b = el.closest('.miss'); if (b) b.classList.remove('miss'); }
}
document.addEventListener('input', function (e) { if (e.target.name) obReadField(e.target); });
document.addEventListener('change', function (e) { if (e.target.name) obReadField(e.target); });

/* Names get their capitals and a personality type is upper-cased before they reach the club's sheet. */
function obCapName(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().replace(/(^|[\s\-'’])(\p{Ll})/gu, function (m, a, b) { return a + b.toUpperCase(); }); }
function obMbti(v) {
  var s = String(v == null ? '' : v).trim(); if (!s) return '';
  var m = s.toUpperCase().replace(/[^A-Z]/g, '').match(/([EI])([SN])([TF])([JP])/);
  return m ? m[0] : s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}
/* The answers the backend files on the account even when the club's response sheet cannot be read back. */
function obSummary(answers) {
  var out = {};
  (OB.form.schema.fields || []).forEach(function (f) {
    var v = answers[f.id]; if (v == null || v === '') return;
    v = Array.isArray(v) ? v.join(', ') : String(v);
    var L = String(f.label || '').toLowerCase();
    if (!out.mbti && /mbti|personality|16 ?personalities|four letters/.test(L)) out.mbti = v;
    else if (!out.year && /\byear\b|tenure|how long/.test(L)) out.year = v;
    else if (!out.track && /track|division|which side|interest/.test(L)) out.track = v;
    else if (!out.avail && /availab|when are you|free time|schedule/.test(L)) out.avail = v;
    else if (!out.notes && /anything|note|comment|else/.test(L)) out.notes = v;
  });
  return out;
}
SUBMIT_EXT.obForm = function (form) {
  var F = OB.form; if (!F.schema || F.sending) return;
  Array.prototype.forEach.call(form.elements, function (el) { if (el.name) obReadField(el); });
  var answers = {}, missing = [];
  F.miss = {};
  F.schema.fields.forEach(function (f, i) {
    var id = 'ff_' + i, v = F.vals[id], L = String(f.label || '').toLowerCase();
    if (f.type === 4) v = v || [];
    else {
      v = String(v || '').trim();
      if (v && f.type === 0 && /mbti|personality|16 ?personalities|four letters/.test(L)) v = obMbti(v);
      else if (v && f.type === 0 && !/e-?mail/.test(L) && /\bname\b|surname/.test(L)) v = obCapName(v);
      F.vals[id] = v;
    }
    if (f.required && !v.length) { missing.push(String(f.label).replace(/[?:.\s]+$/, '')); F.miss[id] = 1; }
    if (v.length) answers[f.id] = v;
  });
  if (missing.length) {
    render();
    var first = document.querySelector('.obform .miss input, .obform .miss select, .obform .miss textarea');
    if (first) { first.scrollIntoView({block: 'center', behavior: reduced() ? 'auto' : 'smooth'}); try { first.focus({preventScroll: true}); } catch (e) {} }
    return toast('Still needed: ' + missing.slice(0, 3).join('; ') + (missing.length > 3 ? ' and ' + (missing.length - 3) + ' more' : '') + '.', true);
  }
  F.sending = true; render();
  call('submitForm', {action: F.schema.action, answers: answers, summary: obSummary(answers)}).then(function (r) {
    if (!(r && r.ok)) { F.sending = false; render(); return toast((r && r.error) || 'That did not send. Check your connection and try again.', true); }
    /* It is in the club's form now, so this device stops asking at once. */
    obFormSent();
    toast('Sent. Reading your answers back…');
    /* Pulling the new row straight back is what files it on the account. */
    call('myFormAnswers').then(function (a) {
      F.sending = false;
      toast(a && a.ok ? 'Sent, and saved to your profile.' : 'Sent. It shows on your profile once the club\'s sheet catches up.');
      obReloadProfile();
      obLift();
    });
  });
};
function obFormSent() {
  if (M.demo) obDemoSet('form'); else lsSet(obFormKey(), '1');
  if (RAW.all) RAW.all.me = Object.assign({}, RAW.all.me || {}, {formSent: true});
  M.me.answered = true;
}
ACT_EXT.obReload = function () { OB.form.err = ''; OB.form.schema = null; render(); };
/* For a form filled in on Google itself: its row in the club's response sheet is the proof. */
ACT_EXT.obRecheck = function (el) {
  el.disabled = true; toast('Looking for your answers…');
  call('myFormAnswers').then(function (a) {
    el.disabled = false;
    if (!(a && a.ok)) return toast((a && a.error) || 'Nothing yet. Give the club\'s sheet a minute and try again.', true);
    obFormSent(); toast('Found them. Welcome in.'); obReloadProfile(); obLift();
  });
};

/* ---------- the home-screen step ---------- */
function obHomeSteps() {
  var host = location.host || 'org.deanzapbl.com', kind = obPhone();
  var ios = '<details class="obplat"' + (kind !== 'android' ? ' open' : '') + '><summary>iPhone (Safari)</summary><ol>' +
    '<li>Open <b>' + esc(host) + '</b> in <b>Safari</b>.</li><li>Tap <b>•••</b> at the bottom, then <b>Share</b>. On older iPhones, Share is right on the toolbar.</li>' +
    '<li>Scroll down and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>. The icon is on your home screen.</li></ol></details>';
  var and = '<details class="obplat"' + (kind === 'android' ? ' open' : '') + '><summary>Android (Chrome)</summary><ol>' +
    '<li>Open <b>' + esc(host) + '</b> in <b>Chrome</b>.</li><li>Tap <b>⋮</b> at the top right, then <b>Add to Home screen</b> (some phones say <b>Install app</b>).</li>' +
    '<li>Tap <b>Add</b>, and <b>Add</b> again if it asks.</li></ol></details>';
  return (kind === 'computer' ? '<p class="note">' + icon('clock') + '<span>You are on a computer, so do this on your phone: open <b>' + esc(host) + '</b> there and follow the steps, then press Done here.</span></p>' : '') +
    (kind === 'android' ? and + ios : ios + and);
}
function obHomeVideo() {
  return '<video class="obvideo" controls playsinline muted preload="none" poster="/media/demos/homescreen.jpg" src="/media/demos/homescreen.mp4" aria-label="Adding the Org System to an iPhone home screen"></video>';
}
function obHomeStep(gate) {
  return '<div class="cols obhome"><section class="card"><header><div>' + (gate ? '<p class="tag">Step 2 of 2</p>' : '') + '<h3>Put the Org System on your home screen</h3></div></header>' +
    '<p class="lede">It opens like an app and keeps you signed in for a month. On an iPhone it is also the only way phone notifications reach you.</p>' +
    obHomeSteps() + (gate ? '<div class="sendrow"><button class="btn" data-act="obHomeDone">' + icon('check') + 'Done, it is on my home screen</button></div>' : '') + '</section>' +
    '<section class="card obvidcard">' + obHomeVideo() + '</section></div>';
}
ACT_EXT.obHomeDone = function () {
  if (M.demo) obDemoSet('home'); else lsSet(obHomeKey(), '1');
  var v = document.querySelector('.obvideo'); if (v) try { v.pause(); } catch (e) {}
  toast('Welcome in.');
  obLift();
};
ACT_EXT.obHomeSheet = function () {
  openSheet('<header class="sh"><h3>Add it to your home screen</h3></header><p class="mb">It opens like an app and keeps you signed in for a month. On an iPhone, notifications only work from there.</p>' +
    '<div class="obsheetsteps">' + obHomeSteps() + obHomeVideo() + '</div>');
};

/* ---------- the first-run tour ----------
   Members only, once (the same key as the classic page), after the gate.
   Each step opens the screen it talks about, so the tour teaches the
   navigation by using it. */
var OB_TOUR = [
  {v: 'orgs', h: 'This is your Org', p: 'Eight to ten members, a mix of 1st and 2nd years, plus one EBOD contact. It is your family in the chapter and your breakout group at bootcamps. Everyone is a Member, and 2nd years look out for 1st years.'},
  {v: 'teams', h: 'Your teams', p: 'Your SFBLC team once EBOD places you, and your consulting client team under Client teams. Competing at SFBLC? Rank your events so EBOD can form the teams.'},
  {v: 'homework', h: 'Hand work in here', p: 'Upload a file or paste a link before the due date. EBOD sees what is in, and your Org earns a cup when most of it arrives on time.'},
  {v: 'calendar', h: 'The season', p: ''},
  {v: 'messages', h: 'Your inbox', p: 'News, schedule changes and reminders from EBOD land here. Turn on phone notifications on your Profile so they reach you right away.'},
  {v: 'cup', h: 'Org Cups, not a leaderboard', p: 'Cups are earned together by your whole Org. Nobody is ranked, and your own commitment points stay private on your profile.'},
  {v: 'profile', h: 'Your page', p: 'Your details, photo, phone notifications and commitment log. That is the tour: go and look around.'}
];
function obTourSeen() {
  if (M.demo) return !!obDemoState().tour;
  try { return localStorage.getItem(OB_TOUR_KEY) === '1'; } catch (e) { return true; }
}
function obMaybeTour(justIn) {
  if (!M || M.officer || OB.step || obTourSeen() || !M.orgs.length) return;
  /* In the demo it follows the new-member flow only, so it does not pop up on every look at the member view. */
  if (M.demo && !justIn) return;
  /* Someone who followed a link to a particular screen came for that screen. */
  if (!justIn && ROUTE.view !== 'overview') return;
  setTimeout(function () { if (!OB.step) obTour(0); }, 700);
}
function obTour(i) {
  var steps = OB_TOUR.filter(function (s) { return NAV.some(function (n) { return n.id === s.v; }); });
  var st = steps[i], box = $('obtour');
  if (!st) return obTourDone();
  OB.tourAt = i;
  if (ROUTE.view !== st.v) location.hash = '#' + st.v;
  var p = st.p;
  if (st.v === 'calendar') {
    var off = M.cfg.seasonOff || [];
    /* A three-day event is named once, on its first day. */
    var seen = {}, up = SEASON.filter(function (e) {
      var t = e.title.replace(/\s*\([^)]*\)/g, '');
      if (e.date < today() || off.indexOf(e.id) > -1 || seen[t]) return false;
      return (seen[t] = true);
    }).slice(0, 4);
    p = up.length ? 'Coming up: ' + up.map(function (e) { return e.title.replace(/\s*\([^)]*\)/g, '') + ' ' + fmtDay(e.date).replace(/^[A-Za-z]+,? /, ''); }).join('; ') + '. Add any of them to your own calendar.'
      : 'Meetings, bootcamps, SFBLC and homework due dates, all in one place. Add any of them to your own calendar.';
  }
  if (!box) {
    box = document.createElement('div'); box.id = 'obtour'; box.className = 'obtour';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Tour of the dashboard');
    document.body.appendChild(box);
  }
  var last = i === steps.length - 1;
  box.innerHTML = '<p class="tag">Step ' + (i + 1) + ' of ' + steps.length + '</p><h3>' + esc(st.h) + '</h3><p class="mb">' + esc(p) + '</p>' +
    '<div class="obtacts"><span class="obdots" aria-hidden="true">' + steps.map(function (s, j) { return '<i' + (j === i ? ' class="on"' : '') + '></i>'; }).join('') + '</span>' +
    '<button class="btn sm ghost" data-act="obTourSkip">' + (last ? 'Close' : 'Skip') + '</button><button class="btn sm" data-act="obTourNext">' + (last ? 'Finish' : 'Next') + '</button></div>';
  box.hidden = false;
}
function obTourDone() {
  if (M.demo) obDemoSet('tour'); else lsSet(OB_TOUR_KEY, '1');
  OB.tourAt = -1;
  var b = $('obtour'); if (b) b.hidden = true;
}
ACT_EXT.obTourNext = function () { obTour(OB.tourAt + 1); };
ACT_EXT.obTourSkip = function () { obTourDone(); };
ACT_EXT.obTourAgain = function () { obTour(0); };

/* ---------- phone notifications ----------
   Per device: the backend sends through api/push and sw.js shows them. An
   iPhone only allows them from the home-screen app. */
function obPushOk() { return !!(window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window); }
function obPushReg() {
  if (!obPushOk()) return Promise.resolve(null);
  return navigator.serviceWorker.register('/sw.js').then(function () { return navigator.serviceWorker.ready; }).catch(function () { return null; });
}
function obPushSub() { return obPushReg().then(function (reg) { return reg ? reg.pushManager.getSubscription() : null; }).catch(function () { return null; }); }
function obPushCheck() {
  if (OB.push.checking) return;
  OB.push.checking = true;
  obPushSub().then(function (sub) {
    OB.push.checking = false; OB.push.checked = true; OB.push.sub = sub || null;
    if (ROUTE.view === 'profile') obRenderKeep();
  });
}
function obPushPanel() {
  var P = OB.push, say = function (t, btns) { return '<p class="mb">' + t + '</p>' + (btns ? '<div class="rowacts">' + btns + '</div>' : ''); };
  var on = '<button class="btn sm" data-act="pushOn"' + (P.busy ? ' disabled' : '') + '>' + icon('bell') + (P.busy ? 'Turning on…' : 'Turn on notifications') + '</button>';
  var offTest = '<button class="btn sm ghost" data-act="pushTest">' + icon('send') + 'Send a test</button><button class="btn sm ghost" data-act="pushOff">Turn off</button>';
  var why = 'Get new homework, SFBLC reminders and messages from EBOD as notifications.';
  if (M.demo) return P.demoOn ? say('<b>On for this device.</b> In the demo nothing is sent.', offTest) : say('Off on this device. ' + why, on);
  if (!obPushOk()) {
    if (obPhone() === 'ios' && !obLaunchedFromHome())
      return say('On iPhone, notifications only work in the home-screen app (iOS 16.4 or newer). Open the Org System from its icon on your home screen and turn them on there.', '<button class="btn sm ghost" data-act="obHomeSheet">How to add it</button>');
    return say('This browser cannot show notifications. On your phone, use Safari (iPhone, from the home-screen icon) or Chrome (Android).');
  }
  if (Notification.permission === 'denied') return say('Notifications are blocked for the Org System on this device. Allow them in your phone\'s Settings → Notifications (or this site\'s settings in your browser), then come back here.');
  if (!P.checked) { obPushCheck(); return say('Checking this device…'); }
  return P.sub ? say('<b>On for this device.</b> You hear about new homework, SFBLC reminders and messages from EBOD.', offTest) : say('Off on this device. ' + why, on);
}
/* more.js and views.js draw these too; the full versions live here. */
pushPanel = obPushPanel;
pushHint = function () {
  return '<p class="note">' + icon('bell') + '<span>Messages also arrive as phone notifications once you turn them on: <a href="#profile">Profile → Phone notifications</a>. On an iPhone, open the Org System from its home-screen icon first.</span></p>';
};
ACT_EXT.pushOn = function (el) {
  if (M.demo) { OB.push.demoOn = true; render(); return toast('On. In the demo nothing is sent.'); }
  if (!obPushOk()) return toast('This browser cannot show notifications.', true);
  OB.push.busy = true; el.disabled = true;
  /* Asked first, straight from the tap: an iPhone ignores a permission request that does not come directly from one. */
  var asked = new Promise(function (res) { var p = Notification.requestPermission(res); if (p && p.then) p.then(res); });
  asked.then(function (perm) {
    if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications were not allowed. You can allow them in your phone\'s Settings.' : 'Notifications were not allowed.');
    return Promise.all([obPushReg(), fetch('/api/push', {cache: 'no-store'}).then(function (r) { return r.json(); }).catch(function () { return null; })]);
  }).then(function (v) {
    var reg = v[0], key = v[1] && v[1].publicKey;
    if (!reg) throw new Error('This browser would not start notifications.');
    if (!key) throw new Error('Notifications are not set up on the site yet. Tell an officer.');
    return reg.pushManager.getSubscription().then(function (old) { return old || reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64urlBytes(key)}); });
  }).then(function (sub) {
    return call('savePush', {sub: sub.toJSON()}).then(function (r) {
      if (!(r && r.ok)) { sub.unsubscribe().catch(function () {}); throw new Error((r && r.error) || 'The club sheet did not answer. Try again.'); }
      lsSet(OB_PUSH_SYNC, String(Date.now()));
      OB.push.sub = sub; OB.push.checked = true;
      return call('testPush');
    });
  }).then(function () {
    OB.push.busy = false; render(); toast('On. A test notification is on its way.');
  }).catch(function (e) {
    OB.push.busy = false; OB.push.checked = false; render(); toast(e && e.message ? e.message : 'Could not turn notifications on.', true);
  });
};
ACT_EXT.pushOff = function (el) {
  if (M.demo) { OB.push.demoOn = false; render(); return toast('Off on this device.'); }
  el.disabled = true;
  obPushSub().then(function (sub) {
    if (!sub) return;
    var end = sub.endpoint;
    return sub.unsubscribe().then(function () { return call('dropPush', {endpoint: end}); });
  }).then(function () {
    lsSet(OB_PUSH_SYNC, null); OB.push.sub = null; OB.push.checked = true; render(); toast('Off on this device.');
  }).catch(function () { el.disabled = false; toast('Could not turn them off. Try again.', true); });
};
ACT_EXT.pushTest = function () {
  if (M.demo) return toast('Demo: a test notification would arrive now.');
  toast('Sending…');
  call('testPush').then(function (r) { toast(r && r.ok ? 'Sent. It should arrive in a few seconds.' : (r && r.error) || 'Not sent.', !(r && r.ok)); });
};
/* Once a day, tell the backend this device is still this member's: phones
   replace subscriptions now and then, and someone else may have signed in. */
function obPushResync() {
  if (DEMO || !obPushOk() || Notification.permission !== 'granted') return;
  if (Date.now() - Number(lsGet(OB_PUSH_SYNC) || 0) < 864e5) return;
  obPushSub().then(function (sub) {
    if (!sub) return;
    call('savePush', {sub: sub.toJSON()}).then(function (r) { if (r && r.ok) lsSet(OB_PUSH_SYNC, String(Date.now())); });
  });
}

/* ---------- the profile ---------- */
function obVia() {
  var v = RAW && RAW.all && RAW.all.via;
  if (v) return v;
  if (DEMO) return /[?&]via=password/.test(location.search) ? 'password' : 'google';
  return /^v1\./.test(lsGet(KEYS.session) || '') ? 'password' : 'google';
}
function obPhoto(v) { var s = String(v == null ? '' : v).trim(); return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+=*$/.test(s) ? s : ''; }
/* The classic page's normName: recognitions are filed under it. */
function obNormName(s) {
  s = String(s || '').trim();
  if (s.indexOf(',') > -1) { var p = s.split(','); s = p[1] + ' ' + p[0]; }
  return s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}
function obTracks() {
  if (M.cfg.useTracks === false) return [];
  var ts = (M.cfg.tracks || []).filter(function (t) { return t && t.id; });
  return ts.length ? ts.concat([{id: 'e', label: M.cfg.flexLabel || 'Not sure yet'}]) : [];
}
/* The form records a track's label, the profile its id: either one selects it. */
function obTrackId(v) {
  var s = String(v || '').trim(), lc = s.toLowerCase(), ts = obTracks(), i;
  if (!s) return '';
  for (i = 0; i < ts.length; i++) if (ts[i].id === s || ts[i].label.toLowerCase() === lc) return ts[i].id;
  if (/either|both|not sure|undecided|neither|no preference/.test(lc)) return 'e';
  for (i = 0; i < ts.length; i++) { var w = flat(ts[i].label).slice(0, 5); if (w && flat(s).indexOf(w) > -1) return ts[i].id; }
  return '';
}
/* Re-render unless someone is typing on the screen; then their words stay. */
function obRenderKeep() {
  var ae = document.activeElement;
  if (ae && $('view').contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
  render();
}
function obReloadProfile() {
  return call('myProfile').then(function (r) {
    if (r && r.ok) { RAW.profile = r; M.profile = r; if (ROUTE.view === 'profile') obRenderKeep(); }
    return r;
  });
}
function obLoadSaved() {
  if (OB.profAsked) return;
  OB.profAsked = true;
  call('getProfile').then(function (r) {
    OB.prof = (r && r.ok && r.profile) || {};
    if (ROUTE.view === 'profile') obRenderKeep();
  });
}
function obAvatar(p, photo) {
  return photo ? '<span class="av obav"><img src="' + esc(photo) + '" alt=""></span>' : avatar(p).replace('class="av"', 'class="av obav"');
}
VIEWS.profile = function () {
  obLoadSaved();
  var p = M.me, r = M.profile || {}, row = r.profile || null, ans = r.answers || {}, sp = OB.prof || {};
  var photo = obPhoto(sp.Photo), names = p.name.indexOf('@') < 0 ? p.name.split(' ') : [''];
  var org = M.orgs.filter(function (o) { return o.name === p.org; })[0];
  var year = p.year ? (p.year === 2 ? '2nd year' : '1st year') : (row && row.Year ? String(row.Year) : '');
  var h = head('You', 'Profile');

  /* Who you are, as the club sees it. */
  var facts = [];
  if (p.org) facts.push(['Org', p.org]);
  if (org && org.ebod) facts.push(['EBOD contact', org.ebod]);
  if (org) facts.push(['Org Cups', plural(org.cups, 'cup')]);
  if (p.teams.length) facts.push([p.teams.length > 1 ? 'Teams' : 'Team', p.teams.map(function (t) { return (t.kind === 'flc' ? 'SFBLC ' + t.event + ': ' : t.kind === 'consulting' ? 'Consulting: ' : '') + teamName(t); }).join('; ')]);
  if (year) facts.push(['Year', year]);
  if (p.track || ans.track) facts.push([M.cfg.trackWord || 'Track', p.track || trackLabel(M.cfg, ans.track)]);
  if (p.mbti || ans.mbti) facts.push(['Type', p.mbti || ans.mbti]);
  h += '<div class="cols obprof"><div class="stack"><section class="card me"><div class="sh">' + obAvatar(p, photo) + '<div><h3>' + esc(p.name) + '</h3><p class="pe">' +
    esc([M.officer ? (M.master ? 'Master' : 'Officer') : 'Member', M.club].filter(Boolean).join(' · ')) + '</p><p class="pe">' + esc(M.email) + '</p></div></div>' +
    (facts.length ? '<dl class="facts obfacts">' + facts.map(function (f) { return '<dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd>'; }).join('') + '</dl>' : '') +
    '<div class="chips">' + (p.tags || []).filter(function (t) { return !t.quiet; }).map(function (t) { return chip(t); }).join('') + '</div>' +
    (!M.officer && !p.org ? '<p class="note">' + icon('orgs') + '<span>You are not in an Org yet. EBOD forms them from everyone who sent the sign-up form, and your teams follow. If Orgs are out and you are still not on one, your roster name may be spelled differently: tell your EBOD contact.</span></p>' : '') +
    '<div class="rowacts obphoto"><label class="btn sm ghost file">' + icon('upload') + '<span>' + (photo ? 'Change picture' : 'Add a picture') + '</span><input id="obphoto" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a profile picture"></label>' +
    (photo ? '<button class="btn sm ghost" data-act="obPhotoClear">Remove picture</button>' : '') + '<span class="cc">Square pictures look best.</span></div></section>';

  /* Your details: the name, and what the sign-up form recorded that is yours to correct. */
  var ts = obTracks(), tid = obTrackId(ans.track || p.track), test = safeUrl(M.cfg.mbtiTestUrl), mb = ans.mbti || p.mbti || '';
  h += '<form class="card form" data-act="obProfSave"><header><h3>Your details</h3>' + (M.cfg.formUrl || M.demo ? '<button type="button" class="qbtn" data-act="obPull"' + (OB.pulling ? ' disabled' : '') + '>' + icon('upload') + '<span>' + (OB.pulling ? 'Reading…' : 'Read my answers from the form') + '</span></button>' : '') + '</header>' +
    '<div class="row2"><label class="fld"><span>First name</span><input name="first" maxlength="40" autocomplete="given-name" value="' + esc(sp.FirstName || names[0] || '') + '"></label>' +
    '<label class="fld"><span>Last name</span><input name="last" maxlength="40" autocomplete="family-name" value="' + esc(sp.LastName || names.slice(1).join(' ')) + '"></label></div>' +
    '<div class="row2">' + (ts.length ? '<label class="fld"><span>' + esc(M.cfg.trackWord || 'Track') + '</span><select name="track"><option value="">Not set</option>' +
      ts.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === tid ? ' selected' : '') + '>' + esc(t.label) + '</option>'; }).join('') + '</select></label>' : '') +
    '<label class="fld"><span>Birthday</span><input name="bday" type="date" value="' + esc(ans.bday || '') + '"></label>' +
    (M.cfg.useMbti !== false ? '<label class="fld"><span>Personality type</span><input name="mbti" maxlength="4" placeholder="INTJ" class="obmono" value="' + esc(mb) + '">' +
      (test && !mb ? '<small class="cc">No type recorded. <a href="' + esc(test) + '" target="_blank" rel="noopener">Take the test</a></small>' : '') + '</label>' : '') + '</div>' +
    '<label class="fld"><span>Anything the club should know</span><input name="notes" maxlength="300" placeholder="Allergies, a nickname, anything" value="' + esc(ans.notes || '') + '"></label>' +
    ((ans.year || ans.avail) ? '<p class="meta">' + esc([ans.year ? 'Year in the club: ' + ans.year : '', ans.avail ? 'Available: ' + ans.avail : ''].filter(Boolean).join(' · ')) + '</p>' : '') +
    '<p class="meta">Your name is what teammates, Orgs and officers see. Year and leadership interest stay as the form recorded them.</p>' +
    '<div class="sendrow"><button class="btn sm">Save my details</button></div></form>';
  h += obPasswordCard() + '</div>';

  h += '<div class="stack"><section class="card" id="pushcard"><header><h3>Phone notifications</h3></header>' + obPushPanel() + '</section>' +
    obTrophies(p) + obLog(r) + (M.officer ? '' : myStandingCard()) + obPrivacy() + lookCard() + '</div></div>';
  return h;
};
function obPasswordCard() {
  if (obVia() === 'password') return '<form class="card form" data-act="obChPw"><header><h3>Your password</h3></header>' +
    '<p class="meta">You sign in with a username and password. A change takes effect at once; other devices stay signed in until their session runs out.</p>' +
    '<input type="text" name="username" autocomplete="username" value="' + esc(M.email) + '" hidden>' +
    '<div class="row2"><label class="fld"><span>Current password</span><input name="old" type="password" autocomplete="current-password"></label>' +
    '<label class="fld"><span>New password</span><input name="pw" type="password" autocomplete="new-password" placeholder="At least 10 characters"></label></div>' +
    '<div class="sendrow"><button class="btn sm">Change password</button></div></form>';
  return '<form class="card form" data-act="obSetPw"><header><h3>Add a password</h3></header>' +
    '<p class="meta">You sign in with Google. A password here lets you use either: same account, either door. Google sign-in keeps working.</p>' +
    '<input type="text" name="username" autocomplete="username" value="' + esc(M.email) + '" hidden>' +
    '<label class="fld"><span>New password</span><input name="pw" type="password" autocomplete="new-password" placeholder="At least 10 characters"></label>' +
    '<div class="sendrow"><button class="btn sm">Set password</button></div></form>';
}
function obTrophies(p) {
  var all = M.cfg.recognitions || {}, list = (all[obNormName(p.name)] || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  return '<section class="card"><header><h3>Trophy case</h3>' + (list.length ? '<span class="count">' + list.length + '</span>' : '') + '</header>' + (list.length ?
    '<ul class="obtrophies">' + list.map(function (t) {
      var d = t.at ? new Date(t.at) : null;
      return '<li><span class="obcup" aria-hidden="true">' + icon('cup') + '</span><span><b>' + esc(t.label) + '</b><small>' + esc(d && !isNaN(d) ? d.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}) : '') + (t.by ? ' · ' + esc(t.by) : '') + '</small></span></li>';
    }).join('') + '</ul>' : '<p class="meta">Nothing yet. Officers award these for standout work.</p>') + '</section>';
}
/* The backend's list is history; entries is only how many there are. */
function obLog(r) {
  var hist = (r.history || []).slice().reverse(), n = typeof r.entries === 'number' ? r.entries : hist.length;
  return '<section class="card"><header><h3>Commitment log</h3>' + (hist.length ? '<b class="fig">' + esc(r.points || 0) + '</b>' : '') + '</header>' +
    '<p class="meta">What you have put in this season, for your own reflection. Nothing ranks members, and no one else is compared with it.</p>' +
    (hist.length ? '<p class="meta">' + plural(+r.points || 0, 'point') + ' across ' + plural(n, 'entry', 'entries') + '</p><ul class="inbox oblog">' + hist.slice(0, 10).map(function (e) {
      var day = String(e.when || '').slice(0, 10);
      return '<li><div class="mh"><p class="mt">' + esc(e.label || 'Entry') + '</p><span class="ma">' + esc(e.points ? (e.points > 0 ? '+' : '') + e.points : '') + '</span></div>' +
        (day ? '<span class="meta">' + esc(fmtDay(day) || day) + '</span>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="meta">Nothing logged yet. Bootcamps, handed-in work and events show up here.</p>') + '</section>';
}
function obPrivacy() {
  return '<section class="card"><header><h3>What others can see</h3></header><p class="mb sm">Your name, Org and teams are visible to the club. Your commitment log and personality type are visible to EBOD and you only. ' +
    'Anything you wrote in the sign-up form\'s free-text box is for officers only. You are in <b>' + esc(M.club) + '</b>, and nothing here is visible to any other club.</p>' +
    (M.officer ? '' : '<div class="rowacts"><button class="qbtn" data-act="obTourAgain">' + icon('arrow') + '<span>Take the tour again</span></button>' +
      (obLaunchedFromHome() ? '' : '<button class="qbtn" data-act="obHomeSheet">' + icon('upload') + '<span>Add it to your home screen</span></button>') + '</div>') + '</section>';
}
SUBMIT_EXT.obProfSave = function (f) {
  var first = obCapName(clean(f.first.value, 40)), last = obCapName(clean(f.last.value, 40));
  if (!first) return toast('A first name is needed.', true);
  var pay = {firstName: first, lastName: last, bday: f.bday.value || '', notes: clean(f.notes.value, 300)};
  if (f.track) pay.track = f.track.value;
  if (f.mbti) { pay.mbti = obMbti(f.mbti.value); f.mbti.value = pay.mbti; }
  f.first.value = first; f.last.value = last;
  var btn = f.querySelector('button.btn'); btn.disabled = true;
  call('saveProfile', pay).then(function (r) {
    btn.disabled = false;
    if (!(r && r.ok)) return toast((r && r.error) || 'That did not save.', true);
    OB.prof = Object.assign({}, OB.prof || {}, {FirstName: first, LastName: last});
    if (M.profile) M.profile.answers = Object.assign({}, M.profile.answers || {}, {bday: pay.bday, notes: pay.notes},
      pay.track !== undefined ? {track: pay.track} : {}, pay.mbti !== undefined ? {mbti: pay.mbti} : {});
    toast('Saved. A new name shows everywhere after the next refresh.');
  });
};
ACT_EXT.obPull = function () {
  OB.pulling = true; render();
  call('myFormAnswers').then(function (a) {
    if (!(a && a.ok)) { OB.pulling = false; render(); return toast((a && a.error) || 'Could not read your answers.', true); }
    obReloadProfile().then(function () { OB.pulling = false; render(); toast('Found them. Your profile is up to date.'); });
  });
};
/* Downscaled here to a 160px square: a phone photo is megabytes, and a sheet cell is not the place for one. */
document.addEventListener('change', function (e) {
  var inp = e.target; if (inp.id !== 'obphoto' || !inp.files[0]) return;
  var fr = new FileReader();
  toast('Resizing…');
  fr.onload = function () {
    var img = new Image();
    img.onload = function () {
      var side = Math.min(img.width, img.height), c = document.createElement('canvas');
      c.width = c.height = 160;
      c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 160, 160);
      var data = c.toDataURL('image/jpeg', 0.82);
      call('saveProfile', {photo: data}).then(function (r) {
        if (!(r && r.ok)) return toast((r && r.error) || 'That picture did not save.', true);
        OB.prof = Object.assign({}, OB.prof || {}, {Photo: data}); render(); toast('Picture saved.');
      });
    };
    img.onerror = function () { toast('That file is not an image this browser can read.', true); };
    img.src = fr.result;
  };
  fr.readAsDataURL(inp.files[0]);
});
ACT_EXT.obPhotoClear = function () {
  call('saveProfile', {photo: 'none'}).then(function (r) {
    if (!(r && r.ok)) return toast((r && r.error) || 'Not removed.', true);
    OB.prof = Object.assign({}, OB.prof || {}, {Photo: ' '}); render(); toast('Picture removed.');
  });
};

/* ---------- passwords ----------
   The password never leaves the browser: what goes to the backend is a
   PBKDF2 key (auth.js's pbkdf2Dk, the classic page's derivation). */
var OB_ITERS = 210000;
function obDk(pw, salt, iters) {
  if (typeof window.pbkdf2Dk !== 'function') return Promise.reject(new Error('The password tools did not load. Reload the page and try again.'));
  return Promise.resolve().then(function () { return window.pbkdf2Dk(pw, salt, iters); });
}
function obSalt() { var a = new Uint8Array(16), s = ''; crypto.getRandomValues(a); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
function obBusy(f, on, label) { var b = f.querySelector('button.btn'); b.disabled = on; b.textContent = label; }
SUBMIT_EXT.obSetPw = function (f) {
  var pw = f.pw.value;
  if (pw.length < 10) return toast('At least 10 characters.', true);
  var salt = obSalt();
  obBusy(f, true, 'Working…');
  obDk(pw, salt, OB_ITERS).then(function (dk) {
    return call('setMyPassword', {dk: dk, clientSalt: salt, iterations: OB_ITERS, firstName: (OB.prof || {}).FirstName || '', lastName: (OB.prof || {}).LastName || ''});
  }).then(function (r) {
    obBusy(f, false, 'Set password');
    if (!(r && r.ok)) return toast((r && r.error) || 'That did not work.', true);
    f.pw.value = ''; toast('Done. You can now sign in with ' + M.email + ' and that password.');
  }).catch(function (e) { obBusy(f, false, 'Set password'); toast((e && e.message) || 'That did not work.', true); });
};
SUBMIT_EXT.obChPw = function (f) {
  var old = f.old.value, pw = f.pw.value;
  if (!old) return toast('Type your current password.', true);
  if (pw.length < 10) return toast('The new password needs at least 10 characters.', true);
  var salt = obSalt();
  obBusy(f, true, 'Working…');
  call('getSalt', {username: M.email}).then(function (s) {
    if (!(s && s.ok)) throw new Error('The club sheet did not answer. Try again.');
    return Promise.all([obDk(old, s.salt, s.iterations || OB_ITERS), obDk(pw, salt, OB_ITERS)]);
  }).then(function (k) {
    return call('changePassword', {oldDk: k[0], newDk: k[1], clientSalt: salt, iterations: OB_ITERS});
  }).then(function (r) {
    obBusy(f, false, 'Change password');
    if (!(r && r.ok)) return toast((r && r.error) || 'That did not work.', true);
    f.old.value = ''; f.pw.value = ''; toast('Password changed.');
  }).catch(function (e) { obBusy(f, false, 'Change password'); toast((e && e.message) || 'That did not work.', true); });
};

/* ---------- start: after the club has loaded ---------- */
BOOT_EXT.push(function (raw) {
  obApply();
  if (OB.step) {
    if (location.hash && !/^#?welcome\b/.test(location.hash)) OB.wanted = location.hash;
    history.replaceState(null, '', location.pathname + location.search + '#welcome');
    route();
  } else obMaybeTour(false);
  obPushResync();
  /* Once a visit, in the background: makes the member's Drive folder if it is
     missing, adds new assignments and puts their real name on it. */
  if (!DEMO && !OB.driveAsked && raw && raw.all && ('myDriveReady' in raw.all)) {
    OB.driveAsked = true;
    setTimeout(function () { call('ensureMyDrive'); }, 2500);
  }
  /* The demo's profile save also has to keep teams2's preferences, whichever file answers it. */
  var prev = DEMO_EXT.saveProfile;
  if (prev && prev.ob) return;
  DEMO_EXT.saveProfile = function (pl, s, officer, me, store) {
    obDemoSaveProfile(pl, s, me, !prev);
    store();
    return prev ? prev(pl, s, officer, me, store) : {ok: true, saved: true};
  };
  DEMO_EXT.saveProfile.ob = true;
});
/* A password set or changed in the demo is checked against its own salt;
   anyone else gets auth.js's demo salt. Wrapped once the files have all
   registered theirs. */
BOOT_EXT.push(function () {
  var prev = DEMO_EXT.getSalt;
  if (prev && prev.ob) return;
  DEMO_EXT.getSalt = function (pl, s, officer, me, store) {
    var pw = obDemoOb(s).pw[flat(pl.username)];
    if (pw) return {ok: true, salt: pw.salt, iterations: OB_ITERS};
    return prev ? prev(pl, s, officer, me, store) : {ok: true, salt: 'ZGVtby1zYWx0LTEyMzQ1Ng==', iterations: OB_ITERS};
  };
  DEMO_EXT.getSalt.ob = true;
});

/* ---------- demo answers ---------- */
function obDemoOb(s) { return s.ob || (s.ob = {prof: {}, form: {}, pw: {}}); }
function obDemoPerson(s, me) { return s.people.filter(function (p) { return flat(p.name) === me; })[0]; }
function obDemoSaveProfile(pl, s, me, prefsToo) {
  var o = obDemoOb(s), pr = o.prof[me] || (o.prof[me] = {}), p = obDemoPerson(s, me);
  if (pl.firstName) pr.FirstName = obCapName(pl.firstName);
  if (pl.lastName) pr.LastName = obCapName(pl.lastName);
  if (pl.photo) pr.Photo = pl.photo === 'none' ? ' ' : pl.photo;
  ['track', 'bday', 'notes'].forEach(function (k) { if (pl[k] !== undefined) pr[k] = String(pl[k]); });
  if (pl.mbti !== undefined) { pr.mbti = obMbti(pl.mbti); if (p && pr.mbti) p.mbti = pr.mbti; }
  if (prefsToo && pl.prefs !== undefined && p) p.prefs = parsePrefs(pl.prefs);
}
DEMO_EXT.myProfile = function (pl, s, officer, me) {
  var p = obDemoPerson(s, me), o = obDemoOb(s), pr = o.prof[me] || {}, f = o.form[me];
  if (!p) return {ok: true, profile: null, points: 0, entries: 0, history: [],
                  answers: f ? {year: f.year, track: pr.track || f.track, mbti: pr.mbti || f.mbti, notes: pr.notes || f.notes, avail: f.avail, bday: pr.bday || '', at: f.at} : null};
  var d = function (n) { var x = new Date(); x.setDate(x.getDate() - n); return isoDay(x); };
  var hist = [{label: 'IM orientation', points: 2, when: d(18)}, {label: 'Bootcamp 1', points: 2, when: d(13)}, {label: 'Case framework drill, on time', points: 3, when: d(12)},
              {label: 'Bootcamp 2', points: 2, when: d(11)}, {label: 'Helped run tabling', points: 5, when: d(6)}];
  return {ok: true, profile: {MemberName: p.name, Org: p.org, Track: p.track, Year: p.year === 2 ? '2nd year' : '1st year', MBTI: p.mbti},
          points: hist.reduce(function (a, e) { return a + e.points; }, 0), entries: hist.length, history: hist,
          answers: {year: (f && f.year) || (p.year === 2 ? '2nd year' : '1st year'), track: pr.track || (f && f.track) || p.track, mbti: pr.mbti || p.mbti,
                    notes: pr.notes || (f && f.notes) || '', avail: (f && f.avail) || p.avail, bday: pr.bday || '', at: (f && f.at) || d(20)}};
};
DEMO_EXT.getProfile = function (pl, s, officer, me) {
  var pr = obDemoOb(s).prof[me] || {}, b = String(s.me).split(' ');
  return {ok: true, profile: {FirstName: pr.FirstName || b[0], LastName: pr.LastName || b.slice(1).join(' '), Photo: pr.Photo || ''}};
};
DEMO_EXT.formSchema = function () {
  return {ok: true, title: 'De Anza PBL sign-up, Fall 2026 (demo)', action: 'https://docs.google.com/forms/d/demo/formResponse', fields: [
    {id: 'entry.1001', label: 'First name', type: 0, required: true, options: []},
    {id: 'entry.1002', label: 'Last name', type: 0, required: true, options: []},
    {id: 'entry.1003', label: 'Email', type: 0, required: true, options: []},
    {id: 'entry.1004', label: 'Which year are you in the club?', type: 2, required: true, options: ['1st year', '2nd year']},
    {id: 'entry.1005', label: 'Which track are you leaning toward?', type: 3, required: true, options: ['Consulting', 'Case competition (FLC)', 'Polaris', 'Not sure yet']},
    {id: 'entry.1006', label: 'Your MBTI (four letters)', type: 0, required: false, options: []},
    {id: 'entry.1007', label: 'When are you usually free?', type: 4, required: false, options: ['Mon/Wed evenings', 'Tue/Thu afternoons', 'Tue/Thu evenings', 'Fri afternoons', 'Weekends']},
    {id: 'entry.1008', label: 'Anything else EBOD should know?', type: 1, required: false, options: []}
  ]};
};
DEMO_EXT.submitForm = function (pl, s, officer, me, store) {
  var sum = pl.summary || {};
  obDemoOb(s).form[me] = {year: sum.year || '', track: sum.track || '', mbti: sum.mbti || '', avail: sum.avail || '', notes: sum.notes || '', at: new Date().toISOString()};
  store();
  return {ok: true, submitted: true};
};
DEMO_EXT.myFormAnswers = function (pl, s, officer, me) {
  var f = obDemoOb(s).form[me], p = obDemoPerson(s, me);
  if (f) return {ok: true, answers: f};
  if (p && p.answered && !obDemoNew()) return {ok: true, answers: {year: p.year === 2 ? '2nd year' : '1st year', track: p.track, mbti: p.mbti, avail: p.avail}};
  return {ok: false, error: 'No response in that spreadsheet matches your account yet.'};
};
DEMO_EXT.setMyPassword = function (pl, s, officer, me, store) {
  if (obVia() !== 'google') return {ok: false, error: 'You already sign in with a password.'};
  obDemoOb(s).pw[flat(M.email)] = {salt: pl.clientSalt, dk: pl.dk}; store();
  return {ok: true, created: true};
};
DEMO_EXT.changePassword = function (pl, s, officer, me, store) {
  if (obVia() !== 'password') return {ok: false, error: 'You are signed in with Google, which has no password here.'};
  var k = flat(M.email), pw = obDemoOb(s).pw[k];
  /* The demo takes any first current password; after that it is checked like the real one. */
  if (pw && pw.dk !== pl.oldDk) return {ok: false, error: 'That is not your current password.'};
  obDemoOb(s).pw[k] = {salt: pl.clientSalt, dk: pl.newDk}; store();
  return {ok: true, changed: true};
};
DEMO_EXT.dropPush = function () { return {ok: true, removed: 1}; };
DEMO_EXT.ensureMyDrive = function () { return {ok: true}; };
