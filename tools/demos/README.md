# Tab demo clips and the member walkthrough

`media/demos/*.mp4` are recorded from the demo club (`/demo?as=member`, `?as=new`)
with Playwright: a drawn cursor, a title card and burned-in captions, no audio.
`media/member-walkthrough.mp4` is one narrated run through the whole site as a new
member. Re-record after a tab changes so the videos match the app.

Frames come from Chrome's screencast at 2x and are encoded with ffmpeg, so the
text stays sharp (Playwright's own video recorder encodes at a low fixed bitrate).

```
# serve the site with the vercel.json rewrites (any server that maps /demo to index.html)
node serve.js ../.. 8791                        # or: npx serve -s -l 8791 ../..
npm i playwright && npx playwright install chromium
echo "$(node -e "console.log(require('playwright').chromium.executablePath())")" > exe.txt

node clips.js out                    # all clips, or: node clips.js out calendar homework
./encode.sh out ../../media/demos    # 1920x1200 H.264 + a poster .jpg per clip

node walkthrough.js out              # the narrated walkthrough, about 3 minutes in real time
./walkthrough.sh out                 # muxes walkthrough-narration.m4a -> media/member-walkthrough.mp4
```

`BASE` (default `http://127.0.0.1:8791`) and `PLAYWRIGHT` (a path to a playwright
package) can be set in the environment.

- `clips.js` holds one entry per clip (`CLIPS`): which demo view, which tab, and
  the steps with their captions.
- `walkthrough.js` starts each part on a cue point (`CUE`, seconds) taken from the
  narration, and prints `late by …` if a part overruns its cue. Keep those under
  about 1.5 s; record on an otherwise idle machine.
- `walkthrough-narration.m4a` is the ElevenLabs narration (voice "Rodney - Clear
  Educator", `eleven_v4`, flow `KnfUbsdLteI0re72cVtT`). The opening line was
  re-voiced on Oct 13 2026 for org.deanzapbl.com and the removed join code. To
  change a line, re-voice it there and splice it in at the same time.

After re-recording, bump `DEMO_V` in `index.html` and the `?v=` on the walkthrough
in `orientation.html`: `/media` is cached for a day, so the old video would keep
showing at the same address. Update the lengths shown beside each clip too.
