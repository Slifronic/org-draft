/* Carpools for SFBLC: everyone says whether they drive (and how many seats),
   need a ride, or get there on their own, and where the car starts or picks
   them up. Riders join a car with an open seat and officers fill the gaps.
   Entries live in their own backend row (rideList, rideSave, rideAssign in
   Code.gs) because a member cannot write the club record; a phone number and
   a home address only reach officers and your own car. Officers can also make
   a Google Form with a QR code; its sheet syncs with these rides both ways. */
'use strict';

var RIDES = {list: [], ready: null, err: ''};
var RIDE_FROM = {deanza: 'De Anza College', addr: 'An address', hotel: 'Meet at the hotel'};
var RIDE_ROLE = {driver: ['I can drive', 'Offer seats in your car'], rider: ['I need a ride', 'Join a car with an open seat'], own: ['I have my own way', 'Parents, train, already there']};
var DEANZA_Q = 'De Anza College, 21250 Stevens Creek Blvd, Cupertino, CA';

function ridesLoad() {
  return call('rideList').then(function (r) {
    if (r && r.ok) { RIDES.list = r.rides || []; RIDES.ready = true; RIDES.err = ''; }
    else if (r && /unknown action/i.test(String(r.error || ''))) RIDES.ready = false;
    else RIDES.err = (r && r.error) || 'Carpools did not load.';
    if (ROUTE.view === 'sfblc' && ROUTE.sub === 'rides') render();
  });
}
BOOT_EXT.push(function () { ridesLoad(); });

function rideMe() { return RIDES.list.filter(function (x) { return x.who === M.me.key; })[0] || null; }
function rideCars() { return RIDES.list.filter(function (x) { return x.role === 'driver'; }); }
function rideRiders(car) { return RIDES.list.filter(function (x) { return x.role === 'rider' && x.car === car; }); }
function rideOpen(d) { return Math.max(0, (d.seats || 0) - rideRiders(d.who).length); }
function rideWaiting() { return RIDES.list.filter(function (x) { return x.role === 'rider' && !x.car; }); }
/* Going to SFBLC with no answer yet: the people officers chase. */
function rideMissing() {
  var has = {};
  RIDES.list.forEach(function (x) { has[x.who] = 1; });
  return M.people.filter(function (p) { return p.going && !has[p.key]; });
}

/* ---------- places and maps ----------
   Plain Google Maps links (no key, nothing sent until someone taps one). */
function rideFrom(x) { var f = x && x.from === 'other' ? 'addr' : x && x.from; return RIDE_FROM[f] ? f : 'deanza'; }
function rideHotelQ() { var i = sfInfo(); return i.venue + ', ' + i.city; }
/* What Maps should look for, or '' when the address is not ours to see. */
function ridePlaceQ(x) {
  var f = rideFrom(x);
  return f === 'deanza' ? DEANZA_Q : f === 'hotel' ? rideHotelQ() : x.addr || '';
}
function rideMap(q) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q); }
function rideDir(origin, dest, stops) {
  return 'https://www.google.com/maps/dir/?api=1' + (origin ? '&origin=' + encodeURIComponent(origin) : '') + '&destination=' + encodeURIComponent(dest) +
    (stops && stops.length ? '&waypoints=' + encodeURIComponent(stops.join('|')) : '') + '&travelmode=driving';
}
function rideWhere(x) {
  var f = rideFrom(x), q = ridePlaceQ(x);
  var label = f === 'addr' ? (x.addr ? esc(x.addr) : 'An address' + (x.area ? ' near ' + esc(x.area) : '')) : esc(RIDE_FROM[f]);
  return icon('pin') + label + (x.fromNote ? ' (' + esc(x.fromNote) + ')' : '') + (x.area && (f !== 'addr' || x.addr) ? ' · ' + esc(x.area) : '') +
    (q ? ' · <a href="' + esc(rideMap(q)) + '" target="_blank" rel="noopener">Map</a>' : '');
}
function ridePhone(x) {
  return x.phone ? '<a href="tel:' + esc(String(x.phone).replace(/[^0-9+]/g, '')) + '">' + esc(x.phone) + '</a>' : '';
}
function rideLine(x, driver) {
  var bits = [rideWhere(x)];
  if (driver && x.leave) bits.push('leaving Fri ' + esc(fmtTime(x.leave)));
  if (x.back) bits.push(driver ? 'driving back Sunday' : 'needs a ride back Sunday');
  if (x.phone) bits.push(ridePhone(x));
  return '<p class="meta">' + bits.join(' · ') + '</p>' + (x.note ? '<p class="mb sm">' + esc(x.note) + '</p>' : '');
}
/* A driver's riders in pickup order: the order they set, then the rest as they joined. */
function rideStops(d) {
  var rs = rideRiders(d.who), set = d.stops || [];
  return set.map(function (w) { return rs.filter(function (x) { return x.who === w; })[0]; }).filter(Boolean)
    .concat(rs.filter(function (x) { return set.indexOf(x.who) < 0; }));
}
/* Start, every pickup that is somewhere else, then the hotel. Riders meeting at the hotel are not stops. */
function rideRoute(d) {
  var start = ridePlaceQ(d), seen = {}, stops = [];
  if (!start) return '';
  seen[start] = 1;
  rideStops(d).forEach(function (x) { var q = ridePlaceQ(x); if (q && rideFrom(x) !== 'hotel' && !seen[q]) { seen[q] = 1; stops.push(q); } });
  return rideDir(start, rideHotelQ(), stops);
}

