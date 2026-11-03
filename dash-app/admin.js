/* Club and master administration: club setup, the sign-up form editor and kit, the roster, clearing a club, the calendar connection, access and roles, clubs, every sign-up and password accounts. */
'use strict';

/* Officers get "Club settings" (#club/setup|form|roster|calendar). The master
   account also gets "System admin" (#admin/access|clubs|signups|accounts),
   added once the club has loaded and the role is known, so an officer never
   sees a screen every call on it would refuse. */
var ADM = {
  setup: null, setup0: '', keep: {}, note: {}, err: {}, busy: {}, confirm: null,
  roster: null, rq: '', rrole: '',
  fe: {items: null, snap: '', err: '', loading: false, busy: false},
  roles: null, affs: null, signups: null, users: null,
  sgq: '', sgaff: '', sgrole: '', calPast: false, calBusy: false
};
ICONS.club = '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>';
ICONS.admin = '<circle cx="8" cy="15.5" r="3.5"/><path d="M10.6 13L19 4.5M15.5 8l2.5 2.5M13.4 10.2l2 2"/>';
NAV.push({id: 'club', label: 'Club settings', short: 'Club', group: 'Admin', officer: 1});
var ADMIN_NAV = {id: 'admin', label: 'System admin', short: 'Admin', group: 'Admin', officer: 1};

/* The classic page's starter kits, minus the points catalog (dropped from the
   dashboard). A kit only fills in the setup form; nothing is saved until Save. */
var CLUB_DEFAULTS = {
  unit: 'Org', units: 'Orgs', useTracks: true, trackWord: 'Track',
  tracks: [{id: 'c', label: 'Consulting'}, {id: 'k', label: 'Case competition (FLC)'}, {id: 't3', label: 'Polaris'}],
  flexLabel: 'Not sure yet', useYear: true, newWord: '1st year', oldWord: '2nd year',
  useMbti: true, mbtiRequired: true, mbtiTestUrl: '', theme: ''
};
var KITS = {
  business: {label: 'Business / PBL / DECA', club: {unit: 'Org', units: 'Orgs', useTracks: true, trackWord: 'Track',
    tracks: [{id: 'c', label: 'Consulting'}, {id: 'k', label: 'Case competition (FLC)'}, {id: 't3', label: 'Polaris'}], flexLabel: 'Not sure yet'}},
  robotics: {label: 'Robotics / Engineering', club: {unit: 'Team', units: 'Teams', useTracks: true, trackWord: 'Sub-team',
    tracks: [{id: 'c', label: 'Build / mechanical'}, {id: 'k', label: 'Programming / electrical'}], flexLabel: 'Either / wherever I am needed'}},
  debate: {label: 'Debate / Speech / Mock Trial', club: {unit: 'Squad', units: 'Squads', useTracks: true, trackWord: 'Event type',
    tracks: [{id: 'c', label: 'Debate'}, {id: 'k', label: 'Speech / interp'}], flexLabel: 'Either / still deciding'}},
  service: {label: 'Service / Volunteering', club: {unit: 'Crew', units: 'Crews', useTracks: true, trackWord: 'Focus',
    tracks: [{id: 'c', label: 'Events'}, {id: 'k', label: 'Fundraising'}], flexLabel: 'Either / happy to help anywhere'}},
  general: {label: 'General club (no tracks)', club: {unit: 'Group', units: 'Groups', useTracks: false, trackWord: 'Track', tracks: [], flexLabel: 'Member'}}
};
var KIT_KEYS = ['unit', 'units', 'useTracks', 'trackWord', 'tracks', 'flexLabel', 'newWord', 'oldWord'];
var SETUP_KEYS = ['clubName', 'unit', 'units', 'useTracks', 'trackWord', 'tracks', 'flexLabel', 'useYear', 'newWord', 'oldWord', 'useMbti', 'mbtiRequired', 'mbtiTestUrl', 'theme'];
var TRACK_SW = ['#7aa9dd', '#e8765e', '#4fae8c', '#a98bd0', '#c9a24a', '#4fa3a3'];
var FE_TYPES = [['TEXT', 'Short answer'], ['PARAGRAPH_TEXT', 'Paragraph'], ['MULTIPLE_CHOICE', 'Multiple choice'], ['CHECKBOX', 'Checkboxes'], ['LIST', 'Dropdown']];
var ROLE_WORD = {member: 'Member', admin: 'Admin', master: 'Master'};
var FE_EMPTY = function () { return {items: null, snap: '', err: '', loading: false, busy: false}; };

function admClone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function admErr(r) { return (r && r.error) || 'The backend did not answer. Try again.'; }
function keepVal(k, d) { return ADM.keep[k] != null ? ADM.keep[k] : (d == null ? '' : d); }
function admMine() { return ROUTE.view === 'club' || ROUTE.view === 'admin'; }
function admNote(k) {
  var n = ADM.note[k];
  return n ? '<p class="note' + (n.bad ? ' warn' : '') + '"><span>' + esc(n.text) + '</span><button class="link" data-act="admNoteX" data-k="' + esc(k) + '">Dismiss</button></p>' : '';
}
function roleOpts(cur, list) {
  return (list || ['member', 'admin', 'master']).map(function (v) { return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + ROLE_WORD[v] + '</option>'; }).join('');
}
function roleSelect(cur, act, data) { return '<select class="mini" data-act="' + act + '"' + data + ' aria-label="Role">' + roleOpts(cur) + '</select>'; }
/* Values the backend wrote to the club record itself (cloneForm,
   republishForm, calendarSync) go into BASE as well, so the next item-by-item
   save does not take them for this browser's edits. */
function admTakeCfg(ch) {
  Object.keys(ch).forEach(function (k) { M.cfg[k] = admClone(ch[k]); if (BASE) BASE[k] = admClone(ch[k]); });
  rebuild();
}

/* ---------- the confirmation sheet ----------
   Destructive steps say what goes and what stays. The ones that wipe a club
   also ask for its code to be typed, as the classic page does (the backend
   checks it again). */
function admConfirm(o) {
  ADM.confirm = o;
  openSheet('<form class="form" data-act="admConfirmGo"><header class="sh"><h3>' + esc(o.title) + '</h3></header><p class="mb">' + esc(o.body) + '</p>' +
    (o.type ? '<label class="fld"><span>Type <b class="num">' + esc(o.type) + '</b> to confirm</span><input name="admtyped" data-want="' + esc(o.type) + '" autocomplete="off" autocapitalize="none" spellcheck="false"></label>' : '') +
    '<div class="sheetacts"><button class="btn' + (o.calm ? '' : ' admdanger') + '"' + (o.type ? ' disabled' : '') + '>' + esc(o.label) + '</button><button type="button" class="btn ghost" data-act="closeSheet">Cancel</button></div></form>');
}
SUBMIT_EXT.admConfirmGo = function (f) {
  var o = ADM.confirm; if (!o) return closeSheet();
  var typed = f.admtyped ? f.admtyped.value.trim() : '';
  if (o.type && typed.toLowerCase() !== o.type.toLowerCase()) return toast('Type ' + o.type + ' exactly to confirm.', true);
  ADM.confirm = null; closeSheet(); o.fn(typed);
};
ACT_EXT.admNoteX = function (el, d) { delete ADM.note[d.k]; render(); };

/* =====================================================================
   Club settings (officers)
   ===================================================================== */
VIEWS.club = function (sub) {
  sub = sub || 'setup';
  var n = (rosterList() || []).length;
  var h = subtabs(sub, [['setup', 'Setup'], ['form', 'Sign-up form'], ['roster', 'Roster', n || ''], ['calendar', 'Calendar']], 'club');
  if (M.demo && !M.master) h += '<p class="note"><span>The demo opens as an officer. <a href="?demo&amp;as=master#admin">Open it as the master account</a> to see access, clubs and password accounts.</span></p>';
  if (sub === 'form') return h + formTab();
  if (sub === 'roster') return h + rosterTab();
  if (sub === 'calendar') return h + calTab();
  return h + setupTab();
};

/* ---------------- setup ---------------- */
function setupFrom(cfg) {
  var d = {};
  SETUP_KEYS.forEach(function (k) { d[k] = admClone(cfg[k] !== undefined ? cfg[k] : CLUB_DEFAULTS[k]); });
  d.clubName = cfg.clubName || M.club || '';
  d.tracks = (d.tracks || []).filter(function (t) { return t && t.id; });
  return d;
}
function setupSync() {
  var f = $('admsetup'), d = ADM.setup; if (!f || !d) return;
  ['clubName', 'unit', 'units', 'trackWord', 'flexLabel', 'newWord', 'oldWord', 'mbtiTestUrl'].forEach(function (k) { if (f[k]) d[k] = f[k].value; });
  ['useTracks', 'useYear', 'useMbti', 'mbtiRequired'].forEach(function (k) { if (f[k]) d[k] = f[k].checked; });
  if (f.theme) d.theme = f.theme.value;
  Array.prototype.forEach.call(f.querySelectorAll('input[data-trk]'), function (i) { var t = d.tracks[+i.getAttribute('data-trk')]; if (t) t.label = i.value; });
}
function trackUse(t) { return M.people.filter(function (p) { return p.track && flat(p.track) === flat(t.label); }).length; }
function setupTab() {
  if (!ADM.setup) { ADM.setup = setupFrom(M.cfg); ADM.setup0 = JSON.stringify(ADM.setup); }
  var d = ADM.setup, dirty = JSON.stringify(d) !== ADM.setup0;
  var tick = function (k, label, dis) { return '<label class="tick"><input type="checkbox" name="' + k + '"' + (d[k] ? ' checked' : '') + (dis ? ' disabled' : '') + '> ' + esc(label) + '</label>'; };
  var fld = function (k, label, ph, type) {
    return '<label class="fld"><span>' + esc(label) + '</span><input name="' + k + '" maxlength="' + (type === 'url' ? 300 : 60) + '"' + (type ? ' type="' + type + '"' : '') +
      ' value="' + esc(d[k] || '') + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '></label>';
  };
  var h = '<form class="card form" id="admsetup" data-act="admSetupSave" novalidate><header><h3>Club setup</h3>' + (dirty ? '<span class="badge gold">Not saved yet</span>' : '') + '</header>' +
    '<p class="meta">The club’s own words, set once. They change everywhere, on the dashboard and the classic page.</p>';
  h += '<div class="fg"><p class="fl">Start from a kit</p><div class="admline"><label class="fld"><span class="admvh">Kit</span><select name="kit">' +
    Object.keys(KITS).map(function (k) { return '<option value="' + k + '">' + esc(KITS[k].label) + '</option>'; }).join('') + '</select></label>' +
    '<button type="button" class="btn sm ghost" data-act="admKit">Fill in from the kit</button></div><p class="hint">A kit fills in the names and tracks below. Nothing is saved until you press Save.</p></div>';
  h += '<div class="fg"><p class="fl">Names</p><div class="row3">' + fld('clubName', 'Club name') + fld('unit', 'A team is called', 'Org') + fld('units', 'Several are called', 'Orgs') + '</div></div>';
  h += '<div class="fg"><p class="fl">How the club divides</p>' + tick('useTracks', 'This club splits into tracks or sub-teams');
  if (d.useTracks) {
    h += '<div class="row2">' + fld('trackWord', 'A division is called', 'Track') + fld('flexLabel', 'Wording for no preference', 'Not sure yet') + '</div><div class="admtracks">' +
      d.tracks.map(function (t, i) {
        var n = trackUse(t);
        return '<div class="admtrack"><span class="sw" style="background:' + TRACK_SW[i % TRACK_SW.length] + '"></span><input data-trk="' + i + '" maxlength="60" value="' + esc(t.label) + '" aria-label="Track name">' +
          (n ? '<span class="hint">' + plural(n, 'member') + '</span>' : '') + '<button type="button" class="x" data-act="admTrackRm" data-i="' + i + '" aria-label="Remove ' + esc(t.label) + '">' + icon('close') + '</button></div>';
      }).join('') + (d.tracks.length ? '' : '<p class="hint">No tracks yet.</p>') + '</div>' +
      '<div class="rowacts"><button type="button" class="qbtn" data-act="admTrackAdd">' + icon('plus') + '<span>Add a track</span></button></div>' +
      '<p class="hint">Members who pick the no-preference option are the flexible ones the draft uses to even out lopsided ' + esc((d.units || 'Orgs').toLowerCase()) + '. Keep that option on the sign-up form.</p>';
  }
  h += '</div>';
  h += '<div class="fg"><p class="fl">Membership</p>' + tick('useYear', 'Track how long members have been in the club') +
    (d.useYear ? '<div class="row2">' + fld('newWord', 'Newer members are', '1st year') + fld('oldWord', 'Longer-standing members are', '2nd year') + '</div>' : '') + '</div>';
  h += '<div class="fg"><p class="fl">Personality types</p>' + tick('useMbti', 'Collect MBTI and use it to spread types across teams') +
    tick('mbtiRequired', 'Hold the draft until every member has one', !d.useMbti) + fld('mbtiTestUrl', 'Link to the test everyone takes', 'https://www.16personalities.com/free-personality-test', 'url') + '</div>';
  /* On the chapter's own address the colours are settled (auth.js fixes the look there). */
  if (location.hostname !== 'org.deanzapbl.com')
    h += '<div class="fg"><p class="fl">Chapter colours</p><label class="fld"><span class="admvh">Colours</span><select name="theme"><option value=""' + (d.theme ? '' : ' selected') + '>Default, dark and light</option>' +
      '<option value="pbl"' + (d.theme === 'pbl' ? ' selected' : '') + '>De Anza PBL, crimson and cream</option></select></label>' +
      '<p class="hint">What members of this club see on the classic page. The dashboard’s look is each person’s own choice, under Profile.</p></div>';
  h += '<div class="sendrow admend">' + (dirty ? '<button type="button" class="btn sm ghost" data-act="admSetupReset">Discard changes</button>' : '') +
    '<button class="btn sm"' + (dirty ? '' : ' disabled') + '>Save setup</button></div></form>';
  return h;
}
ACT_EXT.admKit = function () {
  setupSync();
  var f = $('admsetup'), kit = KITS[f && f.kit ? f.kit.value : 'business']; if (!kit) return;
  KIT_KEYS.forEach(function (k) { ADM.setup[k] = admClone(kit.club[k] !== undefined ? kit.club[k] : CLUB_DEFAULTS[k]); });
  render(); toast('Filled in from the ' + kit.label + ' kit. Save to keep it.');
};
ACT_EXT.admTrackAdd = function () {
  setupSync();
  var used = {}; ADM.setup.tracks.forEach(function (t) { used[t.id] = 1; });
  var id = !used.c ? 'c' : !used.k ? 'k' : '';
  for (var i = 3; !id && i < 60; i++) if (!used['t' + i]) id = 't' + i;
  ADM.setup.tracks.push({id: id || uid('t'), label: 'New track'});
  render();
  var all = document.querySelectorAll('#admsetup input[data-trk]'), last = all[all.length - 1];
  if (last) { last.focus(); last.select(); }
};
ACT_EXT.admTrackRm = function (el, d) {
  setupSync();
  var t = ADM.setup.tracks[+d.i]; if (!t) return;
  var n = trackUse(t), drop = function () { ADM.setup.tracks.splice(+d.i, 1); render(); };
  if (!n) return drop();
  admConfirm({title: 'Remove “' + t.label + '”?', label: 'Remove the track', calm: 1,
              body: (n === 1 ? '1 member is' : n + ' members are') + ' on it. Their answer stays as they gave it, but it stops counting as a track once you save.', fn: drop});
};
ACT_EXT.admSetupReset = function () { ADM.setup = null; render(); };
SUBMIT_EXT.admSetupSave = function () {
  setupSync();
  var d = ADM.setup, was = JSON.parse(ADM.setup0), ch = {};
  if (!clean(d.clubName, 60).trim()) return toast('The club needs a name.', true);
  if (d.useTracks && d.tracks.some(function (t) { return !clean(t.label, 60).trim(); })) return toast('Every track needs a name.', true);
  if (String(d.mbtiTestUrl || '').trim() && !safeUrl(d.mbtiTestUrl)) return toast('The test link has to start with https://', true);
  SETUP_KEYS.forEach(function (k) {
    var v = d[k];
    if (k === 'tracks') v = v.map(function (t) { return {id: t.id, label: clean(t.label, 60).trim()}; });
    else if (k === 'mbtiTestUrl') v = safeUrl(v);
    else if (typeof v === 'string') v = clean(v, 60).trim();
    if (JSON.stringify(v) !== JSON.stringify(was[k])) ch[k] = v;
  });
  if (!Object.keys(ch).length) return;
  saveCfg(ch, 'Club setup saved.').then(function (ok) { if (ok) { ADM.setup = null; render(); } });
};

