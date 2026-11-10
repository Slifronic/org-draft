// node apps-script/test/itinspan.test.js -- the itinerary's time cells, read as start and end.
const fs = require('fs'), path = require('path'), assert = require('assert');
global.Utilities = {formatDate: () => ''}; global.Session = {getScriptTimeZone: () => ''};
const src = fs.readFileSync(path.join(__dirname, '..', 'Sync.gs'), 'utf8');
eval(src.slice(src.indexOf('function itinSpan_'), src.indexOf('function hhmm_')));
const cases = {
  '12:00 PM': ['12:00', ''], '≈ 2:00 PM': ['14:00', ''], '5:15-6:00PM': ['17:15', '18:00'], '6:00-7:30PM': ['18:00', '19:30'],
  '10:00-12:00AM': ['22:00', '00:00'], '8:00AM-6:00PM': ['08:00', '18:00'], '1:30-2:20PM': ['13:30', '14:20'],
  '8:30 AM - 10:30 AM': ['08:30', '10:30'], '12:00 AM': ['00:00', ''], '11:30-12:30PM': ['11:30', '12:30'], '': ['', '']
};
for (const [t, [s, e]] of Object.entries(cases)) assert.deepStrictEqual(itinSpan_(t), {start: s, end: e}, t);
console.log('itinSpan_: ' + Object.keys(cases).length + ' cases pass');
