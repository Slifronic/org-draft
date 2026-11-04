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
var DEANZA_Q = 'De Anza College, 21250 Stevens Creek Blvd, Cupertino, CA';

function ridesLoad(pre) {
  RIDES.at = Date.now();
  return (pre ? Promise.resolve(pre) : call('rideList')).then(function (r) {
    var was = JSON.stringify(RIDES.list);
    if (r && r.ok) { RIDES.list = r.rides || []; RIDES.ready = true; RIDES.err = ''; }
    else if (r && /unknown action/i.test(String(r.error || ''))) RIDES.ready = false;
    else RIDES.err = (r && r.error) || 'Carpools did not load.';
    /* Redraw only when something changed, and never under someone typing on the tab. */
    var typing = document.activeElement && $('view').contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (ridesOpen() && (!RIDES.shown || was !== JSON.stringify(RIDES.list)) && !typing) { RIDES.shown = true; render(); }
  });
}
function ridesOpen() { return ROUTE.view === 'sfblc' && ROUTE.sub === 'rides'; }
BOOT_EXT.push(function (raw) { ridesLoad(raw && raw.pre && raw.pre.rides); });
/* Sign-ups also arrive from the carpool Form and its sheet (Sync.gs, about a
   minute behind), so the tab reads the list again when opened and every 30
   seconds while it is on screen. */
window.addEventListener('hashchange', function () {
  setTimeout(function () { if (ridesOpen() && RIDES.ready !== null && Date.now() - (RIDES.at || 0) > 15000) ridesLoad(); }, 0);
});
setInterval(function () { if (ridesOpen() && RIDES.ready && !document.hidden) ridesLoad(); }, 30000);

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
  var h = rideAnswersCard();
  if (M.officer) {
    var cars = rideCars(), open = 0, seats = 0, wait = rideWaiting(), miss = rideMissing(), going = M.people.filter(function (p) { return p.going; }).length;
    cars.forEach(function (d) { seats += d.seats || 0; open += rideOpen(d); });
    h += '<section class="kpis">' +
      kpi('Cars', cars.length, plural(seats, 'seat') + ' for riders', '#sfblc/rides') +
      kpi('Open seats', open, open ? 'Riders can still join' : cars.length ? 'Every car is full' : 'No drivers yet', '#sfblc/rides', open || !wait.length ? '' : 'warn') +
      kpi('Waiting for a car', wait.length, wait.length ? '<b>Put them in a car</b>' : 'None', '#sfblc/rides', wait.length ? 'warn' : '') +
      kpi('No answer yet', miss.length, 'of ' + going + ' going to SFBLC', '#sfblc/rides', miss.length ? 'warn' : 'good', going ? (going - miss.length) / going * 100 : 0) + '</section>';
  }
  h += rideCarsCard();
  h += '<div class="bento">' + rideMineCard();
  if (M.officer) h += rideFormCard() + rideWaitingCard() + rideMissingCard() + rideAllCard();
  return h + '</div>';
}

/* ---------- your answers, as the Google Form asks them ----------
   The same questions in the same words as the carpool Form, filled in with
   what you last said, here or on the Form. Saving here writes the sheet's
   Carpools tab straight away; an edit there or a new Form answer comes back
   on the next sync (about a minute). */
