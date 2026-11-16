// Bundle size gate. Spec: docs/specs/_root/0002-ci-pipeline.md
//
//   bun toolings/ci/size.ts <workspace>      compare a built workspace with its budget
//
// Measured size = sum of gzip (level 9) sizes of every *.js, *.mjs and *.css file in
// the built web output, source maps excluded. Output folder: apps/<name>/dist, or
// www/dist/client for www (browser assets only, not the server worker).
// Budgets live in toolings/ci/budgets.json. A budget of null means "not measured
// yet": the size is printed with the number to commit, and nothing fails.
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export const EXTENSIONS = [".js", ".mjs", ".css"];

export function outputDir(root: string, workspace: string): string {
  return workspace === "www" ? join(root, "www", "dist", "client") : join(root, "apps", workspace, "dist");
}

/** Gzipped bytes of every script and stylesheet below `dir`. Throws when `dir` is missing. */
export function measure(dir: string): number {
  if (!existsSync(dir)) throw new Error(`built output not found: ${dir}`);
  let total = 0;
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (EXTENSIONS.some((e) => name.endsWith(e))) total += Bun.gzipSync(readFileSync(p), { level: 9 }).length;
    }
  };
  walk(dir);
  return total;
}

export type Verdict = { ok: boolean; message: string };

export function compare(workspace: string, measured: number, budget: number | null | undefined): Verdict {
  if (budget === null || budget === undefined) {
    const suggested = Math.ceil(measured * 1.1);
    return {
      ok: true,
      message:
        `${workspace}: measured ${measured} bytes, no budget set yet (NOT ENFORCED). ` +
        `Set "${workspace}": ${suggested} in toolings/ci/budgets.json (measured plus 10 percent).`,
    };
  }
  if (measured > budget) {
    return {
      ok: false,
      message: `${workspace}: over budget. Measured ${measured} bytes, budget ${budget} bytes, over by ${measured - budget} bytes.`,
    };
  }
  return { ok: true, message: `${workspace}: ${measured} bytes, budget ${budget} bytes, ${budget - measured} bytes to spare.` };
}

if (import.meta.main) {
  const workspace = process.argv[2];
  const root = resolve(import.meta.dir, "../..");
  const budgets = JSON.parse(readFileSync(join(root, "toolings/ci/budgets.json"), "utf8")).workspaces ?? {};
  if (!workspace || !(workspace in budgets)) {
    console.error(`usage: size.ts <workspace>, one of: ${Object.keys(budgets).join(", ")}`);
    process.exit(2);
  }
  let verdict: Verdict;
  try {
    verdict = compare(workspace, measure(outputDir(root, workspace)), budgets[workspace]);
  } catch (e) {
    verdict = { ok: false, message: `${workspace}: ${(e as Error).message}` };
  }
  console.log(verdict.message);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${verdict.ok ? "ok" : "FAILED"}: ${verdict.message}\n`);
  process.exit(verdict.ok ? 0 : 1);
}
