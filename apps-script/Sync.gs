/* ---------------- two-way sync with the chapter's sheets ----------------
   The EBOD keeps working in its own Google Sheets and the PBL Verify bot keeps
   writing to them; the Org System now stays in step with all of it, both ways.

   What is synced, per club (SYNC_):
     attendance  Fall 26' Attendance, one tab per meeting ("10/29")
                 <-> Attendance rows labelled "Meeting 10/29", with a Status
     tickets     the bot's attendance tickets (Records sheet + the Tickets tab)
                 <-> the Tickets tab here; deciding one sets the meeting cell
     teams       SFBLC Master Sheet · Teams <-> the club's SFBLC teams
     rooms       SFBLC Master Sheet · Rooming Assignments <-> the club's rooms
     itinerary   SFBLC Master Sheet · Itinerary <-> the schedule items it made
     discord     PBL Verify Records · Verified members -> the Discord tab here,
                 each profile linked to a member (officers can fix a link)
   The sign-up, track interest and re-enrollment sheets are Google Form
   responses and stay read-only (they become tags through linkedRead).

   How a change travels. Every domain is a set of keys (a member at a meeting,
   a team, a room...) with a value on each side, plus the value both sides
   last agreed on (the SyncBase tab). Whichever side moved away from that is
   the change, and it is copied to the other side. When both moved, the
   latest edit wins: a person's edit to a sheet is stamped by syncOnChange,
   an edit here is stamped by the action that made it. Every copy is written
   to the SyncLog tab, so an overwrite can be traced.

   When it runs: right after an edit here that touches a synced domain (inside
   the same request), within about half a minute of an edit to a linked sheet
   (an installable onChange trigger, debounced), and from keepWarm for what
   neither notices -- the bot writes through its own script, and edits made by
   a script fire no trigger. Script edits never fire triggers, which is also
   why the sync cannot echo its own writes back and forth. */

var SYNC_ = {
  'deanza-pbl': {
    attendance: '11epr7XrJQbhJwWWnVH9pUsHlMZAx3XoUzjmYjVr5p3A',  // Fall 26' Attendance (the bot's script lives here)
    master: '1oKlEes6653hEO8pJj2sExZzAI1daXZLVRCMaDWQtVJY',      // SFBLC 2026 – Master Sheet (Internal)
    records: '19xazg1JCkQl-JJADMmgZqKfx0l35u1uNPct33MPcq8E'      // PBL Verify Records (the bot's)
  }
};
/* Order matters: a ticket decided here writes the meeting cell, which the
   attendance pass then carries back into this club's Attendance rows. */
var SYNC_DOMAINS_ = ['discord', 'tickets', 'attendance', 'teams', 'rooms', 'itinerary'];
var SYNC_SHEETS_ = {discord: ['records'], tickets: ['attendance', 'records'], attendance: ['attendance'],
                    teams: ['master'], rooms: ['master'], itinerary: ['master']};
var SYNC_TRIGGER_V_ = '1';

/* ---- small helpers ---- */
function sn_(x) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().toLowerCase(); }
function sclean_(x) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim(); }
var SBOOK_ = {};
function sbook_(id) { return SBOOK_[id] || (SBOOK_[id] = SpreadsheetApp.openById(id)); }
/* The header row is the first of the top six rows matching every pattern. */
function shead_(values, want) {
  for (var r = 0; r < Math.min(6, values.length); r++) {
    var h = values[r].map(function (x) { return sn_(x); }), col = {}, all = true;
    Object.keys(want).forEach(function (k) {
      var re = want[k], i = -1;
      for (var c = 0; c < h.length && i < 0; c++) if (re.test(h[c])) i = c;
      col[k] = i;
      if (i < 0 && !re.optional) all = false;
    });
    if (all) return {row: r, col: col, head: h};
  }
  return null;
}
function sopt_(re) { re.optional = true; return re; }
function strue_(v) { return v === true || /^(true|x|yes|y|1|✓)$/i.test(String(v).trim()); }

var ATT_TEXT_ = {P: 'Present', EL: 'Excused Late', UL: 'Unexcused Late', EA: 'Excused Abscence', UA: 'Unexcused Abscence'};
/* A status as a short code. The sheet spells "Abscence" (and the bot checks
   for it), so that spelling is what gets written; either spelling is read. */
function attCode_(t) {
  var s = sn_(t);
  if (!s) return '';
  if (/^present/.test(s)) return 'P';
  if (/unexcused/.test(s)) return /late/.test(s) ? 'UL' : /abs/.test(s) ? 'UA' : s;
  if (/excused/.test(s)) return /late/.test(s) ? 'EL' : /abs/.test(s) ? 'EA' : s;
  return s;
}
function attAbsent_(status) { var c = attCode_(status); return c === 'EA' || c === 'UA'; }
function attText_(code, fallback) { return ATT_TEXT_[code] || fallback || code; }
/* "10/29" sorted by school year: August to July. */
function meetOrder_(tab) {
  var m = String(tab).match(/^(\d{1,2})\/(\d{1,2})$/);
  return m ? ((+m[1] < 8 ? +m[1] + 12 : +m[1]) * 100 + +m[2]) : -1;
}
function meetLabel_(tab) { return 'Meeting ' + tab; }
/* A member's name from a meeting tab, as people actually fill it in. When the
   "First Name" column already holds two or more words it is the whole name
   ("Dillon Takeshima", "Aaron, Tang") and "Last Name" is a nickname or a repeat
   ("Dillon", "Tina"); with one word, "Last Name" is the surname ("Anna" |
   "Shvedova"). The roster's spelling wins: if it does not know the full name,
   the nickname with the surname is tried ("Augustina Apeh" | "Tina" -> "Tina Apeh"). */
function attName_(first, last) {
  var f = sclean_(first).replace(/\s*,\s*/g, ', '), l = sclean_(last);
  if (!l) return f;
  if (!f) return l;
  return f.replace(/,/g, ' ').split(' ').filter(String).length > 1 ? f : f + ' ' + l;
}
function attPerson_(first, last, roster) {
  var raw = attName_(first, last), name = syncMatchName_(raw, roster);
  if (roster[flatName_(name)]) return name;
  var f = sclean_(first).replace(/,/g, ' ').split(' ').filter(String), nick = sclean_(last);
  if (nick.replace(/,/g, ' ').split(' ').filter(String).length > 1) {
    var whole = syncMatchName_(nick, roster);
    if (roster[flatName_(whole)]) return whole;
  }
  if (f.length > 1 && nick && nick.split(' ').length === 1) {
    var alt = syncMatchName_(nick + ' ' + f[f.length - 1], roster);
    if (roster[flatName_(alt)]) return alt;
  }
  return name;
}
function meetTab_(label) { var m = String(label || '').match(/^Meeting (\d{1,2}\/\d{1,2})$/); return m ? m[1] : ''; }

