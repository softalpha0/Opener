import { afterEach, describe, expect, it } from "vitest";
import { redact, scrubString } from "@/lib/qloo/redact";

afterEach(() => {
  delete process.env.QLOO_API_KEY;
});

describe("redact", () => {
  it("drops secret-looking keys at any depth", () => {
    const out = redact({
      entity: "x",
      api_key: "abc",
      nested: { Authorization: "Bearer t", token: "y", keep: 1 },
    });
    expect(out).toEqual({
      entity: "x",
      api_key: "[redacted]",
      nested: { Authorization: "[redacted]", token: "[redacted]", keep: 1 },
    });
  });

  it("scrubs the configured Qloo key wherever it appears", () => {
    process.env.QLOO_API_KEY = "sk-qloo-123456789";
    expect(redact({ note: "used sk-qloo-123456789 today" })).toEqual({
      note: "used [redacted] today",
    });
    expect(scrubString("x sk-qloo-123456789")).toBe("x [redacted]");
  });

  it("truncates long strings and caps arrays and depth", () => {
    const out = redact({ s: "a".repeat(500), arr: Array.from({ length: 40 }, (_, i) => i) }) as {
      s: string;
      arr: number[];
    };
    expect(out.s.length).toBeLessThanOrEqual(241);
    expect(out.arr).toHaveLength(25);
    const deep = redact({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } });
    expect(JSON.stringify(deep)).toContain("[…]");
  });

  it("leaves primitives alone and drops functions", () => {
    expect(redact(3)).toBe(3);
    expect(redact(null)).toBeNull();
    expect(redact({ f: () => 1, ok: true })).toEqual({ ok: true });
  });
});