function ridesView() {
  if (RIDES.ready === false) return '<p class="note warn">' + icon('clock') + '<span>Carpools work once the backend update is deployed.</span></p>';
  if (RIDES.ready === null) return RIDES.err ? empty('Carpools did not load', RIDES.err, '<button class="btn sm" data-act="rideReload">Try again</button>')
    : '<div class="loading"><span></span><span></span><span></span></div>';
  var h = '';
  if (M.officer) {
    var cars = rideCars(), open = 0, seats = 0, wait = rideWaiting(), miss = rideMissing(), going = M.people.filter(function (p) { return p.going; }).length;
    cars.forEach(function (d) { seats += d.seats || 0; open += rideOpen(d); });
    h += '<section class="kpis">' +
      kpi('Cars', cars.length, plural(seats, 'seat') + ' for riders', '#sfblc/rides') +
      kpi('Open seats', open, open ? 'Riders can still join' : cars.length ? 'Every car is full' : 'No drivers yet', '#sfblc/rides', open || !wait.length ? '' : 'warn') +
      kpi('Waiting for a car', wait.length, wait.length ? '<b>Put them in a car</b>' : 'None', '#sfblc/rides', wait.length ? 'warn' : '') +
      kpi('No answer yet', miss.length, 'of ' + going + ' going to SFBLC', '#sfblc/rides', miss.length ? 'warn' : 'good', going ? (going - miss.length) / going * 100 : 0) + '</section>';
  }
  h += '<div class="bento">' + rideMineCard() + rideCarsCard();
  if (M.officer) h += rideFormCard() + rideWaitingCard() + rideMissingCard();
  return h + '</div>';
}