/* ---- state: SyncBase, SyncLog, stamps ---- */
function syncBaseRead_(aff, domain) {
  var out = {};
  readScoped('syncBase', aff).forEach(function (r) {
    if (String(r.Domain) === domain) out[String(r.Key)] = {v: String(r.Value), ref: r.Ref === '' ? null : Number(r.Ref)};
  });
  return out;
}
function syncBaseWrite_(aff, domain, map) {
  var sh = tab('syncBase'), vals = sh.getDataRange().getValues(), head = vals[0];
  var ia = head.indexOf('Affiliation'), id = head.indexOf('Domain');
  var keep = [head].concat(vals.slice(1).filter(function (r) {
    return !(String(r[ia] || DEFAULT_AFF).toLowerCase() === aff && String(r[id]) === domain);
  }));
  Object.keys(map).forEach(function (k) {
    keep.push(TAB.syncBase.cols.map(function (c) {
      return c === 'Affiliation' ? aff : c === 'Domain' ? domain : c === 'Key' ? k
        : c === 'Value' ? map[k].v : c === 'Ref' ? (map[k].ref == null ? '' : map[k].ref) : '';
    }));
  });
  sh.getRange(1, 1, keep.length, head.length).setValues(keep);
  if (vals.length > keep.length) sh.getRange(keep.length + 1, 1, vals.length - keep.length, head.length).clearContent();
}
function syncLog_(entries) {
  if (!entries.length) return;
  appendRows('syncLog', entries);
  var sh = tab('syncLog'), n = sh.getLastRow();
  if (n > 1500) sh.deleteRows(2, n - 1000);
}
function syncProps_() { return PropertiesService.getScriptProperties(); }
function syncStampSheet_(sheetId) { syncProps_().setProperty('syncSheetAt:' + sheetId, String(Date.now())); }
function syncStampOrg_(aff, domain) { syncProps_().setProperty('syncOrgAt:' + aff + ':' + domain, String(Date.now())); }
function syncSheetAt_(ids, domain) {
  var p = syncProps_();
  return Math.max.apply(null, [0].concat((SYNC_SHEETS_[domain] || []).map(function (k) {
    return Number(p.getProperty('syncSheetAt:' + ids[k]) || 0);
  })));
}
function syncOrgAt_(aff, domain) { return Number(syncProps_().getProperty('syncOrgAt:' + aff + ':' + domain) || 0); }

/* The club record, read and written whole (the write lock is held). */
function syncCfgSave_(aff, cfg) {
  var key = 'club:' + aff, sh = tab('config'), v = sh.getDataRange().getValues(), json = JSON.stringify(cfg);
  if (json.length > 49000) throw new Error('The club record would pass the 50,000-character cell limit.');
  for (var q = 1; q < v.length; q++) if (String(v[q][0]) === key) { sh.getRange(q + 1, 2).setValue(json); return; }
  sh.appendRow([key, json]);
}

/* ---- the engine ----
   An adapter gives each side as {key: {v: comparable value, ...meta}} and
   writes a set of changes {key: value ('' removes)} to one side. */
function syncDomain_(aff, domain, why) {
  var ids = SYNC_[aff];
  if (!ids) return null;
  if (domain === 'discord') return syncDiscord_(aff);
  var A = SYNC_ADAPT_[domain];
  if (!A) return null;
  var ctx = {aff: aff, ids: ids, why: why, cfg: null};
  SYNC_ROSTER_ = syncRoster_(aff);
  var S = A.sheet(ctx), O = A.org(ctx), B = syncBaseRead_(aff, domain);
  ctx.S = S;
  var first = !Object.keys(B).length;
  ctx.first = first;
  if (first && A.adopt) A.adopt(ctx, S, O);   // match old one-off imports to sheet rows by content
  var same = A.same || function (a, b) { return sn_(a) === sn_(b); };
  var sheetAt = syncSheetAt_(ids, domain), orgAt = syncOrgAt_(aff, domain);
  var toSheet = {}, toOrg = {}, log = [], now = new Date();
  var keys = {};
  [S, O, B].forEach(function (m) { Object.keys(m).forEach(function (k) { keys[k] = 1; }); });
  Object.keys(keys).forEach(function (k) {
    var s = S[k] ? S[k].v : '', o = O[k] ? O[k].v : '', b = B[k] ? B[k].v : null, dir = '', why2 = '';
    if (same(s, o)) return;
    if (b === null) {
      /* Never agreed before: fill whichever side is empty, else the sheet. */
      if (!o) dir = 'org'; else if (!s) dir = 'sheet'; else { dir = 'org'; why2 = 'first sync, sheet kept'; }
    } else if (same(o, b)) dir = 'org';
    else if (same(s, b)) dir = 'sheet';
    else { dir = sheetAt >= orgAt ? 'org' : 'sheet'; why2 = 'both changed, latest edit kept'; }
    if (dir === 'org') toOrg[k] = s; else toSheet[k] = o;
    log.push({At: now, Affiliation: aff, Domain: domain, Key: k, Direction: dir === 'org' ? 'sheet → org' : 'org → sheet',
              From: dir === 'org' ? o : s, To: dir === 'org' ? s : o, Why: why2 || why || ''});
  });
  /* A sheet that suddenly reads as empty (a tab renamed or restructured) or a
     run that would mostly remove things without adding any is stopped and
     reported, never carried out: removals are only applied when they look
     like edits, not like a sheet that went missing. */
  var nB = Object.keys(B).length, gone = function (m) { return Object.keys(m).filter(function (k) { return !m[k]; }).length; };
  var added = function (m) { return Object.keys(m).filter(function (k) { return m[k] && !B[k]; }).length; };
  if (nB > 2 && !Object.keys(S).length) throw new Error(domain + ': the sheet came back empty, so nothing was changed. Check that its tab and header row are still there.');
  [[toOrg, 'the Org System'], [toSheet, 'the sheet']].forEach(function (x) {
    var g = gone(x[0]);
    if (g > Math.max(5, nB * 0.5) && added(x[0]) < g / 2)
      throw new Error(domain + ': this run would remove ' + g + ' of ' + nB + ' from ' + x[1] + ', so nothing was changed. Check the sheet, then run Sync now again.');
  });
  var refs = {};
  if (Object.keys(toSheet).length) refs = A.writeSheet(ctx, toSheet, S, O) || {};
  if (Object.keys(toOrg).length || A.alwaysOrg || ctx.dirty) A.writeOrg(ctx, toOrg, S, O);
  /* What both sides hold now, which is the next run's base. */
  var nb = {};
  Object.keys(keys).forEach(function (k) {
    var v = toOrg.hasOwnProperty(k) ? toOrg[k] : toSheet.hasOwnProperty(k) ? toSheet[k] : (S[k] ? S[k].v : '');
    if (!v) return;
    var ref = refs[k] != null ? refs[k] : S[k] && S[k].ref != null ? S[k].ref : B[k] ? B[k].ref : null;
    nb[k] = {v: v, ref: ref};
  });
  syncBaseWrite_(aff, domain, nb);
  syncLog_(log);
  return {domain: domain, toOrg: Object.keys(toOrg).length, toSheet: Object.keys(toSheet).length, keys: Object.keys(nb).length};
}

/* Runs domains under the script lock (held already inside a write request). */
function syncRun_(aff, domains, why) {
  var l = LockService.getScriptLock(), mine = false;
  if (!l.hasLock()) { if (!l.tryLock(25000)) return {ok: false, error: 'Busy, the sync will run on its next turn.'}; mine = true; }
  var out = [], errs = [], moved = false;
  try {
    SYNC_DOMAINS_.forEach(function (d) {
      if (domains && domains.indexOf(d) < 0) return;
      try { var r = syncDomain_(aff, d, why); if (r) out.push(r); if (r && (r.toOrg || r.profiles)) moved = true; }
      catch (e) { errs.push(d + ': ' + (e && e.message || e)); Logger.log('sync ' + d + ': ' + (e && e.stack || e)); }
    });
    /* The page reads the club from a shared cache that only page writes renew;
       what the sync copied in must show at once, not when that cache runs out. */
    if (moved || !domains) bumpShared_(aff);
    syncProps_().setProperty('syncRunAt:' + aff, String(Date.now()));
    syncProps_().setProperty('syncErr:' + aff, errs.join('\n'));
  } finally { if (mine) l.releaseLock(); }
  return {ok: !errs.length, ran: out, errors: errs};
}
/* After an edit here: stamp it as the latest, then copy it out now. A sync
   problem never fails the edit itself; keepWarm retries. */
