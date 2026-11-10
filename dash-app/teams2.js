/* Teams and competitions: members' event and client rankings, consulting client teams, hotel rooms and team requests. */
'use strict';

/* The same rules the classic Teams tab (index.html) and the backend keep:
   one consulting team per client, three SFBLC teams per event, rooms of up to
   roomCap from one rooming group, team requests capped per kind (Code.gs
   TEAMREQ_KINDS). Teams and rooms keep their ids and every field they carry,
   so the master sheet sync (Sync.gs) keeps matching them. */
var T2 = {reqs: null, reqErr: '', reqBusy: false, prefs: null, clients: null, pf: 'all',
          draft: {kind: 'flc', tgt: '', nm: '', note: '', mates: []}};
var T2_CLIENTS = ['Ecology Action', 'Habitat for Humanity', 'Chroma Aromatics', 'Orkizz', 'Sky Campus'];
var T2_CAP = {consulting: 14, flc: 4, other: 14};
var T2_PER_EVENT = 3, T2_CLIENT_CAP = 12;
var T2_GROUP = {w: 'Women’s room', m: 'Men’s room', x: 'All-gender room'};

/* ---------- helpers ---------- */
/* The classic page's normName: initiative assignments are keyed by it. */
function t2norm(s) {
  s = String(s || '').trim();
  if (s.indexOf(',') > -1) { var p = s.split(','); s = p[1] + ' ' + p[0]; }
  return s.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}
function t2kind(t) { return !t ? 'other' : t.kind || (t.track === 'c' ? 'consulting' : t.track === 'k' ? 'flc' : 'other'); }
function t2clients() { return (M.cfg.clients && M.cfg.clients.length) ? M.cfg.clients.slice() : T2_CLIENTS.slice(); }
function t2rooms() { return (M.cfg.rooms || []).filter(function (r) { return r && r.id; }); }
function t2roomCap() { var n = parseInt(M.cfg.roomCap, 10); return n >= 1 && n <= 8 ? n : 4; }
function t2person(name) { return M.byKey[flat(name)] || null; }
function t2on(t, name) { return (t.members || []).some(function (m) { return flat(m) === flat(name); }); }
function t2assign(t, m) { var a = t.assign || {}; return a[t2norm(m)] || a[m] || ''; }
function t2hasPrefs(pr) { return !!(pr && ((pr.flc && pr.flc.length) || (pr.clients && pr.clients.length) || pr.group || pr.attend === false)); }
function t2selfTeams() { return M.cfg.selfTeams !== false; }
function t2flcFor(list, ev) { return list.filter(function (t) { return t2kind(t) === 'flc' && t.event === ev; }); }
function t2yr(p) { return p && p.year ? (p.year === 2 ? '2nd year' : '1st year') : ''; }
function t2sel(name, opts, cur, extra) {
  return '<select class="mini" ' + name + (extra || '') + '>' + opts.map(function (o) {
    var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
    return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>';
  }).join('') + '</select>';
}
function t2namesList() {
  return '<datalist id="t2names">' + M.people.map(function (p) { return '<option value="' + esc(p.name) + '">'; }).join('') + '</datalist>';
}
/* Off every other team of this kind, initiative and all: a member is on one team of each kind. */
function t2offKind(list, kind, name, keep) {
  var moved = [];
  list.forEach(function (t) {
    if (t.id === keep || t2kind(t) !== kind || !t2on(t, name)) return;
    t.members = (t.members || []).filter(function (m) { return flat(m) !== flat(name); });
    if (t.assign) { delete t.assign[t2norm(name)]; delete t.assign[name]; }
    if (t.pms) t.pms = t.pms.map(function (x) { return flat(x) === flat(name) ? '' : x; });
    moved.push(teamName(t));
  });
  return moved;
}
function t2csv(rows, file) {
  var csv = rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); if (/^[=+\-@]/.test(c)) c = "'" + c; return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'})); a.download = file;
  document.body.appendChild(a); a.click(); a.remove();
}
/* Typed answers on these screens survive a re-render (a request list arriving, a save). */
function t2keep() {
  var f = document.querySelector('form[data-act="t2prefSave"]');
  if (f && T2.prefs) {
    T2.prefs.flc = [f.flc0.value, f.flc1.value, f.flc2.value];
    T2.prefs.mate = f.mate.value; T2.prefs.attend = f.attend.checked; T2.prefs.group = f.group.value;
    T2.prefs.roomies = [f.rm0.value, f.rm1.value, f.rm2.value]; T2.prefs.rnote = f.rnote.value;
  }
  var g = document.querySelector('form[data-act="t2rqSend"]');
  if (g) { T2.draft.tgt = g.tgt.value; T2.draft.nm = g.nm.value; T2.draft.note = g.note.value; }
  var c = document.querySelector('form[data-act="t2clientSave"]');
  if (c && T2.clients) T2.clients = t2clients().map(function (_, i) { return c['c' + i].value; });
}
function t2render() { t2keep(); render(); }

/* ---------- team requests ---------- */
function t2loadReqs() {
  if (T2.reqBusy || !M) return Promise.resolve();
  T2.reqBusy = true;
  return call('listTeamRequests', {me: M.me.name}).then(function (r) {
    T2.reqBusy = false;
    if (r && r.ok) { T2.reqs = r.requests || []; T2.reqErr = ''; }
    else { if (!T2.reqs) T2.reqs = []; T2.reqErr = (r && r.error) || 'The backend did not answer.'; }
    if (M && (ROUTE.view === 'teams' || ROUTE.view === 'overview' || ROUTE.view === 'consulting')) t2render(); else drawNav();
  });
}
function t2waiting() { return (T2.reqs || []).filter(function (q) { return q.status === 'pending'; }); }
function t2what(q) {
  if (q.kind === 'consulting') return 'Consulting · ' + (q.target || 'client not set');
  if (q.kind === 'flc') return 'SFBLC · ' + (q.target || 'event not set');
  return q.target ? 'Track · ' + q.target : 'Other team';
}
function t2status(q) {
  var s = {pending: ['Waiting for EBOD', 'gold'], approved: ['Approved', 'ok'], returned: ['Sent back', 'bad']}[q.status] || [q.status || '', ''];
  return '<span class="badge ' + s[1] + '">' + esc(s[0]) + '</span>';
}
/* What an officer should look at before saying yes. */
function t2checks(q) {
  var out = [], k = q.kind, mem = q.members || [];
  var unknown = mem.filter(function (m) { return !t2person(m); });
  if (unknown.length) out.push('Not on the roster under that name: ' + unknown.join(', '));
  var taken = mem.map(function (m) { var t = M.teams.filter(function (x) { return t2kind(x) === k && t2on(x, m); })[0]; return t ? m + ' (' + teamName(t) + ')' : ''; }).filter(String);
  if (taken.length) out.push('Already on ' + (k === 'flc' ? 'an SFBLC' : k === 'consulting' ? 'a consulting' : 'another') + ' team (approving moves them): ' + taken.join(', '));
  if (mem.length > T2_CAP[k]) out.push('Over the ' + T2_CAP[k] + '-person limit');
  if (k === 'flc') {
    if (M.events.indexOf(q.target) < 0) out.push(q.target + ' is not one of this season’s SFBLC events');
    else {
      if (t2flcFor(M.teams, q.target).length >= T2_PER_EVENT) out.push(q.target + ' already has its ' + T2_PER_EVENT + ' teams');
      var cap = capFor(M.cfg, q.target).max;
      if (mem.length > cap) out.push(q.target + ' teams take up to ' + cap);
    }
    var cant = mem.filter(function (m) { var p = t2person(m); return p && p.prefs.attend === false; });
    if (cant.length) out.push('Said they cannot make the conference: ' + cant.join(', '));
  }
  if (k === 'consulting' && t2clients().indexOf(q.target) < 0) out.push(q.target + ' is not on this season’s client list');
  var dup = mem.filter(function (m) {
    return (T2.reqs || []).some(function (o) { return o.id !== q.id && o.status === 'pending' && o.kind === k && (o.members || []).some(function (x) { return flat(x) === flat(m); }); });
  });
  if (dup.length) out.push('Also in another waiting request: ' + dup.join(', '));
  return out;
}
/* Turning a request into a team: consulting members join that client's
   team; SFBLC and track requests become new teams. */
function t2approve(q, tl) {
  var k = q.kind, names = (q.members || []).map(function (m) { var p = t2person(m); return p ? p.name : clean(m, 60).trim(); }).filter(Boolean);
  if (k === 'flc' && t2flcFor(tl, q.target).length >= T2_PER_EVENT) return {error: q.target + ' already has its ' + T2_PER_EVENT + ' teams. Make room first, or send this back.'};
  if (names.length > T2_CAP[k]) return {error: 'That is more than ' + T2_CAP[k] + ' people.'};
  names.forEach(function (n) { t2offKind(tl, k, n, ''); });
  var team;
  if (k === 'consulting') {
    team = tl.filter(function (t) { return t2kind(t) === 'consulting' && String(t.client || t.name).toLowerCase() === String(q.target).toLowerCase(); })[0];
    if (!team) { team = {id: uid('c'), kind: 'consulting', track: 'c', client: q.target, event: '', name: q.target, members: [], pms: [], initiatives: [], assign: {}}; tl.push(team); }
    team.members = (team.members || []).concat(names.filter(function (n) { return !t2on(team, n); }));
  } else {
    var nm = clean(q.name, 60).trim();
    if (!nm) nm = k === 'flc' ? q.target + ' ' + (t2flcFor(tl, q.target).length + 1) : (q.target || 'Team') + ' · ' + (q.byName || 'members');
    while (tl.some(function (t) { return String(t.name || '').toLowerCase() === nm.toLowerCase(); })) nm += ' 2';
    var tr = (M.cfg.tracks || []).filter(function (t) { return t && t.label === q.target; })[0];
    team = {id: uid(k === 'flc' ? 'flc' : 't'), kind: k, track: k === 'flc' ? 'k' : (tr ? tr.id : ''), event: k === 'flc' ? q.target : '', client: '',
            name: nm, members: names, pms: [], initiatives: [], assign: {}};
    tl.push(team);
  }
  return {team: team};
}
/* Every change to a request row is saved at once; a request that is already
   a team changes that team too. */
