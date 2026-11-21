#!/usr/bin/env bash
# Builds the debug binary of one desktop app from the CURRENT source and prints
# its path, so a native acceptance run never drives a stale binary (the Prisons
# binary once ran older than six of its sources). Usage: scripts/native-binary.sh police|dpp|courts|lawyers|prisons
set -euo pipefail
app="${1:?usage: native-binary.sh <app>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/apps/$app/src-tauri"
[ -d "$dir" ] || { echo "no such app: $app" >&2; exit 1; }
(cd "$dir" && cargo build -j"${JOBS:-2}")
bin="$dir/target/debug/$app"
newer="$(find "$dir/src" "$dir/migrations" "$root/packages" -path '*/target' -prune -o \( -name '*.rs' -o -name '*.sql' -o -name Cargo.toml \) -newer "$bin" -print 2>/dev/null | head -3)"
if [ -n "$newer" ]; then
  echo "STALE: $bin is older than:" >&2; echo "$newer" >&2; exit 1
fi
echo "$bin"