function syncAfterOrg_(aff, domains, why) {
  if (!SYNC_[aff]) return null;
  domains.forEach(function (d) { syncStampOrg_(aff, d); });
  try { return syncRun_(aff, domains, why || 'edited in the Org System'); }
  catch (e) { Logger.log('syncAfterOrg_: ' + (e && e.stack || e)); return null; }
}

/* ---- triggers ----
   onChange on every linked spreadsheet stamps the edit and books one sync
   about 30 seconds out, so a burst of typing costs one run, not fifty. */
function syncOnChange(e) {
  var id = e && e.source ? e.source.getId() : '';
  if (id) syncStampSheet_(id);
  var p = syncProps_();
  if (Number(p.getProperty('syncDueAt') || 0) > Date.now()) return;
  p.setProperty('syncDueAt', String(Date.now() + 30000));
  ScriptApp.newTrigger('syncDue').timeBased().after(30000).create();
}
function syncDue() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncDue') ScriptApp.deleteTrigger(t); });
  syncProps_().deleteProperty('syncDueAt');
  Object.keys(SYNC_).forEach(function (aff) { syncRun_(aff, null, 'sheet edited'); });
}
/* Installs the onChange triggers once (and again if SYNC_ gains a sheet).
   keepWarm calls it, so a redeploy is all it takes. */
function syncInstall_() {
  var want = {};
  Object.keys(SYNC_).forEach(function (aff) { Object.keys(SYNC_[aff]).forEach(function (k) { want[SYNC_[aff][k]] = 1; }); });
  var sig = SYNC_TRIGGER_V_ + ':' + Object.keys(want).sort().join(',');
  var p = syncProps_();
  if (p.getProperty('syncTriggers') === sig) return;
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncOnChange') ScriptApp.deleteTrigger(t); });
  Object.keys(want).forEach(function (id) { ScriptApp.newTrigger('syncOnChange').forSpreadsheet(id).onChange().create(); });
  p.setProperty('syncTriggers', sig);
}
/* From keepWarm: a club whose sheets and record have not moved since its
   last run is skipped, so the ten-minute timer costs almost nothing. */
function syncKeepWarm_() {
  syncInstall_();
  Object.keys(SYNC_).forEach(function (aff) {
    var p = syncProps_(), last = Number(p.getProperty('syncRunAt:' + aff) || 0), ids = SYNC_[aff], moved = false;
    Object.keys(ids).forEach(function (k) {
      try { if (DriveApp.getFileById(ids[k]).getLastUpdated().getTime() > last) moved = true; } catch (e) { moved = true; }
    });
    if (moved || Date.now() - last > 6 * 3600 * 1000) syncRun_(aff, null, 'scheduled check');
  });
}

/* ---- names ---- */
function syncRoster_(aff) {
  var names = {};
  readScoped('teams', aff).forEach(function (r) { if (r.MemberName) names[flatName_(r.MemberName)] = sclean_(r.MemberName); });
  readScoped('users', aff).forEach(function (r) {
    var n = sclean_([r.FirstName, r.LastName].join(' '));
    if (n) names[flatName_(n)] = names[flatName_(n)] || n;
  });
  /* Everyone signed up with Google too, as the dashboard counts them ("Tajinder (TJ) Bahia"). */
  try {
    accountsFor(aff).forEach(function (a) {
      var n = sclean_([a.first, a.last].join(' '));
      if (n) names[flatName_(n)] = names[flatName_(n)] || n;
    });
  } catch (e) {}
  return names;
}
/* A sheet name to a roster name: exact, "Last, First", or first and last
   word (middle names dropped). Unknown names come back as typed. */
function syncMatchName_(raw, roster) {
  var s = sclean_(raw);
  if (!s) return '';
  var f = flatName_(s);
  if (roster[f]) return roster[f];
  var m = s.match(/^([^,]+),\s*(.+)$/);
  if (m && roster[flatName_(m[2] + m[1])]) return roster[flatName_(m[2] + m[1])];
  var w = s.split(' ');
  if (w.length > 2 && roster[flatName_(w[0] + w[w.length - 1])]) return roster[flatName_(w[0] + w[w.length - 1])];
  return syncFuzzy_(s, roster) || s;
}
/* The roster and the sheets spell people differently ("Colin"/"Collin",
   "Emelia"/"Emilia", "Qieu"/"Kieu", "Chris"/"Christopher", "Sen"/"Senthil").
   A roster name is taken when both its first and last name agree with this
   one -- equal, one starting the other (3+ letters), or one letter apart --
   with at most one of the two not equal, and only if exactly one roster
   name fits, so two people are never merged. */
function syncFuzzy_(s, roster) {
  var parts = function (x) { var w = String(x).toLowerCase().replace(/,/g, ' ').replace(/[^a-z ]/g, '').split(' ').filter(String); return w.length > 1 ? [w[0], w[w.length - 1]] : null; };
  var near = function (a, b) {
    if (a === b) return 2;
    if (Math.min(a.length, b.length) >= 3 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)) return 1;
    if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return 0;
    var i = 0, j = 0, miss = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++miss > 1) return 0;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return miss + (a.length - i) + (b.length - j) <= 1 ? 1 : 0;
  };
  var me = parts(s);
  if (!me) return '';
  var hits = Object.keys(roster).filter(function (k) {
    var o = parts(roster[k]);
    if (!o) return false;
    var f = near(me[0], o[0]), l = near(me[1], o[1]);
    return f && l && f + l >= 3;
  });
  return hits.length === 1 ? roster[hits[0]] : '';
}

/* ---- adapters ---- */
var SYNC_ADAPT_ = {};

/* Attendance: key "10/29|janedoe", value a status code plus "*" for "not in
   business casual". Absences are kept here as rows with a Status, and
   getAll leaves them out, so nothing that counts check-ins counts them. */