function rideAnswersCard() {
  var me = rideMe(), x = me || {}, role = me ? me.role : '', from = rideFrom(x), rf = M.cfg.rideForm || {};
  if (role === 'driver' && from === 'hotel') from = 'deanza';
  var fk = function (n, v) { return ' data-fk="ra|' + n + (v ? '|' + v : '') + '"'; };
  var tile = function (name, val, on, title, sub, cls) {
    return '<label class="tile' + (cls ? ' ' + cls : '') + '"><input type="radio" name="' + name + '" value="' + val + '"' + (on ? ' checked' : '') + fk(name, val) + '><b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</label>';
  };
  var q = function (n, title, help, field, cls) {
    if (n === 2 || n === 4 || n === 10) cls = (cls ? cls + ' ' : '') + 'wide';
    return '<div class="rq' + (cls ? ' ' + cls : '') + '"><p class="rqn">' + n + '</p><div class="rqb"><p class="rqt">' + esc(title) + '</p>' + (help ? '<p class="meta">' + esc(help) + '</p>' : '') + field + '</div></div>';
  };
  var seatOpts = [1, 2, 3, 4, 5, 6, 7].map(function (n) { return '<option' + (+(x.seats || 3) === n ? ' selected' : '') + '>' + n + '</option>'; }).join('');
  var h = '<section class="card rideans"><header><h3>Your carpool form</h3>' +
    (me ? '<span class="badge ok">Answered ' + esc(ago(me.at)) + '</span>' : '<span class="badge gold">Not answered yet</span>') + '</header>' +
    '<p class="mb sm">The same questions as the carpool Google Form, with what you answered. Change an answer here or on the Form and the other one follows within about a minute.' +
    (safeUrl(rf.formUrl) ? ' <a href="' + esc(safeUrl(rf.formUrl)) + '" target="_blank" rel="noopener">Open the Form</a>' : '') + '</p>' +
    '<form class="form rideform rqs" data-act="rideAnsSave" data-role="' + (role || 'rider') + '" data-from="' + from + '">' +
    q(1, 'Your full name', '', '<p class="rqv">' + esc(M.me.name) + '</p>') +
    q(2, 'How are you getting there?', '', '<fieldset class="tiles"><legend class="sr">How are you getting there?</legend>' +
      tile('role', 'driver', role === 'driver', 'I can drive') + tile('role', 'rider', role === 'rider' || !role, 'I need a ride') + tile('role', 'own', role === 'own', 'I have my own way there') + '</fieldset>') +
    '<div class="rf-ride">' +
    q(3, 'Drivers: seats for riders', 'Not counting yourself.', '<select name="seats" class="mini"' + fk('seats') + '>' + seatOpts + '</select>', 'rf-driver') +
    q(4, 'Where should the carpool start or pick you up?', 'The hotel is the ' + sfInfo().venue + '. Drivers start from De Anza or an address.',
      '<fieldset class="tiles small"><legend class="sr">Where should the carpool start or pick you up?</legend>' + tile('from', 'deanza', from === 'deanza', 'De Anza College') +
      tile('from', 'addr', from === 'addr', 'At my address') + tile('from', 'hotel', from === 'hotel', 'Meet at the hotel', '', 'rf-rider') + '</fieldset>') +
    q(5, 'Pickup address or cross streets', 'Only officers and your car see it.', '<input name="addr" maxlength="140" autocomplete="street-address" value="' + esc(x.addr || '') + '"' + fk('addr') + ' placeholder="Stevens Creek Blvd and De Anza Blvd">' +
      ' <a class="rf-map" href="' + esc(x.addr ? rideMap(x.addr) : '#') + '" target="_blank" rel="noopener"' + (x.addr ? '' : ' hidden') + '>Check it on the map</a>', 'rf-addr') +
    q(6, 'City or neighborhood', 'Shown to everyone, so riders can find a car near them.', '<input name="area" maxlength="40" autocomplete="address-level2" value="' + esc(x.area || '') + '"' + fk('area') + ' placeholder="Cupertino">') +
    q(7, 'Drivers: leaving Friday at', 'Hotel check-in starts at 4 PM.', '<input name="leave" type="time" value="' + esc(x.leave || '') + '"' + fk('leave') + '>', 'rf-driver') +
    q(8, 'Riding or driving back on Sunday too?', '', '<div class="seg yn"><label><input type="radio" name="back" value="1"' + (x.back || !me ? ' checked' : '') + fk('back', '1') + '><span>Yes</span></label>' +
      '<label><input type="radio" name="back" value="0"' + (me && !x.back ? ' checked' : '') + fk('back', '0') + '><span>No</span></label></div>') +
    q(9, 'Phone number', 'So your car can reach you on the day.', '<input name="phone" type="tel" maxlength="30" autocomplete="tel" value="' + esc(x.phone || '') + '"' + fk('phone') + ' placeholder="(408) 555-0123">') +
    '</div>' +
    q(10, 'Anything else', '', '<textarea name="note" rows="2" maxlength="200"' + fk('note') + ' placeholder="Room for one suitcase each">' + esc(x.note || '') + '</textarea>') +
    '<div class="sheetacts"><button class="btn">' + (me ? 'Save my answers' : 'Send my answers') + '</button>' + (me ? '<button type="button" class="btn ghost" data-act="rideDrop">Remove my entry</button>' : '') + '</div></form></section>';
  return h;
}
SUBMIT_EXT.rideAnsSave = function (f) {
  rideFormSync(f);
  var role = f.getAttribute('data-role'), p = {role: role, note: f.note.value};
  if (role !== 'own') {
    p.from = f.getAttribute('data-from'); p.addr = p.from === 'addr' ? f.addr.value : ''; p.area = f.area.value;
    p.phone = f.phone.value; p.back = (f.querySelector('input[name=back]:checked') || {}).value !== '0';
  }
  if (role === 'driver') { p.seats = +f.seats.value; p.leave = f.leave.value; }
  rideSend(p, role === 'driver' ? 'Saved. Riders can pick your car now.' : role === 'rider' ? 'Saved. Pick a car below.' : 'Saved. Have a safe trip.');
};

