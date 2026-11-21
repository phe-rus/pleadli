#!/usr/bin/env bash
# Tauri checks that each externalBin sidecar exists at build time. The real file is
# downloaded at release time, so empty placeholders are enough to compile and test.
set -euo pipefail
app="$1"
mkdir -p "apps/$app/dist"
bun -e '
  const conf = await Bun.file(`apps/${process.argv[1]}/src-tauri/tauri.conf.json`).json();
  for (const bin of conf.bundle?.externalBin ?? []) console.log(bin);
' "$app" | while read -r bin; do
  path="apps/$app/src-tauri/${bin}-x86_64-unknown-linux-gnu"
  mkdir -p "$(dirname "$path")"
  : > "$path"
  chmod +x "$path"
done
