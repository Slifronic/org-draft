/* Positions: what someone actually is in the chapter (President, a VP, an
   Org lead, a consulting PM, on an SFBLC team...), next to the permission
   level the backend checks (member / admin / master), which this file never
   touches. Most positions follow from what the club record already says;
   officers can add, hide or retitle one per person (cfg.positions, keyed by
   the classic page's normName, as recognitions are). Positions are club
   knowledge, shown to everyone, and drawn as an org chart (#orgchart). A
   consulting PM also gets one narrow power: pmSaveTeam, for their own client
   team's initiatives, assignments and stage. */
'use strict';

ICONS.orgchart = '<rect x="9" y="3.5" width="6" height="4.5" rx="1"/><rect x="3" y="16" width="6" height="4.5" rx="1"/><rect x="15" y="16" width="6" height="4.5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>';
ICONS.chev = '<path d="M8 10l4 4 4-4"/>';
(function () {
  var i = NAV.map(function (n) { return n.id; }).indexOf('board');
  NAV.splice(i < 0 ? NAV.length : i + 1, 0, {id: 'orgchart', label: 'Org chart', short: 'Org chart', group: 'Chapter'});
})();
/* Positions lead the tag filters on Members. */
(function () {
  var g = {position: {label: 'Position', tone: 'plum'}};
  Object.keys(GROUPS).forEach(function (k) { if (k !== 'position') g[k] = GROUPS[k]; });
  GROUPS = g;
})();
if (typeof TOOLS !== 'undefined') TOOLS.push(['Positions', 'Who holds which position, the Executive board and the org chart', '#club/positions']);

/* ---------- the catalog ----------
   Order is rank: the first position someone holds is the one shown under
   their name. Officers may rename and reorder (cfg.positionCatalog). */
var RL_DEFAULT = [
  {id: 'president', label: 'President', tone: 'plum', how: 'From the Executive board list'},
  {id: 'vp', label: 'Vice President', tone: 'plum', how: 'From the Executive board list (any VP title)'},
  {id: 'ebod', label: 'Executive board', tone: 'plum', how: 'Everyone on the Executive board list but Directors'},
  {id: 'director', label: 'Director', tone: 'plum', how: 'From the Executive board list'},
  {id: 'officer', label: 'Officer', tone: 'ink', how: 'Officer accounts (admin access)'},
  {id: 'orglead', label: 'Org lead', tone: 'green', how: 'Marked lead on the Org roster'},
  {id: 'pm', label: 'Consulting project manager', short: 'Consulting PM', tone: 'blue', how: 'A PM of a client team'},
  {id: 'consultant', label: 'Consulting member', tone: 'blue', how: 'On a client team, or on the consulting track'},
  {id: 'case', label: 'Case competition member', tone: 'gold', how: 'On the case competition track'},
  {id: 'sfblc', label: 'SFBLC competitor', tone: 'gold', how: 'On an SFBLC team'},
  {id: 'member', label: 'Member', tone: 'ink', how: 'Every member account'}
];
/* Shown on a member's row in Members only when they are something more than their track and teams already say. */
var RL_QUIET = {consultant: 1, 'case': 1, sfblc: 1, member: 1};
var RL = {cat: [], idx: {}, ebod: [], open: {}, all: null, zoom: 1, busy: false, ebodDraft: null};

function rlNorm(s) {
  s = String(s || '').trim();
  if (s.indexOf(',') > -1) { var p = s.split(','); s = p[1] + ' ' + p[0]; }
  return s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}
function rlKind(t) { return !t ? 'other' : t.kind || (t.track === 'c' ? 'consulting' : t.track === 'k' ? 'flc' : 'other'); }
function rlCatalog() {
  var saved = (M && M.cfg && M.cfg.positionCatalog) || [], byId = {}, seen = {}, out = [];
  RL_DEFAULT.forEach(function (d) { byId[d.id] = d; });
  var take = function (d, label) {
    var c = Object.assign({}, d);
    if (label && label !== d.label) { c.label = label; c.short = label; }
    c.short = c.short || c.label;
    out.push(c); seen[d.id] = 1;
  };
  (Array.isArray(saved) ? saved : []).forEach(function (s) { var d = s && byId[s.id]; if (d && !seen[d.id]) take(d, clean(s.label, 40).trim()); });
  RL_DEFAULT.forEach(function (d) { if (!seen[d.id]) take(d); });
  return out;
}
function rlTier(pos) {
  var s = String(pos || '');
  if (/\bvice\b|\bvp\b/i.test(s)) return 'vp';
  if (/president/i.test(s)) return 'president';
  if (/director/i.test(s)) return 'director';
  return 'ebod';
}
/* A name as the EBOD list or a team writes it: the roster's full name, or a
   first name only one member has ("Derick"). */
function rlFind(name, m) {
  m = m || M;
  var k = flat(name); if (!k) return null;
  var p = m.byKey[k];
  if (p && m.people.indexOf(p) > -1) return p;
  if (String(name).trim().split(/\s+/).length !== 1) return null;
  var hits = m.people.filter(function (x) { return flat(String(x.name).split(/\s+/)[0]) === k; });
  return hits.length === 1 ? hits[0] : null;
}

/* ---------- working positions out, after every build ---------- */
function rlApply(m, raw) {
  var cfg = m.cfg || {}, cat = rlCatalog(), idx = {}, held = {};
  cat.forEach(function (c, i) { c.i = i; idx[c.id] = c; });
  RL.cat = cat; RL.idx = idx;
  var give = function (p, id, detail) {
    if (!p || !idx[id]) return;
    var h = held[p.key] || (held[p.key] = {});
    h[id] = h[id] || [];
    if (detail && h[id].indexOf(String(detail)) < 0) h[id].push(String(detail));
  };
  RL.ebod = (typeof ebod === 'function' ? ebod() : (cfg.ebod || [])).filter(function (e) { return e && String(e.name || '').trim(); }).map(function (e) {
    var tier = rlTier(e.pos), p = rlFind(e.name, m);
    give(p, tier, e.pos);
    if (tier === 'president' || tier === 'vp') give(p, 'ebod', e.pos);
    return {name: String(e.name).trim(), pos: String(e.pos || ''), tier: tier, p: p};
  });
  m.people.forEach(function (p) {
    if (p.role === 'admin' || (p === m.me && m.officer)) give(p, 'officer');
    var f = typeof focusOf === 'function' ? focusOf(p) : '';
    if (f === 'c') give(p, 'consultant');
    if (f === 'k') give(p, 'case');
    if (p.role === 'member') give(p, 'member');
  });
  (((raw || RAW || {}).all || {}).teams || []).forEach(function (r) {
    if (/^y/i.test(String(r.IsLead || ''))) give(m.byKey[flat(r.MemberName)], 'orglead', r.Org);
  });
  m.teams.forEach(function (t) {
    var k = rlKind(t), label = t.client || teamName(t);
    if (k === 'consulting') {
      (t.pms || []).forEach(function (n) { if (String(n || '').trim()) give(rlFind(n, m), 'pm', label); });
      (t.members || []).forEach(function (n) { give(m.byKey[flat(n)], 'consultant', label); });
    } else if (k === 'flc') (t.members || []).forEach(function (n) { give(m.byKey[flat(n)], 'sfblc', t.event || teamName(t)); });
  });
  var over = cfg.positions || {};
  m.people.forEach(function (p) {
    var d = held[p.key] || {}, o = over[rlNorm(p.name)] || {}, add = o.add || [], rm = o.remove || [];
    var list = cat.filter(function (c) { return (d[c.id] && rm.indexOf(c.id) < 0) || add.indexOf(c.id) > -1; }).map(function (c) {
      var det = (d[c.id] || []).slice();
      if (!det.length && c.id === 'orglead' && p.org) det = [p.org];
      return {id: c.id, label: c.label, short: c.short, tone: c.tone, detail: det.join(', '), details: det, auto: !!d[c.id], added: !d[c.id]};
    });
    var has = function (id) { return list.some(function (x) { return x.id === id; }); };
    list.forEach(function (x) {
      x.implied = (x.id === 'member' && list.length > 1) || (x.id === 'ebod' && (has('president') || has('vp'))) || (x.id === 'consultant' && has('pm'));
    });
    var eb = RL.ebod.filter(function (e) { return e.p === p; })[0];
    p.posAuto = d;
    p.positions = list;
    p.posTitle = clean(o.title || '', 60).trim() || (eb ? eb.pos : '');
    var first = list.filter(function (x) { return !x.implied; })[0];
    p.posHead = p.posTitle || (first ? first.short : '');
    list.forEach(function (x) { p.tags.push(tag('pos:' + x.id, x.short, 'position', {quiet: x.implied || !!RL_QUIET[x.id]})); });
  });
  return m;
}
var rlBuildBase = build;
build = function (raw) {
  var m = rlBuildBase(raw);
  try { rlApply(m, raw); } catch (e) { console.error(e); }
  return m;
};
function rlHas(p, id) { return !!(p && (p.positions || []).some(function (x) { return x.id === id; })); }
function rlShown(p) { return (p.positions || []).filter(function (x) { return !x.implied; }); }

