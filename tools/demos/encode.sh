#!/bin/zsh
# encode.sh <clipsdir> <outdir>
set -e
C="$1"; O="$2"; mkdir -p "$O"
for d in "$C"/*/; do
  id=$(basename "$d"); [ -f "$d/raw.webm" ] || continue
  st=$(python3 -I -c "import json;print(max(0,json.load(open('$d/marks.json'))['start']-0.05))")
  en=$(python3 -I -c "import json;print(json.load(open('$d/marks.json'))['end'])")
  ffmpeg -v error -y -ss $st -to $en -i "$d/raw.webm" -r 30 -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -an -movflags +faststart "$O/$id.mp4"
  ffmpeg -v error -y -ss 1.0 -i "$O/$id.mp4" -frames:v 1 -q:v 4 "$O/$id.jpg"
  ffmpeg -v error -y -i "$O/$id.mp4" -vf "fps=1/3.5,scale=426:-2,tile=4x4" -frames:v 1 "$C/$id-sheet.jpg"
  printf "%-10s %5.1fs %6s KB\n" $id $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$O/$id.mp4") $(( $(stat -f%z "$O/$id.mp4") / 1024 ))
done
