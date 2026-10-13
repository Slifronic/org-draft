#!/bin/zsh
# walkthrough.sh <outdir> — muxes the recorded walkthrough frames with the
# narration into media/member-walkthrough.mp4 (1920x1080, 30 fps) and its poster.
set -e
D="$1/walkthrough"; M="$(dirname $0)/../../media"
ffmpeg -v error -y -f concat -safe 0 -i "$D/f/list.txt" -i "$(dirname $0)/walkthrough-narration.m4a" \
  -vf "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p" -c:v libx264 -preset slow -crf 22 -tune animation \
  -c:a copy -shortest -movflags +faststart "$M/member-walkthrough.mp4"
ffmpeg -v error -y -ss 3 -i "$M/member-walkthrough.mp4" -frames:v 1 -q:v 3 "$M/member-walkthrough.jpg"
ffmpeg -v error -y -i "$M/member-walkthrough.mp4" -vf "fps=1/6,scale=480:-2,tile=6x5" -frames:v 1 "$1/walkthrough-sheet.jpg"
printf "member-walkthrough %5.1fs %6s KB\n" $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$M/member-walkthrough.mp4") $(( $(stat -f%z "$M/member-walkthrough.mp4") / 1024 ))
