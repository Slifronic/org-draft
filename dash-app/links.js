/* Links: every link the chapter's members use, in one place. Officers keep
   the list (cfg.links for members, cfg.officerLinks for officers only, which
   the backend never sends to members); links the Org System already knows
   (the sign-up form, orientation, the calendar, the linked and synced sheets)
   are added on their own and edited where they live. */
'use strict';

var LINK_GROUPS = ['Start here', 'Meetings & attendance', 'Homework & resources', 'SFBLC & competitions', 'Consulting',
                   'Community', 'Dues & forms', 'Officers only'];
var LK = {q: '', edit: null};
(function () {
  var at = 0;
  NAV.forEach(function (n, i) { if (n.id === 'calendar') at = i + 1; });
  NAV.splice(at, 0, {id: 'links', label: 'Links', short: 'Links', group: 'Chapter'});
})();

function lkSafe(u) { u = String(u || '').trim(); return /^https?:\/\/[^\s<>"]+$/i.test(u) || /^\/[^\s<>"]*$/.test(u) ? u : ''; }
function lkHost(u) {
  if (u.charAt(0) === '/') return location.host;
  var m = u.match(/^https?:\/\/([^/]+)/i); return m ? m[1].replace(/^www\./, '') : '';
}
/* What kind of thing a link opens, from its address. */
function lkKind(u) {
  var s = String(u);
  if (/docs\.google\.com\/forms|forms\.gle/.test(s)) return 'Form';
  if (/docs\.google\.com\/spreadsheets/.test(s)) return 'Sheet';
  if (/docs\.google\.com\/document/.test(s)) return 'Doc';
  if (/docs\.google\.com\/presentation/.test(s)) return 'Slides';
  if (/drive\.google\.com/.test(s)) return 'Drive';
  if (/calendar\.google\.com/.test(s)) return 'Calendar';
  if (/discord\.(gg|com)/.test(s)) return 'Discord';
  if (/instagram\.com/.test(s)) return 'Instagram';
  if (/groupme\.com/.test(s)) return 'GroupMe';
  if (/linktr\.ee/.test(s)) return 'Linktree';
  if (/fbla\.org|bluepanda/i.test(s)) return 'FBLA';
  if (/zoom\.us/.test(s)) return 'Zoom';
  return 'Link';
}
function lkSheet(id) { return 'https://docs.google.com/spreadsheets/d/' + id + '/edit'; }

/* Links the Org System already holds, so nobody has to type them twice. */
function lkAuto() {
  var c = M.cfg || {}, out = [];
  var add = function (o) { if (lkSafe(o.url)) out.push(Object.assign({auto: true, id: 'auto:' + o.url}, o)); };
  if (c.formUrl) add({title: 'Club sign-up form', url: c.formUrl, group: 'Start here', note: 'Everyone fills this in once when they join.'});
  add({title: 'Orientation', url: '/orientation', group: 'Start here', note: 'A 2½-minute tour of how the chapter and this site work.'});
  /* The bare calendar address opens whoever is signed in's own calendar; only a shared one is worth listing. */
  if (c.calShare && /[?&](cid|src)=/.test(c.calShare)) add({title: 'Chapter calendar', url: c.calShare, group: 'Meetings & attendance', note: 'Add it to your own Google Calendar.'});
  if (M.officer) {
    if (c.formEditUrl) add({title: 'Sign-up form (edit)', url: c.formEditUrl, group: 'Officers only', officer: true});
    if (c.sheetUrl) add({title: 'Sign-up responses', url: c.sheetUrl, group: 'Officers only', officer: true});
    var seen = {};
    (typeof SOURCES !== 'undefined' ? SOURCES : []).forEach(function (s) {
      if (!s.sheet || seen[s.sheet]) return; seen[s.sheet] = 1;
      add({title: s.label.replace(/\s*·.*$/, ''), url: lkSheet(s.sheet), group: 'Officers only', officer: true, note: 'Linked sheet: ' + (s.about || '')});
    });
  }
  return out;
}
function lkStored(officer) { return ((officer ? M.cfg.officerLinks : M.cfg.links) || []).filter(function (l) { return l && l.id && lkSafe(l.url); }); }
function lkAll() {
  var list = lkStored(false).concat(M.officer ? lkStored(true).map(function (l) { return Object.assign({officer: true}, l); }) : []);
  if (!list.length && M.demo) list = LK_DEMO;
  var urls = {}; list.forEach(function (l) { urls[l.url] = 1; });
  return list.concat(lkAuto().filter(function (l) { return !urls[l.url]; }));
}
function lkMatch(l, q) { return !q || (l.title + ' ' + (l.note || '') + ' ' + l.url + ' ' + l.group).toLowerCase().indexOf(q) > -1; }