function rideMineCard() {
  var me = rideMe(), h = '<section class="card"><header><h3>Your ride</h3>' + (me ? '<button class="qbtn" data-act="rideForm" data-role="' + esc(me.role) + '">' + icon('edit') + '<span>Change</span></button>' : '') + '</header>';
  if (!me) return h + '<p class="mb">How are you getting to SFBLC? Carpools leave Friday, Nov 13. Hotel check-in starts at 4 PM.</p>' +
    '<div class="ridepick">' + ['driver', 'rider', 'own'].map(function (r) {
      return '<button class="ridechoice" data-act="rideForm" data-role="' + r + '"><b>' + esc(RIDE_ROLE[r][0]) + '</b><span>' + esc(RIDE_ROLE[r][1]) + '</span></button>';
    }).join('') + '</div></section>';
  if (me.role === 'own') return h + '<p class="mb">You are getting there on your own.</p>' + (me.note ? '<p class="meta">' + esc(me.note) + '</p>' : '') + '</section>';
  if (me.role === 'driver') {
    var rs = rideStops(me), route = rideRoute(me);
    return h + '<p class="mb">You are driving · <b>' + rs.length + ' of ' + (me.seats || 0) + '</b> seats taken</p>' + rideLine(me, true) +
      (rs.length ? '<p class="fl">Pickups, in order</p><ol class="inbox rides stops">' + rs.map(function (x, i) {
        return '<li><div class="mh"><p class="mt">' + esc(x.name) + '</p><span class="stopacts">' +
          (i ? '<button class="qbtn" data-act="rideStop" data-who="' + esc(x.who) + '" data-dir="-1" aria-label="Pick up ' + esc(x.name) + ' earlier">' + icon('back', 'up') + '</button>' : '') +
          (i < rs.length - 1 ? '<button class="qbtn" data-act="rideStop" data-who="' + esc(x.who) + '" data-dir="1" aria-label="Pick up ' + esc(x.name) + ' later">' + icon('back', 'down') + '</button>' : '') +
          '</span></div>' + rideLine(x, false) + '</li>';
      }).join('') + '</ol>' : empty('No riders yet', 'Riders who need a ride can join your car from this page.')) +
      (route ? '<div class="rowacts"><a class="qbtn" href="' + esc(route) + '" target="_blank" rel="noopener">' + icon('arrow') + '<span>Route with every pickup</span></a></div>' : '') + '</section>';
  }
  var car = me.car && rideCars().filter(function (d) { return d.who === me.car; })[0];
  if (car) {
    var mates = rideRiders(car.who).filter(function (x) { return x.who !== me.who; });
    return h + '<p class="mb">You are riding with <b>' + esc(car.name) + '</b></p>' + rideLine(car, true) +
      '<p class="meta">Your pickup: ' + rideWhere(me) + '</p>' +
      (mates.length ? '<p class="meta">Also in the car: ' + mates.map(function (x) { return esc(x.name) + (x.phone ? ' ' + ridePhone(x) : ''); }).join(', ') + '</p>' : '') +
      '<div class="rowacts">' + (rideFrom(me) === 'deanza' ? '<a class="qbtn" href="' + esc(rideDir('', DEANZA_Q)) + '" target="_blank" rel="noopener">' + icon('arrow') + '<span>Directions to De Anza</span></a>' : '') +
      '<button class="qbtn" data-act="rideJoin" data-car="">' + icon('close') + '<span>Leave this car</span></button></div></section>';
  }
  var open = rideCars().filter(function (d) { return rideOpen(d) > 0; });
  return h + '<p class="mb">You need a ride. ' + (open.length ? 'Pick a car with an open seat; the area shows where each one starts.' : 'No car has a seat yet; officers will put you in one.') + '</p>' + rideLine(me, false) +
    (open.length ? '<ul class="inbox rides">' + open.map(function (d) {
      return '<li><div class="mh"><p class="mt">' + esc(d.name) + '</p><span class="badge ok">' + plural(rideOpen(d), 'seat') + ' open</span></div>' + rideLine(d, true) +
        '<div class="rowacts"><button class="qbtn" data-act="rideJoin" data-car="' + esc(d.who) + '">' + icon('plus') + '<span>Join this car</span></button></div></li>';
    }).join('') + '</ul>' : '') + '</section>';
}

function rideCarsCard() {
  var cars = rideCars().slice().sort(function (a, b) { return (a.leave || '99').localeCompare(b.leave || '99') || a.name.localeCompare(b.name); });
  var h = '<section class="card' + (M.officer ? ' span2' : '') + '"><header><h3>Cars</h3><span class="count">' + cars.length + '</span></header>';
  if (!cars.length) return h + empty('No drivers yet', 'Anyone with a car and a license can offer seats from Your ride.') + '</section>';
  return h + '<ul class="inbox rides">' + cars.map(function (d) {
    var rs = rideStops(d), left = rideOpen(d), route = M.officer ? rideRoute(d) : '';
    return '<li><div class="mh"><p class="mt">' + esc(d.name) + '</p><span class="badge ' + (left ? 'ok' : '') + '">' + (left ? plural(left, 'seat') + ' open' : 'Full') + '</span></div>' + rideLine(d, true) +
      (rs.length ? '<p class="meta">Riders: ' + rs.map(function (x) {
        return esc(x.name) + (M.officer ? ' <button class="link" data-act="rideOut" data-who="' + esc(x.who) + '" aria-label="Take ' + esc(x.name) + ' out of this car">(take out)</button>' : '');
      }).join(', ') + '</p>' : '') +
      (route && rs.length ? '<p class="meta"><a href="' + esc(route) + '" target="_blank" rel="noopener">Route with pickups</a></p>' : '') + '</li>';
  }).join('') + '</ul></section>';
}