SYNC_ADAPT_.attendance = {
  sheet: function (ctx) {
    var ss = sbook_(ctx.ids.attendance), out = {}, roster = syncRoster_(ctx.aff);
    ss.getSheets().forEach(function (sh) {
      var tabName = sh.getName();
      if (meetOrder_(tabName) < 0) return;
      var v = sh.getDataRange().getValues();
      var h = shead_(v, {first: /^first/, last: sopt_(/^last/), att: /^attendance$/, bc: sopt_(/bus casual/), mail: sopt_(/gmail|e-?mail/)});
      if (!h) return;
      for (var r = h.row + 1; r < v.length; r++) {
        var raw = attName_(v[r][h.col.first], h.col.last >= 0 ? v[r][h.col.last] : '');
        if (!raw) continue;
        /* Keyed by the roster's spelling, so the dashboard counts the meeting for the right person. */
        var name = attPerson_(v[r][h.col.first], h.col.last >= 0 ? v[r][h.col.last] : '', roster), k = tabName + '|' + flatName_(name);
        if (out[k]) continue;
        var code = attCode_(v[r][h.col.att]), bc = h.col.bc >= 0 && strue_(v[r][h.col.bc]);
        out[k] = {v: code ? code + (bc ? '*' : '') : (bc ? '*' : ''), tab: tabName, row: r + 1, name: name,
                  text: sclean_(v[r][h.col.att]), mail: h.col.mail >= 0 ? sclean_(v[r][h.col.mail]) : ''};
      }
    });
    return out;
  },
  org: function (ctx) {
    var out = {};
    readScoped('attendance', ctx.aff).forEach(function (r) {
      var t = meetTab_(r.EventLabel);
      if (!t) return;
      var k = t + '|' + flatName_(r.MemberName);
      if (out[k]) return;
      var code = attCode_(r.Status || 'Present'), bc = /business casual/i.test(String(r.Note || ''));
      out[k] = {v: code + (bc ? '*' : ''), name: sclean_(r.MemberName), text: sclean_(r.Status)};
    });
    return out;
  },
  writeOrg: function (ctx, ch, S) {
    var sh = tab('attendance'), vals = sh.getDataRange().getValues(), head = vals[0], col = {};
    head.forEach(function (c, i) { col[c] = i; });
    var people = {};
    readScoped('teams', ctx.aff).forEach(function (r) { people[flatName_(r.MemberName)] = r; });
    var at = {}, drop = {};
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][col.Affiliation] || DEFAULT_AFF).toLowerCase() !== ctx.aff) continue;
      var t = meetTab_(vals[i][col.EventLabel]);
      if (!t) continue;
      var k = t + '|' + flatName_(vals[i][col.MemberName]);
      if (at[k] == null) at[k] = i; else drop[i] = 1;     // one row per member per meeting
    }
    var add = [];
    Object.keys(ch).forEach(function (k) {
      var v = ch[k], code = v.replace(/\*$/, ''), bc = /\*$/.test(v), s = S[k] || {};
      var status = code ? attText_(code, s.text) : '', note = bc ? 'Not in business casual' : '';
      if (!code && !bc) { if (at[k] != null) drop[at[k]] = 1; return; }
      if (at[k] != null) {
        vals[at[k]][col.Status] = status;
        vals[at[k]][col.Note] = note;
        return;
      }
      var p = people[k.split('|')[1]] || {}, row = head.map(function () { return ''; });
      row[col.Timestamp] = new Date(); row[col.MemberName] = p.MemberName || s.name || '';
      row[col.EventLabel] = meetLabel_(k.split('|')[0]); row[col.Track] = p.Track || ''; row[col.Org] = p.Org || '';
      row[col.Affiliation] = ctx.aff; row[col.Status] = status; row[col.Note] = note;
      add.push(row);
    });
    var rows = vals.filter(function (r, i) { return !drop[i]; }).concat(add);
    sh.getRange(1, 1, rows.length, head.length).setValues(rows);
    if (vals.length > rows.length) sh.getRange(rows.length + 1, 1, vals.length - rows.length, head.length).clearContent();
  },
  writeSheet: function (ctx, ch, S, O) {
    var ss = sbook_(ctx.ids.attendance), byTab = {};
    Object.keys(ch).forEach(function (k) { (byTab[k.split('|')[0]] = byTab[k.split('|')[0]] || []).push(k); });
    Object.keys(byTab).forEach(function (t) {
      var sh = ss.getSheetByName(t) || syncNewMeeting_(ss, t);
      if (!sh) return;
      var v = sh.getDataRange().getValues();
      var h = shead_(v, {first: /^first/, last: sopt_(/^last/), att: /^attendance$/, bc: sopt_(/bus casual/)});
      if (!h) return;
      var bool = h.col.bc >= 0 && v.slice(h.row + 1).some(function (r) { return typeof r[h.col.bc] === 'boolean'; });
      var rowOf = {}, roster = syncRoster_(ctx.aff);
      for (var r = h.row + 1; r < v.length; r++) {
        var n = attName_(v[r][h.col.first], h.col.last >= 0 ? v[r][h.col.last] : '');
        if (!n) continue;
        [flatName_(n), flatName_(attPerson_(v[r][h.col.first], h.col.last >= 0 ? v[r][h.col.last] : '', roster))]
          .forEach(function (f) { if (rowOf[f] == null) rowOf[f] = r + 1; });
      }
      byTab[t].forEach(function (k) {
        var val = ch[k], code = val.replace(/\*$/, ''), bc = /\*$/.test(val), o = O[k] || {};
        var row = rowOf[k.split('|')[1]];
        if (!row) {
          if (!code && !bc) return;
          row = sh.getLastRow() + 1;
          sh.getRange(row, h.col.first + 1).setValue(o.name || '');
        }
        sh.getRange(row, h.col.att + 1).setValue(code ? attText_(code, o.text) : '');
        if (h.col.bc >= 0) sh.getRange(row, h.col.bc + 1).setValue(bool ? bc : (bc ? 'TRUE' : ''));
      });
    });
    return {};
  }
};
/* A meeting taken here that has no tab yet gets one, copied from the latest
   meeting with the attendance columns emptied, at the end -- the bot reads
   the right-most meeting tab as the current roster, which this now is. */
function syncNewMeeting_(ss, t) {
  var latest = ss.getSheets().filter(function (s) { return meetOrder_(s.getName()) >= 0; })
    .sort(function (a, b) { return meetOrder_(b.getName()) - meetOrder_(a.getName()); })[0];
  if (!latest) return null;
  var sh = latest.copyTo(ss).setName(t);
  ss.setActiveSheet(sh); ss.moveActiveSheet(ss.getNumSheets());
  var v = sh.getDataRange().getValues(), h = shead_(v, {att: /^attendance$/, bc: sopt_(/bus casual/)});
  if (h && v.length > h.row + 1) {
    [h.col.att, h.col.bc].forEach(function (c) {
      if (c < 0) return;
      var rg = sh.getRange(h.row + 2, c + 1, v.length - h.row - 1, 1);
      rg.clearContent(); rg.clearNote(); rg.setBackground(null);
    });
  }
  return sh;
}

