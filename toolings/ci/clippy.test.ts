import { describe, expect, test } from "bun:test";
import { check, merge, parse } from "./clippy";

const warn = (code: string, file: string, line: number, col = 1, level = "warning") =>
  JSON.stringify({
    reason: "compiler-message",
    message: { level, message: `${code} here`, code: code ? { code } : null, spans: [{ is_primary: true, file_name: file, line_start: line, column_start: col }] },
  });

describe("clippy ratchet", () => {
  test("counts each distinct warning once, even when two targets repeat it", () => {
    const out = [warn("clippy::unwrap_used", "a.rs", 1), warn("clippy::unwrap_used", "a.rs", 1), warn("clippy::unwrap_used", "a.rs", 2), "not json", "{broken"].join("\n");
    expect(parse(out).counts).toEqual({ "clippy::unwrap_used": 2 });
  });

  test("ignores summary lines without a lint code and non compiler messages", () => {
    const out = [JSON.stringify({ reason: "compiler-artifact" }), warn("", "a.rs", 1)].join("\n");
    expect(parse(out).counts).toEqual({});
  });

  test("a new lint not in the baseline fails", () => {
    const r = check({ "clippy::unwrap_used": 2 }, { "clippy::unwrap_used": 2, "clippy::needless_return": 1 });
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toContain("clippy::needless_return");
  });

  test("a baselined lint that grows fails, and removing the extra one passes", () => {
    expect(check({ a: 2 }, { a: 3 }).ok).toBe(false);
    expect(check({ a: 2 }, { a: 2 }).ok).toBe(true);
  });

  test("a lint that shrinks passes and asks for a lower baseline", () => {
    const r = check({ a: 5 }, { a: 3 });
    expect(r.ok).toBe(true);
    expect(r.lines.join("\n")).toContain("Lower the baseline");
  });

  test("compiler errors always fail", () => {
    const { errors } = parse(warn("E0308", "a.rs", 9, 1, "error"));
    expect(errors).toHaveLength(1);
    expect(check({}, {}, errors).ok).toBe(false);
  });

  test("merge keeps the highest count per lint", () => {
    expect(merge([{ a: 1, b: 5 }, { a: 3 }])).toEqual({ a: 3, b: 5 });
  });
});