function lkRow(l) {
  var ext = l.url.charAt(0) !== '/';
  return '<li class="lkrow"><span class="lkkind">' + esc(lkKind(l.url)) + '</span>' +
    '<div class="lkmain"><a class="lkt" href="' + esc(l.url) + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + esc(l.title) + '</a>' +
    '<p class="meta"><span>' + esc(lkHost(l.url)) + (l.note ? ' · ' + esc(l.note) : '') + (l.auto ? ' · from the Org System' : '') + '</span></p></div>' +
    '<div class="lkacts"><button class="qbtn" data-act="lkCopy" data-url="' + esc(l.url) + '" aria-label="Copy the link to ' + esc(l.title) + '">' + icon('link') + '<span>Copy</span></button>' +
    (M.officer && !l.auto ? '<button class="qbtn" data-act="lkEdit" data-id="' + esc(l.id) + '" aria-label="Edit ' + esc(l.title) + '">' + icon('more') + '<span>Edit</span></button>' : '') +
    '</div></li>';
}
VIEWS.links = function () {
  var q = LK.q.trim().toLowerCase(), all = lkAll().filter(function (l) { return lkMatch(l, q); });
  var h = head('Chapter', 'Links', M.officer ? '<button class="btn sm" data-act="lkNew">' + icon('plus') + 'Add a link</button>' : '');
  h += '<section class="toolbar"><input id="lkq" class="mini" type="search" placeholder="Find a link" value="' + esc(LK.q) + '" aria-label="Find a link"></section>';
  var pins = all.filter(function (l) { return l.pin; });
  if (pins.length && !q) h += '<section class="card"><header><h3>Most used</h3></header><ul class="lklist">' + pins.map(lkRow).join('') + '</ul></section>';
  var any = false;
  LINK_GROUPS.forEach(function (g) {
    var rows = all.filter(function (l) { return (l.group || 'Start here') === g && (q || !l.pin); });
    if (!rows.length) return;
    any = true;
    h += '<section class="card"><header><h3>' + esc(g) + '</h3><span class="count">' + rows.length + '</span></header>' +
      (g === 'Officers only' ? '<p class="meta">Members never see this section.</p>' : '') + '<ul class="lklist">' + rows.map(lkRow).join('') + '</ul></section>';
  });
  if (!any && !pins.length) h += empty(q ? 'No link matches' : 'No links yet', q ? 'Try another word.' : (M.officer ? 'Add the links members ask for most: forms, Discord, the calendar, SFBLC registration.' : 'Officers have not added any links yet.'));
  return h;
};
/* A few pinned links on everyone's Overview, so the usual ones are one tap away. */
var lkOverview = VIEWS.overview;
VIEWS.overview = function () {
  var base = lkOverview.apply(this, arguments), pins = lkAll().filter(function (l) { return l.pin && !l.officer; }).slice(0, 6);
  if (!pins.length) return base;
  return base + '<section class="card"><header><h3>Quick links</h3><a class="qbtn" href="#links">All links</a></header><ul class="lklist">' + pins.map(lkRow).join('') + '</ul></section>';
};