/* Tickets: key the ticket id, value its status ("Pending" until decided). */
var TICKET_COLORS_ = {Pending: '#fff2cc', Excused: '#d9ead3', Unexcused: '#f4cccc'};
function ticketStatus_(x) {
  var s = sn_(x);
  if (!s || /^(open|pending)$/.test(s)) return 'Pending';
  var c = attCode_(s);
  return ATT_TEXT_[c] || sclean_(x);
}
SYNC_ADAPT_.tickets = {
  alwaysOrg: true,   // new tickets and their details arrive even when no status moved
  sheet: function (ctx) {
    var out = {};
    var rs = sbook_(ctx.ids.records).getSheetByName('Attendance tickets');
    if (rs) {
      var v = rs.getDataRange().getValues(), h = shead_(v, {id: /^ticket id$/, did: /^discord id$/, user: /^username$/, name: /^name$/,
        meet: /^meeting$/, type: /^type$/, label: /^label$/, reason: /^reason$/, status: /^status$/, thread: /^thread id$/,
        created: /^created at$/, by: /^decided by$/, at: /^decided at$/});
      if (h) for (var r = h.row + 1; r < v.length; r++) {
        var id = sclean_(v[r][h.col.id]);
        if (!id) continue;
        out[id] = {v: ticketStatus_(v[r][h.col.status]), recRow: r + 1, discordId: sclean_(v[r][h.col.did]), username: sclean_(v[r][h.col.user]),
                   name: sclean_(v[r][h.col.name]), meeting: sclean_(v[r][h.col.meet]), type: sclean_(v[r][h.col.type]), label: sclean_(v[r][h.col.label]),
                   reason: String(v[r][h.col.reason] || '').slice(0, 500), thread: sclean_(v[r][h.col.thread]), opened: v[r][h.col.created],
                   by: sclean_(v[r][h.col.by]), at: v[r][h.col.at]};
      }
    }
    var ts = sbook_(ctx.ids.attendance).getSheetByName('Tickets');
    if (ts) {
      var w = ts.getDataRange().getValues(), g = shead_(w, {id: /^ticket$/, meet: /^meeting$/, name: /^name$/, discord: /^discord$/,
        type: /^type$/, reason: /^reason$/, status: /^status$/, by: /^decided by$/});
      if (g) for (var q = g.row + 1; q < w.length; q++) {
        var tid = sclean_(w[q][g.col.id]);
        if (!tid) continue;
        var st = ticketStatus_(w[q][g.col.status]), o = out[tid] || (out[tid] = {v: 'Pending', name: sclean_(w[q][g.col.name]),
          meeting: sclean_(w[q][g.col.meet]), username: sclean_(w[q][g.col.discord]), label: sclean_(w[q][g.col.type]),
          reason: String(w[q][g.col.reason] || '').slice(0, 500)});
        o.tabRow = q + 1;
        /* The Tickets tab is where people decide by hand, so its decision wins over the bot's copy. */
        if (st !== 'Pending') { o.v = st; o.by = sclean_(w[q][g.col.by]) || o.by; }
      }
    }
    return out;
  },
  org: function (ctx) {
    var out = {};
    readScoped('tickets', ctx.aff).forEach(function (r) {
      out[String(r.TicketId)] = {v: ticketStatus_(r.Status), by: sclean_(r.DecidedBy), at: r.DecidedAt};
    });
    return out;
  },
  writeOrg: function (ctx, ch, S, O) {
    var rows = Object.keys(S).map(function (k) {
      var s = S[k], o = O[k] || {}, fromOrg = !ch.hasOwnProperty(k) && o.v && o.v !== s.v;
      var status = ch.hasOwnProperty(k) ? ch[k] : (o.v || s.v);
      return {Affiliation: ctx.aff, TicketId: k, Meeting: s.meeting, Name: s.name, DiscordId: s.discordId || '', Username: s.username || '',
              Type: s.type || '', Label: s.label || '', Reason: s.reason || '', Status: status, OpenedAt: s.opened || '',
              DecidedBy: fromOrg ? o.by : (s.by || o.by || ''), DecidedAt: fromOrg ? o.at : (s.at || o.at || ''), Thread: s.thread || ''};
    });
    /* Tickets decided here that the sheets no longer list are kept. */
    Object.keys(O).forEach(function (k) { if (!S[k]) rows.push(null); });
    var sh = tab('tickets'), vals = sh.getDataRange().getValues(), head = vals[0], ia = head.indexOf('Affiliation'), it = head.indexOf('TicketId');
    var keep = [head].concat(vals.slice(1).filter(function (r) {
      return String(r[ia] || DEFAULT_AFF).toLowerCase() !== ctx.aff || !S[String(r[it])];
    }));
    rows.filter(Boolean).forEach(function (o) { keep.push(TAB.tickets.cols.map(function (c) { return o[c] === undefined ? '' : o[c]; })); });
    sh.getRange(1, 1, keep.length, head.length).setValues(keep);
    if (vals.length > keep.length) sh.getRange(keep.length + 1, 1, vals.length - keep.length, head.length).clearContent();
     /* A decision typed on the Tickets tab sets the meeting cell too, as one made here does.
       Not on the first run: old decisions must not overwrite cells edited since. */
    if (!ctx.first) Object.keys(ch).forEach(function (k) { if (S[k] && ch[k] !== 'Pending') syncTicketCell_(ctx, S[k], k, ch[k]); });
  },
  writeSheet: function (ctx, ch, S, O) {
    var rs = sbook_(ctx.ids.records).getSheetByName('Attendance tickets'), ts = sbook_(ctx.ids.attendance).getSheetByName('Tickets');
    var rv = rs ? rs.getDataRange().getValues() : [], tv = ts ? ts.getDataRange().getValues() : [];
    var rh = rs ? shead_(rv, {status: /^status$/, by: /^decided by$/, at: /^decided at$/}) : null;
    var th = ts ? shead_(tv, {status: /^status$/, by: /^decided by$/}) : null;
    Object.keys(ch).forEach(function (k) {
      var s = S[k], o = O[k] || {}, status = ch[k];
      if (!s) return;                                  // only tickets the bot opened are written back
      if (rh && s.recRow) {
        rs.getRange(s.recRow, rh.col.status + 1).setValue(status === 'Pending' ? 'open' : status);
        rs.getRange(s.recRow, rh.col.by + 1).setValue(o.by || '');
        rs.getRange(s.recRow, rh.col.at + 1).setValue(o.at ? new Date(o.at).toISOString() : '');
      }
      if (th && s.tabRow) {
        ts.getRange(s.tabRow, th.col.status + 1).setValue(status);
        ts.getRange(s.tabRow, th.col.by + 1).setValue(o.by || '');
        var kind = status === 'Pending' ? 'Pending' : /^unexcused/i.test(status) ? 'Unexcused' : 'Excused';
        ts.getRange(s.tabRow, 1, 1, ts.getLastColumn()).setBackground(TICKET_COLORS_[kind]);
      }
      if (status !== 'Pending') syncTicketCell_(ctx, s, k, status);
    });
    return {};
  }
};
/* A decided ticket sets the member's cell on that meeting's tab, and clears
   the yellow and the pending note the bot left there. */
function syncTicketCell_(ctx, s, id, status) {
  var sh = sbook_(ctx.ids.attendance).getSheetByName(s.meeting);
  if (!sh) return;
  var v = sh.getDataRange().getValues();
  var h = shead_(v, {first: /^first/, last: sopt_(/^last/), att: /^attendance$/, handle: sopt_(/instagram|discord/)});
  if (!h) return;
  var want = flatName_(s.name), handle = sn_(s.username).replace(/^@/, '');
  for (var r = h.row + 1; r < v.length; r++) {
    var n = flatName_(attName_(v[r][h.col.first], h.col.last >= 0 ? v[r][h.col.last] : ''));
    var hd = h.col.handle >= 0 ? sn_(v[r][h.col.handle]).replace(/^@/, '') : '';
    if (!(handle && hd === handle) && !(want && n === want)) continue;
    var cell = sh.getRange(r + 1, h.col.att + 1);
    cell.setValue(status);
    var note = String(cell.getNote() || '').split('\n').filter(function (l) { return l.indexOf('Ticket ' + id + ' pending') < 0; }).join('\n');
    cell.setNote(note);
    cell.setBackground(null);
    return;
  }
}

/* SFBLC teams: one sheet row per team (confirmed tick, event, Person 1-4).
   The value compares the first four members, which is all a row holds. */
function teamVal_(confirmed, event, members) {
  return [confirmed ? '1' : '0', sclean_(event)].concat((members || []).slice(0, 4).map(sclean_).filter(String)).join('|');
}
var SYNC_ROSTER_ = null;
function syncSame_(a, b) {
  var f = function (x) {
    return String(x || '').split('|').map(function (n) { return flatName_(SYNC_ROSTER_ && n ? syncMatchName_(n, SYNC_ROSTER_) : n); }).join('|');
  };
  return f(a) === f(b);
}
function syncRows_(ctx, tabName, want) {
  var sh = sbook_(ctx.ids.master).getSheetByName(tabName);
  if (!sh) return null;
  var v = sh.getDataRange().getValues(), h = shead_(v, want);
  return h ? {sh: sh, v: v, h: h, persons: h.head.map(function (x, i) { return /^person/.test(x) ? i : -1; }).filter(function (i) { return i >= 0; })} : null;
}
/* Sheet row <-> item id comes from the base (Ref), so a team keeps its id
   here while its row keeps its place on the sheet. */
function syncRowKeys_(ctx, domain) {
  var B = syncBaseRead_(ctx.aff, domain), byRow = {};
  Object.keys(B).forEach(function (k) { if (B[k].ref != null) byRow[B[k].ref] = k; });
  return byRow;
}
function syncCfg_(ctx) { return ctx.cfg || (ctx.cfg = clubCfg_(ctx.aff)); }
/* On the first run, items an earlier one-off Import made are matched to the
   sheet rows they came from by content, so they keep their ids. */
function syncAdoptBy_(S, O, score) {
  var used = {};
  Object.keys(S).forEach(function (k) {
    var best = null, top = 0;
    Object.keys(O).forEach(function (ok) {
      if (used[ok] || S[ok]) return;
      var sc = score(S[k].v, O[ok].v);
      if (sc > top) { top = sc; best = ok; }
    });
    if (best && top >= 0.5) { used[best] = 1; S[best] = S[k]; delete S[k]; }
  });
}
/* After adoption, an item here that matches no sheet row is either left
   over from an old Import (gone from the sheet, so dropped) or was made
   here before the sync existed (kept here only, never pushed to the sheet). */
