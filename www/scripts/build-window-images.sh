#!/usr/bin/env bash
# Turns the captures from scripts/capture-windows.ts into the small WebP pictures the home page shows
# instead of live copies of the apps. Usage: scripts/build-window-images.sh <captures-dir>
# The capture is the browser viewport at 2x with the window (1152 x 774 css px, 0.9 of 1280 x 860) at the top left.
set -euo pipefail
in="${1:?usage: build-window-images.sh <captures-dir>}"
out="$(dirname "$0")/../public/images/windows"
mkdir -p "$out"
S=1.8 # pixels per design pixel: 0.9 scale x 2 for the screen density

webp() { # file, crop-x, crop-y, crop-w, crop-h (design px), out-width, out-name
  local x w y h
  x=$(awk "BEGIN{printf \"%d\", $2*$S}"); y=$(awk "BEGIN{printf \"%d\", $3*$S}")
  w=$(awk "BEGIN{printf \"%d\", $4*$S}"); h=$(awk "BEGIN{printf \"%d\", $5*$S}")
  ffmpeg -hide_banner -loglevel error -y -i "$in/$1.png" -vf "crop=$w:$h:$x:$y,scale=$6:-2" -c:v libwebp -quality 80 "$out/$7.webp"
}

# The whole window, for the phone layout.
for slug in police dpp courts lawyers prisons; do webp "$slug-today" 0 0 1280 860 1200 "$slug-full"; done
# One cut for each item of the strip, each from a different screen.
webp courts-today             0   0 1280 740 1344 courts-bench
webp dpp-today              256   0 1024 520 1100 dpp-desk
webp police-in-custody        0   0  900 860  800 police-cells
webp lawyers-criminal-register 0  0 1280 600 1216 lawyers-register
webp prisons-today           256   0  900 620  960 prisons-held
ls -la "$out" | awk '{print $5, $9}'