/* ---------------- sign-up form: kit, links, questions ---------------- */
function shareNote(r) {
  if (r.shareFailed && r.shareFailed.length)
    return ' Drive would not give ' + (r.sharedWith || 'you') + ' access to it (' + r.shareFailed[0] + '), so it has to be shared by hand.';
  var out = r.sharedWith ? ' ' + r.sharedWith + ' can edit the questions and read the responses.' : '';
  if (r.ownerSkipped) out += ' The account that runs the Org System owns it; set a club Google account below if the club should own its files.';
  else if (r.ownerFailed && r.ownerFailed.length) out += ' Ownership could not move to ' + (r.owner || 'that account') + ' (' + r.ownerFailed[0] + '), so the Org System account still owns it.';
  else if (r.ownerMoved) out += ' ' + r.owner + ' now owns both files.';
  return out;
}
function formTab() {
  var cfg = M.cfg, f = safeUrl(cfg.formUrl), ed = safeUrl(cfg.formEditUrl), sh = safeUrl(cfg.sheetUrl);
  var h = '<div class="cols"><div class="stack">';
  h += '<section class="card admauto"><header><h3>The club’s sign-up form</h3>' + (f ? '<span class="badge ok">Live</span>' : '') + '</header>' + admNote('form');
  if (!f) {
    h += '<p class="mb">No form yet. This makes ' + esc(M.club) + ' its own copy of the standard sign-up form, attaches a fresh response spreadsheet and gives you access to both. Editing its questions never touches another club’s form.</p>' +
      '<div class="rowacts"><button class="btn sm" data-act="admCloneForm"' + (ADM.busy.clone ? ' disabled' : '') + '>' + (ADM.busy.clone ? 'Creating…' : 'Create this club’s sign-up form') + '</button></div>';
  } else {
    h += '<div class="admlinks"><a class="btn sm ghost" href="' + esc(f) + '" target="_blank" rel="noopener">' + icon('link') + 'Open the form</a>' +
      (ed ? '<a class="btn sm ghost" href="' + esc(ed) + '" target="_blank" rel="noopener">' + icon('edit') + 'Edit in Google Forms</a>' : '') +
      (sh ? '<a class="btn sm ghost" href="' + esc(sh) + '" target="_blank" rel="noopener">' + icon('homework') + 'Open the responses</a>' : '') +
      '<button class="btn sm ghost" data-act="copy" data-v="' + esc(f) + '">Copy the form link</button></div>' +
      '<div class="fg"><p class="fl">If the form says it is not published</p><p class="hint">Republishing turns publishing back on, makes sure it accepts answers and gives you access. The questions and the answers already in stay as they are.</p>' +
      '<div class="rowacts"><button class="btn sm ghost" data-act="admRepublish"' + (ADM.busy.repub ? ' disabled' : '') + '>' + (ADM.busy.repub ? 'Republishing…' : 'Republish the form') + '</button></div></div>';
  }
  h += '</section>';
  h += '<form class="card form admauto" data-act="admLinksSave" novalidate><header><h3>Links and club account</h3></header>' +
    '<label class="fld"><span>Google Form link</span><input name="formUrl" type="url" maxlength="300" data-keep="formUrl" value="' + esc(keepVal('formUrl', cfg.formUrl || '')) + '" placeholder="https://docs.google.com/forms/…"></label>' +
    '<label class="fld"><span>Response spreadsheet link</span><input name="sheetUrl" type="url" maxlength="300" data-keep="sheetUrl" value="' + esc(keepVal('sheetUrl', cfg.sheetUrl || '')) + '" placeholder="https://docs.google.com/spreadsheets/…"></label>' +
    '<label class="fld"><span>Club Google account</span><input name="ownerEmail" type="email" maxlength="60" autocapitalize="none" spellcheck="false" data-keep="ownerEmail" value="' + esc(keepVal('ownerEmail', cfg.ownerEmail || '')) + '" placeholder="yourclub@gmail.com"></label>' +
    '<p class="hint">The club account owns the forms and calendars made from here, so they stay with the club when officers graduate. Only officers see these.</p>' +
    '<div class="sendrow"><button class="btn sm">Save links</button></div></form></div>';
  h += '<div class="stack">' + feCard() + '</div></div>';
  return h;
}
ACT_EXT.admCloneForm = function () {
  ADM.busy.clone = 1; ADM.note.form = {text: 'Copying the form and attaching a spreadsheet. This takes a few seconds.'}; render();
  call('cloneForm', {ownerEmail: M.cfg.ownerEmail || ''}).then(function (r) {
    delete ADM.busy.clone;
    if (!(r && r.ok)) { ADM.note.form = {text: admErr(r), bad: 1}; return render(); }
    admTakeCfg({formUrl: r.formUrl, sheetUrl: r.sheetUrl, formEditUrl: r.editUrl || ''});
    ADM.fe = FE_EMPTY();
    delete ADM.keep.formUrl; delete ADM.keep.sheetUrl;
    ADM.note.form = {text: 'Created “' + (r.title || 'the sign-up form') + '”.' + shareNote(r), bad: !!(r.shareFailed && r.shareFailed.length)};
    render();
  });
};
ACT_EXT.admRepublish = function () {
  ADM.busy.repub = 1; render();
  call('republishForm').then(function (r) {
    delete ADM.busy.repub;
    if (!(r && r.ok)) { ADM.note.form = {text: admErr(r), bad: 1}; return render(); }
    admTakeCfg({formUrl: r.formUrl, formEditUrl: r.editUrl || M.cfg.formEditUrl || ''});
    delete ADM.keep.formUrl;
    var failed = (r.failed || []).length;
    ADM.note.form = {text: 'Republished' + (r.did && r.did.length ? ': ' + r.did.join(', ') : '') + '.' + shareNote(r) + ' Open the form to check it.' +
      (failed ? ' Some settings were refused: ' + r.failed.join('; ') : ''), bad: !!(failed || (r.shareFailed && r.shareFailed.length))};
    render();
  });
};
SUBMIT_EXT.admLinksSave = function (f) {
  var fu = f.formUrl.value.trim(), su = f.sheetUrl.value.trim(), ow = f.ownerEmail.value.trim().toLowerCase();
  if ((fu && !safeUrl(fu)) || (su && !safeUrl(su))) return toast('Links have to start with https://', true);
  if (ow && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ow)) return toast('That club account does not look like an email address.', true);
  var ch = {}, cur = {formUrl: safeUrl(fu), sheetUrl: safeUrl(su), ownerEmail: clean(ow, 60)};
  Object.keys(cur).forEach(function (k) { if ((M.cfg[k] || '') !== cur[k]) ch[k] = cur[k]; });
  ['formUrl', 'sheetUrl', 'ownerEmail'].forEach(function (k) { delete ADM.keep[k]; });
  if (!Object.keys(ch).length) return toast('Nothing changed.');
  if ('formUrl' in ch) ADM.fe = FE_EMPTY();
  saveCfg(ch, 'Links saved.');
};

/* The questions, read from the live form and written back to it. Typing
   only updates ADM.fe (feSync); the list is redrawn for structural changes. */