function syncSettle_(ctx, O, listKey, field, imported) {
  var cfg = syncCfg_(ctx), drop = {};
  Object.keys(O).forEach(function (k) {
    if (ctx.S[k]) return;
    if (imported.test(k)) drop[k] = 1; else O[k][field].local = true;
    delete O[k];
    ctx.dirty = true;
  });
  cfg[listKey] = (cfg[listKey] || []).filter(function (x) { return !(x && drop[x.id]); });
}
function overlap_(a, b) {
  var A = String(a).split('|').slice(2).map(flatName_), B = String(b).split('|').slice(2).map(flatName_);
  if (String(a).split('|')[1] !== String(b).split('|')[1] && sn_(String(a).split('|')[1]) !== sn_(String(b).split('|')[1])) return 0;
  var hit = A.filter(function (x) { return x && B.indexOf(x) > -1; }).length;
  return A.length || B.length ? hit / Math.max(A.length, B.length) : 1;
}
SYNC_ADAPT_.teams = {
  same: syncSame_,
  sheet: function (ctx) {
    var t = syncRows_(ctx, 'Teams', {p1: /^person 1$/}), out = {};
    if (!t) return out;
    var byRow = syncRowKeys_(ctx, 'teams');
    for (var r = t.h.row + 1; r < t.v.length; r++) {
      var ev = sclean_(t.v[r][1]), mem = t.persons.map(function (c) { return sclean_(t.v[r][c]); }).filter(String);
      if (!ev && !mem.length) continue;
      out[byRow[r + 1] || 'sh-t' + (r + 1)] = {v: teamVal_(strue_(t.v[r][0]), ev, mem), ref: r + 1, event: ev, members: mem, confirmed: strue_(t.v[r][0])};
    }
    return out;
  },
  org: function (ctx) {
    var out = {};
    (syncCfg_(ctx).teams || []).forEach(function (t) {
      if (!t || t.kind !== 'flc' || t.local) return;
      out[t.id] = {v: teamVal_(t.confirmed, t.event, t.members), team: t};
    });
    return out;
  },
  adopt: function (ctx, S, O) { syncAdoptBy_(S, O, overlap_); syncSettle_(ctx, O, 'teams', 'team', /^mst-/); },
  writeOrg: function (ctx, ch, S, O) {
    var cfg = syncCfg_(ctx);
    var teams = (cfg.teams || []).slice(), n = {};
    teams.forEach(function (t) { if (t && t.kind === 'flc') n[t.event] = (n[t.event] || 0) + 1; });
    Object.keys(ch).forEach(function (k) {
      var i = -1;
      teams.forEach(function (t, j) { if (t && t.id === k) i = j; });
      if (!ch[k]) { if (i >= 0) teams.splice(i, 1); return; }
      var s = S[k], roster = syncRoster_(ctx.aff), mem = s.members.map(function (m) { return syncMatchName_(m, roster); });
      if (i >= 0) {
        var t = JSON.parse(JSON.stringify(teams[i]));
        var extra = (t.members || []).slice(4);     // a fifth member here has no cell on the sheet
        t.event = s.event; t.members = mem.concat(extra); t.confirmed = s.confirmed;
        teams[i] = t;
      } else {
        n[s.event] = (n[s.event] || 0) + 1;
        teams.push({id: k, kind: 'flc', event: s.event, name: s.event + ' ' + n[s.event], members: mem, confirmed: s.confirmed,
                    track: 'k', client: '', pms: [], initiatives: [], assign: {}});
      }
    });
    cfg.teams = teams;
    syncCfgSave_(ctx.aff, cfg);
  },
  writeSheet: function (ctx, ch, S, O) {
    var t = syncRows_(ctx, 'Teams', {p1: /^person 1$/}), refs = {};
    if (!t) return refs;
    var bool = t.v.slice(t.h.row + 1).some(function (r) { return typeof r[0] === 'boolean'; });
    var next = t.v.length + 1;
    for (var r = t.v.length - 1; r > t.h.row; r--) { if (t.v[r].slice(1, 6).join('')) break; next = r + 1; }
    Object.keys(ch).forEach(function (k) {
      var row = S[k] ? S[k].ref : null, o = O[k];
      if (!ch[k]) { if (row) t.sh.getRange(row, 2, 1, 1 + t.persons.length).clearContent(); return; }
      var tm = o.team;
      if (!row) row = next++;
      t.sh.getRange(row, 1).setValue(bool ? !!tm.confirmed : (tm.confirmed ? 'TRUE' : 'FALSE'));
      t.sh.getRange(row, 2).setValue(tm.event || '');
      t.persons.forEach(function (c, j) { t.sh.getRange(row, c + 1).setValue((tm.members || [])[j] || ''); });
      refs[k] = row;
    });
    return refs;
  }
};

/* Rooms: room label, room type, gender and Person 1-4. */
function roomVal_(label, type, gender, members) {
  return [sclean_(label), sclean_(type), sclean_(gender)].concat((members || []).slice(0, 4).map(sclean_).filter(String)).join('|');
}
function roomGroup_(g) { return /wom|fem|girl/i.test(g) ? 'w' : /\bmen\b|^male|boy/i.test(g) ? 'm' : 'x'; }
SYNC_ADAPT_.rooms = {
  same: syncSame_,
  sheet: function (ctx) {
    var t = syncRows_(ctx, 'Rooming Assignments', {type: /room type/, gender: /gender/, p1: /^person 1$/}), out = {};
    if (!t) return out;
    var byRow = syncRowKeys_(ctx, 'rooms');
    for (var r = t.h.row + 1; r < t.v.length; r++) {
      var lab = sclean_(t.v[r][0]), mem = t.persons.map(function (c) { return sclean_(t.v[r][c]); }).filter(String);
      if (!mem.length && !/\d/.test(lab)) continue;
      var type = sclean_(t.v[r][t.h.col.type]), g = sclean_(t.v[r][t.h.col.gender]);
      out[byRow[r + 1] || 'sh-r' + (r + 1)] = {v: roomVal_(lab, type, g, mem), ref: r + 1, label: lab, type: type, gender: g, members: mem};
    }
    return out;
  },
  org: function (ctx) {
    var out = {};
    (syncCfg_(ctx).rooms || []).forEach(function (rm) {
      if (!rm || rm.local) return;
      var lab = rm.label != null ? rm.label : ('Room ' + (rm.no || '')).trim();
      out[rm.id] = {v: roomVal_(lab, rm.type || '', rm.gender || ({w: 'Female', m: 'Male'})[rm.group] || '', rm.members), room: rm, label: lab};
    });
    return out;
  },
  adopt: function (ctx, S, O) {
    syncAdoptBy_(S, O, function (a, b) {
      var A = String(a).split('|').slice(3).map(flatName_), B = String(b).split('|').slice(3).map(flatName_);
      var hit = A.filter(function (x) { return x && B.indexOf(x) > -1; }).length;
      return A.length || B.length ? hit / Math.max(A.length, B.length) : 0;
    });
    syncSettle_(ctx, O, 'rooms', 'room', /^mst-r/);
  },
  writeOrg: function (ctx, ch, S) {
    var cfg = syncCfg_(ctx), rooms = (cfg.rooms || []).slice();
    var roster = syncRoster_(ctx.aff);
    Object.keys(ch).forEach(function (k) {
      var i = -1;
      rooms.forEach(function (rm, j) { if (rm && rm.id === k) i = j; });
      if (!ch[k]) { if (i >= 0) rooms.splice(i, 1); return; }
      var s = S[k], no = (s.label.match(/\d+/) || [''])[0];
      var rm = i >= 0 ? JSON.parse(JSON.stringify(rooms[i])) : {id: k};
      rm.label = s.label; rm.no = no.slice(0, 12); rm.type = s.type; rm.gender = s.gender; rm.group = roomGroup_(s.gender);
      rm.name = (s.label || 'Room ' + no) + (s.type ? ' · ' + s.type : '');
      rm.members = s.members.map(function (m) { return syncMatchName_(m, roster); }).concat((rm.members || []).slice(4));
      if (i >= 0) rooms[i] = rm; else rooms.push(rm);
    });
    cfg.rooms = rooms;
    syncCfgSave_(ctx.aff, cfg);
  },
  writeSheet: function (ctx, ch, S, O) {
    var t = syncRows_(ctx, 'Rooming Assignments', {type: /room type/, gender: /gender/, p1: /^person 1$/}), refs = {};
    if (!t) return refs;
    var next = t.v.length + 1;
    for (var r = t.v.length - 1; r > t.h.row; r--) { if (t.v[r].join('').replace(/false|true/gi, '')) break; next = r + 1; }
    Object.keys(ch).forEach(function (k) {
      var row = S[k] ? S[k].ref : null, o = O[k];
      if (!ch[k]) { if (row) t.persons.forEach(function (c) { t.sh.getRange(row, c + 1).clearContent(); }); return; }
      var rm = o.room;
      if (!row) { row = next++; t.sh.getRange(row, 1).setValue(o.label); }
      t.sh.getRange(row, t.h.col.type + 1).setValue(rm.type || '');
      t.sh.getRange(row, t.h.col.gender + 1).setValue(rm.gender || ({w: 'Female', m: 'Male'})[rm.group] || '');
      t.persons.forEach(function (c, j) { t.sh.getRange(row, c + 1).setValue((rm.members || [])[j] || ''); });
      refs[k] = row;
    });
    return refs;
  }
};