function rideWaitingCard() {
  var wait = rideWaiting(), cars = rideCars().filter(function (d) { return rideOpen(d) > 0; });
  var h = '<section class="card"><header><h3>Waiting for a car</h3><span class="count">' + wait.length + '</span></header>';
  if (!wait.length) return h + empty('Everyone who needs a ride has one', '') + '</section>';
  return h + '<ul class="inbox rides">' + wait.map(function (x) {
    return '<li><div class="mh"><p class="mt">' + esc(x.name) + '</p></div>' + rideLine(x, false) +
      (cars.length ? '<label class="fld"><span>Put in a car</span><select data-act="rideAssign" data-who="' + esc(x.who) + '"><option value="">Choose a driver</option>' +
        cars.map(function (d) { return '<option value="' + esc(d.who) + '">' + esc(d.name) + (d.area ? ' · ' + esc(d.area) : '') + ' · ' + plural(rideOpen(d), 'seat') + ' open</option>'; }).join('') + '</select></label>'
        : '<p class="meta bad">No car has an open seat.</p>') + '</li>';
  }).join('') + '</ul></section>';
}

function rideMissingCard() {
  var miss = rideMissing();
  var h = '<section class="card"><header><h3>No answer yet</h3><span class="count">' + miss.length + '</span></header>';
  if (!miss.length) return h + empty('Everyone going has answered', '') + '</section>';
  return h + '<p class="meta">' + esc(miss.slice(0, 30).map(function (p) { return p.name; }).join(', ')) + (miss.length > 30 ? ' and ' + (miss.length - 30) + ' more' : '') + '</p>' +
    '<div class="rowacts"><button class="qbtn" data-act="rideNudge">' + icon('bell') + '<span>Remind the ' + miss.length + '</span></button></div></section>';
}

/* ---------- the QR code and its form (officers) ---------- */
function rideFormCard() {
  var rf = M.cfg.rideForm, h = '<section class="card"><header><h3>Sign-up form and QR code</h3></header>';
  if (!rf || !rf.formUrl) return h + '<p class="mb">For anyone who would rather scan than sign in. Makes a Google Form and a sheet in the club’s Drive: answers become carpools here, and the sheet’s Carpools tab stays in step both ways.</p>' +
    '<div class="rowacts"><button class="qbtn" data-act="rideFormMake">' + icon('plus') + '<span>Make the form</span></button></div></section>';
  var qr = '';
  try { qr = QR.svg(rf.formUrl, 176); } catch (e) { qr = '<p class="meta bad">' + esc(e.message) + '</p>'; }
  return h + '<div class="qrbox">' + qr + '</div><p class="meta qrurl"><a href="' + esc(safeUrl(rf.formUrl)) + '" target="_blank" rel="noopener">' + esc(rf.formUrl) + '</a></p>' +
    '<div class="rowacts"><button class="qbtn" data-act="ridePrint">' + icon('upload') + '<span>Print</span></button>' +
    '<button class="qbtn" data-act="rideCopy">' + icon('link') + '<span>Copy link</span></button>' +
    (safeUrl(rf.sheetUrl) ? '<a class="qbtn" href="' + esc(safeUrl(rf.sheetUrl)) + '" target="_blank" rel="noopener">' + icon('arrow') + '<span>Sheet</span></a>' : '') +
    (safeUrl(rf.formEditUrl) ? '<a class="qbtn" href="' + esc(safeUrl(rf.formEditUrl)) + '" target="_blank" rel="noopener">' + icon('edit') + '<span>Edit questions</span></a>' : '') +
    '<button class="qbtn" data-act="rideSync">' + icon('clock') + '<span>Sync now</span></button></div>' +
    '<p class="meta">Edits on the sheet’s Carpools tab come back here within a minute or so; the latest edit wins.</p></section>';
}
ACT_EXT.rideFormMake = function () {
  confirmSheet('Make the carpool form?', 'A Google Form and a spreadsheet are made in the club’s Drive and shared with you. Anyone with the link or the QR code can answer it.', 'Make the form', function () {
    call('rideFormSetup').then(function (r) {
      if (!(r && r.ok)) return toast((r && r.error) || 'The form was not made.', true);
      M.cfg.rideForm = r.rideForm; if (BASE) BASE.rideForm = JSON.parse(JSON.stringify(r.rideForm));
      ridesLoad(); render(); toast('Form made. Print the QR code or share the link.');
    });
  });
};
ACT_EXT.rideCopy = function () {
  var u = (M.cfg.rideForm || {}).formUrl || '';
  (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('Link copied.'); }, function () { toast(u); });
};
/* Prints a page with only the code on it (#qrprint; see the print rules in app.css). */
ACT_EXT.ridePrint = function () {
  var rf = M.cfg.rideForm || {}, box = $('qrprint');
  if (!box) { box = document.createElement('div'); box.id = 'qrprint'; document.body.appendChild(box); }
  box.innerHTML = '<h1>' + esc(sfInfo().name) + ' carpools</h1><p>Scan to say whether you are driving, need a ride, or have your own way there.</p>' +
    QR.svg(rf.formUrl, 420) + '<p class="u">' + esc(rf.formUrl) + '</p>';
  document.body.classList.add('qrprinting');
  window.print();
};
window.addEventListener('afterprint', function () { document.body.classList.remove('qrprinting'); });
ACT_EXT.rideSync = function () {
  call('syncNow').then(function (r) {
    toast(r && r.ok ? 'Synced with the sheet.' : (r && r.error) || 'The sync did not run.', !(r && r.ok));
    ridesLoad();
  });
};