function t2editReq(q, patch) {
  var mem = (patch.members || q.members || []).slice();
  if (!mem.length) return toast('A team needs at least one member. Delete the request instead.', true);
  if (mem.length > T2_CAP[q.kind]) return toast('This kind of team takes up to ' + T2_CAP[q.kind] + '.', true);
  var tm = q.status === 'approved' && q.teamId ? findTeam(M.teams, q.teamId) : null, first = Promise.resolve(true), moved = [];
  if (tm) {
    var tl = cloneTeams(), t = findTeam(tl, tm.id);
    if (patch.members) {
      var names = mem.map(function (m) { var p = t2person(m); return p ? p.name : m; });
      names.forEach(function (n) { moved = moved.concat(t2offKind(tl, t2kind(t), n, t.id)); });
      (t.members || []).forEach(function (m) { if (!names.some(function (n) { return flat(n) === flat(m); }) && t.assign) { delete t.assign[t2norm(m)]; delete t.assign[m]; } });
      t.members = names;
    }
    if (patch.name && q.kind !== 'consulting') t.name = patch.name;
    first = saveCfg({teams: tl});
  }
  var body = {id: q.id, members: mem};
  if (patch.name != null) body.name = patch.name;
  if (patch.target) body.target = patch.target;
  return first.then(function () { return call('editTeamRequest', body); }).then(function (r) {
    if (!(r && r.ok)) return toast((r && r.error) || 'Not saved.' + (tm ? ' The team itself was updated.' : ''), true);
    q.members = mem; if (patch.name != null) q.name = patch.name; if (patch.target) q.target = patch.target;
    t2render();
    toast('Saved' + (tm ? ', and ' + teamName(tm) + ' updated' + (moved.length ? ' (moved from ' + moved.join(', ') + ')' : '') : '') + '.');
  });
}
function t2req(id) { return (T2.reqs || []).filter(function (q) { return q.id === id; })[0]; }
/* A deleted team takes the requests that became it, so nobody reads "Approved" for a team that is gone. */
function t2dropTeam(id, msg) {
  var t = findTeam(M.teams, id); if (!t) return;
  return saveCfg({teams: cloneTeams().filter(function (x) { return x.id !== id; })}, msg || teamName(t) + ' deleted.').then(function (ok) {
    if (!ok || !(T2.reqs || []).some(function (q) { return q.teamId === id; })) return;
    return call('deleteTeamRequest', {teamId: id}).then(function (r) {
      if (r && r.ok) { T2.reqs = T2.reqs.filter(function (q) { return q.teamId !== id; }); t2render(); }
    });
  });
}

/* ---------- Teams: the screen ---------- */
var t2baseTeams = VIEWS.teams;
VIEWS.teams = function (sub) {
  if (!M.officer) {
    var tabsM = [['team', 'Your team'], ['choices', 'Your choices']];
    var mineReqs = (T2.reqs || []).length;
    if (t2selfTeams() || mineReqs) tabsM.push(['form', 'Form a team', mineReqs || '']);
    sub = tabsM.some(function (x) { return x[0] === sub; }) ? sub : 'team';
    var hm = subtabs(sub, tabsM, 'teams');
    if (sub === 'choices') return hm + t2choices();
    if (sub === 'form') return hm + t2formTeam();
    return hm + t2links(t2baseTeams());
  }
  var going = M.people.filter(function (p) { return p.going; }), roomless = t2rooms().length ? going.filter(function (p) { return !p.room; }).length : 0;
  var sent = M.people.filter(function (p) { return t2hasPrefs(p.prefs) && ((p.prefs.flc || []).length || p.prefs.attend === false); }).length;
  var tabs = [['board', 'SFBLC teams'], ['prefs', 'Choices', sent || ''], ['rooms', 'Hotel rooms', roomless || ''], ['requests', 'Team requests', t2waiting().length || '']];
  sub = tabs.some(function (x) { return x[0] === sub; }) ? sub : 'board';
  var h = subtabs(sub, tabs, 'teams');
  if (sub === 'prefs') return h + t2prefsOverview();
  if (sub === 'rooms') return h + t2roomsView();
  if (sub === 'requests') return h + t2reqAdmin();
  return h + t2baseTeams();
};
/* The classic Teams tab links the other screens still carry, pointed here. */
function t2links(h) {
  return String(h).replace(/href="\/teams">Rank my events/g, 'href="#teams/choices">Rank my events');
}

/* ---------- member: SFBLC choices ---------- */
function t2prefsDraft() {
  if (!T2.prefs) {
    var p = M.me.prefs || {};
    T2.prefs = {flc: (p.flc || []).slice(), mate: p.mate || '', attend: p.attend !== false, group: p.group || '', roomies: (p.roomies || []).slice(), rnote: p.rnote || ''};
  }
  return T2.prefs;
}
function t2choices() {
  var cur = t2prefsDraft(), info = sfInfo(), evs = M.events, sent = !!(M.me.prefs && M.me.prefs.at);
  var dates = fmtDay(info.start) + ' – ' + fmtDay(info.end);
  var h = '';
  var rm = M.me.room;
  if (rm) h += '<section class="card t2myroom"><header><h3>Your room</h3>' + (rm.no ? '<span class="badge">Room ' + esc(rm.no) + '</span>' : '') + '</header><p class="tn">' + esc(rm.name || 'Room') + '</p>' +
    '<p class="meta">' + esc(T2_GROUP[rm.group] || '') + (rm.no ? '' : ' · room number at check-in') + '</p><ul class="mates">' + (rm.members || []).map(function (m) {
      return '<li>' + avatar({name: m}) + '<span>' + esc(m) + (flat(m) === M.me.key ? ' <span class="badge">You</span>' : '') + '</span></li>';
    }).join('') + '</ul></section>';
  var ev = function (i) {
    return '<label class="fld"><span>' + ['1st', '2nd', '3rd'][i] + ' choice</span>' + t2sel('name="flc' + i + '"', [['', '—']].concat(evs), (cur.flc || [])[i] || '') + '</label>';
  };
  h += '<form class="card form t2prefs" data-act="t2prefSave"><header><h3>Your SFBLC choices</h3>' + (sent ? '<span class="badge ok">Sent ' + esc(ago(new Date(M.me.prefs.at).toISOString())) + '</span>' : '') + '</header>' +
    '<p class="meta">Competing at ' + esc(info.name) + ' (' + esc(dates) + ', ' + esc(info.city) + ')? Rank the events you want. EBOD forms teams from these, up to ' + T2_PER_EVENT + ' per event, and confirms them. Open to everyone, whatever your track. Going without competing? Leave the events empty and fill in your room.</p>' +
    '<div class="t2row3">' + ev(0) + ev(1) + ev(2) + '</div>' +
    '<label class="fld"><span>Someone you would like on your team (optional)</span><input name="mate" maxlength="60" list="t2names" value="' + esc(cur.mate) + '" placeholder="Start typing a name" autocomplete="off"></label>' +
    '<label class="tick"><input type="checkbox" name="attend" data-t2c="attend"' + (cur.attend ? ' checked' : '') + '> I can be there ' + esc(dates) + '</label>' +
    '<fieldset class="t2hotel"' + (cur.attend ? '' : ' disabled') + '><legend>Hotel room</legend>' +
    '<p class="meta">Everyone going stays at the conference hotel. EBOD books the rooms from these answers.</p>' +
    '<label class="fld"><span>Rooming group</span>' + t2sel('name="group"', [['', 'Choose…'], ['w', T2_GROUP.w], ['m', T2_GROUP.m], ['x', T2_GROUP.x]], cur.group) + '</label>' +
    '<div class="fld"><span>Up to 3 people you would like to room with (optional)</span><div class="t2row3">' + [0, 1, 2].map(function (i) {
      return '<input name="rm' + i + '" maxlength="60" list="t2names" value="' + esc((cur.roomies || [])[i] || '') + '" aria-label="Roommate ' + (i + 1) + '" autocomplete="off">';
    }).join('') + '</div></div>' +
    '<label class="fld"><span>Anything EBOD should know for rooming (optional, only officers see this)</span><input name="rnote" maxlength="160" value="' + esc(cur.rnote) + '" placeholder="e.g. light sleeper, need a ground floor"></label></fieldset>' +
    '<div class="sendrow"><button class="btn">' + (sent ? 'Update my choices' : 'Send my choices') + '</button></div>' + t2namesList() + '</form>';
  return h;
}
SUBMIT_EXT.t2prefSave = function (f) {
  t2keep();
  var c = T2.prefs, seen = {};
  var flc = c.flc.filter(function (v) { if (!v || seen[v]) return false; seen[v] = 1; return true; });
  if (c.attend && !c.group) { toast('Choose a rooming group so EBOD can put you in a room.', true); f.group.focus(); return; }
  var old = M.me.prefs || {};
  var pr = {flc: flc, clients: old.clients || [], mate: clean(c.mate, 60).trim(), attend: c.attend, hotel: c.attend, group: c.attend ? c.group : '',
            roomies: c.attend ? c.roomies.map(function (x) { return clean(x, 60).trim(); }).filter(function (x) { return x && flat(x) !== M.me.key; }).slice(0, 3) : [],
            rnote: c.attend ? clean(c.rnote, 160) : '', at: Date.now()};
  t2savePrefs(pr, f, c.attend ? 'Sent. EBOD sees your choices when they form teams and rooms.' : 'Sent. EBOD knows you cannot make it.');
};
function t2savePrefs(pr, f, msg) {
  var btn = f.querySelector('button.btn'); if (btn) btn.disabled = true;
  return call('saveProfile', {prefs: JSON.stringify(pr)}).then(function (r) {
    if (btn) btn.disabled = false;
    if (!(r && r.ok)) return toast((r && r.error) || 'Not sent: the backend did not answer. Try again.', true);
    RAW.all.me = RAW.all.me || {}; RAW.all.me.prefs = JSON.stringify(pr);
    T2.prefs = null; T2.clients = null;
    rebuild(); render(); toast(msg);
  });
}

/* ---------- member: client ranking (on the consulting screen) ---------- */
function t2clientCard() {
  var cl = t2clients(), p = M.me.prefs || {}, have = (p.clients || []).length === cl.length;
  if (!T2.clients) T2.clients = cl.map(function (_, i) { return (p.clients || [])[i] || ''; });
  /* Someone who never sent SFBLC choices is not taken to be going by ranking clients. */
  var fresh = !p.at && !(p.flc || []).length;
  return '<form class="card form t2clients" data-act="t2clientSave"><header><h3>Your client ranking</h3>' + (have ? '<span class="badge ok">Sent</span>' : '<span class="badge gold">Not sent yet</span>') + '</header>' +
    '<p class="meta">Rank all ' + cl.length + ' clients, from the one you most want to work with to the one you least do. EBOD forms one team per client from these rankings, so there is no team to send in. Open to everyone, whatever your track.</p>' +
    '<div class="t2cgrid">' + cl.map(function (_, i) {
      return '<label class="fld"><span>' + ordinalWord(i + 1) + ' choice</span>' + t2sel('name="c' + i + '"', [['', '—']].concat(cl), T2.clients[i]) + '</label>';
    }).join('') + '</div>' +
    (fresh ? '<label class="tick"><input type="checkbox" name="going"> I am also going to ' + esc(sfInfo().name) + '</label>' : '') +
    '<div class="sendrow"><button class="btn">Send my client ranking</button></div></form>';
}
SUBMIT_EXT.t2clientSave = function (f) {
  t2keep();
  var cl = t2clients(), list = T2.clients.slice();
  if (list.some(function (v) { return !v; })) return toast('Rank all ' + cl.length + ' clients, 1st to ' + ordinalWord(cl.length) + '.', true);
  if (list.some(function (v, i) { return list.indexOf(v) !== i; })) return toast('Each client can only be ranked once.', true);
  var b = M.me.prefs || {};
  var pr = {flc: b.flc || [], clients: list, mate: b.mate || '', attend: f.going ? f.going.checked : b.attend !== false, group: b.group || '', roomies: b.roomies || [], rnote: b.rnote || '', at: Date.now()};
  pr.hotel = pr.attend;
  t2savePrefs(pr, f, 'Sent. EBOD uses your ranking when they form the client teams.');
};