/* A member's row in Members puts positions right after what needs attention. */
tagRow = function (p) {
  var order = {gap: 0, position: 1, sfblc: 2, linked: 3, custom: 4, client: 5, track: 6, year: 7, room: 8};
  var list = (p.tags || []).filter(function (t) { return !t.quiet && t.group !== 'avail' && t.group !== 'type' && t.group !== 'org'; })
    .sort(function (a, b) { return (order[a.group] == null ? 9 : order[a.group]) - (order[b.group] == null ? 9 : order[b.group]); });
  var shown = list.slice(0, 5), more = list.length - shown.length;
  return '<div class="tags">' + shown.map(function (t) { return chip(t); }).join('') +
    (more > 0 ? '<button class="chip tone-ink moretags" data-act="profile" data-key="' + esc(p.key) + '">+' + more + '</button>' : '') + '</div>';
};

/* ---------- chips ---------- */
/* A position as a tag: a click filters Members by it, as every tag does. */
function rlChip(x, detail) {
  return '<button type="button" class="chip tone-' + x.tone + '" data-tag="pos:' + esc(x.id) + '">' + esc(x.short) + (detail && x.detail ? '<i>' + esc(x.detail) + '</i>' : '') + '</button>';
}
function rlChips(p, detail) { return rlShown(p).map(function (x) { return rlChip(x, detail); }).join(''); }

/* ---------- the member card ---------- */
var rlProfileBase = profileSheet;
profileSheet = function (p) {
  var h = rlProfileBase(p);
  if (!p || !p.positions) return h;
  var shown = rlShown(p);
  var block = '<div class="fg rlpos"><p class="fl">Position</p>' + (p.posTitle ? '<p class="rltitle">' + esc(p.posTitle) + '</p>' : '') +
    (shown.length ? '<div class="chips">' + rlChips(p, true) + '</div>' : '<p class="meta">No position yet.</p>') +
    (M.officer ? '<div class="rowacts"><button class="qbtn" data-act="rlEdit" data-key="' + esc(p.key) + '">' + icon('edit') + '<span>Edit positions</span></button>' +
      '<a class="qbtn" href="#orgchart" data-close>' + icon('orgchart') + '<span>Org chart</span></a></div>' : '') + '</div>';
  var at = h.indexOf('</header>');
  return at < 0 ? block + h : h.slice(0, at + 9) + block + h.slice(at + 9);
};
ACT_EXT.rlBack = function (el, d) { var p = M.byKey[d.key]; if (p) openSheet(profileSheet(p), function () { return profileSheet(M.byKey[d.key]); }); };

/* The officer's editor: tick what they are, give a title. A PM is whoever a
   client team names as PM, so that is changed on the team, here or on Client teams. */
function rlEditSheet(p) {
  var auto = p.posAuto || {}, on = {};
  (p.positions || []).forEach(function (x) { on[x.id] = 1; });
  var h = '<form class="form" data-act="rlEditSave" data-key="' + esc(p.key) + '"><header class="sh">' + avatar(p) + '<div><h3>Positions</h3><p class="pe">' + esc(p.name) + '</p></div></header>' +
    '<p class="meta">Ticked positions show on ' + esc(p.name.split(' ')[0]) + '’s card, on Members and on the org chart, to everyone. “Automatic” ones follow the club record; untick one to hide it.</p><div class="rlticks">';
  h += RL.cat.filter(function (c) { return c.id !== 'pm'; }).map(function (c) {
    var a = auto[c.id];
    return '<label class="tick"><input type="checkbox" name="pos" value="' + esc(c.id) + '"' + (on[c.id] ? ' checked' : '') + '><span>' + esc(c.label) +
      ' <small>' + (a ? 'Automatic' + (a.length ? ' · ' + esc(a.join(', ')) : '') : on[c.id] ? 'Added by an officer' : esc(c.how)) + '</small></span></label>';
  }).join('') + '</div>';
  h += '<label class="fld"><span>Title (optional)</span><input name="title" maxlength="60" value="' + esc(clean(((M.cfg.positions || {})[rlNorm(p.name)] || {}).title || '', 60)) + '" placeholder="' + esc(p.posTitle || 'e.g. Social chair') + '"></label>' +
    '<p class="hint">A title is shown under their name everywhere. Left empty, an Executive board title is used.</p>' +
    '<div class="sheetacts"><button class="btn">Save positions</button><button type="button" class="btn ghost" data-act="rlBack" data-key="' + esc(p.key) + '">Back to card</button></div></form>';
  /* PM of a client team. */
  var cts = M.teams.filter(function (t) { return rlKind(t) === 'consulting'; }), mine = rlPmTeams(p);
  h += '<div class="fg"><p class="fl">Consulting project manager</p>' + (mine.length ? '<ul class="tm">' + mine.map(function (t) {
    return '<li><span class="mn">' + esc(t.client || teamName(t)) + '<small>PM</small></span><button type="button" class="qbtn" data-act="rlPmDrop" data-id="' + esc(t.id) + '" data-key="' + esc(p.key) + '">' + icon('close') + '<span>Remove as PM</span></button></li>';
  }).join('') + '</ul>' : '<p class="meta">Not a PM of any client team.</p>') +
    (cts.length > mine.length ? '<label class="fld"><span>Make them a PM of</span><select class="mini" data-act="rlPmMake" data-key="' + esc(p.key) + '"><option value="">Pick a client team…</option>' +
      cts.filter(function (t) { return mine.indexOf(t) < 0; }).map(function (t) {
        var full = (t.pms || []).filter(function (x) { return String(x || '').trim(); }).length >= 2;
        return '<option value="' + esc(t.id) + '"' + (full ? ' disabled' : '') + '>' + esc((t.client || teamName(t)) + (full ? ' · both PM places taken' : '')) + '</option>';
      }).join('') + '</select></label>' : '') +
    '<p class="hint">A PM can change their client team’s initiatives, who works on which, and its stage. Members and PMs stay with officers.</p></div>';
  return h;
}
ACT_EXT.rlEdit = function (el, d) { var p = M.byKey[d.key]; if (p && M.officer) openSheet(rlEditSheet(p), function () { return M.byKey[d.key] ? rlEditSheet(M.byKey[d.key]) : ''; }); };
SUBMIT_EXT.rlEditSave = function (f) {
  if (!M.officer) return;
  var p = M.byKey[f.getAttribute('data-key')]; if (!p) return;
  var auto = p.posAuto || {}, add = [], rm = [], k = rlNorm(p.name), all = JSON.parse(JSON.stringify(M.cfg.positions || {})), was = all[k] || {};
  Array.prototype.forEach.call(f.querySelectorAll('input[name=pos]'), function (i) {
    if (i.checked && !auto[i.value]) add.push(i.value);
    if (!i.checked && auto[i.value]) rm.push(i.value);
  });
  /* PM follows the teams, so an old entry for it is kept as it was. */
  (was.add || []).forEach(function (id) { if (id === 'pm') add.push(id); });
  (was.remove || []).forEach(function (id) { if (id === 'pm') rm.push(id); });
  var title = clean(f.title.value, 60).trim();
  if (add.length || rm.length || title) all[k] = {add: add, remove: rm, title: title}; else delete all[k];
  openSheet(profileSheet(p), function () { return M.byKey[p.key] ? profileSheet(M.byKey[p.key]) : ''; });
  saveCfg({positions: all}, 'Positions saved for ' + p.name + '.');
};
CHANGE_EXT.rlPmMake = function (el, d) {
  var p = M.byKey[d.key]; if (!p || !el.value || !M.officer) return;
  var tl = cloneTeams(), t = findTeam(tl, el.value); if (!t) return;
  var pms = (t.pms || []).slice(); while (pms.length < 2) pms.push('');
  var slot = pms.map(function (x) { return String(x || '').trim(); }).indexOf('');
  if (slot < 0) { el.value = ''; return toast('Both PM places on ' + teamName(t) + ' are taken. Change one on Client teams → Edit teams.', true); }
  /* A PM sits on their team; a member is on one client team at a time. */
  var moved = typeof t2offKind === 'function' ? t2offKind(tl, 'consulting', p.name, t.id) : [];
  if (!(t.members || []).some(function (m) { return flat(m) === p.key; })) t.members = (t.members || []).concat([p.name]);
  pms[slot] = p.name; t.pms = pms;
  saveCfg({teams: tl}, p.name + ' is a PM of ' + teamName(t) + (moved.length ? ', moved from ' + moved.join(', ') : '') + '.');
};
ACT_EXT.rlPmDrop = function (el, d) {
  var p = M.byKey[d.key]; if (!p || !M.officer) return;
  var tl = cloneTeams(), t = findTeam(tl, d.id); if (!t) return;
  t.pms = (t.pms || []).map(function (x) { return flat(x) === p.key || (rlFind(x) === p) ? '' : x; });
  saveCfg({teams: tl}, p.name + ' is no longer a PM of ' + teamName(t) + '. They stay on the team.');
};