/* ---------- the sign-up form ----------
   One sheet: pick how you are getting there, and only that choice's questions
   show (data-role / data-from on the form drive the CSS). */
function rideForm(role) {
  var me = rideMe() || {}, x = me.role === role ? me : {from: me.from, addr: me.addr, area: me.area, fromNote: me.fromNote, phone: me.phone, back: me.back};
  var from = rideFrom(x);
  if (role === 'driver' && from === 'hotel') from = 'deanza';
  var tile = function (name, val, on, title, sub, cls) {
    return '<label class="tile' + (cls ? ' ' + cls : '') + '"><input type="radio" name="' + name + '" value="' + val + '"' + (on ? ' checked' : '') + '><b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</label>';
  };
  var q = x.addr ? rideMap(x.addr) : '';
  return '<form class="form rideform" data-act="rideSave" data-role="' + role + '" data-from="' + from + '"><header class="sh"><h3>Carpool to ' + esc(sfInfo().name) + '</h3></header>' +
    '<fieldset class="tiles"><legend>How are you getting there?</legend>' +
    ['driver', 'rider', 'own'].map(function (r) { return tile('role', r, r === role, RIDE_ROLE[r][0], RIDE_ROLE[r][1]); }).join('') + '</fieldset>' +
    '<div class="rf-ride">' +
      '<div class="rf-driver two"><label class="fld"><span>Seats for riders</span><input name="seats" type="number" min="1" max="7" inputmode="numeric" value="' + esc(x.seats || 3) + '"></label>' +
      '<label class="fld"><span>Leaving Friday at</span><input name="leave" type="time" value="' + esc(x.leave || '') + '"></label></div>' +
      '<p class="meta rf-driver">Hotel check-in starts at 4 PM. The board proposed arriving by 3.</p>' +
      '<fieldset class="tiles small"><legend><span class="rf-driver">Where does your car start?</span><span class="rf-rider">Where should the car pick you up?</span></legend>' +
        tile('from', 'deanza', from === 'deanza', 'De Anza College') + tile('from', 'addr', from === 'addr', 'An address', 'Home or nearby') +
        tile('from', 'hotel', from === 'hotel', 'Meet at the hotel', '', 'rf-rider') + '</fieldset>' +
      '<div class="rf-addr"><label class="fld"><span>Address or cross streets</span><input name="addr" maxlength="140" autocomplete="street-address" value="' + esc(x.addr || '') + '" placeholder="Stevens Creek Blvd and De Anza Blvd"></label>' +
        '<p class="meta">Only officers and your car see it. <a class="rf-map" href="' + esc(q || '#') + '" target="_blank" rel="noopener"' + (q ? '' : ' hidden') + '>Check it on the map</a></p></div>' +
      '<div class="two"><label class="fld"><span>City or neighborhood</span><input name="area" maxlength="40" autocomplete="address-level2" value="' + esc(x.area || '') + '" placeholder="Cupertino"></label>' +
      '<label class="fld"><span>Details (optional)</span><input name="fromNote" maxlength="80" value="' + esc(x.fromNote || '') + '" placeholder="Parking Lot B"></label></div>' +
      '<p class="meta">The area is shown to everyone, so riders can find a car near them.</p>' +
      '<label class="tick"><input type="checkbox" name="back"' + (x.back || !me.who ? ' checked' : '') + '><span class="rf-driver">Driving back Sunday too</span><span class="rf-rider">I need a ride back Sunday too</span></label>' +
      '<label class="fld"><span>Phone</span><input name="phone" type="tel" maxlength="30" autocomplete="tel" value="' + esc(x.phone || '') + '" placeholder="(408) 555-0123"></label>' +
      '<p class="meta">So your car can reach you on the day. Only officers and your car see it.</p>' +
    '</div>' +
    '<label class="fld"><span>Note (optional)</span><input name="note" maxlength="200" value="' + esc(x.note || '') + '" placeholder="Room for one suitcase each"></label>' +
    '<div class="sheetacts"><button class="btn">Save</button>' + (me.who ? '<button type="button" class="btn ghost" data-act="rideDrop">Remove my entry</button>' : '') + '</div></form>';
}
/* Keeps the form's visible questions and required fields in step with the choices. */
function rideFormSync(f) {
  var role = (f.querySelector('input[name=role]:checked') || {}).value || 'rider', from = (f.querySelector('input[name=from]:checked') || {}).value || 'deanza';
  if (role === 'driver' && from === 'hotel') { from = 'deanza'; f.querySelector('input[name=from][value=deanza]').checked = true; }
  f.setAttribute('data-role', role); f.setAttribute('data-from', from);
  f.phone.required = role !== 'own';
  f.addr.required = role !== 'own' && from === 'addr';
  f.seats.required = role === 'driver';
}
document.addEventListener('change', function (e) {
  var f = e.target.closest && e.target.closest('form.rideform');
  if (f && (e.target.name === 'role' || e.target.name === 'from')) rideFormSync(f);
});
document.addEventListener('input', function (e) {
  var f = e.target.closest && e.target.closest('form.rideform');
  if (!f || e.target.name !== 'addr') return;
  var a = f.querySelector('.rf-map'), v = e.target.value.trim();
  a.hidden = !v; a.href = v ? rideMap(v) : '#';
});

