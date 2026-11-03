/* Carpools for SFBLC: everyone says whether they drive (and how many seats),
   need a ride, or get there on their own. Riders join a car with an open
   seat and officers fill the gaps. Entries live in their own backend row
   (rideList, rideSave, rideAssign in Code.gs) because a member cannot write
   the club record; a phone number only reaches officers and your own car. */
'use strict';

var RIDES = {list: [], ready: null, err: ''};
var RIDE_FROM = {deanza: 'De Anza', hotel: 'Straight to the hotel', other: 'Somewhere else'};

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
function rideWhere(x) {
  return esc(RIDE_FROM[x.from] || RIDE_FROM.deanza) + (x.fromNote ? ' (' + esc(x.fromNote) + ')' : '');
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
  if (M.officer) h += rideWaitingCard() + rideMissingCard();
  return h + '</div>';
}

function rideMineCard() {
  var me = rideMe(), h = '<section class="card"><header><h3>Your ride</h3>' + (me ? '<button class="qbtn" data-act="rideForm" data-role="' + esc(me.role) + '">' + icon('edit') + '<span>Change</span></button>' : '') + '</header>';
  if (!me) return h + '<p class="mb">How are you getting to SFBLC? Carpools leave Friday, Nov 13. Hotel check-in starts at 4 PM.</p>' +
    '<div class="rowacts"><button class="qbtn" data-act="rideForm" data-role="driver">' + icon('check') + '<span>I can drive</span></button>' +
    '<button class="qbtn" data-act="rideForm" data-role="rider">' + icon('pin') + '<span>I need a ride</span></button>' +
    '<button class="qbtn" data-act="rideForm" data-role="own">' + icon('arrow') + '<span>I have my own way</span></button></div></section>';
  if (me.role === 'own') return h + '<p class="mb">You are getting there on your own.</p>' + (me.note ? '<p class="meta">' + esc(me.note) + '</p>' : '') + '</section>';
  if (me.role === 'driver') {
    var rs = rideRiders(me.who);
    return h + '<p class="mb">You are driving · <b>' + rs.length + ' of ' + (me.seats || 0) + '</b> seats taken</p>' + rideLine(me, true) +
      (rs.length ? '<ul class="inbox rides">' + rs.map(function (x) { return '<li><div class="mh"><p class="mt">' + esc(x.name) + '</p></div>' + rideLine(x, false) + '</li>'; }).join('') + '</ul>'
        : empty('No riders yet', 'Riders who need a ride can join your car from this page.')) + '</section>';
  }
  var car = me.car && rideCars().filter(function (d) { return d.who === me.car; })[0];
  if (car) {
    var mates = rideRiders(car.who).filter(function (x) { return x.who !== me.who; });
    return h + '<p class="mb">You are riding with <b>' + esc(car.name) + '</b></p>' + rideLine(car, true) +
      (mates.length ? '<p class="meta">Also in the car: ' + mates.map(function (x) { return esc(x.name) + (x.phone ? ' ' + ridePhone(x) : ''); }).join(', ') + '</p>' : '') +
      '<div class="rowacts"><button class="qbtn" data-act="rideJoin" data-car="">' + icon('close') + '<span>Leave this car</span></button></div></section>';
  }
  var open = rideCars().filter(function (d) { return rideOpen(d) > 0; });
  return h + '<p class="mb">You need a ride. ' + (open.length ? 'Pick a car with an open seat:' : 'No car has a seat yet; officers will put you in one.') + '</p>' + rideLine(me, false) +
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
    var rs = rideRiders(d.who), left = rideOpen(d);
    return '<li><div class="mh"><p class="mt">' + esc(d.name) + '</p><span class="badge ' + (left ? 'ok' : '') + '">' + (left ? plural(left, 'seat') + ' open' : 'Full') + '</span></div>' + rideLine(d, true) +
      (rs.length ? '<p class="meta">Riders: ' + rs.map(function (x) {
        return esc(x.name) + (M.officer ? ' <button class="link" data-act="rideOut" data-who="' + esc(x.who) + '" aria-label="Take ' + esc(x.name) + ' out of this car">(take out)</button>' : '');
      }).join(', ') + '</p>' : '') + '</li>';
  }).join('') + '</ul></section>';
}

