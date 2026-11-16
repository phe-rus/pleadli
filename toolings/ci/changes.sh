#!/usr/bin/env bash
# Works out which CI jobs a change needs. Spec: docs/specs/_root/0002-ci-pipeline.md
#
#   changes.sh            diff against $BASE (a commit sha), print and export outputs
#   changes.sh --stdin    read changed paths (one per line) from stdin instead of git
#
# Outputs (one `name=value` per line, also appended to $GITHUB_OUTPUT when set):
#   ts    true or false     does TypeScript need a typecheck
#   rust  ["dpp","police"]  Rust apps that need cargo test and clippy, single line JSON
#   size  ["police","www"]  workspaces whose bundle size is measured, single line JSON
#   base  the sha used for the diff, empty when everything is treated as changed
#
# A missing, all zero or unknown $BASE means everything changed. An empty diff is a
# valid answer: nothing to check.
#
# Test hook: CI_DEPS_JSON=<file> is a JSON map {"apps/police": ["apps/police", "packages/ui"]}
# used instead of asking turbo for a workspace's dependencies.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ZERO="0000000000000000000000000000000000000000"
ALL=0
BASE_USED=""
FILES=""

if [ "${1:-}" = "--stdin" ]; then
  FILES="$(cat)"
else
  BASE="${BASE:-}"
  if [ -z "$BASE" ] || [ "$BASE" = "$ZERO" ] || ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
    ALL=1
  else
    BASE_USED="$BASE"
    FILES="$(git diff --name-only "$BASE...HEAD")"
  fi
fi

# True when any changed path matches the extended regex.
changed() { [ "$ALL" = 1 ] || grep -Eq "$1" <<<"$FILES"; }

json_list() {
  local out="" item
  for item in "$@"; do out+="${out:+,}\"$item\""; done
  printf '[%s]' "$out"
}

# --- TypeScript -------------------------------------------------------------
TS=false
if changed '^(apps|www|packages|toolings)/|^(package\.json|bun\.lock|turbo\.json|tsconfig[^/]*)$|^\.github/workflows/ci\.yml$'; then
  TS=true
fi

# --- Rust apps --------------------------------------------------------------
# Local crates a Cargo.toml lists with `path =`, followed through their own
# Cargo.toml too. Prints repo relative directories, one per line.
crate_paths() {
  local dir="$1" line rel target
  [ -f "$dir/Cargo.toml" ] || return 0
  while IFS= read -r line; do
    rel="$(sed -E 's/.*path *= *"([^"]+)".*/\1/' <<<"$line")"
    target="$(realpath -m --relative-to="$ROOT" "$dir/$rel")"
    echo "$target"
    crate_paths "$ROOT/$target"
  done < <(grep -E 'path *= *"' "$dir/Cargo.toml" || true)
}

RUST=()
RUST_GLOBAL='^(Cargo\.lock|Cargo\.toml)$|^\.github/workflows/ci\.yml$|^toolings/ci/'
for manifest in apps/*/src-tauri/Cargo.toml; do
  [ -f "$manifest" ] || continue
  app="$(basename "$(dirname "$(dirname "$manifest")")")"
  hit=0
  if changed "$RUST_GLOBAL" || changed "^apps/$app/src-tauri/"; then
    hit=1
  else
    while IFS= read -r crate; do
      [ -n "$crate" ] || continue
      if changed "^${crate}/"; then hit=1; break; fi
    done < <(crate_paths "apps/$app/src-tauri" | sort -u)
  fi
  if [ "$hit" = 1 ]; then RUST+=("$app"); fi
done

# --- Bundle size ------------------------------------------------------------
# Workspaces are the keys of toolings/ci/budgets.json, so adding one is one edit.
mapfile -t SIZE_KEYS < <(bun -e '
  const b = JSON.parse(await Bun.file("toolings/ci/budgets.json").text());
  for (const k of Object.keys(b.workspaces ?? {})) console.log(k);
')

workspace_dir() { if [ "$1" = www ]; then echo www; else echo "apps/$1"; fi; }

# Directories a workspace depends on (itself included), from the turbo graph.
workspace_deps() {
  local dir="$1"
  if [ -n "${CI_DEPS_JSON:-}" ]; then
    DIR="$dir" bun -e '
      const m = JSON.parse(await Bun.file(process.env.CI_DEPS_JSON!).text());
      for (const p of m[process.env.DIR!] ?? [process.env.DIR!]) console.log(p);
    '
  else
    # Only reached when TypeScript changed, so a docs only run never installs anything.
    [ -x node_modules/.bin/turbo ] || bun install --frozen-lockfile >&2
    bunx turbo ls --filter="./${dir}..." --output=json | bun -e '
      const t = await Bun.stdin.text();
      const j = JSON.parse(t.slice(t.indexOf("{")));
      for (const i of j.packages.items) console.log(i.path);
    '
  fi
}

SIZE=()
SIZE_GLOBAL='^toolings/ci/|^bun\.lock$|^\.github/workflows/ci\.yml$'
# Every size trigger is also a TypeScript trigger, so skip the lookups when TS is false.
for ws in "${SIZE_KEYS[@]}"; do
  [ "$TS" = true ] || break
  dir="$(workspace_dir "$ws")"
  hit=0
  if changed "$SIZE_GLOBAL" || changed "^${dir}/"; then
    hit=1
  else
    while IFS= read -r dep; do
      [ -n "$dep" ] || continue
      if changed "^${dep}/"; then hit=1; break; fi
    done < <(workspace_deps "$dir")
  fi
  if [ "$hit" = 1 ]; then SIZE+=("$ws"); fi
done

OUT="$(printf 'ts=%s\nrust=%s\nsize=%s\nbase=%s\n' \
  "$TS" "$(json_list "${RUST[@]+"${RUST[@]}"}")" "$(json_list "${SIZE[@]+"${SIZE[@]}"}")" "$BASE_USED")"
echo "$OUT"
if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "$OUT" >>"$GITHUB_OUTPUT"; fi