/* Someone on the chart who is not on the roster (an EBOD name with no account). */
function rlLite(name) {
  var e = RL.ebod.filter(function (x) { return x.name === name; })[0];
  var orgs = M.orgs.filter(function (o) { return flat(o.ebod) === flat(name); }).map(function (o) { return o.name; });
  var pm = M.teams.filter(function (t) { return rlKind(t) === 'consulting' && (t.pms || []).some(function (x) { return flat(x) === flat(name); }); }).map(function (t) { return t.client || teamName(t); });
  var facts = [['Position', e ? e.pos : ''], ['Org contact', orgs.join(', ')], ['PM of', pm.join(', ')]].filter(function (f) { return f[1]; });
  return '<header class="sh">' + avatar({name: name}) + '<div><h3>' + esc(name) + '</h3><p class="pe">' + esc(e ? e.pos : 'Chapter') + '</p></div></header>' +
    (facts.length ? '<dl class="facts pf">' + facts.map(function (f) { return '<dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd>'; }).join('') + '</dl>' : '') +
    '<p class="meta">Not on the member roster under this name, so there is no member card to open.' + (M.officer ? ' Write their full roster name on the Executive board list (Club settings → Positions) to link them.' : '') + '</p>' +
    '<div class="sheetacts"><button class="btn ghost" data-act="closeSheet">Close</button></div>';
}
ACT_EXT.rlWho = function (el, d) {
  var p = d.key && M.byKey[d.key];
  if (p) return openSheet(profileSheet(p), function () { return M.byKey[d.key] ? profileSheet(M.byKey[d.key]) : ''; });
  if (d.name) openSheet(rlLite(d.name));
};

/* ---------- Profile: your own positions ---------- */
function rlMineCard(h) {
  if (!M || !M.me) return h;
  var p = M.me, shown = rlShown(p), pm = rlPmTeams(p);
  var card = '<section class="card rlmine"><header><h3>Your positions</h3><a href="#orgchart">Org chart</a></header>' +
    (p.posTitle ? '<p class="rltitle">' + esc(p.posTitle) + '</p>' : '') +
    (shown.length ? '<ul class="rllist">' + shown.map(function (x) {
      return '<li><span class="sw tone-' + x.tone + '" aria-hidden="true"></span><span><b>' + esc(x.label) + '</b>' + (x.detail ? '<small>' + esc(x.detail) + '</small>' : '') + '</span></li>';
    }).join('') + '</ul>' : '<p class="meta">No position yet. Officers set positions; most follow from your Org, your teams and the Executive board.</p>') +
    (pm.length && !M.officer ? '<div class="rowacts"><a class="qbtn" href="#consulting">' + icon('consulting') + '<span>Run ' + esc(pm.map(function (t) { return t.client || teamName(t); }).join(' and ')) + '</span></a></div>' : '') + '</section>';
  var mark = '<form class="card form" data-act="obProfSave"', at = h.indexOf(mark);
  return at < 0 ? h + card : h.slice(0, at) + card + h.slice(at);
}
/* auth.js keeps VIEWS.profile behind a getter (to add its Account card to
   whatever draws Profile), so the card is added through that getter. */
(function () {
  var d = Object.getOwnPropertyDescriptor(VIEWS, 'profile');
  if (d && d.get) {
    Object.defineProperty(VIEWS, 'profile', {configurable: true, enumerable: true, set: d.set,
      get: function () { var f = d.get.call(VIEWS); return f && function (sub) { return rlMineCard(f(sub)); }; }});
  } else {
    var base = VIEWS.profile;
    VIEWS.profile = function (sub) { return rlMineCard(base ? base(sub) : ''); };
  }
})();