function rideSend(payload, ok) {
  return call('rideSave', payload).then(function (r) {
    if (!(r && r.ok)) return toast((r && r.error) || 'Not saved. Try again.', true);
    RIDES.list = r.rides || []; RIDES.ready = true;
    closeSheet(); render(); toast(ok);
  });
}
ACT_EXT.rideForm = function (el, d) {
  if (RIDES.ready === false) return toast('Carpools work once the backend update is deployed.', true);
  openSheet(rideForm(d.role));
  var f = document.querySelector('#sheetbody form.rideform');
  if (f) rideFormSync(f);
};
SUBMIT_EXT.rideSave = function (f) {
  rideFormSync(f);
  var role = f.getAttribute('data-role'), p = {role: role, note: f.note.value};
  if (role !== 'own') {
    p.from = f.getAttribute('data-from'); p.addr = p.from === 'addr' ? f.addr.value : ''; p.area = f.area.value; p.fromNote = f.fromNote.value;
    p.phone = f.phone.value; p.back = f.back.checked;
  }
  if (role === 'driver') { p.seats = +f.seats.value; p.leave = f.leave.value; }
  rideSend(p, role === 'driver' ? 'Saved. Riders can join your car now.' : role === 'rider' ? 'Saved.' : 'Saved. Have a safe trip.');
};
ACT_EXT.rideDrop = function () {
  var me = rideMe(), n = me && me.role === 'driver' ? rideRiders(me.who).length : 0;
  confirmSheet('Remove your carpool entry?', n ? 'Your ' + plural(n, 'rider') + ' go back to waiting for a car.' : 'You can add it again any time.', 'Remove', function () {
    rideSend({role: 'none'}, 'Removed.');
  });
};
ACT_EXT.rideJoin = function (el, d) {
  var car = d.car ? rideCars().filter(function (x) { return x.who === d.car; })[0] : null;
  rideSend({role: 'rider', car: d.car || ''}, car ? 'You are in ' + car.name + '’s car.' : 'You left the car.');
};
ACT_EXT.rideStop = function (el, d) {
  var me = rideMe(); if (!me) return;
  var order = rideStops(me).map(function (x) { return x.who; }), i = order.indexOf(d.who), j = i + (+d.dir);
  if (i < 0 || j < 0 || j >= order.length) return;
  order.splice(j, 0, order.splice(i, 1)[0]);
  rideSend({role: 'driver', stops: order}, 'Pickup order saved.');
};
function rideAssign(who, car) {
  return call('rideAssign', {who: who, car: car}).then(function (r) {
    if (!(r && r.ok)) { toast((r && r.error) || 'Not saved. Try again.', true); return render(); }
    RIDES.list = r.rides || []; render();
    var d = car && rideCars().filter(function (x) { return x.who === car; })[0];
    toast(d ? 'Put in ' + d.name + '’s car.' : 'Taken out of the car.');
  });
}
CHANGE_EXT.rideAssign = function (el, d, v) { if (v) rideAssign(d.who, v); };
ACT_EXT.rideOut = function (el, d) { rideAssign(d.who, ''); };
ACT_EXT.rideReload = function () { RIDES.err = ''; render(); ridesLoad(); };
ACT_EXT.rideNudge = function () {
  compose({title: 'Carpool to SFBLC', body: 'Tell us how you are getting to SFBLC: driving (and how many seats), needing a ride, or going on your own. It takes a minute on your dashboard.',
           target: {tags: [], names: rideMissing().map(function (p) { return p.name; })}, url: '/#sfblc/rides'});
};