function feLoad() {
  var fe = ADM.fe;
  if (fe.loading || fe.items || fe.err) return;
  fe.loading = true;
  call('formItems').then(function (r) {
    if (ADM.fe !== fe) return;
    fe.loading = false;
    if (!(r && r.ok)) fe.err = admErr(r);
    else { fe.items = (r.items || []).map(feItem); fe.snap = JSON.stringify(fe.items); }
    if (ROUTE.view === 'club' && ROUTE.sub === 'form') render();
  });
}
function feItem(it) { return {id: it.id || null, title: it.title || '', help: it.help || '', type: it.type, required: !!it.required, options: (it.options || []).slice(), editable: it.editable !== false}; }
function feSync() {
  var items = ADM.fe.items; if (!items) return;
  Array.prototype.forEach.call(document.querySelectorAll('#admfe .feq[data-i]'), function (row) {
    var it = items[+row.getAttribute('data-i')]; if (!it) return;
    var g = function (f) { return row.querySelector('[data-f="' + f + '"]'); };
    it.title = g('title').value; it.help = g('help').value; it.required = g('required').checked;
    var o = g('opts'); if (o) it.options = o.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
  });
}
function feDirty() { return !!ADM.fe.items && JSON.stringify(ADM.fe.items) !== ADM.fe.snap; }
function feCard() {
  var fe = ADM.fe, ed = safeUrl(M.cfg.formEditUrl);
  var h = '<section class="card admauto" id="admfe"><header><h3>Questions</h3>' + (feDirty() ? '<span class="badge gold">Not saved yet</span>' : fe.items ? '<span class="count">' + fe.items.length + '</span>' : '') + '</header>';
  if (!safeUrl(M.cfg.formUrl)) return h + empty('No form yet', 'Create the club’s form first; its questions appear here.') + '</section>';
  if (fe.err) return h + '<p class="note warn"><span>' + esc(fe.err) + '</span>' + (ed ? '<a class="link" href="' + esc(ed) + '" target="_blank" rel="noopener">Open it in Google Forms</a>' : '') +
    '<button class="link" data-act="admFeReload">Try again</button></p></section>';
  if (!fe.items) { feLoad(); return h + '<p class="meta">Reading the form…</p></section>'; }
  h += '<p class="meta">Saving writes straight to the live form: anyone who opens the link next sees the change.</p>';
  h += fe.items.length ? '<div class="feqs">' + fe.items.map(function (it, i) {
    if (!it.editable) return '<div class="feq locked"><div class="feqtop"><span class="fenum num">' + (i + 1) + '</span><span class="tt">' + esc(it.title || 'Untitled') + '</span></div><p class="hint">This kind of item is edited in Google Forms.</p></div>';
    var choice = it.type === 'MULTIPLE_CHOICE' || it.type === 'CHECKBOX' || it.type === 'LIST';
    return '<div class="feq" data-i="' + i + '"><div class="feqtop"><span class="fenum num">' + (i + 1) + '</span>' +
      '<input data-f="title" maxlength="300" value="' + esc(it.title) + '" placeholder="Question" aria-label="Question ' + (i + 1) + '"></div>' +
      '<div class="feqmid"><select class="mini" data-act="admFeType" data-i="' + i + '" aria-label="Answer type">' + FE_TYPES.map(function (t) { return '<option value="' + t[0] + '"' + (it.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select>' +
      '<label class="tick"><input type="checkbox" data-f="required"' + (it.required ? ' checked' : '') + '> Required</label><span class="feqbtns">' +
      '<button type="button" class="ghost icon sm2" data-act="admFeMove" data-i="' + i + '" data-d="-1" aria-label="Move question ' + (i + 1) + ' up"' + (i ? '' : ' disabled') + '><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg></button>' +
      '<button type="button" class="ghost icon sm2" data-act="admFeMove" data-i="' + i + '" data-d="1" aria-label="Move question ' + (i + 1) + ' down"' + (i < fe.items.length - 1 ? '' : ' disabled') + '><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg></button>' +
      '<button type="button" class="ghost icon sm2 danger" data-act="admFeDel" data-i="' + i + '" aria-label="Delete question ' + (i + 1) + '">' + icon('close') + '</button></span></div>' +
      '<input data-f="help" maxlength="500" value="' + esc(it.help) + '" placeholder="Helper text (optional)" aria-label="Helper text for question ' + (i + 1) + '">' +
      (choice ? '<textarea data-f="opts" spellcheck="false" placeholder="One choice per line" aria-label="Choices for question ' + (i + 1) + '">' + esc(it.options.join('\n')) + '</textarea>' : '') + '</div>';
  }).join('') + '</div>' : empty('No questions yet', 'Add the first one.');
  return h + '<div class="sendrow admend"><button class="qbtn" data-act="admFeAdd">' + icon('plus') + '<span>Add a question</span></button><span class="grow"></span>' +
    (feDirty() ? '<button class="btn sm ghost" data-act="admFeReload">Discard changes</button>' : '') +
    '<button class="btn sm" data-act="admFeSave"' + (fe.busy || !feDirty() ? ' disabled' : '') + '>' + (fe.busy ? 'Saving…' : 'Save to the form') + '</button></div></section>';
}
ACT_EXT.admFeReload = function () { ADM.fe = FE_EMPTY(); render(); };
ACT_EXT.admFeAdd = function () {
  feSync();
  ADM.fe.items.push({id: null, title: '', help: '', type: 'TEXT', required: false, options: [], editable: true});
  render();
  var all = document.querySelectorAll('#admfe .feq [data-f="title"]'); if (all.length) all[all.length - 1].focus();
};
ACT_EXT.admFeMove = function (el, d) {
  feSync();
  var l = ADM.fe.items, i = +d.i, j = i + (+d.d);
  if (j < 0 || j >= l.length) return;
  var t = l[i]; l[i] = l[j]; l[j] = t; render();
  var b = document.querySelector('#admfe .feq[data-i="' + j + '"] [data-act="admFeMove"][data-d="' + d.d + '"]:not([disabled])'); if (b) b.focus();
};
ACT_EXT.admFeDel = function (el, d) {
  feSync();
  var it = ADM.fe.items[+d.i]; if (!it) return;
  admConfirm({title: 'Delete “' + (it.title || 'this question') + '”?', label: 'Delete the question',
              body: 'Answers already collected stay in the spreadsheet; new responses will not have this column. It leaves the live form when you save.',
              fn: function () { ADM.fe.items.splice(+d.i, 1); render(); }});
};
CHANGE_EXT.admFeType = function (el, d, v) { feSync(); ADM.fe.items[+d.i].type = v; render(); };
ACT_EXT.admFeSave = function () {
  feSync();
  var fe = ADM.fe; if (fe.busy || !fe.items) return;
  var bad = fe.items.filter(function (it) { return it.editable && !String(it.title || '').trim(); }).length;
  if (bad) return toast('Every question needs a title. ' + (bad === 1 ? '1 is' : bad + ' are') + ' still blank.', true);
  var payload = fe.items.filter(function (it) { return it.editable; }).map(function (it) {
    return {id: it.id, title: it.title.trim(), help: it.help || '', type: it.type, required: !!it.required, options: it.options || []};
  });
  if (!payload.length) return toast('A form needs at least one question.', true);
  fe.busy = true; render();
  call('saveFormItems', {items: payload}).then(function (r) {
    fe.busy = false;
    if (!(r && r.ok)) { render(); return toast(admErr(r), true); }
    fe.items = (r.items || []).map(feItem); fe.snap = JSON.stringify(fe.items);
    render(); toast('Saved. The live form now asks these questions.');
  });
};

/* ---------------- roster ---------------- */
function rosterList() { return ADM.roster || (RAW && RAW.roster && RAW.roster.roster) || null; }
function canDel(u) {
  var who = String(u.who || '').toLowerCase();
  return !!who && who !== String(M.email || '').toLowerCase() && String(u.role || '').toLowerCase() !== 'master' && !u.isMaster;
}
function acctRow(u, i, showClub, act) {
  var nm = ((u.first || '') + ' ' + (u.last || '')).trim(), role = String(u.role || 'member');
  return '<li class="admrow"><span class="who">' + avatar({name: nm || u.email || u.who}) + '<span><span class="pn">' + esc(nm || u.email || u.who) + '</span><span class="pe">' + esc(u.email || u.who) + '</span></span></span>' +
    '<span class="admc">' + (role !== 'member' ? '<span class="badge' + (role === 'master' ? ' gold' : '') + '">' + esc(ROLE_WORD[role] || role) + '</span> ' : '<span class="hint">Member</span> ') +
    (showClub ? '<span class="hint">· ' + esc(u.affName || u.aff) + '</span>' : '') + '</span>' +
    '<span class="admc hint">' + (u.kind === 'google' ? 'Google' : 'Password') + (u.joined ? ' · joined ' + esc(String(u.joined).slice(0, 10)) : '') + '</span>' +
    '<span class="admx">' + (canDel(u) ? '<button class="btn sm ghost danger" data-act="' + act + '" data-i="' + i + '" aria-label="Remove ' + esc(nm || u.who) + '">Remove</button>' : '') + '</span></li>';
}
function rosterTab() {
  var all = rosterList(), code = M.aff || 'default';
  var h = '<section class="card"><header><h3>Everyone who signed up</h3>' + (all ? '<span class="count">' + all.length + '</span>' : '') + '<button class="btn sm ghost" data-act="admRosterReload">Refresh</button></header>';
  if (!all) {
    if (!ADM.busy.roster && !ADM.err.roster) ACT_EXT.admRosterReload();
    h += '<p class="meta">' + esc(ADM.err.roster || 'Reading the roster…') + '</p></section>';
  } else {
    var q = flat(ADM.rq), rows = all.filter(function (u) {
      if (ADM.rrole && u.role !== ADM.rrole) return false;
      return !q || flat((u.first || '') + (u.last || '') + (u.email || u.who || '')).indexOf(q) > -1;
    });
    ADM.rosterShown = rows;
    h += '<p class="meta">The club’s accounts: signing up is how someone gets on the roster. Removing an account signs them out; what is logged under their name stays, and they can sign up again with the join code.</p>' +
      '<div class="toolbar admbar"><label class="search">' + icon('search') + '<input id="admrq" data-k="rq" type="search" placeholder="Search names or emails" value="' + esc(ADM.rq) + '" autocomplete="off" aria-label="Search the roster"></label>' +
      '<select class="mini" data-act="admFilter" data-k="rrole" aria-label="Role"><option value="">All roles</option>' + roleOpts(ADM.rrole) + '</select></div>';
    h += !all.length ? empty('Nobody has signed up yet', 'Share the join code and the sign-up form.') : !rows.length ? empty('Nobody matches', 'Clear the search or the role.') :
      '<ul class="admrows">' + rows.map(function (u, i) { return acctRow(u, i, false, 'admRosterRm'); }).join('') + '</ul>' + (rows.length < all.length ? '<p class="hint">' + rows.length + ' of ' + all.length + ' shown.</p>' : '');
    h += '</section>';
  }
  h += '<section class="card"><header><h3>Clear this club’s data</h3></header><p class="mb">Removes the roster sheet rows, points and attendance for <b>' + esc(M.club) + '</b> (code <span class="num">' + esc(code) + '</span>). ' +
    'Accounts, setup, teams, homework and messages on the club record stay. It cannot be undone.</p><p class="hint">For handing the club over between semesters.</p>' +
    '<div class="rowacts"><button class="btn sm ghost danger" data-act="admPurgeMine">Clear data…</button></div></section>';
  return h;
}
ACT_EXT.admRosterReload = function () {
  ADM.busy.roster = 1; delete ADM.err.roster;
  return call('clubRoster').then(function (r) {
    delete ADM.busy.roster;
    if (!(r && r.ok)) { ADM.err.roster = admErr(r); if (admMine()) render(); return; }
    ADM.roster = r.roster || []; RAW.roster = r; rebuild();
    if (admMine()) render();
  });
};
function removeAccount(u, after) {
  var nm = ((u.first || '') + ' ' + (u.last || '')).trim() || u.email || u.who;
  admConfirm({title: 'Remove ' + nm + '?', label: 'Remove the account',
    body: 'Their account and saved profile are deleted, and they are signed out the next time their session is checked. Anything already logged against their name stays. They can sign up again with the join code.',
    fn: function () {
      call('deleteSignup', {who: u.who, kind: u.kind, aff: u.aff}).then(function (r) {
        if (!(r && r.ok)) return toast(admErr(r), true);
        toast('Removed ' + nm + '.'); after();
      });
    }});
}
ACT_EXT.admRosterRm = function (el, d) { var u = (ADM.rosterShown || [])[+d.i]; if (u) removeAccount(u, ACT_EXT.admRosterReload); };
function purge(code, name) {
  admConfirm({title: 'Clear data for ' + name + '?', type: code, label: 'Clear data',
    body: 'This removes its roster rows, points and attendance. The club, its accounts and its setup stay. It cannot be undone.',
    fn: function (typed) {
      call('purgeClub', {code: code, confirm: typed}).then(function (r) {
        if (!(r && r.ok)) return toast(admErr(r), true);
        toast('Cleared the data in ' + name + '.');
        if (code === (M.aff || 'default') && typeof reloadClub === 'function') reloadClub();
      });
    }});
}
ACT_EXT.admPurgeMine = function () { purge(M.aff || 'default', M.club); };

/* ---------------- calendar connection ---------------- */
function calHideOf() { var h = M.cfg.calHide || {}; return {ids: (h.ids || []).slice(), series: (h.series || []).slice()}; }
function gHidden(e, h) { return h.ids.indexOf(e.id) > -1 || (!!e.gid && h.series.indexOf(e.gid) > -1); }
/* The backend marks hidden events only when the club is read, so the marks
   are redone here after every change (and put back if the save fails). */
function markHidden(h) {
  ((RAW.all.gcal && RAW.all.gcal.events) || []).forEach(function (e) { if (gHidden(e, h)) e.hidden = 1; else delete e.hidden; });
}
function saveHide(h, msg) {
  var live = {}; M.gcal.forEach(function (x) { live[x.id] = 1; });
  /* Hides for events that have left the window are trimmed, so the list does not grow all year. */
  if (M.gcal.length) h.ids = h.ids.filter(function (id) { return live[id]; });
  h = {ids: h.ids.slice(-600), series: h.series.slice(-200)};
  markHidden(h);
  saveCfg({calHide: h}, msg).then(function (ok) { if (!ok) { markHidden(calHideOf()); rebuild(); render(); } });
}
function evRow(e, extra, btns) {
  return '<li class="item' + (extra.off ? ' admoff' : '') + '"><div class="when"><span class="d">' + esc(fmtDay(e.date)) + '</span>' + (extra.noTime ? '' : '<span class="t">' + esc(e.time || 'All day') + '</span>') + '</div>' +
    '<div class="what"><p class="tt">' + esc(e.title) + (extra.badges || '') + '</p>' + (extra.meta ? '<p class="meta">' + esc(extra.meta) + '</p>' : '') + '<div class="rowacts">' + btns + '</div></div></li>';
}
function qb(act, id, ic, label, more) { return '<button class="qbtn' + (more && more.cls ? ' ' + more.cls : '') + '" data-act="' + act + '" data-id="' + esc(id) + '"' + (more && more.m ? ' data-m="' + more.m + '"' : '') + '>' + icon(ic) + '<span>' + esc(label) + '</span></button>'; }
function calTab() {
  var cfg = M.cfg, h0 = calHideOf(), t0 = today(), cid = cfg.gcalId || '';
  var g = M.gcal.slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)) || tmin(a.time) - tmin(b.time); });
  var hid = g.filter(function (e) { return gHidden(e, h0); }).length;
  var h = '<div class="cols"><div class="stack">';
  h += '<section class="card admauto"><header><h3>Google Calendar</h3>' + (cid ? '<span class="badge ok">Connected</span>' : '<span class="badge">Not connected</span>') + '</header>' + admNote('cal') +
    '<p class="mb">' + (cid ? 'Connected to <b>' + esc(cid) + '</b>. ' + plural(g.length - hid, 'event') + ' shared with members' + (hid ? ', ' + hid + ' hidden' : '') +
      (M.calSynced ? ', refreshed ' + esc(ago(new Date(M.calSynced).toISOString())) : '') + '. New events there show up here within half an hour.' :
      'Not connected yet. Connecting sends the events added here and the season’s dates to the chapter’s Google Calendar, and reads it back.') + '</p>' +
    '<form class="admline" data-act="admCalSync"><label class="fld"><span>Chapter calendar ID</span><input name="calid" data-keep="calId" value="' + esc(keepVal('calId', cid)) + '" placeholder="Leave empty to make one" autocapitalize="none" spellcheck="false"></label>' +
    '<button class="btn sm"' + (ADM.calBusy ? ' disabled' : '') + '>' + icon('calendar') + (ADM.calBusy ? 'Talking to Google…' : 'Connect &amp; refresh') + '</button></form>' +
    '<p class="hint">Two-way and additive: Google gains anything added here, and anything put straight into Google shows up here. Nothing is deleted on either side. It also refreshes by itself every half hour.</p>' +
    (safeUrl(cfg.gcalUrl) ? '<div class="rowacts"><a class="btn sm ghost" href="' + esc(safeUrl(cfg.gcalUrl)) + '" target="_blank" rel="noopener">' + icon('arrow') + 'Open in Google Calendar</a></div>' : '') + '</section>';
  h += '<form class="card form admauto" data-act="admShareSave" novalidate><header><h3>Members’ calendar link</h3></header>' +
    '<label class="fld"><span>Shareable link to the org calendar</span><input name="calShare" type="url" maxlength="300" data-keep="calShare" value="' + esc(keepVal('calShare', cfg.calShare || '')) + '" placeholder="Google Calendar → Settings → Integrate calendar"></label>' +
    '<p class="hint">' + (M.calFeedKey ? 'Members already get a private feed of exactly what they see on Calendar; this link is a fallback. ' : 'Members see “Add the org calendar” on Calendar. ') +
    'It only opens for people who can see that calendar in Google, so make it public or share it with the chapter. If it is the synced calendar, anyone it works for also sees what is hidden here.</p>' +
    '<div class="sendrow">' + (cid ? '<button type="button" class="btn sm ghost" data-act="admShareFill">Use the synced calendar</button>' : '') + '<button class="btn sm">Save link</button></div></form>';
  /* The built-in season dates: hidden ones go on seasonOff (and, once synced, are kept from members as EBOD-only). */
  var off = {}; (cfg.seasonOff || []).forEach(function (id) { off[id] = 1; });
  h += '<section class="card admtall"><header><h3>Season dates</h3><span class="count">' + SEASON.filter(function (e) { return !off[e.id]; }).length + ' of ' + SEASON.length + ' shown</span></header>' +
    '<p class="meta">Built in for Fall 2026, so every member sees them without anyone adding them.</p><ul class="items">' + SEASON.map(function (e) {
      return evRow(e, {off: off[e.id], noTime: 1, badges: off[e.id] ? ' <span class="badge">Hidden</span>' : ''}, qb('admSeason', e.id, off[e.id] ? 'check' : 'close', off[e.id] ? 'Show to members' : 'Hide'));
    }).join('') + '</ul></section>';
  h += '</div><div class="stack">';
  /* Events from Google: hide one occurrence, or every occurrence of a repeating one. */
  var up = g.filter(function (e) { return (e.end || e.date) >= t0; }), past = g.length - up.length, list = ADM.calPast ? g : up;
  h += '<section class="card admtall"><header><h3>From Google Calendar</h3><span class="count">' + list.length + '</span></header>';
  if (!g.length) h += empty(cid ? 'Nothing on the calendar' : 'Not connected', cid ? 'Events put on ' + cid + ' show up here.' : 'Connect a calendar and its events show up here.');
  else {
    h += '<p class="meta">Members see these unless you hide them. Hiding is not deleting: hidden events stay on Google and come back with Show.</p>' +
      (list.length ? '<ul class="items">' + list.slice(0, 150).map(function (e) {
        var series = !!e.gid && h0.series.indexOf(e.gid) > -1, hidden = gHidden(e, h0);
        var btns = series ? qb('admGHide', e.id, 'check', 'Show every one', {m: 'showall'}) :
          qb('admGHide', e.id, hidden ? 'check' : 'close', hidden ? 'Show to members' : 'Hide', {m: hidden ? 'show' : 'hide'}) +
          (e.rec && e.gid && !hidden ? qb('admGHide', e.id, 'close', 'Hide every one', {m: 'hideall'}) : '');
        return evRow(e, {off: hidden, badges: (hidden ? ' <span class="badge">Hidden from members</span>' : '') + (e.rec ? ' <span class="badge">Repeats</span>' : ''),
          meta: [e.where, e.end && e.end !== e.date ? 'through ' + fmtDay(e.end) : ''].filter(Boolean).join(' · ')}, btns);
      }).join('') + '</ul>' : empty('Nothing coming up', '')) +
      (past ? '<button class="link" data-act="admCalPast">' + (ADM.calPast ? 'Hide past events' : 'Show ' + plural(past, 'past event')) + '</button>' : '');
  }
  h += '</section>';
  var own = (cfg.events || []).filter(function (e) { return e && e.id && !e.pulled; }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  h += '<section class="card admtall"><header><h3>Added here</h3><span class="count">' + own.length + '</span><button class="btn sm ghost" data-act="calNew">' + icon('plus') + 'Event</button></header>' +
    (own.length ? '<ul class="items">' + own.map(function (e) {
      return evRow(e, {off: e.ebod, badges: (e.ebod ? ' <span class="badge">EBOD only</span>' : '') + (e.gid ? ' <span class="badge ok">On Google</span>' : ''), meta: e.where || ''},
        qb('admEvHide', e.id, e.ebod ? 'check' : 'close', e.ebod ? 'Show to members' : 'Hide from members') + qb('admEvDel', e.id, 'close', 'Delete', {cls: 'danger'}));
    }).join('') + '</ul>' : empty('Nothing added here', 'Events officers add show up on everyone’s calendar.')) + '</section>';
  return h + '</div></div>';
}
SUBMIT_EXT.admCalSync = function (f) {
  if (ADM.calBusy) return;
  var off = {}, have = {};
  (M.cfg.seasonOff || []).forEach(function (id) { off[id] = 1; });
  var own = (M.cfg.events || []).filter(function (e) { return e && e.id && !e.pulled && !off[e.id]; });
  own.forEach(function (e) { have[e.id] = 1; });
  /* The season's dates go too, as the classic page sends them; they come back as the club's own events. */
  var season = SEASON.filter(function (e) { return !have[e.id] && !off[e.id]; }).map(function (e) { return {id: e.id, title: e.title, date: e.date, cat: e.cat, where: e.where || ''}; });
  var body = {events: own.concat(season)}, want = f.calid.value.trim();
  if (want && want !== M.cfg.gcalId) body.calendarId = want;
  ADM.calBusy = true; ADM.note.cal = {text: 'Talking to Google Calendar. Making a calendar for the first time can take a minute.'}; render();
  call('calendarSync', body).then(function (r) {
    ADM.calBusy = false; delete ADM.keep.calId;
    if (!(r && r.ok)) { ADM.note.cal = {text: admErr(r), bad: 1}; return render(); }
    if (r.gcal) RAW.all.gcal = r.gcal;
    admTakeCfg({events: r.events || M.cfg.events || [], gcalId: r.calendarId || '', gcalUrl: r.calendarUrl || '', gcalLinked: !!r.linked});
    var hh = calHideOf(), n = M.gcal.length, hid = M.gcal.filter(function (e) { return gHidden(e, hh); }).length;
    var t = 'Connected to ' + (r.calendarId || 'the calendar') + '. ' + (r.pushed ? r.pushed + ' sent to Google, ' : '') + (r.adopted ? r.adopted + ' matched to events already there, ' : '') +
      n + ' read back, ' + (n - hid) + ' shared with members' + (hid ? ' and ' + hid + ' hidden' : '') + '.';
    if (r.remaining) t += ' ' + r.remaining + ' still to send: press it again.';
    if (r.shareError) t += ' ' + r.shareError;
    else if (r.sharedWith) t += ' ' + r.sharedWith + ' can edit it.';
    else if (!r.linked) t += ' Set a club Google account under Sign-up form so the chapter owns its calendar.';
    ADM.note.cal = {text: t, bad: !!r.shareError};
    render();
  });
};
ACT_EXT.admShareFill = function () { ADM.keep.calShare = 'https://calendar.google.com/calendar/u/0?cid=' + encodeURIComponent(M.cfg.gcalId || ''); render(); };
SUBMIT_EXT.admShareSave = function (f) {
  var v = f.calShare.value.trim().replace(/^webcal:/i, 'https:');
  if (v && !safeUrl(v)) return toast('That needs to be a full link starting with https://', true);
  delete ADM.keep.calShare;
  if ((M.cfg.calShare || '') === safeUrl(v)) return toast('Nothing changed.');
  saveCfg({calShare: safeUrl(v)}, v ? 'Saved. Members can add the org calendar now.' : 'Link removed.');
};
ACT_EXT.admGHide = function (el, d) {
  var e = M.gcal.filter(function (x) { return x.id === d.id; })[0]; if (!e) return;
  var h = calHideOf(), drop = function (a, v) { return a.filter(function (x) { return x !== v; }); }, m = d.m;
  if (m === 'hide') h.ids = drop(h.ids, e.id).concat([e.id]);
  else if (m === 'show') h.ids = drop(h.ids, e.id);
  else if (m === 'hideall') {
    h.series = drop(h.series, e.gid).concat([e.gid]);
    var mine = M.gcal.filter(function (x) { return x.gid === e.gid; }).map(function (x) { return x.id; });
    h.ids = h.ids.filter(function (id) { return mine.indexOf(id) < 0; });
  } else if (m === 'showall') h.series = drop(h.series, e.gid);
  saveHide(h, {hide: 'Hidden from members.', show: 'Members see it again.', hideall: 'Every “' + e.title + '” is hidden, including future ones.', showall: 'Members see every “' + e.title + '” again.'}[m]);
};
ACT_EXT.admCalPast = function () { ADM.calPast = !ADM.calPast; render(); };
ACT_EXT.admEvHide = function (el, d) {
  var list = admClone(M.cfg.events || []), e = list.filter(function (x) { return x && x.id === d.id; })[0]; if (!e) return;
  e.ebod = !e.ebod;
  saveCfg({events: list}, e.ebod ? 'Only officers see it now.' : 'Members see it again.');
};
ACT_EXT.admEvDel = function (el, d) {
  var e = (M.cfg.events || []).filter(function (x) { return x && x.id === d.id; })[0]; if (!e) return;
  admConfirm({title: 'Delete “' + e.title + '”?', label: 'Delete the event',
    body: 'It comes off the calendar here, for everyone.' + (e.gid ? ' It is also on Google Calendar: delete it there too, or it comes back as a Google event on the next refresh.' : ''),
    fn: function () {
      var ch = {events: (M.cfg.events || []).filter(function (x) { return !(x && x.id === d.id); })};
      if (/^f26-/.test(d.id) && (M.cfg.seasonOff || []).indexOf(d.id) < 0) ch.seasonOff = (M.cfg.seasonOff || []).concat([d.id]);
      saveCfg(ch, 'Deleted.');
    }});
};
ACT_EXT.admSeason = function (el, d) {
  var off = (M.cfg.seasonOff || []).slice(), on = off.indexOf(d.id) > -1, ch = {};
  ch.seasonOff = on ? off.filter(function (x) { return x !== d.id; }) : off.concat([d.id]);
  /* Once synced, a season date is also one of the club's own events; it is kept from members the same way. */
  var ev = admClone(M.cfg.events || []), hit = ev.filter(function (x) { return x && x.id === d.id; })[0];
  if (hit) { hit.ebod = !on; ch.events = ev; }
  saveCfg(ch, on ? 'Members see it again.' : 'Hidden from members.');
};

