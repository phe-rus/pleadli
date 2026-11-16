import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compare, measure, outputDir } from "./size";

describe("size.ts", () => {
  const dir = mkdtempSync(join(tmpdir(), "pleadli-size-"));
  mkdirSync(join(dir, "assets/deep"), { recursive: true });
  const js = "console.log('hello');".repeat(500);
  writeFileSync(join(dir, "assets/a.js"), js);
  writeFileSync(join(dir, "assets/deep/b.css"), "body{color:red}".repeat(500));
  writeFileSync(join(dir, "assets/a.js.map"), "x".repeat(100000));
  writeFileSync(join(dir, "logo.png"), "x".repeat(100000));

  test("counts gzipped js and css in subfolders, ignores maps and images", () => {
    const expected =
      Bun.gzipSync(Buffer.from(js), { level: 9 }).length + Bun.gzipSync(Buffer.from("body{color:red}".repeat(500)), { level: 9 }).length;
    expect(measure(dir)).toBe(expected);
  });

  test("a missing output folder fails", () => {
    expect(() => measure(join(dir, "nope"))).toThrow("built output not found");
  });

  test("over budget prints app, measured, budget and the difference", () => {
    const v = compare("police", 1200, 1000);
    expect(v.ok).toBe(false);
    expect(v.message).toContain("police");
    expect(v.message).toContain("1200");
    expect(v.message).toContain("1000");
    expect(v.message).toContain("200");
  });

  test("at or under budget passes", () => {
    expect(compare("police", 1000, 1000).ok).toBe(true);
    expect(compare("police", 900, 1000).ok).toBe(true);
  });

  test("an unset budget passes loudly and names the number to commit", () => {
    const v = compare("dpp", 1000, null);
    expect(v.ok).toBe(true);
    expect(v.message).toContain("NOT ENFORCED");
    expect(v.message).toContain("1100");
  });

  test("www is measured in dist/client, apps in dist", () => {
    expect(outputDir("/r", "www")).toBe("/r/www/dist/client");
    expect(outputDir("/r", "police")).toBe("/r/apps/police/dist");
  });
});
