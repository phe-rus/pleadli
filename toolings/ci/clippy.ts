// Clippy ratchet. Spec: docs/specs/_root/0002-ci-pipeline.md
//
//   bun toolings/ci/clippy.ts check <app> <cargo-json-file>   compare with the baseline
//   bun toolings/ci/clippy.ts counts <cargo-json-file>        print per lint counts as JSON
//   bun toolings/ci/clippy.ts merge <counts.json>...          per lint highest count, as JSON
//
// Input is the output of `cargo clippy --message-format=json`. Every distinct
// warning (same lint, file, line, column) counts once, whether it came from the app or
// from a local crate such as packages/node-core. Compiler errors always fail.
// The baseline (clippy-baseline.json) maps a lint name to the most occurrences
// allowed in one app. A lint missing from it, or above its number, fails the run.
// Lowering a number is a reviewed edit to the baseline.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Counts = Record<string, number>;
export type Parsed = { counts: Counts; errors: string[] };

export function parse(jsonLines: string): Parsed {
  const seen = new Set<string>();
  const counts: Counts = {};
  const errors: string[] = [];
  for (const line of jsonLines.split("\n")) {
    if (!line.startsWith("{")) continue;
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.reason !== "compiler-message") continue;
    const m = msg.message;
    const span = (m.spans ?? []).find((s: any) => s.is_primary);
    const where = span ? `${span.file_name}:${span.line_start}:${span.column_start}` : "";
    if (m.level === "error" || m.level === "error: internal compiler error") {
      const key = `error|${m.message}|${where}`;
      if (!seen.has(key)) {
        seen.add(key);
        errors.push(`${where} ${m.message}`.trim());
      }
      continue;
    }
    if (m.level !== "warning" || !m.code?.code) continue;
    const key = `${m.code.code}|${where}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts[m.code.code] = (counts[m.code.code] ?? 0) + 1;
  }
  return { counts, errors };
}

export type Result = { ok: boolean; lines: string[] };

export function check(baseline: Counts, current: Counts, errors: string[] = []): Result {
  const lines: string[] = [];
  let ok = true;
  for (const e of errors) {
    ok = false;
    lines.push(`error: ${e}`);
  }
  for (const [lint, n] of Object.entries(current).sort()) {
    const allowed = baseline[lint];
    if (allowed === undefined) {
      ok = false;
      lines.push(`new lint not in the baseline: ${lint} appears ${n} time(s)`);
    } else if (n > allowed) {
      ok = false;
      lines.push(`lint grew: ${lint} is ${n}, the baseline allows ${allowed} (${n - allowed} more)`);
    }
  }
  for (const [lint, allowed] of Object.entries(baseline).sort()) {
    const n = current[lint] ?? 0;
    if (n < allowed) lines.push(`note: ${lint} is down to ${n} from ${allowed}. Lower the baseline in a reviewed edit.`);
  }
  return { ok, lines };
}

export function merge(all: Counts[]): Counts {
  const out: Counts = {};
  for (const c of all) for (const [k, v] of Object.entries(c)) out[k] = Math.max(out[k] ?? 0, v);
  return Object.fromEntries(Object.entries(out).sort());
}

if (import.meta.main) {
  const [cmd, ...rest] = process.argv.slice(2);
  const baselinePath = resolve(import.meta.dir, "clippy-baseline.json");
  if (cmd === "check" && rest.length === 2) {
    const [app, file] = rest;
    const { counts, errors } = parse(readFileSync(file, "utf8"));
    const result = check(JSON.parse(readFileSync(baselinePath, "utf8")), counts, errors);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`${app}: ${total} warning(s) across ${Object.keys(counts).length} lint(s).`);
    for (const l of result.lines) console.log(l);
    console.log(`${app}: clippy ratchet ${result.ok ? "passed" : "FAILED"}.`);
    process.exit(result.ok ? 0 : 1);
  } else if (cmd === "counts" && rest.length === 1) {
    console.log(JSON.stringify(Object.fromEntries(Object.entries(parse(readFileSync(rest[0], "utf8")).counts).sort()), null, 2));
  } else if (cmd === "merge" && rest.length > 0) {
    console.log(JSON.stringify(merge(rest.map((f) => JSON.parse(readFileSync(f, "utf8")))), null, 2));
  } else {
    console.error("usage: clippy.ts check <app> <file> | counts <file> | merge <counts.json>...");
    process.exit(2);
  }
}