/* ---------- demo ----------
   The same rules as Code.gs, in memory, with a few cars from the demo's SFBLC list.
   Addresses are made up. */
function rideDemoList(s) {
  if (!s.rides) {
    var g = s.people.filter(function (p) { return p.prefs && p.prefs.attend; }), at = new Date().toISOString();
    var e = function (i, role, o) { var p = g[i]; return p ? Object.assign({who: flat(p.name), name: p.name, role: role, from: 'deanza', addr: '', area: '', fromNote: '', leave: '', back: true, phone: '(408) 555-01' + ('0' + i).slice(-2), note: '', at: at}, o) : null; };
    var w0 = flat((g[0] || {}).name), w5 = flat((g[5] || {}).name);
    s.rides = [e(0, 'driver', {seats: 3, leave: '13:30', fromNote: 'Parking Lot B', area: 'Cupertino', note: 'Honda Pilot', stops: []}),
      e(1, 'rider', {car: w0, from: 'addr', addr: '100 Example Way, Cupertino', area: 'Cupertino'}), e(2, 'rider', {car: w0}),
      e(5, 'driver', {seats: 2, leave: '14:00', from: 'addr', addr: '200 Sample Ave, Sunnyvale', area: 'Sunnyvale'}), e(6, 'rider', {car: w5, back: false, area: 'Sunnyvale'}),
      e(9, 'driver', {seats: 4, leave: '12:45', back: false, area: 'San Jose'}), e(3, 'own', {note: 'Parents dropping me off', phone: ''}),
      e(7, 'rider', {from: 'addr', addr: '300 Demo Ct, Santa Clara', area: 'Santa Clara'}), e(8, 'rider', {from: 'hotel'})].filter(Boolean);
  }
  return s.rides;
}
function rideDemoView(list, me, officer) {
  if (officer) return JSON.parse(JSON.stringify(list));
  var mine = list.filter(function (x) { return x.who === me; })[0];
  var car = mine ? (mine.role === 'driver' ? me : mine.role === 'rider' ? mine.car || '' : '') : '';
  return list.map(function (x) {
    var c = Object.assign({}, x);
    if (!(x.who === me || (car && (x.who === car || (x.role === 'rider' && x.car === car))))) { delete c.phone; delete c.addr; if (rideFrom(x) === 'addr') delete c.fromNote; }
    return c;
  });
}
function rideDemoJoin(list, car, who) {
  var d = list.filter(function (x) { return x.who === car && x.role === 'driver'; })[0];
  if (!d) return 'That car is no longer offered.';
  return list.filter(function (x) { return x.role === 'rider' && x.car === car && x.who !== who; }).length >= d.seats ? 'That car is full.' : '';
}
function rideDemoFree(list, car) { list.forEach(function (x) { if (x.role === 'rider' && x.car === car) x.car = ''; }); }
DEMO_EXT.rideList = function (pl, s, officer, me) { return {ok: true, rides: rideDemoView(rideDemoList(s), me, officer)}; };
DEMO_EXT.rideSave = function (pl, s, officer, me, store) {
  var list = rideDemoList(s), old = list.filter(function (x) { return x.who === me; })[0];
  var person = s.people.filter(function (p) { return flat(p.name) === me; })[0];
  if (pl.role === 'none') { s.rides = list = list.filter(function (x) { return x.who !== me; }); rideDemoFree(list, me); store(); return {ok: true, rides: rideDemoView(list, me, officer)}; }
  if (['driver', 'rider', 'own'].indexOf(pl.role) < 0) return {ok: false, error: 'Choose driving, riding or your own way.'};
  var get = function (k, n) { return clean(k in pl ? pl[k] : (old || {})[k], n); };
  var from = rideFrom({from: get('from', 10)});
  var e = {who: me, name: person ? person.name : String(s.me), role: pl.role, from: from, addr: from === 'addr' ? get('addr', 140) : '', area: get('area', 40),
           fromNote: get('fromNote', 80), leave: get('leave', 5), back: 'back' in pl ? !!pl.back : !!(old && old.back), phone: get('phone', 30), note: get('note', 200), at: new Date().toISOString()};
  if (from === 'addr' && !e.addr) return {ok: false, error: 'Add the pickup address or cross streets.'};
  if (pl.role === 'own') { e.from = 'deanza'; e.addr = ''; }
  if (pl.role === 'driver') {
    var seats = Math.floor(+('seats' in pl ? pl.seats : (old || {}).seats)) || 0, mine = list.filter(function (x) { return x.role === 'rider' && x.car === me; }).map(function (x) { return x.who; });
    if (seats < 1 || seats > 7) return {ok: false, error: 'Seats for riders go from 1 to 7.'};
    if (seats < mine.length) return {ok: false, error: 'You have ' + mine.length + ' riders. Ask an officer to move someone before cutting seats.'};
    if (from === 'hotel') return {ok: false, error: 'Drivers start from De Anza or an address.'};
    e.seats = seats;
    e.stops = (Array.isArray(pl.stops) ? pl.stops : (old && old.stops) || []).filter(function (w, i, a) { return mine.indexOf(w) > -1 && a.indexOf(w) === i; });
  } else { e.leave = ''; rideDemoFree(list, me); }
  if (pl.role === 'rider') {
    var car = 'car' in pl ? clean(pl.car, 80) : String((old && old.role === 'rider' && old.car) || ''), no = car ? rideDemoJoin(list, car, me) : '';
    if (no) return {ok: false, error: no};
    e.car = car;
  }
  s.rides = list = list.filter(function (x) { return x.who !== me; }).concat([e]);
  store();
  return {ok: true, rides: rideDemoView(list, me, officer)};
};
DEMO_EXT.rideAssign = function (pl, s, officer, me, store) {
  if (!officer) return {ok: false, error: 'Your account is member. That action needs admin.'};
  var list = rideDemoList(s), e = list.filter(function (x) { return x.who === pl.who; })[0];
  if (!e) return {ok: false, error: 'That person has no carpool entry.'};
  if (pl.remove) { s.rides = list = list.filter(function (x) { return x.who !== pl.who; }); rideDemoFree(list, pl.who); }
  else {
    if (e.role !== 'rider') return {ok: false, error: 'Only riders can be put in a car.'};
    var no = pl.car ? rideDemoJoin(list, pl.car, pl.who) : '';
    if (no) return {ok: false, error: no};
    e.car = clean(pl.car, 80);
  }
  store();
  return {ok: true, rides: JSON.parse(JSON.stringify(list))};
};
/* The demo's form is a stand-in: its link and sheet go nowhere real. */
DEMO_EXT.rideFormSetup = function (pl, s, officer, me, store) {
  if (!officer) return {ok: false, error: 'Your account is member. That action needs admin.'};
  s.cfg.rideForm = s.cfg.rideForm || {formId: 'demo', formUrl: 'https://forms.gle/demo-carpool', formEditUrl: 'https://docs.google.com/forms/d/demo/edit',
                                      sheetId: 'demo', sheetUrl: 'https://docs.google.com/spreadsheets/d/demo'};
  store();
  return {ok: true, rideForm: JSON.parse(JSON.stringify(s.cfg.rideForm))};
};