/* ---------- member: form your own team ---------- */
function t2formTeam() {
  var d = T2.draft, h = '';
  if (T2.reqs === null) { t2loadReqs(); }
  var mine = (T2.reqs || []).filter(function (q) { return q.mine; }), listed = (T2.reqs || []).filter(function (q) { return !q.mine; });
  if (t2selfTeams()) {
    var cap = T2_CAP[d.kind] - 1;
    var targets = d.kind === 'flc' ? M.events.map(function (e) { return [e, e]; }) : [['', 'No particular track']].concat((M.cfg.tracks || []).filter(function (t) { return t && t.label; }).map(function (t) { return [t.label, t.label]; }));
    if (!targets.some(function (t) { return t[0] === d.tgt; })) d.tgt = targets[0] ? targets[0][0] : '';
    h += '<form class="card form" data-act="t2rqSend"><header><h3>Form your own team</h3></header>' +
      '<p class="meta">Already know who you want to compete with? Pick what the team is for, name it and list your teammates, then send it to EBOD. It becomes a team once EBOD has checked it for people already on a team, the size limits and names they cannot find. Consulting teams are not sent in: rank the clients you want on Client teams instead.</p>' +
      '<div class="t2row3"><label class="fld"><span>Team for</span>' + t2sel('data-t2c="rqKind"', [['flc', 'SFBLC case competition'], ['other', 'A track (e.g. Polaris)']], d.kind) + '</label>' +
      '<label class="fld"><span>' + (d.kind === 'flc' ? 'Event' : 'Track') + '</span>' + t2sel('name="tgt"', targets, d.tgt) + '</label>' +
      '<label class="fld"><span>Team name (optional)</span><input name="nm" maxlength="60" value="' + esc(d.nm) + '" placeholder="' + (d.kind === 'flc' ? 'e.g. Finance Fours' : 'Your team’s name') + '"></label></div>' +
      '<div class="fld"><span>Teammates (you are included, up to ' + cap + ' more)</span><div class="chips t2mates">' + d.mates.map(function (m, i) {
        return '<span class="t2m">' + esc(m) + (t2person(m) ? '' : ' <small>not on the roster</small>') + '<button type="button" data-act="t2mateRm" data-i="' + i + '" aria-label="Remove ' + esc(m) + '">' + icon('close') + '</button></span>';
      }).join('') + '</div>' +
      (d.mates.length < cap ? '<input data-t2c="mateAdd" maxlength="60" list="t2names" placeholder="Add a teammate: start typing a name" autocomplete="off" aria-label="Add a teammate">' : '<small class="cc">That is the most this kind of team takes.</small>') + '</div>' +
      '<label class="fld"><span>Note for EBOD (optional)</span><input name="note" maxlength="200" value="' + esc(d.note) + '" placeholder="Anything they should know"></label>' +
      '<div class="sendrow"><button class="btn">' + icon('send') + 'Send to EBOD for review</button></div>' + t2namesList() + '</form>';
  } else h += '<section class="card">' + empty('EBOD forms the teams this season', 'Sending in your own team is switched off. Rank your events under Your choices.') + '</section>';
  var row = function (q, own) {
    return '<li><div class="mh"><p class="mt">' + esc(q.name || t2what(q)) + '</p>' + t2status(q) + '</div>' +
      '<p class="meta">' + esc(t2what(q)) + (own ? '' : ' · sent by ' + esc(q.byName || '')) + (q.at ? ' · ' + esc(ago(q.at)) : '') + '</p>' +
      '<p class="mb sm">' + esc((q.members || []).join(', ')) + '</p>' + (q.review ? '<p class="meta"><span><b>EBOD:</b> ' + esc(q.review) + '</span></p>' : '') +
      (own && q.status !== 'approved' ? '<div class="rowacts"><button class="qbtn" data-act="t2rqWithdraw" data-id="' + esc(q.id) + '">' + icon('close') + '<span>Withdraw</span></button></div>' : '') + '</li>';
  };
  if (T2.reqs === null) h += '<section class="card"><p class="meta">Reading your requests…</p></section>';
  if (mine.length) h += '<section class="card"><header><h3>What you sent</h3><span class="count">' + mine.length + '</span></header><ul class="inbox">' + mine.map(function (q) { return row(q, true); }).join('') + '</ul></section>';
  if (listed.length) h += '<section class="card"><header><h3>Teams that list you</h3><span class="count">' + listed.length + '</span></header><ul class="inbox">' + listed.map(function (q) { return row(q, false); }).join('') + '</ul></section>';
  return h;
}
function t2addMate(el) {
  var v = clean(el.value, 60).trim(); if (!v) return;
  var p = t2person(v); if (p) v = p.name;
  t2keep();
  if (flat(v) === M.me.key) { el.value = ''; return toast('You are already on it.'); }
  if (!T2.draft.mates.some(function (m) { return flat(m) === flat(v); }) && T2.draft.mates.length < T2_CAP[T2.draft.kind] - 1) T2.draft.mates.push(v);
  render();
  var i = document.querySelector('[data-t2c="mateAdd"]'); if (i) i.focus();
}
SUBMIT_EXT.t2rqSend = function (f) {
  t2keep();
  var d = T2.draft, extra = f.querySelector('[data-t2c="mateAdd"]');
  if (extra && extra.value.trim()) t2addMate(extra);
  if (d.kind !== 'other' && !d.tgt) return toast('Pick the event.', true);
  var req = {kind: d.kind, target: d.tgt, name: clean(d.nm, 60).trim(), members: d.mates.slice(), note: clean(d.note, 200), me: M.me.name};
  var unknown = d.mates.filter(function (m) { return !t2person(m); });
  var btn = f.querySelector('button.btn'); btn.disabled = true;
  call('submitTeamRequest', req).then(function (r) {
    btn.disabled = false;
    if (!(r && r.ok)) return toast((r && r.error) || 'Not sent: the backend did not answer.', true);
    T2.draft = {kind: d.kind, tgt: '', nm: '', note: '', mates: []};
    toast('Sent. EBOD will review it' + (unknown.length ? '; they may ask about ' + unknown.join(', ') + ', who are not on the roster under those names' : '') + '.');
    t2loadReqs();
  });
};
ACT_EXT.t2mateRm = function (el, d) { t2keep(); T2.draft.mates.splice(+d.i, 1); render(); };
ACT_EXT.t2rqWithdraw = function (el, d) {
  el.disabled = true;
  call('withdrawTeamRequest', {id: d.id}).then(function (r) {
    if (!(r && r.ok)) { el.disabled = false; return toast((r && r.error) || 'Not withdrawn.', true); }
    toast('Withdrawn.'); t2loadReqs();
  });
};