/* Itinerary: the rows of the Itinerary tab and the schedule items they made
   (src 'master'). A date is written on the sheet only on the first row of
   each day, so a row's day is carried down from the last date above it.
   Items added here (any other src) stay here; edits and deletes of the
   sheet's own items go back. */
function itinDays_(cfg) {
  var info = cfg.sfInfo || {}, a = new Date((info.start || '2026-11-13') + 'T12:00:00'), b = new Date((info.end || '2026-11-15') + 'T12:00:00'), out = [];
  for (var d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) out.push(new Date(d));
  return out;
}
function isoDay_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function itinDay_(label, days) {
  var s = String(label || ''), n = +(s.match(/\d{1,2}/) || [0])[0];
  for (var i = 0; i < days.length; i++) {
    if (n && days[i].getDate() === n) return isoDay_(days[i]);
    if (!n && Utilities.formatDate(days[i], Session.getScriptTimeZone(), 'EEE').toLowerCase() === s.slice(0, 3).toLowerCase()) return isoDay_(days[i]);
  }
  return '';
}
function itinDayLabel_(iso) {
  var d = new Date(iso + 'T12:00:00'), n = d.getDate();
  var th = (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({1: 'st', 2: 'nd', 3: 'rd'})[n % 10] || 'th';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'EEEE') + ' ' + n + th;
}
function hhmm_(t) {
  if (Object.prototype.toString.call(t) === '[object Date]') return Utilities.formatDate(t, Session.getScriptTimeZone(), 'HH:mm');
  var m = String(t || '').match(/(\d{1,2})(?::(\d{2}))?\s*([ap])/i);
  if (!m) return '';
  var h = +m[1] % 12 + (/p/i.test(m[3]) ? 12 : 0);
  return (h < 10 ? '0' : '') + h + ':' + (m[2] || '00');
}
function ampm_(hh) {
  var m = String(hh || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  var h = +m[1];
  return (h % 12 || 12) + ':' + m[2] + ' ' + (h < 12 ? 'AM' : 'PM');
}
function itinVal_(date, start, title, note) { return [date, start, sclean_(title), sclean_(note)].join('|'); }
function itinKind_(what) {
  return /check|arriv|depart|carpool|bus|drive/i.test(what) ? 'travel' : /comp|present|round|case/i.test(what) ? 'comp'
    : /social|dinner|picture|photo|party/i.test(what) ? 'social' : 'general';
}
SYNC_ADAPT_.itinerary = {
  sheet: function (ctx) {
    var t = syncRows_(ctx, 'Itinerary', {date: /^date$/, time: /^time$/, what: /^activity$/, note: sopt_(/^notes?$/)}), out = {};
    if (!t) return out;
    var byRow = syncRowKeys_(ctx, 'itinerary'), days = itinDays_(syncCfg_(ctx)), day = '';
    for (var r = t.h.row + 1; r < t.v.length; r++) {
      var dl = t.v[r][t.h.col.date];
      if (sclean_(dl)) day = Object.prototype.toString.call(dl) === '[object Date]' ? isoDay_(dl) : itinDay_(dl, days) || day;
      var what = sclean_(t.v[r][t.h.col.what]);
      if (!what || !day) continue;
      var tm = hhmm_(t.v[r][t.h.col.time]), note = t.h.col.note >= 0 ? sclean_(t.v[r][t.h.col.note]) : '';
      out[byRow[r + 1] || 'sh-it' + (r + 1)] = {v: itinVal_(day, tm, what, note), ref: r + 1, date: day, start: tm, title: what, note: note,
                                                 dated: !!sclean_(dl), carried: day};
    }
    return out;
  },
  org: function (ctx) {
    var out = {};
    (syncCfg_(ctx).sfSchedule || []).forEach(function (x) {
      if (x && x.src === 'master') out[x.id] = {v: itinVal_(x.date, x.start, x.title, x.note), item: x};
    });
    return out;
  },
  adopt: function (ctx, S, O) {
    syncAdoptBy_(S, O, function (a, b) {
      var A = String(a).split('|'), B = String(b).split('|');
      return (A[0] === B[0] ? 0.25 : 0) + (A[1] === B[1] ? 0.25 : 0) + (flatName_(A[2]) === flatName_(B[2]) ? 0.5 : 0);
    });
    syncSettle_(ctx, O, 'sfSchedule', 'item', /^(it-|mst-)/);
  },
  writeOrg: function (ctx, ch, S) {
    var cfg = syncCfg_(ctx), list = (cfg.sfSchedule || []).slice();
    Object.keys(ch).forEach(function (k) {
      var i = -1;
      list.forEach(function (x, j) { if (x && x.id === k) i = j; });
      if (!ch[k]) { if (i >= 0) list.splice(i, 1); return; }
      var s = S[k], x = i >= 0 ? JSON.parse(JSON.stringify(list[i]))
        : {id: k, end: '', where: '', kind: itinKind_(s.title), 'for': {tags: ['sfblc'], names: []}, src: 'master'};
      x.date = s.date; x.start = s.start; x.title = s.title.slice(0, 80); x.note = s.note.slice(0, 160);
      if (i >= 0) list[i] = x; else list.push(x);
    });
    cfg.sfSchedule = list;
    syncCfgSave_(ctx.aff, cfg);
  },
  writeSheet: function (ctx, ch, S, O) {
    var t = syncRows_(ctx, 'Itinerary', {date: /^date$/, time: /^time$/, what: /^activity$/, note: sopt_(/^notes?$/)}), refs = {};
    if (!t) return refs;
    Object.keys(ch).forEach(function (k) {
      var s = S[k], o = O[k];
      if (!s) return;                       // a row is never added for an item made here
      if (!ch[k]) {
        [t.h.col.time, t.h.col.what, t.h.col.note].forEach(function (c) { if (c >= 0) t.sh.getRange(s.ref, c + 1).clearContent(); });
        return;
      }
      var x = o.item;
      t.sh.getRange(s.ref, t.h.col.time + 1).setValue(ampm_(x.start));
      t.sh.getRange(s.ref, t.h.col.what + 1).setValue(x.title || '');
      if (t.h.col.note >= 0) t.sh.getRange(s.ref, t.h.col.note + 1).setValue(x.note || '');
      if (x.date && x.date !== s.carried) t.sh.getRange(s.ref, t.h.col.date + 1).setValue(itinDayLabel_(x.date));
    });
    return refs;
  }
};

/* Discord: every verified profile the bot recorded, linked to a member by
   name. A link an officer set (MatchedBy "officer") is never redone. This
   one only reads: the bot owns its records. */
function syncDiscord_(aff) {
  var ids = SYNC_[aff];
  var sh = sbook_(ids.records).getSheetByName('Verified members');
  if (!sh) return null;
  var v = sh.getDataRange().getValues(), h = shead_(v, {id: /^discord id$/, user: /^username$/, name: /^name$/,
    major: sopt_(/^major$/), cwid: sopt_(/^cwid$/), at: sopt_(/^verified at$/)});
  if (!h) return null;
  var roster = syncRoster_(aff), have = {};
  readScoped('discord', aff).forEach(function (r) { have[String(r.DiscordId)] = r; });
  var rows = [], now = new Date();
  for (var r = h.row + 1; r < v.length; r++) {
    var did = sclean_(v[r][h.col.id]);
    if (!did) continue;
    var old = have[did] || {}, name = sclean_(v[r][h.col.name]);
    /* A link an officer set, or their "not a member", is kept as they left it. */
    var officer = String(old.MatchedBy) === 'officer' || String(old.MatchedBy) === 'none';
    var match = officer ? old.MemberName : syncMatchName_(name, roster);
    rows.push({Affiliation: aff, DiscordId: did, Username: sclean_(v[r][h.col.user]), Name: name,
               Major: h.col.major >= 0 ? sclean_(v[r][h.col.major]) : '', CWID: h.col.cwid >= 0 ? sclean_(v[r][h.col.cwid]) : '',
               VerifiedAt: h.col.at >= 0 ? v[r][h.col.at] : '',
               MemberName: officer ? match : (roster[flatName_(match)] ? match : ''), MatchedBy: officer ? String(old.MatchedBy) : (roster[flatName_(match)] ? 'name' : ''),
               UpdatedAt: now});
    delete have[did];
  }
  var t = tab('discord'), vals = t.getDataRange().getValues(), head = vals[0], ia = head.indexOf('Affiliation');
  var keep = [head].concat(vals.slice(1).filter(function (x) { return String(x[ia] || DEFAULT_AFF).toLowerCase() !== aff; }));
  rows.forEach(function (o) { keep.push(TAB.discord.cols.map(function (c) { return o[c] === undefined ? '' : o[c]; })); });
  t.getRange(1, 1, keep.length, head.length).setValues(keep);
  if (vals.length > keep.length) t.getRange(keep.length + 1, 1, vals.length - keep.length, head.length).clearContent();
  return {domain: 'discord', profiles: rows.length, linked: rows.filter(function (o) { return o.MemberName; }).length};
}

/* ---- the actions the dashboard calls (dispatch routes here) ---- */
function syncAction_(action, payload, aff, id, email) {
  var p = payload || {};
  switch (action) {
    case 'syncStatus': {
      var props = syncProps_(), ids = SYNC_[aff] || null;
      var log = readScoped('syncLog', aff).slice(-60).reverse().map(function (r) {
        return {at: r.At, domain: r.Domain, key: r.Key, dir: r.Direction, from: r.From, to: r.To, why: r.Why};
      });
      var counts = {};
      readScoped('syncBase', aff).forEach(function (r) { counts[r.Domain] = (counts[r.Domain] || 0) + 1; });
      return {ok: true, linked: !!ids, sheets: ids || {}, counts: counts, log: log,
              ranAt: Number(props.getProperty('syncRunAt:' + aff) || 0) || null,
              errors: String(props.getProperty('syncErr:' + aff) || '').split('\n').filter(String),
              triggers: !!props.getProperty('syncTriggers')};
    }
    case 'syncNow': {
      if (!SYNC_[aff]) return {ok: false, error: 'This club has no linked sheets.'};
      try { syncInstall_(); } catch (e) {}
      var r = syncRun_(aff, null, 'Sync now');
      return {ok: r.ok, ran: r.ran, errors: r.errors, error: r.errors && r.errors.length ? r.errors.join('; ') : r.error};
    }
    case 'ticketList': {
      return {ok: true, tickets: readScoped('tickets', aff).map(function (r) {
        return {id: String(r.TicketId), meeting: r.Meeting, name: r.Name, username: r.Username, type: r.Type, label: r.Label,
                reason: r.Reason, status: r.Status, opened: r.OpenedAt, by: r.DecidedBy, at: r.DecidedAt};
      })};
    }
    case 'ticketDecide': {
      var tid = String(p.id || ''), st = ticketStatus_(p.status);
      if (['Excused Late', 'Unexcused Late', 'Excused Abscence', 'Unexcused Abscence', 'Present', 'Pending'].indexOf(st) < 0)
        return {ok: false, error: 'Unknown status.'};
      var sh = tab('tickets'), vals = sh.getDataRange().getValues(), head = vals[0], hit = -1;
      for (var i = 1; i < vals.length; i++)
        if (String(vals[i][head.indexOf('TicketId')]) === tid && String(vals[i][head.indexOf('Affiliation')] || DEFAULT_AFF).toLowerCase() === aff) hit = i;
      if (hit < 0) return {ok: false, error: 'That ticket is not here yet. Try Sync now.'};
      sh.getRange(hit + 1, head.indexOf('Status') + 1).setValue(st);
      sh.getRange(hit + 1, head.indexOf('DecidedBy') + 1).setValue(st === 'Pending' ? '' : (id.name || email));
      sh.getRange(hit + 1, head.indexOf('DecidedAt') + 1).setValue(st === 'Pending' ? '' : new Date().toISOString());
      var res = syncAfterOrg_(aff, ['tickets'], 'decided in the Org System') || {};
      /* Its meeting cell changed on the sheet; carry that into attendance here too. */
      try { syncRun_(aff, ['attendance'], 'ticket decided'); } catch (e) {}
      return {ok: true, status: st, synced: !!(res && res.ok), errors: res && res.errors};
    }
    case 'discordList': {
      return {ok: true, profiles: readScoped('discord', aff).map(function (r) {
        return {id: String(r.DiscordId), username: r.Username, name: r.Name, major: r.Major, verifiedAt: r.VerifiedAt,
                member: r.MemberName, by: r.MatchedBy};
      })};
    }
    case 'discordLink': {
      /* member: the roster name; '' unlinks (the name match may link it again); none: true marks it not a member. */
      var did = String(p.discordId || ''), who = p.none ? '' : sclean_(p.member).slice(0, 80), by = p.none ? 'none' : who ? 'officer' : '';
      var t = tab('discord'), dv = t.getDataRange().getValues(), dh = dv[0], row = -1;
      for (var j = 1; j < dv.length; j++)
        if (String(dv[j][dh.indexOf('DiscordId')]) === did && String(dv[j][dh.indexOf('Affiliation')] || DEFAULT_AFF).toLowerCase() === aff) row = j;
      if (row < 0) return {ok: false, error: 'No such Discord profile.'};
      t.getRange(row + 1, dh.indexOf('MemberName') + 1).setValue(who);
      t.getRange(row + 1, dh.indexOf('MatchedBy') + 1).setValue(by);
      return {ok: true, member: who, by: by};
    }
  }
  return {ok: false, error: 'Unknown action.'};
}
