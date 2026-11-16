import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Spec 0002: change detection. Feeds sample file lists to changes.sh and checks
// which jobs it asks for. The turbo graph is replaced by a fixture so the test
// is fast and does not depend on today's workspace layout.

const script = join(import.meta.dir, "changes.sh");

const dir = mkdtempSync(join(tmpdir(), "pleadli-ci-"));
const depsFile = join(dir, "deps.json");
writeFileSync(
  depsFile,
  JSON.stringify({
    "apps/police": ["apps/police", "packages/ui", "packages/paper"],
    "apps/dpp": ["apps/dpp", "packages/ui"],
    "apps/lawyers": ["apps/lawyers", "packages/ui"],
    "apps/prisons": ["apps/prisons", "packages/ui"],
    "apps/courts": ["apps/courts", "packages/ui"],
    www: ["www", "packages/ui", "toolings/institution", "toolings/templates"],
  }),
);

type Out = { ts: boolean; rust: string[]; size: string[]; base: string };

function run(files: string[]): Out {
  const res = Bun.spawnSync(["bash", script, "--stdin"], {
    stdin: new TextEncoder().encode(files.join("\n") + (files.length ? "\n" : "")),
    env: { ...process.env, CI_DEPS_JSON: depsFile, GITHUB_OUTPUT: "" },
  });
  if (res.exitCode !== 0) throw new Error(res.stderr.toString());
  const kv = Object.fromEntries(
    res.stdout
      .toString()
      .trim()
      .split("\n")
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  return { ts: kv.ts === "true", rust: JSON.parse(kv.rust), size: JSON.parse(kv.size), base: kv.base };
}

const APPS = ["courts", "dpp", "lawyers", "police", "prisons"];

describe("changes.sh", () => {
  test("an empty diff is a valid green: nothing to check", () => {
    expect(run([])).toEqual({ ts: false, rust: [], size: [], base: "" });
  });

  test("docs only changes run nothing", () => {
    const out = run(["docs/scope/_root/scope.md", "docs/specs/_root/0002-ci-pipeline.md", "README.md"]);
    expect(out.ts).toBe(false);
    expect(out.rust).toEqual([]);
    expect(out.size).toEqual([]);
  });

  test("a change in one app typechecks and sizes that app, no Rust", () => {
    const out = run(["apps/police/src/features/x.tsx"]);
    expect(out.ts).toBe(true);
    expect(out.rust).toEqual([]);
    expect(out.size).toEqual(["police"]);
  });

  test("a change under one app's src-tauri runs only that app's Rust job", () => {
    const out = run(["apps/dpp/src-tauri/src/api/mod.rs"]);
    expect(out.rust).toEqual(["dpp"]);
    expect(out.size).toEqual(["dpp"]); // spec: any change under apps/W/ is measured
  });

  test("node-core is a path dependency of every app, so all five run Rust", () => {
    const out = run(["packages/node-core/src/db.rs"]);
    expect(out.rust).toEqual(APPS);
  });

  test("interchange is derived from dpp's Cargo.toml, so only dpp runs Rust", () => {
    const out = run(["packages/interchange/src/lib.rs"]);
    expect(out.rust).toEqual(["dpp"]);
  });

  test("a shared UI package sizes every workspace that depends on it", () => {
    const out = run(["packages/ui/src/button.tsx"]);
    expect(out.ts).toBe(true);
    expect(out.size).toEqual(["courts", "dpp", "lawyers", "police", "prisons", "www"]);
  });

  test("a package only one app uses sizes only that app", () => {
    expect(run(["packages/paper/src/index.ts"]).size).toEqual(["police"]);
  });

  test("www picks up toolings it depends on", () => {
    expect(run(["toolings/institution/src/index.ts"]).size).toEqual(["www"]);
  });

  test("a root lockfile change runs all Rust apps", () => {
    expect(run(["Cargo.lock"]).rust).toEqual(APPS);
  });

  test("a lockfile for one app's Rust deps runs only that app", () => {
    expect(run(["apps/police/src-tauri/Cargo.lock"]).rust).toEqual(["police"]);
  });

  test("editing the workflow or the CI tooling runs everything", () => {
    for (const f of [".github/workflows/ci.yml", "toolings/ci/size.ts"]) {
      const out = run([f]);
      expect(out.ts).toBe(true);
      expect(out.rust).toEqual(APPS);
      expect(out.size).toEqual(["courts", "dpp", "lawyers", "police", "prisons", "www"]);
    }
  });

  test("root package and turbo files typecheck and size everything but skip Rust", () => {
    expect(run(["turbo.json"]).ts).toBe(true);
    expect(run(["bun.lock"]).size).toHaveLength(6);
    expect(run(["package.json"]).rust).toEqual([]);
  });

  test("a zero base sha means everything changed", () => {
    const res = Bun.spawnSync(["bash", script], {
      env: { ...process.env, BASE: "0".repeat(40), CI_DEPS_JSON: depsFile, GITHUB_OUTPUT: "" },
    });
    expect(res.exitCode).toBe(0);
    const text = res.stdout.toString();
    expect(text).toContain("ts=true");
    expect(text).toContain('rust=["courts","dpp","lawyers","police","prisons"]');
    expect(text).toContain("base=\n");
  });

  test("an unknown base sha means everything changed", () => {
    const res = Bun.spawnSync(["bash", script], {
      env: { ...process.env, BASE: "1".repeat(40), CI_DEPS_JSON: depsFile, GITHUB_OUTPUT: "" },
    });
    expect(res.stdout.toString()).toContain("ts=true");
  });

  test("the same input gives the same answer twice", () => {
    const files = ["apps/lawyers/src/a.ts", "packages/node-core/src/b.rs"];
    expect(run(files)).toEqual(run(files));
  });
});