document.addEventListener('input', function (e) {
  if (e.target.id !== 'lkq') return;
  LK.q = e.target.value;
  clearTimeout(LK.t);
  LK.t = setTimeout(function () { render(); var i = $('lkq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 160);
});
ACT_EXT.lkCopy = function (el, d) {
  var u = d.url.charAt(0) === '/' ? location.origin + d.url : d.url;
  (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('Link copied.'); }, function () { toast(u); });
};
function lkForm(l) {
  l = l || {group: 'Start here'};
  return '<form class="form" data-act="lkSave"' + (l.id ? ' data-id="' + esc(l.id) + '"' : '') + '><header class="sh"><h3>' + (l.id ? 'Edit link' : 'Add a link') + '</h3></header>' +
    '<label class="fld"><span>Name</span><input name="title" maxlength="80" required value="' + esc(l.title || '') + '" placeholder="Track interest form"></label>' +
    '<label class="fld"><span>Address</span><input name="url" type="url" maxlength="500" required value="' + esc(l.url || '') + '" placeholder="https://"></label>' +
    '<label class="fld"><span>Section</span><select name="group">' + LINK_GROUPS.map(function (g) { return '<option' + (g === l.group ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select></label>' +
    '<label class="fld"><span>Note (optional)</span><input name="note" maxlength="140" value="' + esc(l.note || '') + '" placeholder="Due Nov 6"></label>' +
    '<label class="tick"><input type="checkbox" name="pin"' + (l.pin ? ' checked' : '') + '><span>Show on everyone\'s Overview (Most used)</span></label>' +
    '<p class="meta">Links in "Officers only" are never sent to members.</p>' +
    '<div class="sheetacts"><button class="btn">Save</button>' + (l.id ? '<button type="button" class="btn ghost" data-act="lkDel" data-id="' + esc(l.id) + '">Delete</button>' : '') + '</div></form>';
}
function lkFind(id) {
  var a = lkStored(false).filter(function (l) { return l.id === id; })[0];
  if (a) return a;
  var b = lkStored(true).filter(function (l) { return l.id === id; })[0];
  return b ? Object.assign({officer: true}, b) : null;
}
ACT_EXT.lkNew = function () { openSheet(lkForm(null)); };
ACT_EXT.lkEdit = function (el, d) { var l = lkFind(d.id); if (l) openSheet(lkForm(l)); };
SUBMIT_EXT.lkSave = function (f) {
  var id = f.getAttribute('data-id'), url = lkSafe(f.url.value);
  if (!url) return toast('Use a full address starting with https://', true);
  var group = LINK_GROUPS.indexOf(f.group.value) > -1 ? f.group.value : 'Start here', officer = group === 'Officers only';
  var item = {id: id || 'lk' + Date.now().toString(36), title: clean(f.title.value, 80), url: url, group: group, note: clean(f.note.value, 140), pin: !!f.pin.checked && !officer};
  var mem = lkStored(false).filter(function (l) { return l.id !== item.id; }), off = lkStored(true).filter(function (l) { return l.id !== item.id; });
  var put = function (list) {
    var at = -1; (id ? (officer ? lkStored(true) : lkStored(false)) : []).forEach(function (l, i) { if (l.id === id) at = i; });
    if (at > -1) list.splice(at, 0, item); else list.push(item);
  };
  put(officer ? off : mem);
  closeSheet();
  saveCfg({links: mem, officerLinks: off}, id ? 'Link saved.' : 'Link added.');
};
ACT_EXT.lkDel = function (el, d) {
  var l = lkFind(d.id); if (!l) return;
  confirmSheet('Delete "' + l.title + '"?', 'It goes from the Links page for everyone.', 'Delete', function () {
    saveCfg({links: lkStored(false).filter(function (x) { return x.id !== d.id; }), officerLinks: lkStored(true).filter(function (x) { return x.id !== d.id; })}, 'Link deleted.');
  });
};
if (typeof TOOLS !== 'undefined') TOOLS.push(['Links', 'Every link members use, in one place: add, pin and sort them', '#links']);

/* The demo club's links (shown only in the demo, never saved). */
var LK_DEMO = [
  {id: 'd1', title: 'Discord server', url: 'https://discord.gg/example', group: 'Community', pin: true, note: 'Verify with the PBL Verify bot when you join.'},
  {id: 'd2', title: 'Attendance ticket (late or absent)', url: 'https://discord.com/channels/example', group: 'Meetings & attendance', pin: true, note: 'Open it before the meeting starts.'},
  {id: 'd3', title: 'Track interest form', url: 'https://forms.gle/example-track', group: 'Dues & forms', note: 'Rank consulting clients and case tracks.'},
  {id: 'd4', title: 'FBLA Connect (dues and SFBLC sign-up)', url: 'https://connect.fbla.org/app/login', group: 'SFBLC & competitions', pin: true},
  {id: 'd5', title: 'Homework folder', url: 'https://drive.google.com/drive/folders/example', group: 'Homework & resources'},
  {id: 'd6', title: 'Instagram', url: 'https://instagram.com/deanzapbl', group: 'Community'}
];
