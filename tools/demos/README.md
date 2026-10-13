# Tab demo clips

`media/demos/*.mp4` are recorded from the demo club (`/demo?as=member`, `?as=new`)
with Playwright: a drawn cursor, a title card and burned-in captions, no audio.
Re-record after a tab changes so the clips match the app.

```
npx serve -s -l 8791 ../..   # from tools/demos: -s serves index.html for /demo
npm i playwright && npx playwright install chromium
echo "$(node -e "console.log(require('playwright').chromium.executablePath())")" > exe.txt
node clips.js out            # all clips, or: node clips.js out calendar homework
./encode.sh out ../../media/demos
```

`clips.js` holds one entry per clip (`CLIPS`): which demo view, which tab, and
the steps with their captions. `encode.sh` trims the load, encodes H.264 with
faststart, and writes a poster `.jpg` beside each `.mp4`.