/* ---------- where you stand ---------- */
function rideMineCard() {
  var me = rideMe(), h = '<section class="card"><header><h3>Your ride</h3></header>';
  if (!me) return h + '<p class="mb">Answer the form above, or pick a car with an open seat. Carpools leave Friday, Nov 13; hotel check-in starts at 4 PM.</p></section>';
  if (me.role === 'own') return h + '<p class="mb">You are getting there on your own.</p>' + (me.note ? '<p class="meta">' + esc(me.note) + '</p>' : '') + '</section>';
  if (me.role === 'driver') {
    var rs = rideStops(me), route = rideRoute(me);
    return h + '<p class="mb">You are driving · <b>' + rs.length + ' of ' + (me.seats || 0) + '</b> seats taken</p>' +
      (rs.length ? '<p class="fl">Pickups, in order</p><ol class="inbox rides stops">' + rs.map(function (x, i) {
        return '<li><div class="mh"><p class="mt">' + esc(x.name) + '</p><span class="stopacts">' +
          (i ? '<button class="qbtn" data-act="rideStop" data-who="' + esc(x.who) + '" data-dir="-1" aria-label="Pick up ' + esc(x.name) + ' earlier">' + icon('back', 'up') + '</button>' : '') +
          (i < rs.length - 1 ? '<button class="qbtn" data-act="rideStop" data-who="' + esc(x.who) + '" data-dir="1" aria-label="Pick up ' + esc(x.name) + ' later">' + icon('back', 'down') + '</button>' : '') +
          '</span></div>' + rideLine(x, false) + '</li>';
      }).join('') + '</ol>' : empty('No riders yet', 'Riders pick your car from the cars above.')) +
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
  return h + '<p class="mb">You need a ride. ' + (rideCars().some(function (d) { return rideOpen(d) > 0; }) ? 'Pick a car with an open seat above; each card says where it starts.' : 'No car has a seat yet; officers will put you in one.') + '</p>' + rideLine(me, false) + '</section>';
}

/* ---------- the cars, a card each ----------
   A card per driver: where it starts, when it leaves, a seat for each place
   (filled ones are taken), who is in it, and one button to take a seat. */
function rideCarsCard() {
  var cars = rideCars().slice().sort(function (a, b) { return (rideOpen(b) > 0) - (rideOpen(a) > 0) || (a.leave || '99').localeCompare(b.leave || '99') || a.name.localeCompare(b.name); });
  var open = 0; cars.forEach(function (d) { open += rideOpen(d); });
  var h = '<section class="carsect"><header class="carshd"><h3>Cars</h3><span class="count">' + cars.length + '</span><span class="hint">' + plural(open, 'open seat') + '</span></header>';
  if (!cars.length) return h + '<div class="card">' + empty('No drivers yet', 'Anyone with a car and a license can offer seats: answer “I can drive” on the form above.') + '</div></section>';
  return h + '<ul class="cars">' + cars.map(rideCarCard).join('') + '</ul></section>';
}
function rideCarCard(d) {
  var me = rideMe(), rs = rideStops(d), left = rideOpen(d), seats = d.seats || 0, route = M.officer ? rideRoute(d) : '';
  var mineDrive = me && me.role === 'driver' && me.who === d.who, mineRide = me && me.role === 'rider' && me.car === d.who;
  var dots = '';
  for (var i = 0; i < seats; i++) dots += '<i class="' + (i < rs.length ? 'on' : '') + '"></i>';
  var act = mineDrive ? '<span class="badge">Your car</span>'
    : mineRide ? '<span class="badge ok">You are in this car</span><button class="qbtn" data-act="rideJoin" data-car="">' + icon('close') + '<span>Leave</span></button>'
    : me && me.role !== 'rider' ? ''
    : left ? '<button class="btn sm" data-act="rideJoin" data-car="' + esc(d.who) + '">' + icon('plus') + 'Take a seat</button>'
    : '<button class="btn sm ghost" disabled>Full</button>';
  return '<li class="car card' + (mineDrive || mineRide ? ' mine' : '') + (left ? '' : ' full') + '"><div class="carhd">' + avatar({name: d.name}) + '<div><p class="tt">' + esc(d.name) + '</p>' +
      '<p class="meta">' + (d.leave ? 'Leaves Fri ' + esc(fmtTime(d.leave)) : 'Leaving time to be set') + (d.back ? ' · back Sunday' : ' · one way') + '</p></div>' +
      '<span class="badge ' + (left ? 'ok' : '') + '">' + (left ? plural(left, 'seat') + ' open' : 'Full') + '</span></div>' +
    '<p class="meta">' + rideWhere(d) + '</p>' +
    (d.note ? '<p class="mb sm">' + esc(d.note) + '</p>' : '') +
    '<div class="seatrow"><span class="seats" role="img" aria-label="' + rs.length + ' of ' + seats + ' seats taken">' + dots + '</span><span class="meta">' + rs.length + ' of ' + seats + ' taken</span></div>' +
    (rs.length ? '<p class="meta">' + rs.map(function (x) {
      return esc(x.name) + (M.officer ? ' <button class="link" data-act="rideOut" data-who="' + esc(x.who) + '" aria-label="Take ' + esc(x.name) + ' out of this car">(take out)</button>' : '');
    }).join(', ') + '</p>' : '<p class="meta">No riders yet</p>') +
    '<div class="rowacts">' + act + (route && rs.length ? '<a class="qbtn" href="' + esc(route) + '" target="_blank" rel="noopener">' + icon('arrow') + '<span>Route</span></a>' : '') + '</div></li>';
}

/* Every answer as the sheet's Carpools tab lays it out, for officers. */
function rideAllCard() {
  var list = RIDES.list.slice().sort(function (a, b) { return a.role.localeCompare(b.role) || a.name.localeCompare(b.name); }), rf = M.cfg.rideForm || {};
  var carOf = function (x) { var d = x.car && rideCars().filter(function (c) { return c.who === x.car; })[0]; return d ? d.name : ''; };
  var h = '<section class="card span3"><header><h3>Everyone’s answers</h3><span class="count">' + list.length + '</span>' +
    (safeUrl(rf.sheetUrl) ? '<a href="' + esc(safeUrl(rf.sheetUrl)) + '" target="_blank" rel="noopener">Open the sheet</a>' : '') + '</header>';
  if (!list.length) return h + empty('No answers yet', '') + '</section>';
  return h + '<div class="tablewrap"><table class="answers"><thead><tr><th>Name</th><th>Role</th><th>Seats</th><th>Pickup</th><th>Area</th><th>Leaves Fri</th><th>Back Sun</th><th>Phone</th><th>Car</th><th>Note</th></tr></thead><tbody>' +
    list.map(function (x) {
      return '<tr><td><b>' + esc(x.name) + '</b></td><td>' + esc({driver: 'Driving', rider: 'Riding', own: 'Own way'}[x.role] || x.role) + '</td><td>' + esc(x.role === 'driver' ? x.seats || '' : '') + '</td>' +
        '<td>' + esc(x.role === 'own' ? '' : rideFrom(x) === 'addr' ? x.addr || 'An address' : RIDE_FROM[rideFrom(x)]) + '</td><td>' + esc(x.area || '') + '</td><td>' + esc(x.leave ? fmtTime(x.leave) : '') + '</td>' +
        '<td>' + (x.role === 'own' ? '' : x.back ? 'Yes' : 'No') + '</td><td>' + ridePhone(x) + '</td><td>' + esc(x.role === 'rider' ? carOf(x) || 'Waiting' : '') + '</td><td>' + esc(x.note || '') + '</td></tr>';
    }).join('') + '</tbody></table></div><p class="meta">Change an answer on the sheet’s Carpools tab and it shows here after the next sync.</p></section>';
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

/* ---------- the answers form ----------
   Pick how you are getting there, and only that choice's questions show
   (data-role / data-from on the form drive the CSS). */
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