/* ---------- consulting PMs ---------- */
function rlPmTeams(p) {
  if (!p) return [];
  return M.teams.filter(function (t) { return rlKind(t) === 'consulting' && (t.pms || []).some(function (x) { return flat(x) === p.key; }); });
}
function rlAssignOf(t, m) { var a = t.assign || {}; return a[rlNorm(m)] || a[m] || ''; }
function rlPmPanel(t) {
  var st = (M.cfg.consultStage || {})[t.id] || 'scope', mem = (t.members || []).filter(Boolean), inits = t.initiatives || [];
  var pms = (t.pms || []).filter(function (x) { return String(x || '').trim(); });
  var others = pms.filter(function (x) { return flat(x) !== M.me.key; });
  var names = mem.filter(function (m) { return flat(m) !== M.me.key; });
  var subj = encodeURIComponent((t.client || teamName(t)) + ' team');
  var h = '<section class="card rlpm"><header><h3>' + esc(t.client || teamName(t)) + ' <span class="badge ok">You are a PM</span></h3><span class="count">' + mem.length + '</span></header>' +
    '<p class="meta">As a project manager' + (others.length ? ' with ' + esc(others.join(' & ')) : '') + ', you set this team’s initiatives, who works on which, and its stage. EBOD sets who is on the team and who its PMs are.</p>';
  h += '<label class="fld inline"><span>Stage</span><select class="mini" data-act="rlPmStage" data-id="' + esc(t.id) + '"' + (RL.busy ? ' disabled' : '') + '>' +
    STAGES.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === st ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select></label>';
  h += '<form class="rlinits" data-act="rlPmInits" data-id="' + esc(t.id) + '"><label class="fld"><span>Initiatives (comma-separated, up to 8)</span><input name="inits" maxlength="480" value="' + esc(inits.join(', ')) + '" placeholder="Market research, Brand, Operations"></label>' +
    '<button class="btn sm"' + (RL.busy ? ' disabled' : '') + '>Save initiatives</button></form>';
  h += '<div class="fg"><p class="fl">Who works on which</p>' + (inits.length ? '<ul class="tm rlasg">' + mem.map(function (m) {
    var isPm = pms.some(function (x) { return flat(x) === flat(m); });
    return '<li><span class="mn">' + esc(m) + (isPm ? '<small>PM</small>' : '') + '</span><select class="mini" data-act="rlPmAssign" data-id="' + esc(t.id) + '" data-name="' + esc(m) + '" aria-label="Initiative for ' + esc(m) + '"' + (RL.busy ? ' disabled' : '') + '>' +
      '<option value="">No initiative</option>' + inits.map(function (x) { return '<option' + (rlAssignOf(t, m) === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></li>';
  }).join('') + '</ul>' : '<p class="meta">Add initiatives above, then put people on them here.</p>') + '</div>';
  h += '<div class="fg"><p class="fl">Reach your team</p><div class="rowacts"><button class="qbtn" data-act="rlPmCopy" data-id="' + esc(t.id) + '">' + icon('members') + '<span>Copy names</span></button>' +
    '<a class="qbtn" href="mailto:?subject=' + subj + '&amp;body=' + encodeURIComponent('Hi ' + (names.map(function (n) { return n.split(' ')[0]; }).join(', ') || 'team') + ',\n\n') + '">' + icon('send') + '<span>Start an email</span></a></div>' +
    '<p class="hint">Club messages and notifications are sent by officers. Paste the names into your team’s Discord thread or an email, or ask EBOD to message the team from the Org System.</p></div>';
  return h + '</section>';
}
function rlPmSave(id, patch, okMsg) {
  if (RL.busy) return;
  RL.busy = true; render();
  return call('pmSaveTeam', Object.assign({teamId: id}, patch)).then(function (r) {
    RL.busy = false;
    if (!(r && r.ok && r.team)) { render(); return toast((r && r.error) || 'Not saved: the backend did not answer. Try again.', true); }
    [M.cfg, BASE].forEach(function (c) {
      if (!c) return;
      c.teams = (c.teams || []).map(function (t) { return t && t.id === id ? JSON.parse(JSON.stringify(r.team)) : t; });
      if (patch.stage !== undefined || (c.consultStage && c.consultStage[id])) { var s = Object.assign({}, c.consultStage || {}); s[id] = r.stage; c.consultStage = s; }
    });
    rebuild(); render(); toast(okMsg);
  });
}
CHANGE_EXT.rlPmStage = function (el, d) {
  var lbl = STAGES.filter(function (x) { return x[0] === el.value; })[0];
  rlPmSave(d.id, {stage: el.value}, 'Stage: ' + (lbl ? lbl[1] : el.value) + '.');
};
SUBMIT_EXT.rlPmInits = function (f) {
  var list = f.inits.value.split(',').map(function (x) { return clean(x, 60).trim(); }).filter(String)
    .filter(function (v, i, a) { return a.map(function (y) { return y.toLowerCase(); }).indexOf(v.toLowerCase()) === i; });
  if (list.length > 8) return toast('Up to 8 initiatives. ' + list.length + ' are listed.', true);
  var t = findTeam(M.teams, f.getAttribute('data-id'));
  if (t && JSON.stringify(list) === JSON.stringify(t.initiatives || [])) return toast('No change.');
  rlPmSave(f.getAttribute('data-id'), {initiatives: list}, list.length ? 'Initiatives saved.' : 'Initiatives cleared.');
};
CHANGE_EXT.rlPmAssign = function (el, d) {
  var t = findTeam(M.teams, d.id); if (!t) return;
  var a = {};
  (t.members || []).forEach(function (m) { var v = rlAssignOf(t, m); if (v) a[m] = v; });
  Object.keys(a).forEach(function (m) { if (flat(m) === flat(d.name)) delete a[m]; });
  if (el.value) a[d.name] = el.value;
  rlPmSave(d.id, {assign: a}, el.value ? d.name + ': ' + el.value + '.' : d.name + ' has no initiative now.');
};
ACT_EXT.rlPmCopy = function (el, d) {
  var t = findTeam(M.teams, d.id); if (!t) return;
  var txt = (t.members || []).filter(Boolean).join(', ');
  var show = function () {
    openSheet('<header class="sh"><h3>' + esc(t.client || teamName(t)) + ' team</h3></header><label class="fld"><span>Names</span><textarea rows="4" readonly>' + esc(txt) + '</textarea></label>' +
      '<div class="sheetacts"><button class="btn ghost" data-act="closeSheet">Done</button></div>');
  };
  try {
    navigator.clipboard.writeText(txt).then(function () { toast('Copied ' + plural((t.members || []).length, 'name') + '.'); }, show);
  } catch (e) { show(); }
};
var rlConsultBase = VIEWS.consulting;
VIEWS.consulting = function (sub) {
  var h = rlConsultBase(sub);
  if (M.officer) return h;
  var mine = rlPmTeams(M.me);
  return mine.length ? mine.map(rlPmPanel).join('') + h : h;
};

/* ---------- Club settings → Positions ---------- */
var rlClubBase = VIEWS.club;
VIEWS.club = function (sub) {
  var n = typeof rosterList === 'function' ? (rosterList() || []).length : 0;
  if (sub === 'positions') return subtabs('positions', [['setup', 'Setup'], ['form', 'Sign-up form'], ['roster', 'Roster', n || ''], ['calendar', 'Calendar'], ['positions', 'Positions']], 'club') + rlPanel();
  var h = rlClubBase ? rlClubBase(sub) : '', at = h.indexOf('<div class="subtabs"');
  if (at < 0) return h;
  var end = h.indexOf('</div>', at);
  return h.slice(0, end) + '<a role="tab" href="#club/positions" aria-selected="false">Positions</a>' + h.slice(end);
};
function rlHolders() {
  var by = {};
  M.people.forEach(function (p) { (p.positions || []).forEach(function (x) { (by[x.id] = by[x.id] || []).push(p); }); });
  return by;
}
function rlPanel() {
  var cat = RL.cat.length ? RL.cat : rlCatalog(), by = rlHolders();
  var h = '<p class="lede">Positions say what someone is in the chapter, on their card, in Members and on the <a href="#orgchart">org chart</a>. Most follow from the club record; a member’s card lets you add, hide or retitle theirs. Access to officer tools is separate and does not change here.</p>';
  h += '<form class="card form rlcat" data-act="rlCatSave"><header><h3>Positions</h3><span class="count">' + cat.length + '</span></header><ol class="rlcatl">' + cat.map(function (c, i) {
    var who = by[c.id] || [];
    return '<li><span class="nn num">' + String(i + 1).padStart(2, '0') + '</span><div class="rlcm"><input name="lbl" data-id="' + esc(c.id) + '" maxlength="40" value="' + esc(c.label) + '" aria-label="Name for ' + esc(c.label) + '">' +
      '<p class="hint">' + esc(c.how) + '</p>' +
      (who.length ? '<details><summary>' + plural(who.length, 'person', 'people') + '</summary><div class="chips">' + who.map(function (p) {
        return '<button type="button" class="chip tone-' + c.tone + '" data-act="profile" data-key="' + esc(p.key) + '">' + esc(p.name) + '</button>';
      }).join('') + '</div></details>' : '') +
      (function () {
        var off = RL.ebod.filter(function (e) { return !e.p && (e.tier === c.id || (c.id === 'ebod' && (e.tier === 'vp' || e.tier === 'president'))); }).map(function (e) { return e.name; });
        return off.length ? '<p class="hint">On the board list, not the roster: ' + esc(off.join(', ')) + '</p>' : who.length ? '' : '<p class="hint">Nobody yet</p>';
      })() + '</div>' +
      '<span class="rlmv"><button type="button" class="ghost icon" data-act="rlCatMove" data-id="' + esc(c.id) + '" data-dir="-1"' + (i ? '' : ' disabled') + ' aria-label="Move ' + esc(c.label) + ' up">' + icon('chev', 'up') + '</button>' +
      '<button type="button" class="ghost icon" data-act="rlCatMove" data-id="' + esc(c.id) + '" data-dir="1"' + (i < cat.length - 1 ? '' : ' disabled') + ' aria-label="Move ' + esc(c.label) + ' down">' + icon('chev') + '</button></span></li>';
  }).join('') + '</ol><p class="hint">The order is rank: the first position someone holds is the one shown under their name.</p>' +
    '<div class="sendrow"><button class="btn sm">Save names</button><button type="button" class="btn sm ghost" data-act="rlCatReset">Back to the defaults</button></div></form>';
  h += rlEbodCard();
  var over = M.cfg.positions || {}, changed = M.people.filter(function (p) { return over[rlNorm(p.name)]; });
  h += '<section class="card"><header><h3>Changed by officers</h3><span class="count">' + changed.length + '</span></header>' + (changed.length ? '<ul class="inbox">' + changed.map(function (p) {
    var o = over[rlNorm(p.name)], nm = function (id) { return (RL.idx[id] || {}).short || id; };
    var bits = [o.title ? '“' + o.title + '”' : '', (o.add || []).length ? 'added ' + o.add.map(nm).join(', ') : '', (o.remove || []).length ? 'hidden ' + o.remove.map(nm).join(', ') : ''].filter(Boolean);
    return '<li><div class="mh"><button class="who" data-act="profile" data-key="' + esc(p.key) + '">' + avatar(p) + '<span><span class="pn">' + esc(p.name) + '</span><span class="pe">' + esc(bits.join(' · ')) + '</span></span></button>' +
      '<button class="qbtn" data-act="rlEdit" data-key="' + esc(p.key) + '">' + icon('edit') + '<span>Edit</span></button></div></li>';
  }).join('') + '</ul>' : empty('Nothing changed by hand', 'Open a member’s card and press Edit positions to add a position, hide one or give a title.')) + '</section>';
  return h;
}
function rlCatRead() {
  var f = document.querySelector('form.rlcat'), labels = {};
  if (f) Array.prototype.forEach.call(f.querySelectorAll('input[name=lbl]'), function (i) { labels[i.getAttribute('data-id')] = clean(i.value, 40).trim(); });
  return RL.cat.map(function (c) { return {id: c.id, label: labels[c.id] || c.label}; });
}
SUBMIT_EXT.rlCatSave = function () {
  var list = rlCatRead();
  saveCfg({positionCatalog: list.map(function (c) { var d = RL_DEFAULT.filter(function (x) { return x.id === c.id; })[0]; return {id: c.id, label: c.label === d.label ? '' : c.label}; })}, 'Position names saved.');
};
ACT_EXT.rlCatMove = function (el, d) {
  var list = rlCatRead(), i = list.map(function (c) { return c.id; }).indexOf(d.id), j = i + (+d.dir);
  if (i < 0 || j < 0 || j >= list.length) return;
  var x = list[i]; list[i] = list[j]; list[j] = x;
  saveCfg({positionCatalog: list.map(function (c) { var dd = RL_DEFAULT.filter(function (y) { return y.id === c.id; })[0]; return {id: c.id, label: c.label === dd.label ? '' : c.label}; })}, 'Order saved.');
};
ACT_EXT.rlCatReset = function () {
  if (!M.cfg.positionCatalog) return toast('Already the defaults.');
  confirmSheet('Use the default positions?', 'Names and order go back to the defaults. Who holds what does not change.', 'Use the defaults', function () {
    delete M.cfg.positionCatalog;
    saveCfg({}, 'Back to the defaults.');
  });
};

/* The Executive board list (cfg.ebod), which the board screen and the
   President, VP and Director positions read. */
function rlEbodRows() {
  if (!RL.ebodDraft) RL.ebodDraft = (typeof ebod === 'function' ? ebod() : (M.cfg.ebod || [])).map(function (e) { return {name: e.name || '', pos: e.pos || ''}; });
  return RL.ebodDraft;
}
function rlEbodSync() {
  var f = document.querySelector('form.rlebod'); if (!f) return;
  var rows = rlEbodRows();
  Array.prototype.forEach.call(f.querySelectorAll('[data-row]'), function (r) {
    var i = +r.getAttribute('data-row'); if (!rows[i]) return;
    rows[i].name = r.querySelector('[name=nm]').value; rows[i].pos = r.querySelector('[name=pos]').value;
  });
}
function rlEbodCard() {
  var rows = rlEbodRows(), saved = !M.cfg.ebod || !M.cfg.ebod.length ? 'default' : '';
  var dirty = JSON.stringify(rows) !== JSON.stringify((typeof ebod === 'function' ? ebod() : []).map(function (e) { return {name: e.name || '', pos: e.pos || ''}; }));
  return '<form class="card form rlebod" data-act="rlEbodSave"><header><h3>Executive board</h3>' + (dirty ? '<span class="badge gold">Not saved yet</span>' : saved ? '<span class="badge">Fall 2026 default</span>' : '<span class="count">' + rows.length + '</span>') + '</header>' +
    '<p class="meta">Titles decide who is President, a Vice President (any title with VP or Vice) or a Director. A name links to a member’s card when it is their roster name, or a first name only one member has.</p>' +
    '<div class="rlebl">' + rows.map(function (r, i) {
      var p = rlFind(r.name);
      return '<div class="rlebr" data-row="' + i + '"><input name="nm" maxlength="60" value="' + esc(r.name) + '" list="rlnames" aria-label="Name" placeholder="Name">' +
        '<input name="pos" maxlength="60" value="' + esc(r.pos) + '" aria-label="Title" placeholder="Title, e.g. VP of Finance">' +
        '<span class="hint">' + (r.name.trim() ? (p ? 'On the roster' : 'Not on the roster') : '') + '</span>' +
        '<button type="button" class="x" data-act="rlEbodRm" data-i="' + i + '" aria-label="Remove ' + esc(r.name || 'this row') + '">' + icon('close') + '</button></div>';
    }).join('') + '</div><datalist id="rlnames">' + M.people.map(function (p) { return '<option value="' + esc(p.name) + '">'; }).join('') + '</datalist>' +
    '<div class="rowacts"><button type="button" class="qbtn" data-act="rlEbodAdd">' + icon('plus') + '<span>Add someone</span></button></div>' +
    '<div class="sendrow"><button class="btn sm">Save the board</button>' + (dirty ? '<button type="button" class="btn sm ghost" data-act="rlEbodUndo">Undo changes</button>' : '') + '</div></form>';
}
ACT_EXT.rlEbodAdd = function () { rlEbodSync(); rlEbodRows().push({name: '', pos: ''}); render(); var r = document.querySelectorAll('.rlebr [name=nm]'); if (r.length) r[r.length - 1].focus(); };
ACT_EXT.rlEbodRm = function (el, d) { rlEbodSync(); rlEbodRows().splice(+d.i, 1); render(); };
ACT_EXT.rlEbodUndo = function () { RL.ebodDraft = null; render(); };
SUBMIT_EXT.rlEbodSave = function () {
  rlEbodSync();
  var list = rlEbodRows().map(function (r) { return {name: clean(r.name, 60).trim(), pos: clean(r.pos, 60).trim()}; }).filter(function (r) { return r.name; });
  if (list.length > 40) return toast('Up to 40 people on the board.', true);
  RL.ebodDraft = null;
  saveCfg({ebod: list}, 'Executive board saved.');
};

/* =====================================================================
   The org chart (#orgchart)
   President, the Executive board, Directors, then the three programs.
   Everyone sees the same chart: names, Orgs and teams are club knowledge.
   ===================================================================== */
function rlOpen(id, dflt) { return RL.open.hasOwnProperty(id) ? RL.open[id] : RL.all != null ? RL.all : dflt; }
function rlTg(id, dflt, label) {
  var on = rlOpen(id, dflt);
  return '<button type="button" class="octg" data-act="rlTg" data-id="' + esc(id) + '" data-d="' + (dflt ? 1 : 0) + '" aria-expanded="' + on + '" aria-label="' + (on ? 'Collapse ' : 'Expand ') + esc(label) + '">' + icon('chev') + '</button>';
}
function rlPerson(name, p, sub, cls) {
  var nm = p ? p.name : name;
  return '<button type="button" class="ocp' + (cls ? ' ' + cls : '') + (p && p === M.me ? ' me' : '') + '" data-act="rlWho" ' + (p ? 'data-key="' + esc(p.key) + '"' : 'data-name="' + esc(name) + '"') + '>' + avatar({name: nm}) +
    '<span><span class="pn">' + esc(nm) + (p && p === M.me ? ' <span class="badge">You</span>' : '') + '</span>' + (sub ? '<span class="pe">' + esc(sub) + '</span>' : '') + '</span></button>';
}
function rlBox(title, list) {
  return '<div class="ocn ocbox"><p class="ocg">' + esc(title) + ' <span class="count">' + list.length + '</span></p><div class="ocppl">' +
    list.map(function (e) { return rlPerson(e.name, e.p, e.pos); }).join('') + '</div></div>';
}
function rlHead(id, ic, title, meta, dflt) {
  return '<div class="ocn ochead"><div class="ochd"><span class="ocic" aria-hidden="true">' + icon(ic) + '</span><div class="ocx"><p class="oct">' + esc(title) + '</p><p class="ocm">' + meta + '</p></div>' + rlTg(id, dflt, title) + '</div></div>';
}
function rlLeaves(list, sub) {
  return '<ul class="ocv">' + list.map(function (p) {
    var real = M.byKey[p.key] && M.people.indexOf(M.byKey[p.key]) > -1 ? M.byKey[p.key] : null;
    return '<li class="ocl">' + rlPerson(p.name, real, sub ? sub(p) : p.posHead, 'sm') + '</li>';
  }).join('') + '</ul>';
}
function rlOrgBranch() {
  var leads = {}, n = 0;
  M.people.forEach(function (p) {
    (p.positions || []).forEach(function (x) { if (x.id === 'orglead') { n++; (x.details.length ? x.details : [p.org]).forEach(function (o) { (leads[o] = leads[o] || []).push(p); }); } });
  });
  var inOrgs = M.orgs.reduce(function (a, o) { return a + o.members.length; }, 0);
  var h = rlHead('b-org', 'orgs', 'Org program', esc(plural(M.orgs.length, 'Org') + ' · ' + plural(inOrgs, 'member') + ' · ' + plural(n, 'Org lead')), true);
  if (!rlOpen('b-org', true)) return h;
  if (!M.orgs.length) return h + '<ul class="ocv"><li><div class="ocn"><p class="ocm">No Orgs yet. They are drafted at bootcamp 1.</p></div></li></ul>';
  return h + '<ul class="ocv">' + M.orgs.map(function (o) {
    var id = 'org-' + o.i, ls = leads[o.name] || [], mine = o.name === M.me.org;
    var rest = o.members.filter(function (p) { return ls.indexOf(p) < 0; });
    return '<li><div class="ocn' + (mine ? ' mine' : '') + '"><div class="ochd"><div class="ocx"><p class="oct">' + esc(o.name) + (mine ? ' <span class="badge">Your Org</span>' : '') + '</p>' +
      '<p class="ocm">' + esc(plural(o.members.length, 'member') + (o.ebod ? ' · EBOD contact ' + o.ebod : '')) + '</p></div>' + (rest.length ? rlTg(id, false, o.name + ' members') : '') + '</div>' +
      (ls.length ? '<div class="ocppl sm">' + ls.map(function (p) { return rlPerson(p.name, p, (RL.idx.orglead || {}).short || 'Org lead', 'sm'); }).join('') + '</div>' : '<p class="ocm">No Org lead named</p>') + '</div>' +
      (rest.length && rlOpen(id, false) ? rlLeaves(rest) : '') + '</li>';
  }).join('') + '</ul>';
}
function rlConsultBranch() {
  var cts = M.teams.filter(function (t) { return rlKind(t) === 'consulting'; }), st = M.cfg.consultStage || {};
  var nPm = 0, nMem = 0;
  cts.forEach(function (t) { nPm += (t.pms || []).filter(function (x) { return String(x || '').trim(); }).length; nMem += (t.members || []).filter(Boolean).length; });
  var h = rlHead('b-con', 'consulting', 'Consulting', esc(plural(cts.length, 'client team') + ' · ' + plural(nMem, 'consultant') + ' · ' + plural(nPm, 'PM')), true);
  if (!rlOpen('b-con', true)) return h;
  if (!cts.length) return h + '<ul class="ocv"><li><div class="ocn"><p class="ocm">No client teams yet.</p></div></li></ul>';
  return h + '<ul class="ocv">' + cts.map(function (t) {
    var id = 'ct-' + t.id, pms = (t.pms || []).filter(function (x) { return String(x || '').trim(); }), mem = (t.members || []).filter(Boolean);
    var stage = (STAGES.filter(function (x) { return x[0] === (st[t.id] || 'scope'); })[0] || STAGES[0])[1], inits = t.initiatives || [];
    var mine = mem.some(function (m) { return flat(m) === M.me.key; });
    var isPm = function (m) { return pms.some(function (x) { return flat(x) === flat(m) || rlFind(x) === M.byKey[flat(m)]; }); };
    var rest = mem.filter(function (m) { return !isPm(m); });
    var node = '<div class="ocn' + (mine ? ' mine' : '') + '"><div class="ochd"><div class="ocx"><p class="oct">' + esc(t.client || teamName(t)) + (mine ? ' <span class="badge">Your team</span>' : '') + '</p>' +
      '<p class="ocm">' + esc(stage + ' · ' + plural(mem.length, 'consultant') + ' · ' + plural(inits.length, 'initiative')) + '</p></div>' + (rest.length ? rlTg(id, false, (t.client || teamName(t)) + ' members') : '') + '</div>' +
      (pms.length ? '<div class="ocppl sm">' + pms.map(function (x) { return rlPerson(x, rlFind(x), 'PM', 'sm'); }).join('') + '</div>' : '<p class="ocm">PMs to be named</p>') + '</div>';
    if (!rest.length || !rlOpen(id, false)) return '<li>' + node + '</li>';
    var groups = inits.map(function (i) { return [i, rest.filter(function (m) { return rlAssignOf(t, m) === i; })]; });
    var none = rest.filter(function (m) { return inits.indexOf(rlAssignOf(t, m)) < 0; });
    if (none.length) groups.push([inits.length ? 'No initiative yet' : 'Consultants', none]);
    return '<li>' + node + '<ul class="ocv">' + groups.map(function (g) {
      var ppl = g[1].map(function (m) { return M.byKey[flat(m)] || {name: m, key: flat(m)}; });
      return '<li><div class="ocn ocsub"><p class="oct">' + esc(g[0]) + ' <span class="count">' + ppl.length + '</span></p></div>' +
        (ppl.length ? rlLeaves(ppl, function () { return ''; }) : '') + '</li>';
    }).join('') + '</ul></li>';
  }).join('') + '</ul>';
}
function rlCaseBranch() {
  var flc = M.teams.filter(function (t) { return rlKind(t) === 'flc'; }), evs = [];
  flc.forEach(function (t) { if (t.event && evs.indexOf(t.event) < 0) evs.push(t.event); });
  var order = M.events || [];
  evs.sort(function (a, b) { var x = order.indexOf(a), y = order.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || a.localeCompare(b); });
  var comp = {}, caseN = M.people.filter(function (p) { return rlHas(p, 'case'); }).length;
  flc.forEach(function (t) { (t.members || []).forEach(function (m) { comp[flat(m)] = 1; }); });
  var h = rlHead('b-case', 'sfblc', 'Case competitions', esc(sfInfo().name + ' · ' + plural(flc.length, 'team') + ' · ' + plural(Object.keys(comp).length, 'competitor') + (caseN ? ' · ' + caseN + ' on the track' : '')), true);
  if (!rlOpen('b-case', true)) return h;
  if (!evs.length) return h + '<ul class="ocv"><li><div class="ocn"><p class="ocm">No SFBLC teams yet.</p></div></li></ul>';
  return h + '<ul class="ocv">' + evs.map(function (e) {
    var id = 'ev-' + flat(e), ts = flc.filter(function (t) { return t.event === e; });
    var mine = ts.some(function (t) { return (t.members || []).some(function (m) { return flat(m) === M.me.key; }); });
    return '<li><div class="ocn' + (mine ? ' mine' : '') + '"><div class="ochd"><div class="ocx"><p class="oct">' + esc(e) + '</p><p class="ocm">' + esc(plural(ts.length, 'team')) + '</p></div>' + rlTg(id, true, e) + '</div></div>' +
      (rlOpen(id, true) ? '<ul class="ocv">' + ts.map(function (t) {
        var tid = 'ft-' + t.id, mem = (t.members || []).filter(Boolean), me = mem.some(function (m) { return flat(m) === M.me.key; });
        return '<li><div class="ocn ocsub' + (me ? ' mine' : '') + '"><div class="ochd"><div class="ocx"><p class="oct">' + esc(teamName(t)) + (me ? ' <span class="badge">Your team</span>' : '') + '</p><p class="ocm">' + esc(plural(mem.length, 'member')) + '</p></div>' +
          (mem.length ? rlTg(tid, false, teamName(t) + ' members') : '') + '</div></div>' +
          (mem.length && rlOpen(tid, false) ? rlLeaves(mem.map(function (m) { return M.byKey[flat(m)] || {name: m, key: flat(m)}; }), function () { return ''; }) : '') + '</li>';
      }).join('') + '</ul>' : '') + '</li>';
  }).join('') + '</ul>';
}
VIEWS.orgchart = function () {
  var add = function (list, p, pos) { if (!list.some(function (e) { return e.p ? e.p === p : flat(e.name) === p.key; })) list.push({name: p.name, pos: pos, p: p}); };
  var pres = RL.ebod.filter(function (e) { return e.tier === 'president'; }), execs = RL.ebod.filter(function (e) { return e.tier === 'vp' || e.tier === 'ebod'; }),
      dirs = RL.ebod.filter(function (e) { return e.tier === 'director'; }), offs = [];
  /* Positions officers gave by hand belong on the chart too. */
  M.people.forEach(function (p) {
    if (rlHas(p, 'president')) add(pres, p, p.posTitle || RL.idx.president.short);
    else if (rlHas(p, 'vp') || rlHas(p, 'ebod')) add(execs, p, p.posTitle || (rlHas(p, 'vp') ? RL.idx.vp.short : RL.idx.ebod.short));
    else if (rlHas(p, 'director')) add(dirs, p, p.posTitle || RL.idx.director.short);
    else if (rlHas(p, 'officer')) add(offs, p, p.posTitle || RL.idx.officer.short);
  });
  var lv = [];
  if (pres.length) lv.push(rlBox(pres.length > 1 ? RL.idx.president.short + 's' : RL.idx.president.short, pres));
  if (execs.length) lv.push(rlBox(RL.idx.ebod.short, execs));
  if (dirs.length) lv.push(rlBox(RL.idx.director.short + 's', dirs));
  if (offs.length) lv.push(rlBox('Other officers', offs));
  if (!lv.length) lv.push('<div class="ocn ocbox"><p class="ocg">' + esc(RL.idx.ebod.short) + '</p><p class="ocm">No board named yet.' + (M.officer ? ' Add it under Club settings → Positions.' : '') + '</p></div>');
  var tree = '<ul class="och ocprog">' + [rlOrgBranch(), rlConsultBranch(), rlCaseBranch()].map(function (b) { return '<li class="ocbr">' + b + '</li>'; }).join('') + '</ul>';
  for (var i = lv.length - 1; i >= 0; i--) tree = '<ul class="och ocstack"><li>' + lv[i] + tree + '</li></ul>';
  var mine = rlShown(M.me);
  var h = '<p class="lede">Who does what in the chapter. Positions follow the Executive board list, Org leads, client team PMs and SFBLC teams' + (M.officer ? '; adjust anyone’s from their card.' : '.') + ' Press a name to open their card.</p>';
  if (mine.length && !M.officer) h += '<div class="note">' + icon('profile') + '<span>You: ' + esc(mine.map(function (x) { return x.short + (x.detail ? ' (' + x.detail + ')' : ''); }).join(', ')) + '.</span></div>';
  h += '<section class="toolbar ocbar"><span class="grow"></span><div class="oczoom" role="group" aria-label="Zoom"><button type="button" class="btn sm ghost" data-act="rlZoom" data-z="-1" aria-label="Zoom out"' + (RL.zoom <= 0.6 ? ' disabled' : '') + '>−</button>' +
    '<button type="button" class="btn sm ghost num" data-act="rlZoom" data-z="0" aria-label="Reset zoom">' + Math.round(RL.zoom * 100) + '%</button>' +
    '<button type="button" class="btn sm ghost" data-act="rlZoom" data-z="1" aria-label="Zoom in"' + (RL.zoom >= 1.4 ? ' disabled' : '') + '>+</button></div>' +
    '<button type="button" class="btn sm ghost" data-act="rlAll" data-v="1">Expand all</button><button type="button" class="btn sm ghost" data-act="rlAll" data-v="0">Collapse all</button>' +
    (M.officer ? '<a class="btn sm ghost" href="#club/positions">Positions</a>' : '') + '</section>';
  return h + '<section class="card occard"><div class="ocwrap"><div class="oc" style="--ocz:' + RL.zoom + '">' + tree + '</div></div></section>';
};
/* Redrawing keeps where the chart was scrolled to and which toggle had focus. */
function rlRedraw(focusSel) {
  var w = document.querySelector('.ocwrap'), x = w ? w.scrollLeft : 0, y = window.scrollY;
  render();
  w = document.querySelector('.ocwrap'); if (w) w.scrollLeft = x;
  window.scrollTo(0, y);
  var f = focusSel && document.querySelector(focusSel); if (f) f.focus({preventScroll: true});
}
ACT_EXT.rlTg = function (el, d) { RL.open[d.id] = !rlOpen(d.id, d.d === '1'); rlRedraw('[data-act="rlTg"][data-id="' + d.id.replace(/"/g, '') + '"]'); };
ACT_EXT.rlAll = function (el, d) { RL.open = {}; RL.all = d.v === '1'; rlRedraw(); };
ACT_EXT.rlZoom = function (el, d) {
  var z = +d.z;
  RL.zoom = z === 0 ? 1 : Math.max(0.6, Math.min(1.4, Math.round((RL.zoom + z * 0.1) * 10) / 10));
  rlRedraw('[data-act="rlZoom"][data-z="' + d.z + '"]');
};

/* =====================================================================
   Demo: believable positions, and the demo member as a PM
   ===================================================================== */
(function () {
  var wrap = function (action, fn) {
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
  };
  /* Once per demo club: two PMs on every client team, the demo member one of
     them on one team, an Org lead in most Orgs, and a title an officer gave. */
  var seed = function (s, store) {
    if (s.rlSeed) return;
    var who = function (n) { return s.people.filter(function (p) { return flat(p.name) === flat(n); })[0]; };
    var cts = s.cfg.teams.filter(function (t) { return t.kind === 'consulting'; });
    var home = cts.filter(function (t) { return (t.members || []).indexOf(s.member) > -1; })[0] || cts[2] || cts[0];
    if (home) {
      cts.forEach(function (t) {
        if (t === home) return;
        t.members = (t.members || []).filter(function (m) { return m !== s.member; });
        t.pms = (t.pms || []).filter(function (m) { return m !== s.member; });
      });
      if (home.members.indexOf(s.member) < 0) home.members.push(s.member);
      if (home.assign) delete home.assign[s.member];
      home.pms = [s.member].concat((home.pms || []).filter(function (m) { return m !== s.member; })).slice(0, 2);
    }
    cts.forEach(function (t) {
      var pms = (t.pms || []).filter(Boolean);
      var cand = (t.members || []).filter(function (m) { return pms.indexOf(m) < 0; })
        .sort(function (a, b) { return ((who(b) || {}).year || 0) - ((who(a) || {}).year || 0); });
      while (pms.length < 2 && cand.length) pms.push(cand.shift());
      t.pms = pms;
      pms.forEach(function (m) { if (t.assign) delete t.assign[m]; });
    });
    var orgs = [];
    s.people.forEach(function (p) { if (p.org && orgs.indexOf(p.org) < 0) orgs.push(p.org); });
    var mem = who(s.member);
    s.rlLeads = orgs.slice(0, 5).map(function (o) {
      if (mem && mem.org === o) return s.member;
      var in2 = s.people.filter(function (p) { return p.org === o && p.year === 2 && p.name !== s.member; });
      var p = in2.filter(function (x) { return x.lead; })[0] || in2[0];
      return p ? p.name : '';
    }).filter(Boolean);
    if (mem && mem.org && s.rlLeads.indexOf(s.member) < 0) s.rlLeads.push(s.member);
    s.cfg.positions = s.cfg.positions || {};
    var social = s.people.filter(function (p) { return p.year === 2 && p.name !== s.member && s.rlLeads.indexOf(p.name) < 0; })[3];
    if (social) s.cfg.positions[rlNorm(social.name)] = {add: [], remove: [], title: 'Social chair'};
    s.rlSeed = 1; store();
  };
  wrap('getAll', function (base, pl, s, officer, me, store) {
    seed(s, store);
    var r = base();
    if (r && r.teams) r.teams.forEach(function (row) { if ((s.rlLeads || []).indexOf(row.MemberName) > -1) row.IsLead = 'yes'; });
    return r;
  });
  /* The same checks as Code.gs pmSaveTeam. */
  DEMO_EXT.pmSaveTeam = function (pl, s, officer, me, store) {
    pl = pl || {};
    var allowed = {teamId: 1, initiatives: 1, assign: 1, stage: 1}, extra = Object.keys(pl).filter(function (k) { return !allowed[k]; });
    if (extra.length) return {ok: false, error: 'A PM can change initiatives, assignments and the stage only (not ' + extra.join(', ') + ').'};
    var t = s.cfg.teams.filter(function (x) { return x && x.id === pl.teamId; })[0];
    if (!t || (t.kind || (t.track === 'c' ? 'consulting' : '')) !== 'consulting') return {ok: false, error: 'That client team was not found.'};
    if (!officer && !(t.pms || []).some(function (n) { return flat(n) === me; })) return {ok: false, error: 'Only a project manager of ' + (t.client || t.name) + ' can change it.'};
    var nt = JSON.parse(JSON.stringify(t)), txt = function (v) { return clean(v, 60).trim(); };
    if (pl.initiatives !== undefined) {
      if (!Array.isArray(pl.initiatives)) return {ok: false, error: 'Initiatives are a list.'};
      if (pl.initiatives.length > 8) return {ok: false, error: 'A team can have up to 8 initiatives.'};
      var seen = {};
      nt.initiatives = pl.initiatives.map(txt).filter(function (v) { if (!v || seen[v.toLowerCase()]) return false; seen[v.toLowerCase()] = 1; return true; });
    }
    var inits = nt.initiatives || [];
    if (pl.assign !== undefined) {
      var on = {}, next = {}, bad = '';
      (nt.members || []).forEach(function (m) { on[flat(m)] = m; });
      Object.keys(pl.assign || {}).forEach(function (k) {
        var m = on[flat(k)], v = txt(pl.assign[k]);
        if (bad) return;
        if (!m) bad = k + ' is not on this team.';
        else if (v && inits.indexOf(v) < 0) bad = '“' + v + '” is not one of this team’s initiatives.';
        else if (v) next[rlNorm(m)] = v;
      });
      if (bad) return {ok: false, error: bad};
      nt.assign = next;
    }
    var kept = {};
    Object.keys(nt.assign || {}).forEach(function (k) { if (inits.indexOf(nt.assign[k]) > -1) kept[k] = nt.assign[k]; });
    nt.assign = kept;
    if (pl.stage !== undefined) {
      if (['scope', 'research', 'deliver', 'done'].indexOf(pl.stage) < 0) return {ok: false, error: 'Unknown stage.'};
      s.cfg.consultStage = Object.assign({}, s.cfg.consultStage || {}); s.cfg.consultStage[t.id] = pl.stage;
    }
    s.cfg.teams = s.cfg.teams.map(function (x) { return x === t ? nt : x; });
    store();
    return {ok: true, team: nt, stage: (s.cfg.consultStage || {})[t.id] || 'scope'};
  };
})();