/* =====================================================================
   System admin (master account)
   ===================================================================== */
var ADM_LOAD = {roles: ['listRoles', 'roles'], affs: ['listAffiliations', 'affiliations'], signups: ['listSignups', 'signups'], users: ['listUsers', 'users']};
function admLoad(k, force) {
  if (ADM.busy['l' + k] || (!force && (ADM[k] || ADM.err[k]))) return;
  ADM.busy['l' + k] = 1;
  call(ADM_LOAD[k][0]).then(function (r) {
    delete ADM.busy['l' + k];
    if (!(r && r.ok)) ADM.err[k] = admErr(r);
    else { delete ADM.err[k]; ADM[k] = r[ADM_LOAD[k][1]] || []; }
    if (admMine()) render();
  });
}
function clubOpts(cur) {
  var rows = (ADM.affs || []).slice();
  if (!rows.some(function (a) { return a.code === 'default'; })) rows.unshift({code: 'default', name: 'default'});
  return rows.map(function (a) { return '<option value="' + esc(a.code) + '"' + (a.code === cur ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join('');
}
function loadingLine(k, what) {
  return '<p class="meta">' + esc(ADM.err[k] || 'Reading ' + what + '…') + (ADM.err[k] ? ' <button class="link" data-act="admReload" data-k="' + k + '">Try again</button>' : '') + '</p>';
}
ACT_EXT.admReload = function (el, d) { delete ADM.err[d.k]; ADM[d.k] = ADM[d.k] || null; admLoad(d.k, true); render(); };

VIEWS.admin = function (sub) {
  if (!M.master) return empty('The master account only', 'Access, clubs and password accounts are run by the account set in the Apps Script.');
  sub = sub || 'access';
  var h = subtabs(sub, [['access', 'Access'], ['clubs', 'Clubs', ADM.affs ? ADM.affs.length : ''], ['signups', 'Every sign-up'], ['accounts', 'Password accounts']], 'admin');
  if (sub === 'clubs') return h + clubsTab();
  if (sub === 'signups') return h + signupsTab();
  if (sub === 'accounts') return h + accountsTab();
  return h + accessTab();
};

/* ---------------- access and roles ---------------- */
function accessTab() {
  admLoad('roles'); admLoad('affs');
  var h = '<form class="card form" data-act="admGrant" novalidate><header><h3>Grant a role</h3></header>' +
    '<p class="meta">Officers are per club. Pick the club an address runs: it is the only club they can see or change, and granting again moves them rather than adding a second. Use the exact Google address they sign in with.</p>' +
    '<div class="row3"><label class="fld"><span>Google address</span><input name="email" type="email" maxlength="80" autocapitalize="none" spellcheck="false" data-keep="gEmail" value="' + esc(keepVal('gEmail')) + '" placeholder="officer@gmail.com"></label>' +
    '<label class="fld"><span>Role</span><select name="role" data-keep="gRole">' + roleOpts(keepVal('gRole', 'admin'), ['admin', 'member', 'master']) + '</select></label>' +
    '<label class="fld"><span>Club they run</span><select name="club" data-keep="gClub">' + clubOpts(keepVal('gClub', M.aff)) + '</select></label></div>' +
    '<div class="sendrow"><button class="btn sm">Grant role</button></div></form>';
  h += '<section class="card"><header><h3>Current roles</h3>' + (ADM.roles ? '<span class="count">' + ADM.roles.length + '</span>' : '') + '<button class="btn sm ghost" data-act="admReload" data-k="roles">Refresh</button></header>';
  if (!ADM.roles) return h + loadingLine('roles', 'the roles list') + '</section>';
  h += '<p class="meta">Admin runs one club; master reaches every club. Anyone not listed is a member of the club they joined.</p>';
  h += '<ul class="admrows">' + ADM.roles.map(function (x) {
    if (x.locked) return '<li class="admrow"><span class="em">' + esc(x.email) + '</span><span class="admc hint">' + esc(x.affName || 'every club') + '</span><span class="admc"><span class="badge gold">Master · set in the script</span></span><span class="admx"></span></li>';
    return '<li class="admrow"><span class="em">' + esc(x.email) + '</span>' +
      '<span class="admc">' + (ADM.affs ? '<select class="mini" data-act="admRoleClub" data-email="' + esc(x.email) + '" data-role="' + esc(x.role) + '" aria-label="Club ' + esc(x.email) + ' runs">' + clubOpts(x.aff) + '</select>' : '<span class="hint">' + esc(x.affName || x.aff) + '</span>') + '</span>' +
      '<span class="admc">' + roleSelect(x.role, 'admRole', ' data-email="' + esc(x.email) + '"') + '</span>' +
      '<span class="admx"><button class="btn sm ghost danger" data-act="admRoleRm" data-email="' + esc(x.email) + '" aria-label="Remove ' + esc(x.email) + '">Remove</button></span></li>';
  }).join('') + '</ul></section>';
  return h;
}
SUBMIT_EXT.admGrant = function (f) {
  var em = f.email.value.trim().toLowerCase(), role = f.role.value, club = f.club.value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast('That does not look like an email address.', true);
  call('setRole', {email: em, role: role, club: club}).then(function (r) {
    if (!(r && r.ok)) return toast(admErr(r), true);
    delete ADM.keep.gEmail;
    var nm = ((ADM.affs || []).filter(function (a) { return a.code === r.aff; })[0] || {}).name || r.aff;
    /* Only claim the club the backend says it wrote: an older deployment ignores the club field. */
    if (r.aff === undefined) toast(em + ' is now ' + role + ', but this backend files them under the club being viewed. Redeploy the Apps Script to choose the club.', true);
    else if (club && String(r.aff).toLowerCase() !== club.toLowerCase()) toast(em + ' is now ' + role + ' of ' + nm + ', not the club picked. The backend refused that choice.', true);
    else toast(em + ' is now ' + ROLE_WORD[role].toLowerCase() + ' of ' + nm + '.');
    admLoad('roles', true);
  });
};
CHANGE_EXT.admRole = function (el, d, v) {
  call('setRole', {email: d.email, role: v}).then(function (r) {
    if (!(r && r.ok)) toast(admErr(r), true); else toast(d.email + ' is now ' + ROLE_WORD[v].toLowerCase() + '.');
    admLoad('roles', true);
  });
};
/* Moving an officer is a different act from changing their rank, so it asks first. */
CHANGE_EXT.admRoleClub = function (el, d, v) {
  var a = (ADM.affs || []).filter(function (x) { return x.code === v; })[0], label = a ? a.name : v;
  render();
  admConfirm({title: 'Move ' + d.email + '?', label: 'Move them', calm: 1,
    body: 'They become ' + (d.role === 'admin' ? 'an officer' : 'a ' + d.role) + ' of “' + label + '” and nothing else. It is the only club they can see or change, and they leave the one they are in now.',
    fn: function () {
      call('setRole', {email: d.email, role: d.role, club: v}).then(function (r) {
        if (!(r && r.ok)) return toast(admErr(r), true);
        toast(d.email + ' now runs ' + label + ', and only that club.'); admLoad('roles', true);
      });
    }});
};
ACT_EXT.admRoleRm = function (el, d) {
  admConfirm({title: 'Remove ' + d.email + '?', label: 'Remove',
    body: 'Their row comes off the roles list, which also unties the address from its club: next time they sign in they are asked for a join code. To keep them in the club as a member, set their role to Member instead.',
    fn: function () {
      call('removeRole', {email: d.email}).then(function (r) {
        if (!(r && r.ok)) return toast(admErr(r), true);
        toast('Removed ' + d.email + '.'); admLoad('roles', true);
      });
    }});
};

/* ---------------- clubs ---------------- */
function clubsTab() {
  admLoad('affs');
  var h = '<form class="card form" data-act="admAffNew" novalidate><header><h3>New club</h3></header>' +
    '<p class="meta">Each club is separate: roster, teams, points and officers. Signing up needs its join code, so treat the code like a door code.</p>' +
    '<div class="row3"><label class="fld"><span>Short code</span><input name="code" maxlength="32" autocapitalize="none" spellcheck="false" data-keep="aCode" value="' + esc(keepVal('aCode')) + '" placeholder="riverside-pbl"></label>' +
    '<label class="fld"><span>Display name</span><input name="name" maxlength="60" data-keep="aName" value="' + esc(keepVal('aName')) + '" placeholder="Riverside PBL"></label>' +
    '<label class="fld"><span>Join code</span><input name="join" maxlength="60" autocapitalize="none" spellcheck="false" data-keep="aJoin" value="' + esc(keepVal('aJoin')) + '" placeholder="at least 6 characters"></label></div>' +
    '<p class="hint">The short code is stamped on every row of the club’s data, so it never changes. The name and join code can.</p><div class="sendrow"><button class="btn sm">Create club</button></div></form>';
  h += '<section class="card"><header><h3>Clubs on this system</h3>' + (ADM.affs ? '<span class="count">' + ADM.affs.length + '</span>' : '') + '<button class="btn sm ghost" data-act="admReload" data-k="affs">Refresh</button></header>';
  if (!ADM.affs) return h + loadingLine('affs', 'the club list') + '</section>';
  /* "default" is where rows from before clubs existed live: it can be cleared, never renamed or deleted. */
  var rows = ADM.affs.concat([{code: 'default', name: 'default (data from before clubs)', legacy: true}]);
  h += '<p class="meta">Clear data empties a club for a new semester. Delete removes it and everything in it, accounts included.</p><ul class="admrows">' + rows.map(function (a) {
    return '<li class="admrow aff"><span class="who"><span><span class="pn">' + esc(a.name) + (a.code === M.aff ? ' <span class="badge ok">Viewing</span>' : '') + '</span><span class="pe num">' + esc(a.code) + '</span></span></span>' +
      '<span class="admx">' + (a.legacy ? '' : '<button class="btn sm ghost" data-act="admAffEdit" data-code="' + esc(a.code) + '">Edit</button>') +
      '<button class="btn sm ghost danger" data-act="admAffPurge" data-code="' + esc(a.code) + '">Clear data</button>' +
      (a.legacy ? '' : '<button class="btn sm ghost danger" data-act="admAffDel" data-code="' + esc(a.code) + '">Delete</button>') + '</span></li>';
  }).join('') + '</ul></section>';
  return h;
}
function affByCode(c) { return (ADM.affs || []).filter(function (a) { return a.code === c; })[0] || {code: c, name: c}; }
SUBMIT_EXT.admAffNew = function (f) {
  var c = f.code.value.trim().toLowerCase(), nm = clean(f.name.value, 60).trim(), j = f.join.value.trim();
  if (!/^[a-z0-9-]{3,32}$/.test(c)) return toast('Codes are 3–32 characters: letters, digits, dashes.', true);
  if (!nm) return toast('Give the club a display name.', true);
  if (j.length < 6) return toast('Join codes are at least 6 characters.', true);
  call('createAffiliation', {code: c, name: nm, joinCode: j}).then(function (r) {
    if (!(r && r.ok)) return toast(admErr(r), true);
    ['aCode', 'aName', 'aJoin'].forEach(function (k) { delete ADM.keep[k]; });
    toast('Created ' + nm + '. Members sign up by picking it and entering the join code.'); admLoad('affs', true);
  });
};
ACT_EXT.admAffEdit = function (el, d) {
  var a = affByCode(d.code);
  openSheet('<form class="form" data-act="admAffEditSave" data-code="' + esc(a.code) + '" novalidate><header class="sh"><h3>Edit ' + esc(a.name) + '</h3></header>' +
    '<p class="meta">The short code <span class="num">' + esc(a.code) + '</span> stays: every row of the club’s data is stamped with it.</p>' +
    '<label class="fld"><span>Display name</span><input name="name" maxlength="60" value="' + esc(a.name) + '"></label>' +
    '<label class="fld"><span>New join code</span><input name="join" maxlength="60" autocapitalize="none" spellcheck="false" placeholder="Leave empty to keep the current one"></label>' +
    '<p class="hint">A new join code stops the old one working for anyone who has not signed up yet.</p><div class="sheetacts"><button class="btn">Save</button><button type="button" class="btn ghost" data-act="closeSheet">Cancel</button></div></form>');
};
SUBMIT_EXT.admAffEditSave = function (f) {
  var code = f.getAttribute('data-code'), nm = clean(f.name.value, 60).trim(), j = f.join.value.trim();
  if (j && j.length < 6) return toast('Join codes are at least 6 characters.', true);
  call('updateAffiliation', {code: code, name: nm, joinCode: j}).then(function (r) {
    if (!(r && r.ok)) return toast(admErr(r), true);
    closeSheet(); toast(j ? 'Saved, with a new join code.' : 'Saved.'); admLoad('affs', true);
    if (code === M.aff && nm) { RAW.all.affName = nm; rebuild(); render(); }
  });
};
ACT_EXT.admAffPurge = function (el, d) { purge(d.code, d.code === 'default' ? 'default' : affByCode(d.code).name); };
ACT_EXT.admAffDel = function (el, d) {
  var a = affByCode(d.code);
  admConfirm({title: 'Delete ' + a.name + '?', type: a.code, label: 'Delete the club',
    body: 'This removes its roster, points, attendance, accounts, officer list and setup. It cannot be undone.',
    fn: function (typed) {
      call('deleteAffiliation', {code: a.code, confirm: typed}).then(function (r) {
        if (!(r && r.ok)) return toast(admErr(r), true);
        toast('Deleted ' + a.name + '.');
        /* The club on screen is gone, so this browser goes back to the default one. */
        if (a.code === M.aff) { lsSet(KEYS.aff, 'default'); boot(); return; }
        admLoad('affs', true);
      });
    }});
};

/* ---------------- every sign-up ---------------- */
function signupsTab() {
  admLoad('signups');
  var h = '<section class="card"><header><h3>Everyone who has signed up</h3>' + (ADM.signups ? '<span class="count">' + ADM.signups.length + '</span>' : '') + '<button class="btn sm ghost" data-act="admReload" data-k="signups">Refresh</button></header>';
  if (!ADM.signups) return h + loadingLine('signups', 'every account') + '</section>';
  var seen = {}, clubs = ADM.signups.filter(function (u) { if (seen[u.aff]) return false; seen[u.aff] = 1; return true; });
  var q = flat(ADM.sgq), rows = ADM.signups.filter(function (u) {
    if (ADM.sgaff && u.aff !== ADM.sgaff) return false;
    if (ADM.sgrole && u.role !== ADM.sgrole) return false;
    return !q || flat((u.first || '') + (u.last || '') + (u.email || '') + (u.who || '')).indexOf(q) > -1;
  });
  ADM.sgShown = rows;
  h += '<p class="meta">Every account on the system and the club it belongs to. Passwords are never shown.</p>' +
    '<div class="toolbar admbar"><label class="search">' + icon('search') + '<input id="admsgq" data-k="sgq" type="search" placeholder="Name or email" value="' + esc(ADM.sgq) + '" autocomplete="off" aria-label="Search every sign-up"></label>' +
    '<select class="mini" data-act="admFilter" data-k="sgaff" aria-label="Club"><option value="">All clubs</option>' + clubs.map(function (u) { return '<option value="' + esc(u.aff) + '"' + (ADM.sgaff === u.aff ? ' selected' : '') + '>' + esc(u.affName || u.aff) + '</option>'; }).join('') + '</select>' +
    '<select class="mini" data-act="admFilter" data-k="sgrole" aria-label="Role"><option value="">All roles</option>' + roleOpts(ADM.sgrole) + '</select></div>';
  h += rows.length ? '<ul class="admrows">' + rows.slice(0, 400).map(function (u, i) { return acctRow(u, i, true, 'admSgRm'); }).join('') + '</ul><p class="hint">' + rows.length + ' of ' + ADM.signups.length + ' shown.</p>' : empty('Nobody matches', 'Clear the search or a filter.');
  return h + '</section>';
}
ACT_EXT.admSgRm = function (el, d) {
  var u = (ADM.sgShown || [])[+d.i]; if (!u) return;
  removeAccount(u, function () { admLoad('signups', true); if (u.aff === M.aff) ACT_EXT.admRosterReload(); });
};
CHANGE_EXT.admFilter = function (el, d, v) { ADM[d.k] = v; render(); };

/* ---------------- password accounts ----------------
   The password never leaves this browser: a PBKDF2 key is derived here with a
   fresh 16-byte salt (auth.js's pbkdf2Dk, the same 210000 SHA-256 rounds as
   the classic page's deriveForNew), so accounts made here sign in on either page. */
var ADM_ITERS = 210000;
function deriveNew(pw) {
  if (typeof window.pbkdf2Dk !== 'function') return Promise.reject(new Error('The password tools did not load (auth.js), so nothing was sent. Reload the page and try again.'));
  if (!(window.crypto && window.crypto.subtle && window.isSecureContext)) return Promise.reject(new Error('This browser only derives keys over https. Open the https address and try again.'));
  var a = new Uint8Array(16), s = '';
  crypto.getRandomValues(a);
  for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  var salt = btoa(s);
  return Promise.resolve(window.pbkdf2Dk(pw, salt, ADM_ITERS)).then(function (dk) {
    if (!dk) throw new Error('The key could not be derived.');
    return {dk: dk, clientSalt: salt, iterations: ADM_ITERS};
  });
}
function accountsTab() {
  admLoad('users');
  var h = '<form class="card form" data-act="admUserNew" novalidate><header><h3>New password account</h3></header>' +
    '<p class="meta">For members who cannot use a Google account. Weaker than Google sign-in: give each person their own, never a shared login. It joins <b>' + esc(M.club) + '</b>, the club you are viewing.</p>' +
    '<div class="row3"><label class="fld"><span>Username</span><input name="user" maxlength="32" autocapitalize="none" spellcheck="false" data-keep="uName" value="' + esc(keepVal('uName')) + '" placeholder="jordan.lee"></label>' +
    '<label class="fld"><span>Starting password</span><input name="pass" class="num" maxlength="200" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="at least 10 characters"></label>' +
    '<label class="fld"><span>Role</span><select name="role" data-keep="uRole">' + roleOpts(keepVal('uRole', 'member')) + '</select></label></div>' +
    '<p class="hint">Tell them the starting password in person and have them change it once they are in.</p><div class="sendrow"><button class="btn sm"' + (ADM.busy.mkuser ? ' disabled' : '') + '>' + (ADM.busy.mkuser ? 'Deriving the key…' : 'Create account') + '</button></div></form>';
  h += '<section class="card"><header><h3>Password accounts in ' + esc(M.club) + '</h3>' + (ADM.users ? '<span class="count">' + ADM.users.length + '</span>' : '') + '<button class="btn sm ghost" data-act="admReload" data-k="users">Refresh</button></header>';
  if (!ADM.users) return h + loadingLine('users', 'the accounts') + '</section>';
  if (!ADM.users.length) return h + empty('No password accounts', 'Everyone in this club signs in with Google.') + '</section>';
  return h + '<ul class="admrows">' + ADM.users.map(function (u) {
    return '<li class="admrow"><span class="em">' + esc(u.username) + (u.locked ? ' <span class="badge bad">Locked</span>' : '') + '</span>' +
      '<span class="admc">' + roleSelect(u.role, 'admUserRole', ' data-u="' + esc(u.username) + '"') + '</span>' +
      '<span class="admc hint">' + (u.createdAt ? 'Made ' + esc(String(u.createdAt).slice(0, 10)) : '') + '</span>' +
      '<span class="admx"><button class="btn sm ghost" data-act="admUserPw" data-u="' + esc(u.username) + '">New password</button><button class="btn sm ghost danger" data-act="admUserDel" data-u="' + esc(u.username) + '" aria-label="Delete ' + esc(u.username) + '">Delete</button></span></li>';
  }).join('') + '</ul></section>';
}
SUBMIT_EXT.admUserNew = function (f) {
  if (ADM.busy.mkuser) return;
  var u = f.user.value.trim().toLowerCase(), pw = f.pass.value, role = f.role.value;
  if (!/^[a-z0-9._-]{3,32}$/.test(u)) return toast('Usernames are 3–32 characters: letters, digits, dot, dash, underscore.', true);
  if (pw.length < 10) return toast('Give them a starting password of at least 10 characters.', true);
  ADM.busy.mkuser = 1; render();
  deriveNew(pw).then(function (d) {
    return call('createUser', {username: u, dk: d.dk, clientSalt: d.clientSalt, iterations: d.iterations, role: role});
  }).then(function (r) {
    delete ADM.busy.mkuser;
    if (!(r && r.ok)) { render(); return toast(admErr(r), true); }
    delete ADM.keep.uName;
    toast('Created ' + u + ' as ' + ROLE_WORD[role].toLowerCase() + '. Give them the password in person.');
    ADM.signups = null; admLoad('users', true);
  }).catch(function (e) { delete ADM.busy.mkuser; render(); toast((e && e.message) || 'Could not create that account.', true); });
};
CHANGE_EXT.admUserRole = function (el, d, v) {
  call('setUserRole', {username: d.u, role: v}).then(function (r) {
    if (!(r && r.ok)) toast(admErr(r), true); else toast(d.u + ' is now ' + ROLE_WORD[v].toLowerCase() + '.');
    admLoad('users', true);
  });
};
ACT_EXT.admUserPw = function (el, d) {
  openSheet('<form class="form" data-act="admUserPwSave" data-u="' + esc(d.u) + '" novalidate><header class="sh"><h3>New password for ' + esc(d.u) + '</h3></header>' +
    '<p class="meta">Tell them in person, and have them change it once they are in. Any lockout is cleared.</p>' +
    '<label class="fld"><span>New password</span><input name="pass" class="num" maxlength="200" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="at least 10 characters"></label>' +
    '<div class="sheetacts"><button class="btn">Set password</button><button type="button" class="btn ghost" data-act="closeSheet">Cancel</button></div></form>');
};
SUBMIT_EXT.admUserPwSave = function (f) {
  var u = f.getAttribute('data-u'), pw = f.pass.value, btn = f.querySelector('button.btn');
  if (pw.length < 10) return toast('Passwords are at least 10 characters.', true);
  btn.disabled = true; btn.textContent = 'Deriving the key…';
  var undo = function () { btn.disabled = false; btn.textContent = 'Set password'; };
  deriveNew(pw).then(function (d) {
    return call('resetPassword', {username: u, dk: d.dk, clientSalt: d.clientSalt, iterations: d.iterations});
  }).then(function (r) {
    if (!(r && r.ok)) { undo(); return toast(admErr(r), true); }
    closeSheet(); toast('Password reset for ' + u + '. Any lockout is cleared.'); admLoad('users', true);
  }).catch(function (e) { undo(); toast((e && e.message) || 'Could not set it.', true); });
};
ACT_EXT.admUserDel = function (el, d) {
  admConfirm({title: 'Delete “' + d.u + '”?', label: 'Delete the account',
    body: 'They are signed out everywhere the next time their session is checked, and cannot sign in again. Points and attendance under their name stay.',
    fn: function () {
      call('deleteUser', {username: d.u}).then(function (r) {
        if (!(r && r.ok)) return toast(admErr(r), true);
        toast('Deleted ' + d.u + '.'); ADM.signups = null; admLoad('users', true);
      });
    }});
};

/* ---------- typing: drafts survive a redraw; searches filter as you type ---------- */
document.addEventListener('input', function (e) {
  var el = e.target;
  if (!el.closest) return;
  if (el.closest('#admsetup')) setupSync();
  if (el.closest('#admfe')) { feSync(); admFeBadge(); }
  if (el.hasAttribute('data-keep')) ADM.keep[el.getAttribute('data-keep')] = el.value;
  if (el.name === 'admtyped') {
    var b = el.form && el.form.querySelector('button.admdanger');
    if (b) b.disabled = el.value.trim().toLowerCase() !== String(el.getAttribute('data-want')).toLowerCase();
  }
  if (el.id === 'admrq' || el.id === 'admsgq') {
    ADM[el.getAttribute('data-k')] = el.value;
    clearTimeout(ADM.qT);
    ADM.qT = setTimeout(function () {
      render();
      var i = $(el.id); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    }, 160);
  }
});
document.addEventListener('change', function (e) {
  var el = e.target;
  if (!el.closest) return;
  if (el.hasAttribute('data-keep')) ADM.keep[el.getAttribute('data-keep')] = el.value;
  if (el.closest('#admsetup') && el.type === 'checkbox') { setupSync(); render(); }
  if (el.closest('#admfe') && el.type === 'checkbox') { feSync(); admFeBadge(); }
});
/* The save button and "not saved" badge follow typing without a full redraw (which would take focus). */
function admFeBadge() {
  var c = $('admfe'); if (!c) return;
  var dirty = feDirty(), b = c.querySelector('[data-act="admFeSave"]'), hd = c.querySelector('header');
  if (b && !ADM.fe.busy) b.disabled = !dirty;
  if (hd && dirty && !hd.querySelector('.badge')) { var x = hd.querySelector('.count'); if (x) x.remove(); hd.insertAdjacentHTML('beforeend', '<span class="badge gold">Not saved yet</span>'); }
}

/* ---------- plugging in ---------- */
BOOT_EXT.push(function () {
  /* A new club (or the master switching) starts clean. */
  ADM.setup = null; ADM.roster = null; ADM.fe = FE_EMPTY();
  ADM.roles = ADM.affs = ADM.signups = ADM.users = null; ADM.err = {}; ADM.note = {}; ADM.keep = {};
  var i = NAV.indexOf(ADMIN_NAV);
  if (i > -1) NAV.splice(i, 1);
  if (M.master) NAV.push(ADMIN_NAV);
  if (/^#admin\b/.test(location.hash)) route(); else drawNav();
});
/* The classic deep links become the screens above. Intake is shared with
   orgs2 (roster source); club setup gets its own card beside it. */
(function () {
  var to = {'/roster': ['Everyone who joined, their roles, removing an account and clearing the club', '#club/roster'],
            '/sign-up-form': ['The club’s form, its links and its questions', '#club/form'],
            '/calendar': ['Link the chapter Google Calendar, hide events', '#club/calendar'],
            '/access': ['Officers and their clubs, every club, every sign-up and password accounts', '#admin/access']};
  var intake = -1;
  TOOLS.forEach(function (t, i) {
    if (to[t[2]]) { t[1] = to[t[2]][0]; t[2] = to[t[2]][1]; }
    if (t[0] === 'Intake') { intake = i; if (t[2] === '/intake') t[1] = 'Roster source and mapping'; }
  });
  TOOLS.splice(intake < 0 ? 0 : intake, 0, ['Club setup', 'Names, tracks, year, personality types and colours', '#club/setup']);
})();
(function () {
  var tools = VIEWS.tools, cal = VIEWS.calendar;
  /* The access card only means something to the master account. */
  VIEWS.tools = function (sub) {
    if (M.master) return tools(sub);
    var keep = TOOLS.slice();
    for (var i = TOOLS.length - 1; i >= 0; i--) if (TOOLS[i][2] === '#admin/access') TOOLS.splice(i, 1);
    try { return tools(sub); } finally { TOOLS.length = 0; Array.prototype.push.apply(TOOLS, keep); }
  };
  VIEWS.calendar = function (sub) { return cal(sub).replace('<a href="/calendar">', '<a href="#club/calendar">'); };
})();

/* =====================================================================
   Demo answers (/dash.html?demo, &as=member, &as=master)
   ===================================================================== */
function demoWrap(action, fn) {
  var prev = DEMO_EXT[action];
  var mine = function (pl, s, officer, me, store) {
    var base = function () {
      if (prev) return prev(pl, s, officer, me, store);
      delete DEMO_EXT[action];
      try { return Demo.answer(action, pl); } finally { DEMO_EXT[action] = mine; }
    };
    return fn(base, pl || {}, s, officer, me, store);
  };
  DEMO_EXT[action] = mine;
}
var DEMO_ME = 'deanzacapbl@gmail.com';
var DEMO_NO = {ok: false, error: 'Your account is admin. That action needs master.'};
var DEMO_MEMBER = {ok: false, error: 'Your account is member. That action needs admin.'};
function demoMaster() { return Demo.as === 'master'; }
function demoAdmin(s) {
  if (s.admin) return s.admin;
  var past = function (d) { return new Date(Date.now() - d * 864e5).toISOString(); };
  var uname = function (p) { return p.name.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, '.'); };
  s.admin = {
    affs: [{code: 'demo', name: 'De Anza PBL (demo)', join: 'pbl-fall-2026'}],
    roles: ['Derick', 'Rameesha', 'Arin', 'William', 'Jayden', 'Ruirui', 'Bryant'].map(function (n, i) { return {email: n.toLowerCase() + '@demo.example', role: 'admin', aff: 'demo', at: past(60 - i)}; }),
    users: [41, 52].map(function (i, k) {
      var p = s.people[i];
      return {username: uname(p), email: p.email, role: 'member', aff: 'demo', locked: k === 1, at: past(40 - k * 12), first: p.name.split(' ')[0], last: p.name.split(' ').slice(1).join(' ')};
    }),
    removed: {}, seq: 1, calAt: 0,
    form: [
      {id: 'q1', title: 'First name', help: '', type: 'TEXT', required: true, options: []},
      {id: 'q2', title: 'Last name', help: '', type: 'TEXT', required: true, options: []},
      {id: 'q3', title: 'Year in the club', help: '', type: 'MULTIPLE_CHOICE', required: true, options: ['1st year', '2nd year']},
      {id: 'q4', title: 'Which track interests you most?', help: 'You can switch after bootcamp.', type: 'MULTIPLE_CHOICE', required: true, options: ['Consulting', 'Case competition (FLC)', 'Polaris', 'Not sure yet']},
      {id: 'q5', title: 'MBTI type', help: 'Four letters from the free test, e.g. ENFJ.', type: 'TEXT', required: false, options: []},
      {id: 'q6', title: 'When are you usually free?', help: '', type: 'CHECKBOX', required: false, options: ['Mon/Wed evenings', 'Tue/Thu afternoons', 'Tue/Thu evenings', 'Fri afternoons', 'Weekends']},
      {id: 'q7', title: 'About the Org Program', help: '', type: 'SECTION_HEADER', required: false, options: [], editable: false},
      {id: 'q8', title: 'Anything EBOD should know?', help: '', type: 'PARAGRAPH_TEXT', required: false, options: []}
    ]
  };
  return s.admin;
}
function demoAffName(s, code) { return ((demoAdmin(s).affs.filter(function (a) { return a.code === code; })[0]) || {}).name || code; }
function demoForm(s) { return demoAdmin(s).form.map(function (it) { var c = JSON.parse(JSON.stringify(it)); c.editable = it.editable !== false; return c; }); }
/* The club's accounts as accountsFor() answers: the demo members (two of them
   password accounts) less any removed, with how and when they joined, plus
   password accounts made in the demo. */
function demoRoster(rows, s) {
  var A = demoAdmin(s), byEmail = {}, mapped = {};
  A.users.forEach(function (u) { byEmail[u.email] = u; });
  var out = rows.map(function (r, i) {
    var u = byEmail[r.email], c = {};
    for (var k in r) c[k] = r[k];
    if (u) mapped[u.username] = 1;
    c.who = u ? u.username : r.email; c.kind = u ? 'password' : 'google'; if (u) c.email = u.username;
    c.role = u ? u.role : (r.role || 'member'); c.aff = 'demo'; c.affName = demoAffName(s, 'demo');
    c.joined = new Date(Date.now() - (50 - i % 30) * 864e5).toISOString();
    return c;
  });
  A.users.forEach(function (u) {
    if (u.aff !== 'demo' || mapped[u.username]) return;
    out.push({who: u.username, kind: 'password', first: u.first || '', last: u.last || '', email: u.username, role: u.role, aff: 'demo', affName: demoAffName(s, 'demo'), joined: u.at,
              year: '', track: '', mbti: '', avail: '', notes: '', prefs: ''});
  });
  return out.filter(function (c) { return !A.removed[String(c.who).toLowerCase()]; });
}
demoWrap('getAll', function (base, pl, s, officer) {
  var r = base();
  if (!(r && r.ok)) return r;
  var h = s.cfg.calHide || {}, hid = function (e) { return (h.ids || []).indexOf(e.id) > -1 || (!!e.gid && (h.series || []).indexOf(e.gid) > -1); };
  if (r.gcal) {
    r.gcal.events = s.gcal.filter(function (e) { return officer || !hid(e); }).map(function (e) { var c = JSON.parse(JSON.stringify(e)); if (hid(e)) c.hidden = 1; else delete c.hidden; return c; });
    if (s.admin && s.admin.calAt) r.gcal.syncedAt = s.admin.calAt;
  }
  /* What Code.gs memberCfg_ keeps from members. */
  if (!officer && r.config) ['sheetUrl', 'sheetId', 'formEditUrl', 'formId', 'ownerEmail', 'calHide', 'handinTo'].forEach(function (k) { delete r.config[k]; });
  if (officer && demoMaster()) r.role = 'master';
  return r;
});
demoWrap('clubRoster', function (base, pl, s) { var r = base(); if (r && r.ok) r.roster = demoRoster(r.roster || [], s); return r; });
demoWrap('deleteSignup', function (base, pl, s, officer, me, store) {
  if (!officer) return DEMO_MEMBER;
  var A = demoAdmin(s), who = String(pl.who || '').toLowerCase().trim(), aff = String(pl.aff || 'demo').toLowerCase();
  if (!who) return {ok: false, error: 'No account was named.'};
  if (!demoMaster() && aff !== 'demo') return {ok: false, error: 'You can only remove accounts in your own club.'};
  if (who === DEMO_ME) return {ok: false, error: 'You cannot remove the account you are signed in with.'};
  var u = A.users.filter(function (x) { return x.username === who && x.aff === aff; })[0], o = A.roles.filter(function (x) { return x.email === who && x.aff === aff; })[0];
  var member = aff === 'demo' && s.people.some(function (p) { return p.email === who; });
  if (!u && !o && !member) return {ok: false, error: 'No such account in this club.'};
  if (u) A.users.splice(A.users.indexOf(u), 1);
  if (o) A.roles.splice(A.roles.indexOf(o), 1);
  A.removed[who] = 1; if (u && u.email) A.removed[u.email] = 1;
  store();
  return {ok: true, removed: pl.who, rows: 1};
});
demoWrap('purgeClub', function (base, pl, s, officer, me, store) {
  if (!officer) return DEMO_MEMBER;
  var code = String(pl.code || 'demo').toLowerCase().trim();
  if (!demoMaster() && code !== 'demo') return {ok: false, error: 'You can only clear your own club.'};
  if (String(pl.confirm || '').toLowerCase().trim() !== code) return {ok: false, error: 'That is not the code for this club. Type ' + code + ' to confirm.'};
  var wiped = {teams: 0, pointsLog: 0, attendance: 0};
  if (code === 'demo') {
    wiped.attendance = s.attendance.length; s.attendance = [];
    s.people.forEach(function (p) { if (p.org) { wiped.teams++; p.org = ''; } });
    store();
  }
  return {ok: true, purged: code, wiped: wiped};
});
demoWrap('formItems', function (base, pl, s, officer) {
  if (!officer) return DEMO_MEMBER;
  if (!s.cfg.formUrl) return {ok: false, error: 'This club has no sign-up form yet.'};
  return {ok: true, title: demoAffName(s, 'demo') + ' sign-up', items: demoForm(s)};
});
demoWrap('saveFormItems', function (base, pl, s, officer, me, store) {
  if (!officer) return DEMO_MEMBER;
  var A = demoAdmin(s), want = pl.items || [], byId = {};
  if (!s.cfg.formUrl) return {ok: false, error: 'This club has no sign-up form yet.'};
  if (!want.length) return {ok: false, error: 'A form needs at least one question.'};
  A.form.forEach(function (it) { byId[it.id] = it; });
  var out = [];
  want.forEach(function (w) {
    var title = String(w.title || '').slice(0, 300); if (!title) return;
    var type = String(w.type || 'TEXT').toUpperCase(), had = w.id && byId[w.id];
    /* A changed type is a new Forms item, with a new id. */
    out.push({id: had && had.type === type ? had.id : 'q' + (100 + A.seq++), title: title, help: String(w.help || '').slice(0, 500), type: type, required: !!w.required,
              options: /CHOICE|CHECKBOX|LIST/.test(type) ? (w.options || []).map(function (o) { return String(o).slice(0, 200); }).filter(String) : []});
  });
  /* Items the editor cannot change stay, after the questions, where moveItem leaves them. */
  A.form = out.concat(A.form.filter(function (it) { return it.editable === false; }));
  store();
  return {ok: true, items: demoForm(s)};
});
demoWrap('cloneForm', function (base, pl, s, officer, me, store) {
  if (!officer) return DEMO_MEMBER;
  if (s.cfg.formUrl && !pl.replace) return {ok: false, error: 'This club already has a form. Clear the link first if you really want a new one.'};
  var c = s.cfg, owner = String(pl.ownerEmail || c.ownerEmail || '').trim();
  c.formUrl = 'https://docs.google.com/forms/d/e/demo-pbl-signup/viewform'; c.formEditUrl = 'https://docs.google.com/forms/d/demo-pbl-signup/edit';
  c.sheetUrl = 'https://docs.google.com/spreadsheets/d/demo-pbl-responses/edit'; c.formId = 'demo-pbl-signup'; c.sheetId = 'demo-pbl-responses'; c.ownerEmail = owner;
  store();
  return {ok: true, formUrl: c.formUrl, sheetUrl: c.sheetUrl, editUrl: c.formEditUrl, title: demoAffName(s, 'demo') + ' sign-up', sharedWith: DEMO_ME, shareFailed: [],
          owner: owner, ownerMoved: owner ? 2 : 0, ownerSkipped: !owner, ownerFailed: []};
});
demoWrap('republishForm', function (base, pl, s, officer) {
  if (!officer) return DEMO_MEMBER;
  if (!s.cfg.formUrl) return {ok: false, error: 'This club has no form yet.'};
  return {ok: true, formUrl: s.cfg.formUrl, editUrl: s.cfg.formEditUrl, did: ['published', 'audience=anyone', 'accepting responses'], failed: [], sharedWith: DEMO_ME, shareFailed: []};
});
demoWrap('calendarSync', function (base, pl, s, officer, me, store) {
  if (!officer) return DEMO_MEMBER;
  var c = s.cfg, A = demoAdmin(s), pushed = 0;
  if (pl.calendarId) c.gcalId = String(pl.calendarId).trim();
  if (!c.gcalId) c.gcalId = 'pbl-chapter-demo@group.calendar.google.com';
  c.gcalUrl = 'https://calendar.google.com/calendar/embed?src=' + encodeURIComponent(c.gcalId); c.gcalLinked = true;
  c.events = (pl.events || []).filter(function (e) { return e && !e.pulled; }).map(function (e) {
    var x = JSON.parse(JSON.stringify(e)); if (!x.gid) { x.gid = 'demo-' + x.id + '@google.com'; pushed++; } return x;
  });
  A.calAt = Date.now(); store();
  var h = c.calHide || {}, list = s.gcal.map(function (e) {
    var x = JSON.parse(JSON.stringify(e));
    if ((h.ids || []).indexOf(e.id) > -1 || (e.gid && (h.series || []).indexOf(e.gid) > -1)) x.hidden = 1; else delete x.hidden;
    return x;
  });
  return {ok: true, events: c.events, gcal: {events: list, syncedAt: A.calAt, calId: c.gcalId, error: ''}, pushed: pushed, pulled: list.length, adopted: 0, remaining: 0,
          calendarId: c.gcalId, calendarUrl: c.gcalUrl, linked: true, sharedWith: DEMO_ME, shareError: ''};
});
/* Master only from here, as Code.gs NEEDS has them. */
demoWrap('listRoles', function (base, pl, s) {
  if (!demoMaster()) return DEMO_NO;
  return {ok: true, roles: [{email: DEMO_ME, role: 'master', locked: true, aff: '', affName: 'every club'}].concat(demoAdmin(s).roles.map(function (r) {
    return {email: r.email, role: r.role, locked: false, aff: r.aff, affName: demoAffName(s, r.aff)};
  }))};
});
demoWrap('setRole', function (base, pl, s, officer, me, store) {
  if (!demoMaster()) return DEMO_NO;
  var A = demoAdmin(s), em = String(pl.email || '').toLowerCase().trim(), role = String(pl.role || '').toLowerCase(), club = String(pl.club || '').toLowerCase().trim();
  if (!em || em.indexOf('@') < 0) return {ok: false, error: 'Not an email address.'};
  if (!ROLE_WORD[role]) return {ok: false, error: 'Unknown role.'};
  if (em === DEMO_ME) return {ok: false, error: 'The master account is set in the script, not here.'};
  if (club && club !== 'default' && !A.affs.some(function (a) { return a.code === club; })) return {ok: false, error: 'No club with the code "' + club + '".'};
  var hit = A.roles.filter(function (r) { return r.email === em; })[0];
  if (hit) { hit.role = role; if (club) hit.aff = club; store(); return {ok: true, updated: em, role: role, aff: hit.aff}; }
  A.roles.push({email: em, role: role, aff: club || 'demo', at: new Date().toISOString()}); delete A.removed[em]; store();
  return {ok: true, added: em, role: role, aff: club || 'demo'};
});
demoWrap('removeRole', function (base, pl, s, officer, me, store) {
  if (!demoMaster()) return DEMO_NO;
  var A = demoAdmin(s), em = String(pl.email || '').toLowerCase().trim();
  if (em === DEMO_ME) return {ok: false, error: 'The master account cannot be removed here.'};
  A.roles = A.roles.filter(function (r) { return r.email !== em; }); store();
  return {ok: true, removed: em};
});
demoWrap('listAffiliations', function (base, pl, s) {
  var have = {}, out = [], r = null;
  demoAdmin(s).affs.forEach(function (a) { have[a.code] = 1; out.push({code: a.code, name: a.name}); });
  /* auth.js may answer this for its sign-up demo; its clubs are kept too. */
  try { r = base(); } catch (e) { r = null; }
  ((r && r.ok && r.affiliations) || []).forEach(function (a) { if (!have[a.code]) { have[a.code] = 1; out.push(a); } });
  return {ok: true, affiliations: out};
});
demoWrap('createAffiliation', function (base, pl, s, officer, me, store) {
  if (!demoMaster()) return DEMO_NO;
  var A = demoAdmin(s), c = String(pl.code || '').toLowerCase().trim(), n = String(pl.name || '').trim(), j = String(pl.joinCode || '').trim();
  if (!/^[a-z0-9-]{3,32}$/.test(c)) return {ok: false, error: 'Codes are 3-32 characters: letters, digits, dashes.'};
  if (!n) return {ok: false, error: 'Give the club a display name.'};
  if (j.length < 6) return {ok: false, error: 'Join codes must be at least 6 characters.'};
  if (c === 'default' || A.affs.some(function (a) { return a.code === c; })) return {ok: false, error: 'That code is taken.'};
  A.affs.push({code: c, name: n, join: j}); store();
  return {ok: true, created: c, name: n};
});
demoWrap('updateAffiliation', function (base, pl, s, officer, me, store) {
  if (!demoMaster()) return DEMO_NO;
  var a = demoAdmin(s).affs.filter(function (x) { return x.code === String(pl.code || '').toLowerCase(); })[0], j = String(pl.joinCode || '').trim();
  if (!a) return {ok: false, error: 'No club with that code.'};
  if (j && j.length < 6) return {ok: false, error: 'Join codes must be at least 6 characters.'};
  if (String(pl.name || '').trim()) a.name = String(pl.name).trim();
  if (j) a.join = j;
  store();
  return {ok: true, updated: a.code};
});
demoWrap('deleteAffiliation', function (base, pl, s, officer, me, store) {
  if (!demoMaster()) return DEMO_NO;
  var A = demoAdmin(s), c = String(pl.code || '').toLowerCase().trim();
  if (!c || c === 'default') return {ok: false, error: 'That club cannot be deleted.'};
  if (String(pl.confirm || '').toLowerCase().trim() !== c) return {ok: false, error: 'That is not the code for this club. Type ' + c + ' to confirm.'};
  if (c === 'demo') return {ok: false, error: 'The demo keeps its own club. Make another one and delete that.'};
  A.affs = A.affs.filter(function (a) { return a.code !== c; });
  A.roles = A.roles.filter(function (r) { return r.aff !== c; });
  A.users = A.users.filter(function (u) { return u.aff !== c; });
  store();
  return {ok: true, deleted: c};
});
demoWrap('listSignups', function (base, pl, s, officer) {
  if (!officer) return DEMO_MEMBER;
  var A = demoAdmin(s), rows = Demo.answer('clubRoster', {}), out = ((rows && rows.roster) || []).slice();
  A.roles.forEach(function (r) {
    if (A.removed[r.email] || (!demoMaster() && r.aff !== 'demo')) return;
    var n = r.email.split('@')[0];
    out.push({who: r.email, kind: 'google', first: n.charAt(0).toUpperCase() + n.slice(1), last: '', email: r.email, role: r.role, aff: r.aff, affName: demoAffName(s, r.aff), joined: r.at});
  });
  A.users.forEach(function (u) {
    if (u.aff === 'demo' || !demoMaster()) return;
    out.push({who: u.username, kind: 'password', first: u.first || '', last: u.last || '', email: u.username, role: u.role, aff: u.aff, affName: demoAffName(s, u.aff), joined: u.at});
  });
  if (demoMaster()) out.push({who: DEMO_ME, kind: 'google', first: 'Demo', last: 'Officer', email: DEMO_ME, role: 'master', aff: 'demo', affName: demoAffName(s, 'demo'), joined: '', isMaster: true});
  return {ok: true, signups: out};
});
demoWrap('listUsers', function (base, pl, s) {
  if (!demoMaster()) return DEMO_NO;
  return {ok: true, users: demoAdmin(s).users.filter(function (u) { return u.aff === 'demo'; }).map(function (u) {
    return {username: u.username, role: u.role, locked: !!u.locked, createdBy: DEMO_ME, createdAt: u.at};
  })};
});
demoWrap('createUser', function (base, pl, s, officer, me, store) {
  if (!demoMaster()) return DEMO_NO;
  var A = demoAdmin(s), u = String(pl.username || '').toLowerCase().trim(), role = String(pl.role || 'member').toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(u)) return {ok: false, error: 'Usernames are 3-32 characters: letters, digits, dot, dash, underscore.'};
  if (!pl.dk || !pl.clientSalt) return {ok: false, error: 'The browser did not send a derived key.'};
  if (!ROLE_WORD[role]) return {ok: false, error: 'Unknown role.'};
  if (A.users.some(function (x) { return x.username === u; })) return {ok: false, error: 'That username is taken.'};
  A.users.push({username: u, email: u, role: role, aff: 'demo', locked: false, at: new Date().toISOString(), first: '', last: ''}); delete A.removed[u]; store();
  return {ok: true, created: u, role: role, aff: 'demo'};
});
demoWrap('setUserRole', function (base, pl, s, officer, me, store) {
  if (!demoMaster()) return DEMO_NO;
  var u = demoAdmin(s).users.filter(function (x) { return x.username === String(pl.username || '').toLowerCase(); })[0];
  if (!u) return {ok: false, error: 'No such account.'};
  if (!ROLE_WORD[pl.role]) return {ok: false, error: 'Unknown role.'};
  u.role = pl.role; store();
  return {ok: true, updated: u.username, role: u.role};
});
demoWrap('resetPassword', function (base, pl, s, officer, me, store) {
  if (!demoMaster()) return DEMO_NO;
  var u = demoAdmin(s).users.filter(function (x) { return x.username === String(pl.username || '').toLowerCase(); })[0];
  if (!pl.dk || !pl.clientSalt) return {ok: false, error: 'The browser did not send a derived key.'};
  if (!u) return {ok: false, error: 'No such account.'};
  u.locked = false; store();
  return {ok: true, reset: u.username};
});
demoWrap('deleteUser', function (base, pl, s, officer, me, store) {
  if (!demoMaster()) return DEMO_NO;
  var A = demoAdmin(s), name = String(pl.username || '').toLowerCase(), u = A.users.filter(function (x) { return x.username === name; })[0];
  if (!u) return {ok: false, error: 'No such account.'};
  A.users.splice(A.users.indexOf(u), 1); A.removed[u.username] = 1; if (u.email) A.removed[u.email] = 1; store();
  return {ok: true, removed: name};
});