function rideWaitingCard() {
  var wait = rideWaiting(), cars = rideCars().filter(function (d) { return rideOpen(d) > 0; });
  var h = '<section class="card"><header><h3>Waiting for a car</h3><span class="count">' + wait.length + '</span></header>';
  if (!wait.length) return h + empty('Everyone who needs a ride has one', '') + '</section>';
  return h + '<ul class="inbox rides">' + wait.map(function (x) {
    return '<li><div class="mh"><p class="mt">' + esc(x.name) + '</p></div>' + rideLine(x, false) +
      (cars.length ? '<label class="fld"><span>Put in a car</span><select data-act="rideAssign" data-who="' + esc(x.who) + '"><option value="">Choose a driver</option>' +
        cars.map(function (d) { return '<option value="' + esc(d.who) + '">' + esc(d.name) + ' · ' + esc(RIDE_FROM[d.from] || '') + ' · ' + plural(rideOpen(d), 'seat') + ' open</option>'; }).join('') + '</select></label>'
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

function rideForm(role) {
  var me = rideMe() || {}, x = me.role === role ? me : {from: me.from, fromNote: me.fromNote, phone: me.phone};
  var title = {driver: 'I can drive', rider: 'I need a ride', own: 'I have my own way'}[role];
  var from = function (label) {
    return '<label class="fld"><span>' + label + '</span><select name="from">' + Object.keys(RIDE_FROM).map(function (k) {
      return '<option value="' + k + '"' + ((x.from || 'deanza') === k ? ' selected' : '') + '>' + esc(RIDE_FROM[k]) + '</option>'; }).join('') + '</select></label>' +
      '<label class="fld"><span>Where exactly (optional)</span><input name="fromNote" maxlength="80" value="' + esc(x.fromNote || '') + '" placeholder="Parking Lot B"></label>';
  };
  var phone = '<label class="fld"><span>Phone (optional)</span><input name="phone" type="tel" maxlength="30" value="' + esc(x.phone || '') + '" placeholder="(408) 555-0123"></label>' +
    '<p class="meta">Only officers and the people in your car see your number.</p>';
  var h = '<form class="form" data-act="rideSave" data-role="' + role + '"><header class="sh"><h3>' + esc(title) + '</h3></header>';
  if (role === 'driver') h += '<label class="fld"><span>Seats for riders</span><input name="seats" type="number" min="1" max="7" required value="' + esc(x.seats || 3) + '"></label>' +
    from('Leaving from') + '<label class="fld"><span>Leaving Friday at</span><input name="leave" type="time" value="' + esc(x.leave || '') + '"></label>' +
    '<p class="meta">Hotel check-in starts at 4 PM. The board proposed arriving by 3.</p>' +
    '<label class="tick"><input type="checkbox" name="back"' + (x.back ? ' checked' : '') + '><span>Driving back Sunday too</span></label>' + phone;
  else if (role === 'rider') h += from('Pick me up at') + '<label class="tick"><input type="checkbox" name="back"' + (x.back || !x.who ? ' checked' : '') + '><span>I need a ride back Sunday too</span></label>' + phone;
  h += '<label class="fld"><span>' + (role === 'own' ? 'How you are getting there (optional)' : 'Note (optional)') + '</span><input name="note" maxlength="200" value="' + esc(x.note || '') + '" placeholder="' +
    (role === 'own' ? 'Parents are dropping me off' : role === 'driver' ? 'Room for one suitcase each' : 'Can leave after 1 PM') + '"></label>';
  var other = ['driver', 'rider', 'own'].filter(function (r) { return r !== role; });
  h += '<p class="meta">Or: ' + other.map(function (r) { return '<button type="button" class="link" data-act="rideForm" data-role="' + r + '">' + esc({driver: 'I can drive', rider: 'I need a ride', own: 'I have my own way'}[r].toLowerCase()) + '</button>'; }).join(' · ') + '</p>';
  return h + '<div class="sheetacts"><button class="btn">Save</button>' + (me.who ? '<button type="button" class="btn ghost" data-act="rideDrop">Remove my entry</button>' : '') + '</div></form>';
}

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
};
SUBMIT_EXT.rideSave = function (f) {
  var role = f.getAttribute('data-role'), p = {role: role, note: f.note.value};
  if (f.from) { p.from = f.from.value; p.fromNote = f.fromNote.value; }
  if (f.phone) p.phone = f.phone.value;
  if (f.back) p.back = f.back.checked;
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
   The same rules as Code.gs, in memory, with a few cars from the demo's SFBLC list. */
function rideDemoList(s) {
  if (!s.rides) {
    var g = s.people.filter(function (p) { return p.prefs && p.prefs.attend; }), at = new Date().toISOString();
    var e = function (i, role, o) { var p = g[i]; return p ? Object.assign({who: flat(p.name), name: p.name, role: role, from: 'deanza', fromNote: '', leave: '', back: true, phone: '(408) 555-01' + ('0' + i).slice(-2), note: '', at: at}, o) : null; };
    s.rides = [e(0, 'driver', {seats: 3, leave: '13:30', fromNote: 'Parking Lot B', note: 'Honda Pilot'}), e(1, 'rider', {car: flat((g[0] || {}).name)}), e(2, 'rider', {car: flat((g[0] || {}).name)}),
      e(5, 'driver', {seats: 2, leave: '14:00', from: 'other', fromNote: 'Cupertino Main Library'}), e(6, 'rider', {car: flat((g[5] || {}).name), back: false}),
      e(9, 'driver', {seats: 4, leave: '12:45', back: false}), e(3, 'own', {note: 'Parents dropping me off', phone: ''}),
      e(7, 'rider', {}), e(8, 'rider', {from: 'hotel'})].filter(Boolean);
  }
  return s.rides;
}
function rideDemoView(list, me, officer) {
  if (officer) return JSON.parse(JSON.stringify(list));
  var mine = list.filter(function (x) { return x.who === me; })[0];
  var car = mine ? (mine.role === 'driver' ? me : mine.role === 'rider' ? mine.car || '' : '') : '';
  return list.map(function (x) {
    var c = Object.assign({}, x);
    if (!(x.who === me || (car && (x.who === car || (x.role === 'rider' && x.car === car))))) delete c.phone;
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
  var e = {who: me, name: person ? person.name : String(s.me), role: pl.role, from: get('from', 10) || 'deanza', fromNote: get('fromNote', 80), leave: get('leave', 5),
           back: 'back' in pl ? !!pl.back : !!(old && old.back), phone: get('phone', 30), note: get('note', 200), at: new Date().toISOString()};
  if (pl.role === 'driver') {
    var seats = Math.floor(+('seats' in pl ? pl.seats : (old || {}).seats)) || 0, taken = list.filter(function (x) { return x.role === 'rider' && x.car === me; }).length;
    if (seats < 1 || seats > 7) return {ok: false, error: 'Seats for riders go from 1 to 7.'};
    if (seats < taken) return {ok: false, error: 'You have ' + taken + ' riders. Ask an officer to move someone before cutting seats.'};
    e.seats = seats;
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
