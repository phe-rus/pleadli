#!/usr/bin/env bash
# Starts the two test installations beside your own station, each with its own
# data folder and ports (debug builds only; see dev_data_dir in src-tauri/src/lib.rs):
#   Kagadi Police Station    data ~/.local/share/pleadli-test/kagadi-station   API 127.0.0.1:47841
#   Albertine Region (HQ)    data ~/.local/share/pleadli-test/albertine-hq     API 127.0.0.1:47851, stations connect to :47852
# Needs `bun run tauri` already running in apps/police (it serves the window's
# pages on :3001 and builds target/debug/police). Then run seed.ts once.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bin="$here/../../src-tauri/target/debug/police"
root="${PLEADLI_TEST_ROOT:-$HOME/.local/share/pleadli-test}"
mkdir -p "$root/kagadi-station" "$root/albertine-hq"

which="${1:-both}"
if [[ "$which" == both || "$which" == hq ]]; then
  PLEADLI_DATA_DIR="$root/albertine-hq" PLEADLI_DEV_PORT=47851 PLEADLI_COMMAND_PORT=47852 \
    NO_AT_BRIDGE=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 \
    nohup "$bin" >"$root/albertine-hq.log" 2>&1 &
  echo "Albertine Region HQ: pid $!"
fi
if [[ "$which" == both || "$which" == station ]]; then
  PLEADLI_DATA_DIR="$root/kagadi-station" PLEADLI_DEV_PORT=47841 \
    NO_AT_BRIDGE=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 \
    nohup "$bin" >"$root/kagadi-station.log" 2>&1 &
  echo "Kagadi Police Station: pid $!"
fi
