#!/bin/zsh
# encode.sh <clipsdir> <outdir>
# Turns each clip's 2x screencast frames into a 1920x1200 H.264 MP4 at 30 fps
# (faststart, no audio) and writes a poster .jpg beside it.
set -e
C="$1"; O="$2"; mkdir -p "$O"
for d in "$C"/*/; do
  id=$(basename "$d"); [ -f "$d/f/list.txt" ] || continue
  ffmpeg -v error -y -f concat -safe 0 -i "$d/f/list.txt" \
    -vf "fps=30,scale=1920:1200:flags=lanczos,format=yuv420p" \
    -c:v libx264 -preset slow -crf 21 -tune animation -an -movflags +faststart "$O/$id.mp4"
  ffmpeg -v error -y -ss 1.2 -i "$O/$id.mp4" -frames:v 1 -q:v 3 "$O/$id.jpg"
  ffmpeg -v error -y -i "$O/$id.mp4" -vf "fps=1/3.5,scale=480:-2,tile=4x4" -frames:v 1 "$C/$id-sheet.jpg"
  printf "%-10s %5.1fs %6s KB\n" $id $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$O/$id.mp4") $(( $(stat -f%z "$O/$id.mp4") / 1024 ))
done