/* ---------- officer: everyone's choices ---------- */
function t2prefsOverview() {
  var ppl = M.people.filter(function (p) { return t2hasPrefs(p.prefs) && ((p.prefs.flc || []).length || p.prefs.attend === false || p.prefs.group); });
  var cant = ppl.filter(function (p) { return p.prefs.attend === false; });
  var open = ppl.filter(function (p) { return p.prefs.attend !== false && (p.prefs.flc || []).length && !p.events.length; });
  var mates = ppl.filter(function (p) { return p.prefs.mate; });
  var h = '<section class="kpis">' + kpi('Sent their choices', ppl.length, 'Ranked events or said they cannot go', '#teams/prefs') +
    kpi('Ranked, no team yet', open.length, open.length ? '<b>To place</b>' : 'Everyone who ranked is placed', '#teams/prefs', open.length ? 'warn' : 'good') +
    kpi('Cannot go', cant.length, 'Said they cannot make it', '#teams/prefs') +
    kpi('Asked for a teammate', mates.length, 'Kept together where it fits', '#teams/prefs') + '</section>';
  var list = T2.pf === 'open' ? open : T2.pf === 'cant' ? cant : ppl;
  h += '<section class="toolbar"><div class="seg" role="group" aria-label="Show">' + [['all', 'Everyone'], ['open', 'No team yet'], ['cant', 'Cannot go']].map(function (o) {
    return '<button class="' + (T2.pf === o[0] ? 'on' : '') + '" data-act="t2pf" data-v="' + o[0] + '">' + o[1] + '</button>';
  }).join('') + '</div><span class="grow"></span>' +
    '<button class="btn sm ghost" data-act="autofill"' + (M.people.some(function (p) { return p.going && !p.events.length; }) ? '' : ' disabled') + '>Place by first choice</button>' +
    '<button class="btn sm ghost" data-act="t2csv">' + icon('upload') + 'Teams and rooms CSV</button></section>';
  h += '<section class="card"><header><h3>SFBLC event choices</h3><span class="count">' + list.length + '</span></header>';
  if (!list.length) h += empty(ppl.length ? 'No one here' : 'No choices sent yet', ppl.length ? 'Try another filter.' : 'Members rank their events under Teams → Your choices.');
  else h += '<ul class="t2rows">' + list.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (p) {
    var pr = p.prefs, on = p.teams.filter(function (t) { return t.kind === 'flc'; })[0];
    var bits = [pr.mate ? 'Teammate: ' + pr.mate : '', pr.attend === false ? '' : (T2_GROUP[pr.group] || 'No rooming group'), (pr.roomies || []).length ? 'Rooms with ' + pr.roomies.join(', ') : ''].filter(Boolean);
    return '<li><button class="who" data-act="profile" data-key="' + esc(p.key) + '">' + avatar(p) + '<span><span class="pn">' + esc(p.name) + '</span><span class="pe">' + esc([t2yr(p), p.track].filter(Boolean).join(' · ')) + '</span></span></button>' +
      '<div class="t2rk">' + (pr.attend === false ? '<span class="badge bad">Cannot go</span>' : (pr.flc || []).length ? '<span class="pe">' + rankLine(pr.flc) + '</span>' : '<span class="meta">Going, no events ranked</span>') +
      (bits.length ? '<p class="meta">' + esc(bits.join(' · ')) + '</p>' : '') + '</div>' +
      '<span class="t2on' + (on ? ' yes' : pr.attend === false ? '' : ' no') + '">' + esc(on ? teamName(on) : pr.attend === false ? '—' : 'No team') + '</span></li>';
  }).join('') + '</ul>';
  return h + '</section>';
}
ACT_EXT.t2pf = function (el, d) { T2.pf = d.v; render(); };
/* Everyone going, on an SFBLC team or in a room, with what they asked for. */
ACT_EXT.t2csv = function () {
  var keys = {}, rows = [['Name', 'Year', 'Going', 'SFBLC event', 'SFBLC team', 'Rooming group', 'Room', 'Room #', 'Roommates asked for', 'Teammate asked for']];
  M.people.forEach(function (p) { if (t2hasPrefs(p.prefs) || p.events.length || p.room) keys[p.key] = p; });
  Object.keys(keys).map(function (k) { return keys[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (p) {
    var pr = p.prefs || {}, t = p.teams.filter(function (x) { return x.kind === 'flc'; })[0], r = p.room;
    rows.push([p.name, t2yr(p), pr.attend === false ? 'no' : p.going ? 'yes' : '', t ? t.event : '', t ? teamName(t) : '', T2_GROUP[(r && r.group) || pr.group] || '',
               r ? r.name || r.label || '' : '', r ? r.no || '' : '', (pr.roomies || []).join('; '), pr.mate || '']);
  });
  t2csv(rows, 'sfblc-teams-and-rooms.csv');
};

/* ---------- officer: hotel rooms ---------- */
function t2needs() { return M.people.filter(function (p) { return p.going; }); }
function t2roomRow(r, cap, waiting) {
  var mem = (r.members || []).filter(Boolean), n = mem.length;
  var others = M.people.filter(function (p) { return p.going && p.room && p.room.id !== r.id; });
  return '<section class="card t2room' + (n > cap ? ' over' : '') + '"><header><h3><button class="link" data-act="t2rmEdit" data-id="' + esc(r.id) + '">' + esc(r.name || r.label || 'Room') + '</button></h3>' +
    '<span class="cnt' + (n > cap ? ' bad' : n === cap ? ' full' : '') + '">' + n + '/' + cap + '</span></header>' +
    '<p class="meta">' + esc([T2_GROUP[r.group] || 'No group set', r.no ? 'Room ' + r.no : 'No room number yet', r.type || ''].filter(Boolean).join(' · ')) + (r.local ? ' · <span class="badge">Not on the master sheet</span>' : '') + '</p>' +
    (n ? '<ul class="tm">' + mem.map(function (m) {
      var p = t2person(m), pr = (p && p.prefs) || {}, off = pr.group && r.group && pr.group !== r.group;
      return '<li><span class="mn">' + esc(m) + (off ? '<small class="off">asked for ' + esc(T2_GROUP[pr.group]) + '</small>' : '') + (pr.rnote ? '<small title="' + esc(pr.rnote) + '">Note: ' + esc(pr.rnote) + '</small>' : '') + (p ? '' : '<small class="off">not on the roster</small>') + '</span>' +
        '<button class="ghost icon t2x" data-act="t2rmOut" data-id="' + esc(r.id) + '" data-name="' + esc(m) + '" aria-label="Take ' + esc(m) + ' out of this room">' + icon('close') + '</button></li>';
    }).join('') + '</ul>' : empty('Empty', '')) +
    (n < cap ? '<select class="mini t2add" data-t2c="rmAdd" data-id="' + esc(r.id) + '" aria-label="Add someone to ' + esc(r.name || 'this room') + '"><option value="">+ Add someone</option>' +
      (waiting.length ? '<optgroup label="Not in a room yet">' + waiting.map(function (p) {
        return '<option value="' + esc(p.key) + '">' + esc(p.name) + ' · ' + esc(T2_GROUP[p.prefs.group] || 'no group') + '</option>';
      }).join('') + '</optgroup>' : '') +
      (others.length ? '<optgroup label="In another room (moves them)">' + others.map(function (p) { return '<option value="' + esc(p.key) + '">' + esc(p.name) + ' · ' + esc(p.room.name || '') + '</option>'; }).join('') + '</optgroup>' : '') + '</select>' : '') +
    '</section>';
}
function t2roomsView() {
  var cap = t2roomCap(), needs = t2needs(), rooms = t2rooms();
  var waiting = needs.filter(function (p) { return !p.room; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  var count = {w: 0, m: 0, x: 0, '': 0};
  needs.forEach(function (p) { count[T2_GROUP[p.prefs.group] ? p.prefs.group : '']++; });
  var beds = rooms.reduce(function (a, r) { return a + (r.members || []).length; }, 0);
  var h = '<section class="kpis">' + kpi('Going', needs.length, 'Everyone going gets a bed', '#teams/rooms') +
    kpi('In a room', (needs.length - waiting.length) + ' of ' + needs.length, waiting.length ? '<b>' + waiting.length + ' still to place</b>' : 'Everyone has a bed', '#teams/rooms', waiting.length ? 'warn' : 'good', needs.length ? (needs.length - waiting.length) / needs.length * 100 : 0) +
    kpi('Rooms', rooms.length, plural(beds, 'bed') + ' taken', '#teams/rooms') +
    kpi('Per room', cap, cap > 4 ? 'The master sheet holds 4' : 'Up to ' + cap + ' a room', '#teams/rooms') + '</section>';
  h += '<section class="toolbar"><label class="cap">People per room <input type="number" min="1" max="8" value="' + cap + '" data-t2c="roomCap" aria-label="People per room"></label><span class="grow"></span>' +
    '<button class="btn sm" data-act="t2rmForm"' + (needs.length ? '' : ' disabled') + '>Form rooms from requests</button>' +
    '<button class="btn sm ghost" data-act="t2rmAdd">' + icon('plus') + 'Empty room</button>' +
    '<button class="btn sm ghost" data-act="t2csv">' + icon('upload') + 'CSV</button></section>';
  if (needs.length) h += '<p class="meta t2groups"><span>' + ['w', 'm', 'x'].filter(function (g) { return count[g]; }).map(function (g) {
    return esc(T2_GROUP[g]) + ': ' + count[g] + ' → at least ' + plural(Math.ceil(count[g] / cap), 'room');
  }).join(' · ') + (count[''] ? ' · <b class="t2warn">' + count[''] + ' did not choose a group</b>' : '') + '</span></p>';
  h += '<p class="note">Forming rooms keeps each room to one rooming group, keeps requested roommates together where they fit, and packs rooms so as few as possible are booked. Rooms sync with the SFBLC master sheet’s Rooming Assignments both ways; the sheet has room for 4 people a room.</p>';
  if (waiting.length) h += '<section class="card"><header><h3>Not in a room yet</h3><span class="count">' + waiting.length + '</span></header><div class="chips">' + waiting.map(function (p) {
    return '<button class="chip tone-ink" data-act="profile" data-key="' + esc(p.key) + '">' + esc(p.name) + ' <em>' + esc(T2_GROUP[p.prefs.group] || 'no group') + '</em></button>';
  }).join('') + '</div></section>';
  if (!rooms.length) h += '<section class="card">' + empty('No rooms yet', needs.length ? 'Form them from what members asked for, or add an empty room and fill it by hand.' : 'Rooms are formed once members say they are going.') + '</section>';
  else h += '<div class="t2grid">' + rooms.map(function (r) { return t2roomRow(r, cap, waiting); }).join('') + '</div>';
  var notes = needs.filter(function (p) { return p.prefs.rnote; });
  if (notes.length) h += '<details class="card"><summary><h3>Rooming notes</h3><span class="count">' + notes.length + '</span></summary><p class="meta">Only officers see these.</p><ul class="inbox tight">' +
    notes.map(function (p) { return '<li><span class="tt">' + esc(p.name) + '</span><span class="meta">' + esc(p.prefs.rnote) + '</span></li>'; }).join('') + '</ul></details>';
  return h;
}
function t2cloneRooms() { return JSON.parse(JSON.stringify(t2rooms())); }
function t2saveRooms(list, msg) { return saveCfg({rooms: list}, msg); }
/* One rooming group per room, requested roommates joined into clusters
   (either side asking is enough), biggest cluster first into the first room
   it fits. A new room that keeps most of an old room's people keeps that
   room's id, number and sheet fields, so the master sheet keeps its row. */
function t2formRooms() {
  var cap = t2roomCap(), needs = t2needs(), out = [], unset = [];
  ['w', 'm', 'x'].forEach(function (g) {
    var list = needs.filter(function (p) { return p.prefs.group === g; });
    if (!list.length) return;
    var root = {};
    list.forEach(function (p) { root[p.key] = p.key; });
    var find = function (a) { while (root[a] !== a) a = root[a] = root[root[a]]; return a; };
    list.forEach(function (p) { (p.prefs.roomies || []).forEach(function (r) { var b = flat(r); if (root[b] !== undefined) root[find(p.key)] = find(b); }); });
    var by = {};
    list.forEach(function (p) { var r = find(p.key); (by[r] = by[r] || []).push(p.name); });
    var clusters = [];
    Object.keys(by).forEach(function (k) { var c = by[k].sort(); for (var i = 0; i < c.length; i += cap) clusters.push(c.slice(i, i + cap)); });
    clusters.sort(function (a, b) { return b.length - a.length; });
    var mine = [];
    clusters.forEach(function (c) {
      var into = mine.filter(function (r) { return r.members.length + c.length <= cap; })[0];
      if (!into) { into = {id: uid('r'), name: '', group: g, no: '', members: []}; mine.push(into); }
      into.members = into.members.concat(c);
    });
    out = out.concat(mine);
  });
  needs.forEach(function (p) { if (!T2_GROUP[p.prefs.group]) unset.push(p.name); });
  var old = t2rooms(), used = {};
  out.forEach(function (r) {
    var best = null, top = 0, A = r.members.map(flat);
    old.forEach(function (o) {
      if (used[o.id] || (o.group && o.group !== r.group)) return;
      var B = (o.members || []).map(flat), hit = A.filter(function (x) { return B.indexOf(x) > -1; }).length, sc = hit / Math.max(A.length, B.length, 1);
      if (sc > top) { top = sc; best = o; }
    });
    if (best && top >= 0.5) {
      used[best.id] = 1;
      var keep = JSON.parse(JSON.stringify(best));
      keep.members = r.members; keep.group = r.group;
      Object.keys(r).forEach(function (k) { delete r[k]; });
      Object.assign(r, keep);
    }
  });
  var names = {};
  out.forEach(function (r) { if (r.name) names[r.name.toLowerCase()] = 1; });
  var n = 0;
  out.forEach(function (r) { if (r.name) return; do { n++; } while (names[('room ' + n)]); r.name = 'Room ' + n; names['room ' + n] = 1; });
  return {rooms: out, unset: unset};
}
ACT_EXT.t2rmForm = function () {
  var cur = t2rooms().length;
  var go = function () {
    var r = t2formRooms();
    t2saveRooms(r.rooms, 'Formed ' + plural(r.rooms.length, 'room') + '.' + (r.unset.length ? ' ' + plural(r.unset.length, 'person', 'people') + ' chose no rooming group and were not placed: ' + r.unset.slice(0, 6).join(', ') + (r.unset.length > 6 ? '…' : '') + '.' : ''));
  };
  if (!cur) return go();
  confirmSheet('Re-form the rooms?', 'The ' + plural(cur, 'room') + ' there now are replaced. A room that keeps most of its people keeps its number and its row on the master sheet.', 'Re-form rooms', go);
};
ACT_EXT.t2rmAdd = function () {
  var list = t2cloneRooms(), n = list.length + 1;
  while (list.some(function (r) { return String(r.name || '').toLowerCase() === 'room ' + n; })) n++;
  list.push({id: uid('r'), name: 'Room ' + n, group: 'x', no: '', members: []});
  t2saveRooms(list, 'Room added.');
};
ACT_EXT.t2rmOut = function (el, d) {
  var list = t2cloneRooms(), r = list.filter(function (x) { return x.id === d.id; })[0]; if (!r) return;
  r.members = (r.members || []).filter(function (m) { return flat(m) !== flat(d.name); });
  t2saveRooms(list, d.name + ' is out of ' + (r.name || 'the room') + '.');
};
function t2roomSheet(id) {
  var r = t2rooms().filter(function (x) { return x.id === id; })[0]; if (!r) return '';
  return '<form class="form" data-act="t2rmSave" data-id="' + esc(id) + '"><header class="sh"><h3>' + esc(r.name || 'Room') + '</h3></header>' +
    '<label class="fld"><span>Name</span><input name="nm" maxlength="40" required value="' + esc(r.name || '') + '"></label>' +
    '<label class="fld"><span>Hotel room number</span><input name="no" maxlength="12" value="' + esc(r.no || '') + '" placeholder="Given at check-in"></label>' +
    '<label class="fld"><span>Rooming group</span>' + t2sel('name="group"', [['w', T2_GROUP.w], ['m', T2_GROUP.m], ['x', T2_GROUP.x]], r.group || 'x') + '</label>' +
    (r.type ? '<p class="meta">Room type on the master sheet: ' + esc(r.type) + '</p>' : '') +
    '<div class="sheetacts"><button class="btn">Save</button><button type="button" class="btn ghost danger" data-act="t2rmDel" data-id="' + esc(id) + '">Delete room</button></div></form>';
}
ACT_EXT.t2rmEdit = function (el, d) { openSheet(t2roomSheet(d.id)); };
SUBMIT_EXT.t2rmSave = function (f) {
  var id = f.getAttribute('data-id'), list = t2cloneRooms(), r = list.filter(function (x) { return x.id === id; })[0]; if (!r) return;
  var nm = clean(f.nm.value, 40).trim(), no = clean(f.no.value, 12).trim(), g = f.group.value, was = r.no || '';
  if (nm) r.name = nm;
  if (no !== was) {
    r.no = no;
    /* The master sheet names a room by its label ("Room 405"), so the number goes there too. */
    if (r.label) r.label = was && r.label.indexOf(was) > -1 ? (no ? r.label.replace(was, no) : r.label) : (no ? 'Room ' + no : r.label);
  }
  if (g !== r.group) {
    r.group = g;
    if (r.gender) r.gender = {w: 'Female', m: 'Male'}[g] || (/wom|fem|girl|\bmen\b|^male|boy/i.test(r.gender) ? '' : r.gender);
  }
  closeSheet();
  t2saveRooms(list, 'Saved.');
};
ACT_EXT.t2rmDel = function (el, d) {
  var r = t2rooms().filter(function (x) { return x.id === d.id; })[0]; if (!r) return;
  confirmSheet('Delete ' + (r.name || 'this room') + '?', 'Whoever is in it goes back to the not-in-a-room list.', 'Delete room', function () {
    t2saveRooms(t2cloneRooms().filter(function (x) { return x.id !== d.id; }), 'Room deleted.');
  });
};

/* ---------- officer: team requests ---------- */
function t2reqAdmin() {
  if (T2.reqs === null) t2loadReqs();
  var list = (T2.reqs || []).slice().sort(function (a, b) { var o = {pending: 0, returned: 1, approved: 2}; return (o[a.status] - o[b.status]) || String(b.at).localeCompare(String(a.at)); });
  var waiting = t2waiting().length;
  var h = '<section class="card t2self"><ul class="autos"><li><label class="switch"><input type="checkbox" data-t2c="selfTeams"' + (t2selfTeams() ? ' checked' : '') + '><i></i></label><div><p class="tt">Members form their own teams</p>' +
    '<p class="meta">They send a team in for review from Teams → Form a team. Approving turns a request into a team: consulting members join that client’s team; SFBLC and track requests become new teams.</p></div></li></ul></section>';
  h += '<section class="toolbar"><p class="meta">' + (T2.reqs === null ? 'Reading requests…' : list.length ? plural(waiting, 'request') + ' waiting for review' : 'Nothing sent in yet') + '</p><span class="grow"></span>' +
    '<button class="btn sm ghost" data-act="t2rqRefresh">Check for new requests</button></section>';
  if (T2.reqErr) h += '<div class="note warn">' + esc(T2.reqErr) + '</div>';
  if (!list.length) return h + (T2.reqs === null ? '' : '<section class="card">' + empty('No team requests', t2selfTeams() ? 'Requests members send show up here with what to check first.' : 'Members cannot send teams in while this is off.') + '</section>');
  h += '<div class="t2reqs">' + list.map(function (q) {
    var checks = q.status === 'pending' ? t2checks(q) : [], tm = q.teamId ? findTeam(M.teams, q.teamId) : null, open = q.status !== 'approved';
    var mem = q.members || [], cap = T2_CAP[q.kind] || 14;
    var tgts = q.kind === 'flc' ? M.events.slice() : q.kind === 'consulting' ? t2clients() : null;
    if (tgts && q.target && tgts.indexOf(q.target) < 0) tgts.push(q.target);
    var addable = M.people.filter(function (p) { return !mem.some(function (m) { return flat(m) === p.key; }); });
    return '<section class="card t2req st-' + esc(q.status) + '"><header>' +
      (q.kind === 'consulting' ? '<h3>' + esc(q.name || t2what(q)) + '</h3>' : '<input class="mini t2rqname" data-t2c="rqName" data-id="' + esc(q.id) + '" maxlength="60" value="' + esc(q.name || '') + '" placeholder="' + esc(t2what(q)) + '" aria-label="Team name">') +
      t2status(q) + '</header>' +
      '<p class="meta t2by">' + (open && tgts ? t2sel('data-t2c="rqTarget" data-id="' + esc(q.id) + '" aria-label="' + (q.kind === 'flc' ? 'Event' : 'Client') + '"', tgts, q.target) + ' ' : esc(t2what(q)) + ' · ') +
      'sent by ' + esc(q.byName || '') + (q.at ? ' · ' + esc(ago(q.at)) : '') + '</p>' +
      '<div class="chips t2mates">' + mem.map(function (m) {
        return '<span class="t2m">' + (t2person(m) ? '<button type="button" class="link" data-act="profile" data-key="' + esc(flat(m)) + '">' + esc(m) + '</button>' : esc(m) + ' <small>not on the roster</small>') +
          '<button type="button" data-act="t2rqOut" data-id="' + esc(q.id) + '" data-name="' + esc(m) + '" aria-label="Take ' + esc(m) + ' off">' + icon('close') + '</button></span>';
      }).join('') + '</div>' +
      (mem.length < cap ? '<select class="mini t2add" data-t2c="rqAdd" data-id="' + esc(q.id) + '" aria-label="Add a member"><option value="">+ Add a member</option>' +
        addable.map(function (p) { return '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>'; }).join('') + '</select>' : '') +
      (q.status === 'approved' ? '<p class="meta"><span>' + (tm ? 'This is the team <b>' + esc(teamName(tm)) + '</b>: changes here change it too.' : 'The team this became has since been deleted; only the request changes.') + '</span></p>' : '') +
      (q.note ? '<p class="mb sm">“' + esc(q.note) + '”</p>' : '') +
      (checks.length ? '<ul class="rules t2checks">' + checks.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' : q.status === 'pending' ? '<p class="meta t2ok">' + icon('check') + 'No clashes found.</p>' : '') +
      (q.review ? '<p class="meta"><span><b>EBOD:</b> ' + esc(q.review) + '</span></p>' : '') +
      '<div class="rowacts">' + (q.status === 'pending' ? '<button class="btn sm" data-act="t2rqYes" data-id="' + esc(q.id) + '">' + icon('check') + 'Approve</button><button class="btn sm ghost" data-act="t2rqNo" data-id="' + esc(q.id) + '">Send back</button>' : '') +
      (q.status === 'approved' && tm ? '<button class="qbtn" data-act="t2rqTeamDel" data-id="' + esc(q.id) + '">' + icon('close') + '<span>Delete team</span></button>' : '') +
      '<button class="qbtn" data-act="t2rqDel" data-id="' + esc(q.id) + '">' + icon('close') + '<span>Delete request</span></button></div></section>';
  }).join('') + '</div>';
  return h;
}
ACT_EXT.t2rqRefresh = function () { T2.reqs = T2.reqs || []; t2loadReqs().then(function () { toast('Up to date.'); }); };
ACT_EXT.t2rqOut = function (el, d) { var q = t2req(d.id); if (q) t2editReq(q, {members: (q.members || []).filter(function (m) { return m !== d.name; })}); };
ACT_EXT.t2rqYes = function (el, d) {
  var q = t2req(d.id); if (!q) return;
  var checks = t2checks(q);
  var go = function () {
    var tl = cloneTeams(), r = t2approve(q, tl);
    if (r.error) return toast(r.error, true);
    saveCfg({teams: tl}).then(function (ok) {
      if (!ok) return;
      return call('reviewTeamRequest', {id: q.id, status: 'approved', note: '', teamId: r.team.id}).then(function (x) {
        if (!(x && x.ok)) return toast('The team was made, but the request could not be marked approved: ' + ((x && x.error) || 'no answer') + '.', true);
        q.status = 'approved'; q.review = ''; q.teamId = r.team.id;
        t2render(); toast('Approved: ' + teamName(r.team) + ' is a team now.');
      });
    });
  };
  if (!checks.length) return go();
  confirmSheet('Approve ' + (q.name || t2what(q)) + '?', checks.join('. ') + '.', 'Approve anyway', go);
};
ACT_EXT.t2rqNo = function (el, d) {
  var q = t2req(d.id); if (!q) return;
  openSheet('<form class="form" data-act="t2rqBack" data-id="' + esc(q.id) + '"><header class="sh"><h3>Send it back</h3></header><p class="mb">' + esc(q.name || t2what(q)) + ', from ' + esc(q.byName || 'a member') + '</p>' +
    '<label class="fld"><span>What to change</span><textarea name="why" rows="3" maxlength="200" placeholder="They see this on their Teams screen and can send it again"></textarea></label>' +
    '<div class="sheetacts"><button class="btn">Send back</button></div></form>');
};
SUBMIT_EXT.t2rqBack = function (f) {
  var q = t2req(f.getAttribute('data-id')); if (!q) return closeSheet();
  var note = clean(f.why.value, 200).trim() || 'Please check with EBOD.';
  closeSheet();
  call('reviewTeamRequest', {id: q.id, status: 'returned', note: note, teamId: ''}).then(function (r) {
    if (!(r && r.ok)) return toast((r && r.error) || 'Not saved.', true);
    q.status = 'returned'; q.review = note; q.teamId = '';
    t2render(); toast('Sent back to ' + (q.byName || 'them') + '.');
  });
};
ACT_EXT.t2rqDel = function (el, d) {
  var q = t2req(d.id); if (!q) return;
  confirmSheet('Delete this request?', 'It disappears for ' + (q.byName || 'the member') + ' too.' + (q.teamId && findTeam(M.teams, q.teamId) ? ' The team it became stays; delete that from the request or its team card.' : ''), 'Delete request', function () {
    call('deleteTeamRequest', {id: q.id}).then(function (r) {
      if (!(r && r.ok)) return toast((r && r.error) || 'Not deleted.', true);
      T2.reqs = T2.reqs.filter(function (x) { return x.id !== q.id; });
      t2render(); toast('Request deleted.');
    });
  });
};
ACT_EXT.t2rqTeamDel = function (el, d) {
  var q = t2req(d.id), tm = q && findTeam(M.teams, q.teamId); if (!tm) return;
  confirmSheet('Delete ' + teamName(tm) + '?', 'Its members go back to having no team of this kind, and this request goes with it. Homework already handed in is kept.', 'Delete team', function () { t2dropTeam(tm.id); });
};

/* ---------- consulting: the client teams ----------
   Replaces the read-only screen in pbl.js with the same cards, plus the
   editor officers used on the classic Teams tab. */
VIEWS.consulting = function (sub) {
  if (!M.officer) return t2clientCard() + t2consultCards();
  var cts = M.teams.filter(function (t) { return t2kind(t) === 'consulting'; });
  var ranked = M.people.filter(function (p) { return (p.prefs.clients || []).length; }).length;
  var tabs = [['teams', 'Client teams'], ['edit', 'Edit teams'], ['interest', 'Client interest', ranked || '']];
  sub = tabs.some(function (x) { return x[0] === sub; }) ? sub : (cts.length ? 'teams' : 'edit');
  var h = subtabs(sub, tabs, 'consulting');
  if (sub === 'edit') return h + t2consultEdit();
  if (sub === 'interest') return h + t2interest();
  return h + t2consultCards();
};
function t2consultCards() {
  var teams = M.teams.filter(function (t) { return t2kind(t) === 'consulting'; }), st = M.cfg.consultStage || {};
  var mine = teams.filter(function (t) { return t2on(t, M.me.name); });
  var h = '<p class="lede">Student analysts on real Bay Area organizations: each client team has two PMs and splits into initiatives, and presents at the Consulting Division Showcase and the State Consulting Competition.</p>';
  if (!teams.length) return h + empty('No client teams yet', M.officer ? 'Set up one team per client and place members by their client rankings.' : 'EBOD forms one team per client from everyone’s rankings.', M.officer ? '<a class="btn" href="#consulting/edit">Set up client teams</a>' : '') + t2otherCards();
  h += '<div class="bento">' + mine.concat(teams.filter(function (t) { return mine.indexOf(t) < 0; })).map(function (t) {
    var stage = st[t.id] || 'scope', si = STAGES.map(function (x) { return x[0]; }).indexOf(stage);
    var mem = (t.members || []).filter(Boolean), pms = (t.pms || []).filter(Boolean), byInit = {}, none = [];
    (t.initiatives || []).forEach(function (i) { byInit[i] = []; });
    mem.forEach(function (m) { var a = t2assign(t, m); if (a && byInit[a]) byInit[a].push(m); else if (!pms.some(function (x) { return flat(x) === flat(m); })) none.push(m); });
    var isMine = mine.indexOf(t) > -1, myInit = isMine ? t2assign(t, M.me.name) : '';
    return '<section class="card cons' + (isMine ? ' mine' : '') + '"><header><h3>' + esc(t.client || teamName(t)) + (isMine ? ' <span class="badge">Your team</span>' : '') + '</h3><span class="count">' + mem.length + '</span></header>' +
      '<ol class="steps">' + STAGES.slice(0, 3).map(function (x, i) { return '<li class="' + (i < si || stage === 'done' ? 'past' : i === si ? 'now' : '') + '">' + esc(x[1]) + '</li>'; }).join('') + '</ol>' +
      (M.officer ? '<label class="fld inline"><span>Step</span><select class="mini" data-act="stage" data-id="' + esc(t.id) + '">' + STAGES.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === stage ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select></label>' : '') +
      '<dl class="facts pf"><dt>PMs</dt><dd>' + esc(pms.join(' & ') || 'To be named') + '</dd>' + (myInit ? '<dt>Your initiative</dt><dd><b>' + esc(myInit) + '</b></dd>' : '') + '</dl>' +
      Object.keys(byInit).map(function (i) { return '<div class="fg"><p class="fl">' + esc(i) + '</p><p class="mb sm">' + esc(byInit[i].join(', ') || 'No one yet') + '</p></div>'; }).join('') +
      (none.length ? '<div class="fg"><p class="fl">' + (Object.keys(byInit).length ? 'No initiative yet' : 'Consultants') + '</p><p class="mb sm">' + esc(none.join(', ')) + '</p></div>' : '') +
      (M.officer ? '<div class="rowacts"><button class="qbtn" data-act="msgTeam" data-id="' + esc(t.id) + '">' + icon('send') + '<span>Message team</span></button><a class="qbtn" href="#consulting/edit">' + icon('edit') + '<span>PMs and initiatives</span></a></div>' : '') + '</section>';
  }).join('') + '</div>';
  return h + t2otherCards();
}
/* Teams of no client or event: track teams such as Polaris, mostly from approved requests. */
function t2otherCards() {
  var ot = M.teams.filter(function (t) { return t2kind(t) === 'other'; });
  if (!ot.length) return '';
  return '<section class="card"><header><h3>Track teams</h3><span class="count">' + ot.length + '</span></header><ul class="inbox">' + ot.map(function (t) {
    var tr = (M.cfg.tracks || []).filter(function (x) { return x && x.id === t.track; })[0];
    return '<li><div class="mh"><p class="mt">' + esc(teamName(t)) + (t2on(t, M.me.name) ? ' <span class="badge">Your team</span>' : '') + '</p><span class="ma">' + esc(tr ? tr.label : 'Mixed') + '</span></div><p class="mb sm">' + esc((t.members || []).join(', ') || 'No one yet') + '</p></li>';
  }).join('') + '</ul></section>';
}
function t2interest() {
  var cl = t2clients(), ppl = M.people.filter(function (p) { return (p.prefs.clients || []).length; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  var first = {};
  cl.forEach(function (c) { first[c] = 0; });
  ppl.forEach(function (p) { var c = p.prefs.clients[0]; if (c in first) first[c]++; });
  var h = '<section class="card"><header><h3>First choices</h3><span class="count">' + ppl.length + ' ranked</span></header><ul class="progress">' + cl.map(function (c) {
    var t = M.teams.filter(function (x) { return t2kind(x) === 'consulting' && String(x.client || x.name).toLowerCase() === c.toLowerCase(); })[0];
    return '<li><div class="pl"><span>' + esc(c) + '<small>' + (t ? plural((t.members || []).length, 'member') + ' on the team' : 'No team yet') + '</small></span><span class="num">' + first[c] + '</span></div><div class="bar"><i style="width:' + (ppl.length ? first[c] / ppl.length * 100 : 0) + '%"></i></div></li>';
  }).join('') + '</ul></section>';
  h += '<section class="card"><header><h3>Every ranking</h3><span class="count">' + ppl.length + '</span></header>';
  if (!ppl.length) return h + empty('No rankings yet', 'Members rank the clients on Client teams. Open to everyone, whatever their track.') + '</section>';
  return h + '<ul class="t2rows">' + ppl.map(function (p) {
    var on = p.teams.filter(function (t) { return t2kind(t) === 'consulting'; })[0];
    return '<li><button class="who" data-act="profile" data-key="' + esc(p.key) + '">' + avatar(p) + '<span><span class="pn">' + esc(p.name) + '</span><span class="pe">' + esc([t2yr(p), p.track].filter(Boolean).join(' · ')) + '</span></span></button>' +
      '<div class="t2rk"><span class="pe">' + rankLine(p.prefs.clients) + '</span></div><span class="t2on' + (on ? ' yes' : ' no') + '">' + esc(on ? (on.client || teamName(on)) : 'No team') + '</span></li>';
  }).join('') + '</ul></section>';
}
function t2consultEdit() {
  var cts = M.teams.filter(function (t) { return t2kind(t) === 'consulting'; }), ot = M.teams.filter(function (t) { return t2kind(t) === 'other'; });
  var free = M.people.filter(function (p) { return p.role === 'member' && !p.teams.some(function (t) { return t2kind(t) === 'consulting'; }) && (focusOf(p) === 'c' || (p.prefs.clients || []).length); });
  var have = {}, cl = t2clients();
  cts.forEach(function (t) { have[String(t.client || t.name).toLowerCase()] = 1; });
  var missing = cl.filter(function (c) { return !have[c.toLowerCase()]; });
  var h = '<section class="toolbar"><p class="meta">' + plural(cts.length, 'client team') + ' · about 10–12 consultants each, two PMs, split into initiatives</p><span class="grow"></span>' +
    '<button class="btn sm" data-act="t2ctSetup">' + (missing.length ? 'Set up every client team' : 'Place by client rankings') + '</button>' +
    '<button class="btn sm ghost" data-act="t2ctNew">' + icon('plus') + 'New team</button></section>';
  if (free.length) h += '<div class="note warn"><span><b>' + plural(free.length, 'member') + '</b> on the consulting track or with a client ranking ' + (free.length === 1 ? 'is' : 'are') + ' not on a client team: ' +
    esc(free.slice(0, 12).map(function (p) { return p.name; }).join(', ')) + (free.length > 12 ? '…' : '') + '.</span></div>';
  if (missing.length) h += '<p class="meta">No team yet for ' + esc(missing.join(', ')) + '.</p>';
  if (!cts.length && !ot.length) return h + '<section class="card">' + empty('No client teams yet', '“Set up every client team” makes one per client (' + cl.join(', ') + ') and places members by their client rankings, then the rest of the consulting track across the smallest teams.') + '</section>';
  h += '<div class="t2grid">' + cts.concat(ot).map(t2teamEditor).join('') + '</div>';
  return h;
}
function t2teamEditor(t) {
  var k = t2kind(t), mem = (t.members || []).filter(Boolean), pms = (t.pms || []).slice(), inits = t.initiatives || [];
  while (pms.length < 2) pms.push('');
  var pmOpts = [['', 'Not named']].concat(ebod().map(function (e) { return e.name; }).concat(M.people.map(function (p) { return p.name; }))
    .filter(function (v, i, a) { return a.indexOf(v) === i; }).map(function (n) { return [n, n]; }));
  pms.forEach(function (x) { if (x && !pmOpts.some(function (o) { return o[0] === x; })) pmOpts.push([x, x]); });
  var free = M.people.filter(function (p) { return !t2on(t, p.name) && !p.teams.some(function (x) { return t2kind(x) === k; }); });
  var rank = function (p) { var i = (p.prefs.clients || []).indexOf(t.client); return i < 0 ? 99 : i; };
  if (k === 'consulting') free.sort(function (a, b) { return rank(a) - rank(b) || (b.year - a.year) || a.name.localeCompare(b.name); });
  var busy = M.people.filter(function (p) { return !t2on(t, p.name) && p.teams.some(function (x) { return t2kind(x) === k; }); });
  var size = mem.length, hint = k === 'consulting' && size && (size < 10 || size > T2_CLIENT_CAP) ? 'EBOD aims for about 10–12' : '';
  return '<section class="card t2ct"><header><h3><button class="link" data-act="t2ctRename" data-id="' + esc(t.id) + '">' + esc(teamName(t)) + '</button></h3><span class="count">' + size + '</span></header>' +
    '<p class="meta">' + esc(k === 'consulting' ? 'Client · ' + (t.client || t.name) : 'Track team') + (hint ? ' · ' + hint : '') + '</p>' +
    (k === 'consulting' ? '<div class="t2pms"><label class="fld"><span>PM 1</span>' + t2sel('data-t2c="ctPm" data-id="' + esc(t.id) + '" data-i="0"', pmOpts, pms[0]) + '</label>' +
      '<label class="fld"><span>PM 2</span>' + t2sel('data-t2c="ctPm" data-id="' + esc(t.id) + '" data-i="1"', pmOpts, pms[1]) + '</label></div>' +
      '<label class="fld"><span>Initiatives (comma-separated)</span><input class="mini" data-t2c="ctInit" data-id="' + esc(t.id) + '" maxlength="300" value="' + esc(inits.join(', ')) + '" placeholder="Market research, Brand, Operations"></label>' : '') +
    (size ? '<ul class="tm">' + mem.map(function (m) {
      var p = t2person(m), ri = p ? (p.prefs.clients || []).indexOf(t.client) : -1, isPm = pms.some(function (x) { return flat(x) === flat(m); });
      var sub = [isPm ? 'PM' : '', k === 'consulting' && ri > -1 ? 'choice ' + (ri + 1) : ''].filter(Boolean).join(' · ');
      return '<li><span class="mn">' + esc(m) + (sub ? '<small>' + sub + '</small>' : '') + (p ? '' : '<small class="off">not on the roster</small>') + '</span>' +
        (k === 'consulting' && inits.length ? t2sel('data-t2c="ctAssign" data-id="' + esc(t.id) + '" data-name="' + esc(m) + '" aria-label="Initiative for ' + esc(m) + '"', [['', 'Initiative…']].concat(inits.map(function (x) { return [x, x]; })), t2assign(t, m)) : '') +
        '<button class="ghost icon t2x" data-act="t2ctOut" data-id="' + esc(t.id) + '" data-name="' + esc(m) + '" aria-label="Take ' + esc(m) + ' off ' + esc(teamName(t)) + '">' + icon('close') + '</button></li>';
    }).join('') + '</ul>' : empty('Nobody on it yet', '')) +
    '<select class="mini t2add" data-t2c="ctAdd" data-id="' + esc(t.id) + '" aria-label="Add someone to ' + esc(teamName(t)) + '"><option value="">+ Add someone</option>' +
    (free.length ? '<optgroup label="Not on a ' + (k === 'consulting' ? 'client' : 'track') + ' team">' + free.map(function (p) {
      var i = rank(p);
      return '<option value="' + esc(p.key) + '">' + esc(p.name) + (t2yr(p) ? ' · ' + esc(t2yr(p)) : '') + (k === 'consulting' && i < 99 ? ' · choice ' + (i + 1) : '') + '</option>';
    }).join('') + '</optgroup>' : '') +
    (busy.length ? '<optgroup label="On another team (moves them)">' + busy.map(function (p) {
      var on = p.teams.filter(function (x) { return t2kind(x) === k; })[0];
      return '<option value="' + esc(p.key) + '">' + esc(p.name) + ' · ' + esc(teamName(on)) + '</option>';
    }).join('') + '</optgroup>' : '') + '</select>' +
    '<div class="rowacts"><button class="qbtn" data-act="msgTeam" data-id="' + esc(t.id) + '">' + icon('send') + '<span>Message</span></button>' +
    '<button class="qbtn" data-act="t2ctDel" data-id="' + esc(t.id) + '">' + icon('close') + '<span>Delete team</span></button></div></section>';
}
/* One team per listed client (a client dropped from the list takes its team
   only while nobody is on it), then members not on a client team: anyone who
   ranked clients to their highest choice with room, then the rest of the
   consulting track across the smallest teams. */
ACT_EXT.t2ctSetup = function () {
  var tl = cloneTeams(), cl = t2clients(), listed = {};
  cl.forEach(function (c) { listed[c.toLowerCase()] = 1; });
  var before = tl.length;
  tl = tl.filter(function (t) { return !(t2kind(t) === 'consulting' && !listed[String(t.client || t.name).toLowerCase()] && !(t.members || []).length && !(t.pms || []).filter(Boolean).length); });
  var dropped = before - tl.length, have = {};
  tl.forEach(function (t) { if (t2kind(t) === 'consulting') have[String(t.client || t.name).toLowerCase()] = 1; });
  var made = cl.filter(function (c) { return !have[c.toLowerCase()]; }).map(function (c) {
    return {id: uid('c'), kind: 'consulting', track: 'c', client: c, event: '', name: c, members: [], pms: [], initiatives: [], assign: {}};
  });
  tl = tl.concat(made);
  var cts = tl.filter(function (t) { return t2kind(t) === 'consulting'; });
  var free = M.people.filter(function (p) {
    return p.role === 'member' && (focusOf(p) === 'c' || (p.prefs.clients || []).length) && !cts.some(function (t) { return t2on(t, p.name); });
  }).sort(function (a, b) { return (b.year - a.year) || a.name.localeCompare(b.name); });
  var teamFor = function (c) { c = String(c || '').toLowerCase(); return cts.filter(function (t) { return String(t.client || t.name).toLowerCase() === c; })[0]; };
  var placed = {}, byRank = 0;
  for (var round = 0; round < cts.length; round++) {
    free.forEach(function (p) {
      if (placed[p.key]) return;
      var t = teamFor((p.prefs.clients || [])[round]);
      if (!t || (t.members || []).length >= T2_CLIENT_CAP) return;
      t.members = (t.members || []).concat([p.name]); placed[p.key] = 1; byRank++;
    });
  }
  free.filter(function (p) { return !placed[p.key]; }).forEach(function (p) {
    if (!cts.length) return;
    var best = cts[0];
    cts.forEach(function (t) { if ((t.members || []).length < (best.members || []).length) best = t; });
    best.members = (best.members || []).concat([p.name]);
  });
  if (!made.length && !dropped && !free.length) return toast('Every client has a team, and everyone who ranked clients or is on the consulting track is on one.');
  saveCfg({teams: tl}, [made.length ? 'Set up ' + plural(made.length, 'client team') + '.' : '', dropped ? 'Removed ' + plural(dropped, 'empty team') + ' for clients no longer listed.' : '',
                        free.length ? 'Placed ' + plural(free.length, 'member') + (byRank ? ', ' + byRank + ' by their client rankings' : '') + '.' : ''].filter(Boolean).join(' ') + (made.length ? ' Name two PMs on each.' : ''));
};
ACT_EXT.t2ctNew = function () {
  var cl = t2clients(), tracks = (M.cfg.tracks || []).filter(function (t) { return t && t.label; });
  openSheet('<form class="form" data-act="t2ctNewSave"><header class="sh"><h3>New team</h3></header>' +
    '<label class="fld"><span>Kind</span>' + t2sel('name="kind"', [['consulting', 'Consulting client team'], ['other', 'Track team (no client or event)']], 'consulting') + '</label>' +
    '<label class="fld"><span>Client (consulting)</span>' + t2sel('name="client"', cl, cl[0]) + '</label>' +
    '<label class="fld"><span>Track (track team)</span>' + t2sel('name="track"', [['', 'Mixed']].concat(tracks.map(function (t) { return [t.id, t.label]; })), '') + '</label>' +
    '<label class="fld"><span>Team name</span><input name="nm" maxlength="60" placeholder="Leave empty to use the client’s name"></label>' +
    '<p class="meta">SFBLC teams are made on Competition teams.</p><div class="sheetacts"><button class="btn">Create team</button></div></form>');
};
SUBMIT_EXT.t2ctNewSave = function (f) {
  var kind = f.kind.value, nm = clean(f.nm.value, 60).trim(), client = kind === 'consulting' ? f.client.value : '';
  if (!nm) nm = kind === 'consulting' ? client : '';
  if (!nm) return toast('A track team needs a name.', true);
  var tl = cloneTeams();
  if (tl.some(function (t) { return String(t.name || '').toLowerCase() === nm.toLowerCase(); })) return toast('There is already a team called that.', true);
  tl.push({id: uid(kind === 'consulting' ? 'c' : 't'), kind: kind, track: kind === 'consulting' ? 'c' : f.track.value, client: client, event: '', name: nm, members: [], pms: [], initiatives: [], assign: {}});
  closeSheet();
  saveCfg({teams: tl}, nm + ' created. Add its members below.');
};
ACT_EXT.t2ctRename = function (el, d) {
  var t = findTeam(M.teams, d.id); if (!t) return;
  openSheet('<form class="form" data-act="t2ctRenameSave" data-id="' + esc(t.id) + '"><header class="sh"><h3>Rename team</h3></header>' +
    '<label class="fld"><span>Name</span><input name="nm" maxlength="60" required value="' + esc(t.name || '') + '"></label>' +
    (t2kind(t) === 'consulting' ? '<p class="meta">The client stays ' + esc(t.client || t.name) + '; only the name shown changes.</p>' : '') + '<div class="sheetacts"><button class="btn">Save</button></div></form>');
};
SUBMIT_EXT.t2ctRenameSave = function (f) {
  var tl = cloneTeams(), t = findTeam(tl, f.getAttribute('data-id')), nm = clean(f.nm.value, 60).trim();
  if (!t || !nm) return;
  t.name = nm; closeSheet();
  saveCfg({teams: tl}, 'Renamed.');
};
ACT_EXT.t2ctOut = function (el, d) {
  var tl = cloneTeams(), t = findTeam(tl, d.id); if (!t) return;
  t.members = (t.members || []).filter(function (m) { return flat(m) !== flat(d.name); });
  if (t.assign) { delete t.assign[t2norm(d.name)]; delete t.assign[d.name]; }
  saveCfg({teams: tl}, d.name + ' is off ' + teamName(t) + '.');
};
ACT_EXT.t2ctDel = function (el, d) {
  var t = findTeam(M.teams, d.id); if (!t) return;
  confirmSheet('Delete ' + teamName(t) + '?', 'Its members go back to having no ' + (t2kind(t) === 'consulting' ? 'client' : 'track') + ' team. Homework already handed in is kept. A request members sent for it goes too.', 'Delete team', function () { t2dropTeam(d.id); });
};

/* ---------- change handlers (selects, text and checkboxes) ---------- */
var T2C = {
  attend: function (el) { var fs = el.form && el.form.querySelector('.t2hotel'); if (fs) fs.disabled = !el.checked; if (T2.prefs) T2.prefs.attend = el.checked; },
  rqKind: function (el) { t2keep(); T2.draft.kind = el.value; T2.draft.tgt = ''; T2.draft.mates = T2.draft.mates.slice(0, T2_CAP[el.value] - 1); render(); },
  mateAdd: function (el) { t2addMate(el); },
  selfTeams: function (el) { saveCfg({selfTeams: el.checked}, el.checked ? 'Members can send in teams.' : 'Members can no longer send in teams. Requests already sent stay here.'); },
  rqName: function (el, d) { var q = t2req(d.id), v = clean(el.value, 60).trim(); if (q && v !== String(q.name || '').trim()) t2editReq(q, {name: v}); },
  rqTarget: function (el, d) { var q = t2req(d.id); if (q && el.value && el.value !== q.target) t2editReq(q, {target: el.value}); },
  rqAdd: function (el, d) { var q = t2req(d.id); if (q && el.value) t2editReq(q, {members: (q.members || []).concat([el.value])}); },
  roomCap: function (el) {
    var n = Math.max(1, Math.min(8, parseInt(el.value, 10) || 4)); el.value = n;
    if (n !== t2roomCap()) saveCfg({roomCap: n}, 'Up to ' + n + ' a room.' + (n > 4 ? ' The master sheet only has room for 4; a fifth person stays here only.' : ''));
  },
  rmAdd: function (el, d) {
    var p = M.byKey[el.value]; if (!p) return;
    var list = t2cloneRooms(), r = list.filter(function (x) { return x.id === d.id; })[0]; if (!r) return;
    if ((r.members || []).length >= t2roomCap()) return toast('That room is full.', true);
    list.forEach(function (x) { x.members = (x.members || []).filter(function (m) { return flat(m) !== p.key; }); });
    r.members = (r.members || []).concat([p.name]);
    var off = p.prefs.group && r.group && p.prefs.group !== r.group;
    t2saveRooms(list, p.name + ' is in ' + (r.name || 'the room') + '.' + (off ? ' They asked for a ' + T2_GROUP[p.prefs.group].toLowerCase() + '.' : ''));
  },
  ctPm: function (el, d) {
    var tl = cloneTeams(), t = findTeam(tl, d.id); if (!t) return;
    t.pms = (t.pms || []).slice(); while (t.pms.length < 2) t.pms.push('');
    t.pms[+d.i] = clean(el.value, 60);
    saveCfg({teams: tl}, el.value ? el.value + ' is a PM of ' + teamName(t) + '.' : 'PM cleared.');
  },
  ctInit: function (el, d) {
    var tl = cloneTeams(), t = findTeam(tl, d.id); if (!t) return;
    var list = el.value.split(',').map(function (x) { return clean(x, 60).trim(); }).filter(String).filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 8);
    if (JSON.stringify(list) === JSON.stringify(t.initiatives || [])) return;
    t.initiatives = list;
    /* Anyone on an initiative that is gone is left without one, rather than on a name nobody sees. */
    Object.keys(t.assign || {}).forEach(function (k) { if (list.indexOf(t.assign[k]) < 0) delete t.assign[k]; });
    saveCfg({teams: tl}, 'Initiatives saved.');
  },
  ctAssign: function (el, d) {
    var tl = cloneTeams(), t = findTeam(tl, d.id); if (!t) return;
    t.assign = t.assign || {}; delete t.assign[d.name];
    if (el.value) t.assign[t2norm(d.name)] = clean(el.value, 60); else delete t.assign[t2norm(d.name)];
    saveCfg({teams: tl}, el.value ? d.name + ': ' + el.value + '.' : 'Initiative cleared.');
  },
  ctAdd: function (el, d) {
    var p = M.byKey[el.value]; if (!p) return;
    var tl = cloneTeams(), t = findTeam(tl, d.id); if (!t) return;
    var moved = t2offKind(tl, t2kind(t), p.name, t.id);
    t.members = (t.members || []).concat([p.name]);
    saveCfg({teams: tl}, p.name + ' is on ' + teamName(t) + (moved.length ? ', moved from ' + moved.join(', ') : '') + '.');
  }
};
document.addEventListener('change', function (e) {
  var el = e.target && e.target.closest ? e.target.closest('[data-t2c]') : null;
  if (!el || !M) return;
  var fn = T2C[el.getAttribute('data-t2c')];
  if (fn) fn(el, el.dataset, el.value);
});
document.addEventListener('keydown', function (e) {
  var el = e.target;
  if (e.key !== 'Enter' || !el || !el.matches || !el.matches('input[data-t2c]') || el.type === 'checkbox') return;
  e.preventDefault();
  if (el.getAttribute('data-t2c') === 'mateAdd') t2addMate(el); else el.blur();
});

/* ---------- links elsewhere that pointed at the classic Teams tab ---------- */
var t2baseOverview = VIEWS.overview || renderOverview;
VIEWS.overview = function (sub) { return t2links(t2baseOverview(sub)); };
if (typeof TOOLS !== 'undefined') TOOLS.forEach(function (t) {
  if (t[0] === 'Consulting teams') t[2] = '#consulting/edit';
  else if (t[0] === 'Team requests') t[2] = '#teams/requests';
  else if (t[0] === 'SFBLC hotel rooms') t[2] = '#teams/rooms';
});
/* The rooms gaps sent officers to /teams; team requests waiting are a gap too. */
var t2baseGaps = gaps;
gaps = function () {
  var g = t2baseGaps();
  g.forEach(function (x) {
    if (x.action && x.action.href === '/teams') x.action = {label: x.action.label || 'Open rooms', go: 'teams/rooms'};
  });
  var w = M && M.officer ? t2waiting().length : 0;
  if (w) {
    g.push({sev: 'mid', title: plural(w, 'team request') + ' waiting', detail: 'Teams members put together themselves, to approve or send back.', action: {label: 'Review', go: 'teams/requests'}});
    var order = {high: 0, mid: 1, low: 2};
    g.sort(function (a, b) { return order[a.sev] - order[b.sev]; });
  }
  return g;
};

BOOT_EXT.push(function (raw) {
  var mine = raw && raw.all && raw.all.me && raw.all.me.requests;
  if (Array.isArray(mine)) { T2.reqs = mine; if (M.officer) render(); }
  else t2loadReqs();
});

/* ---------- the demo ----------
   Requests live beside the club (as the backend keeps them under their own
   key); a member's choices are saved on their person, which is what getAll
   and clubRoster already read. */
function t2demoReqs(s) {
  if (s.reqs) return s.reqs;
  var P = function (i) { return s.people[i].name; }, hrs = function (h) { return new Date(Date.now() - h * 36e5).toISOString(); };
  var other = s.people.filter(function (p) { return p.name !== s.member; });
  s.reqs = [
    {id: 'q-demo1', by: flat(P(17)), byName: P(17), kind: 'flc', target: 'Management', name: 'Case Closed', members: [P(17), P(23), P(31)], note: 'We ran the mock case together and want to stay a team.', status: 'pending', at: hrs(5)},
    {id: 'q-demo2', by: flat(other[10].name), byName: other[10].name, kind: 'other', target: 'Polaris', name: 'Polaris research pod', members: [other[10].name, s.member, other[40].name], note: '', status: 'pending', at: hrs(26)},
    {id: 'q-demo3', by: flat(P(29)), byName: P(29), kind: 'flc', target: 'STRIIVE', name: '', members: [P(29), P(36)], note: 'A duo talk on campus food insecurity.', status: 'returned', review: 'Pick your talk topic with your coach first, then send it again.', at: hrs(70)}
  ];
  return s.reqs;
}
DEMO_EXT.t2seed = function (pl, s, officer, me, store) {
  if (s.t2seeded) return {ok: true};
  /* A few roommate requests, rooming notes and client rankings, so forming rooms and client teams has something to work from. */
  var going = s.people.filter(function (p) { return p.prefs && p.prefs.attend; }), cl = T2_CLIENTS;
  going.forEach(function (p, j) {
    var mate = going.filter(function (x, k) { return k > j && x.prefs.group === p.prefs.group; })[0];
    if (mate && j % 3 === 0) { p.prefs.roomies = [mate.name]; if (j % 2 === 0) p.prefs.mate = mate.name; }
    if (j === 2) p.prefs.rnote = 'Light sleeper, so a quieter room if possible.';
    if (j === 9) p.prefs.rnote = 'Needs a ground-floor room.';
    p.prefs.at = Date.now() - (j + 2) * 36e5;
  });
  s.people.forEach(function (p, j) {
    if (p.track !== 'Consulting' || j % 4 === 3) return;
    var order = cl.slice(j % cl.length).concat(cl.slice(0, j % cl.length));
    if (j % 2) order = [order[1], order[0]].concat(order.slice(2));
    /* No attend answer: ranking clients says nothing about going to SFBLC. */
    if (!p.prefs) p.prefs = {flc: [], group: '', roomies: []};
    p.prefs.clients = order;
  });
  s.t2seeded = true; store();
  return {ok: true};
};
var t2prevSaveProfile = DEMO_EXT.saveProfile;
DEMO_EXT.saveProfile = function (pl, s, officer, me, store) {
  if (pl.prefs !== undefined) {
    var p = s.people.filter(function (x) { return flat(x.name) === me; })[0], o;
    try { o = typeof pl.prefs === 'string' ? JSON.parse(pl.prefs) : pl.prefs; } catch (e) { return {ok: false, error: 'Those preferences could not be read.'}; }
    if (p && o) {
      var txt = function (v, n) { return clean(v, n); };
      p.prefs = {flc: (o.flc || []).slice(0, 3).map(function (v) { return txt(v, 40); }).filter(String), clients: (o.clients || []).slice(0, 10).map(function (v) { return txt(v, 60); }).filter(String),
                 mate: txt(o.mate, 60), attend: o.attend !== false, hotel: o.attend !== false, group: ['w', 'm', 'x'].indexOf(o.group) > -1 ? o.group : '',
                 roomies: (o.roomies || []).slice(0, 3).map(function (v) { return txt(v, 60); }).filter(String), rnote: txt(o.rnote, 160), at: +o.at || Date.now()};
      store();
    }
  }
  return t2prevSaveProfile ? t2prevSaveProfile(pl, s, officer, me, store) : {ok: true, saved: true};
};
DEMO_EXT.listTeamRequests = function (pl, s, officer, me) {
  var all = t2demoReqs(s);
  if (officer) return {ok: true, requests: JSON.parse(JSON.stringify(all))};
  return {ok: true, requests: all.filter(function (r) { return r.by === me || (r.members || []).some(function (m) { return flat(m) === me; }); })
    .map(function (r) { var c = JSON.parse(JSON.stringify(r)); delete c.by; c.mine = r.by === me; return c; })};
};
DEMO_EXT.submitTeamRequest = function (pl, s, officer, me, store) {
  var kind = String(pl.kind || '');
  if (!T2_CAP[kind]) return {ok: false, error: 'Pick what kind of team this is.'};
  if (kind !== 'other' && !pl.target) return {ok: false, error: kind === 'flc' ? 'Pick the event.' : 'Pick the client.'};
  var seen = {}, mem = [s.me].concat(pl.members || []).map(function (m) { return clean(m, 60).trim(); })
    .filter(function (m) { var k = flat(m); if (!k || seen[k]) return false; seen[k] = 1; return true; });
  if (mem.length > T2_CAP[kind]) return {ok: false, error: 'That is ' + mem.length + ' people; this kind of team takes up to ' + T2_CAP[kind] + '.'};
  var list = t2demoReqs(s).filter(function (r) { return !(r.by === me && r.kind === kind && r.status !== 'approved'); });
  var req = {id: uid('q'), by: me, byName: s.me, kind: kind, target: clean(pl.target, 60), name: clean(pl.name, 60), members: mem, note: clean(pl.note, 200), status: 'pending', at: new Date().toISOString()};
  list.push(req); s.reqs = list; store();
  return {ok: true, request: req};
};
DEMO_EXT.withdrawTeamRequest = function (pl, s, officer, me, store) {
  var list = t2demoReqs(s), n = list.length;
  s.reqs = list.filter(function (r) { return !(r.id === pl.id && r.by === me && r.status !== 'approved'); });
  if (s.reqs.length === n) return {ok: false, error: 'That request is not yours to withdraw, or it was already approved.'};
  store(); return {ok: true, withdrawn: pl.id};
};
DEMO_EXT.reviewTeamRequest = function (pl, s, officer, me, store) {
  if (!officer) return {ok: false, error: 'Officers only.'};
  var hit = t2demoReqs(s).filter(function (r) { return r.id === pl.id; })[0];
  if (!hit) return {ok: false, error: 'That request was withdrawn.'};
  if (pl.status !== 'approved' && pl.status !== 'returned') return {ok: false, error: 'Approve or return it.'};
  hit.status = pl.status; hit.review = clean(pl.note, 200); hit.teamId = pl.status === 'approved' ? String(pl.teamId || '') : '';
  hit.reviewedBy = 'Demo Officer'; hit.reviewedAt = new Date().toISOString(); store();
  return {ok: true, request: hit};
};
DEMO_EXT.editTeamRequest = function (pl, s, officer, me, store) {
  if (!officer) return {ok: false, error: 'Officers only.'};
  var hit = t2demoReqs(s).filter(function (r) { return r.id === pl.id; })[0];
  if (!hit) return {ok: false, error: 'That request was withdrawn.'};
  var seen = {}, mem = (pl.members || []).map(function (m) { return clean(m, 60).trim(); }).filter(function (m) { var k = flat(m); if (!k || seen[k]) return false; seen[k] = 1; return true; });
  if (!mem.length) return {ok: false, error: 'A team needs at least one member.'};
  if (mem.length > T2_CAP[hit.kind]) return {ok: false, error: 'This kind of team takes up to ' + T2_CAP[hit.kind] + '.'};
  hit.members = mem;
  if (pl.name !== undefined) hit.name = clean(pl.name, 60);
  if (pl.target) hit.target = clean(pl.target, 60);
  store(); return {ok: true, request: hit};
};
DEMO_EXT.deleteTeamRequest = function (pl, s, officer, me, store) {
  if (!officer) return {ok: false, error: 'Officers only.'};
  var list = t2demoReqs(s), n = list.length;
  s.reqs = list.filter(function (r) { return !((pl.id && r.id === pl.id) || (pl.teamId && r.teamId === pl.teamId)); });
  store(); return {ok: true, deleted: n - s.reqs.length};
};
if (DEMO) Demo.answer('t2seed', {});
