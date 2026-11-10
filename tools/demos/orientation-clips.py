#!/usr/bin/env python3
"""Rewrite the "Tab by tab" grid on orientation.html from the clips in media/demos.
Usage: python3 orientation-clips.py <version>   (run from tools/demos)
Lengths come from ffprobe; the order and wording match dash-clips.js."""
import re, subprocess, sys, pathlib
V = sys.argv[1]
root = pathlib.Path(__file__).resolve().parents[2]
CLIPS = [
    ('signup', 'Sign up', 'Sign in with Google and join with the code'),
    ('overview', 'Overview', 'Your week, homework and SFBLC on one page'),
    ('calendar', 'Calendar', 'Meetings, SFBLC and due dates'),
    ('links', 'Links', 'Every link the chapter uses'),
    ('inbox', 'Inbox', 'Messages and automatic reminders'),
    ('ebod', 'EBOD', 'The board, and who to ask for what'),
    ('orgchart', 'Org chart', 'Who does what in the chapter'),
    ('orgs', 'Orgs', 'Your Org and the other five'),
    ('homework', 'Homework', 'Hand in a file or a link'),
    ('cup', 'Org Cup', 'Cups your Org earns together'),
    ('sfblc', 'SFBLC', 'Schedule, coaching, checklist, need to know'),
    ('carpools', 'Carpools', 'Offer a ride or find one'),
    ('teams', 'Competition teams', 'Your SFBLC team and event choices'),
    ('consulting', 'Client teams', 'Your client team, PMs and initiatives'),
    ('members', 'Internal Members', 'Everyone in the chapter, by tag'),
    ('profile', 'Profile', 'Details, notifications, commitment log'),
]
def length(cid):
    f = root / 'media' / 'demos' / (cid + '.mp4')
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(f)], capture_output=True, text=True).stdout
    return round(float(out))
figs = []
for cid, title, line in CLIPS:
    src = f'/media/demos/{cid}'
    figs.append(f'''      <figure class="clip">
        <video controls playsinline muted preload="none" poster="{src}.jpg?v={V}"><source src="{src}.mp4?v={V}" type="video/mp4"></video>
        <figcaption><b>{title}</b><span>{line} · {length(cid)}s</span></figcaption>
      </figure>''')
p = root / 'orientation.html'
s = p.read_text()
s, n = re.subn(r'(<div class="clips">\n).*?(\n    </div>\n  </section>)', lambda m: m.group(1) + '\n'.join(figs) + m.group(2), s, count=1, flags=re.S)
assert n == 1, 'clip grid not found'
s = s.replace('Short silent clips, one per tab. The same ones are on a <i>Watch</i> button at the top of each tab in the app.',
              'Short silent clips, one per section. The same ones open from the <i>Watch</i> button at the top of each section in the app.')
p.write_text(s)
print('wrote', len(figs), 'clips')
