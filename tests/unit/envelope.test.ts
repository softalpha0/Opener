import { describe, expect, it } from "vitest";
import { hasResults, isCacheable, normalizeEnvelope } from "@/lib/qloo/envelope";

describe("normalizeEnvelope", () => {
  it("reads structuredContent", () => {
    const env = normalizeEnvelope({
      structuredContent: {
        status: "ok",
        summary: "2 results",
        results: [{ name: "a" }, { name: "b" }],
        result_count: 2,
      },
    });
    expect(env.status).toBe("ok");
    expect(env.result_count).toBe(2);
    expect(env.warnings).toEqual([]);
    expect(hasResults(env)).toBe(true);
  });

  it("falls back to a JSON text block", () => {
    const env = normalizeEnvelope({
      content: [
        { type: "text", text: JSON.stringify({ status: "empty", summary: "none", results: [] }) },
      ],
    });
    expect(env.status).toBe("empty");
    expect(env.result_count).toBe(0);
    expect(hasResults(env)).toBe(false);
  });

  it("treats a missing status as an error instead of guessing", () => {
    const env = normalizeEnvelope({ structuredContent: { summary: "weird", results: [] } });
    expect(env.status).toBe("error");
    expect(env.error?.code).toBe("UNKNOWN");
    expect(env.error?.retryable).toBe(false);
  });

  it("returns INVALID_RESULT for unparseable text", () => {
    const env = normalizeEnvelope({ content: [{ type: "text", text: "not json" }] });
    expect(env.status).toBe("error");
    expect(env.error?.code).toBe("INVALID_RESULT");
  });

  it("keeps error details and retryability", () => {
    const env = normalizeEnvelope({
      structuredContent: {
        status: "error",
        summary: "slow down",
        results: [],
        error: {
          code: "QLOO_RATE_LIMIT",
          layer: "qloo",
          retryable: true,
          recovery: "Wait a minute.",
        },
      },
    });
    expect(env.error).toEqual({
      code: "QLOO_RATE_LIMIT",
      layer: "qloo",
      retryable: true,
      recovery: "Wait a minute.",
    });
    expect(isCacheable(env)).toBe(false);
  });

  it("exposes qloo_trends `series` as results", () => {
    const env = normalizeEnvelope({
      structuredContent: { status: "ok", summary: "", series: [{ points: [] }], result_count: 1 },
    });
    expect(Array.isArray(env.results)).toBe(true);
    expect(env.result_count).toBe(1);
    expect(env.summary).toBe("1 result.");
  });

  it.each(["partial", "degraded"] as const)(
    "renders %s results and keeps the summary",
    (status) => {
      const env = normalizeEnvelope({
        structuredContent: {
          status,
          summary: "Reduced quality",
          results: [{}],
          result_count: 1,
          warnings: ["w1", 5],
        },
      });
      expect(hasResults(env)).toBe(true);
      expect(env.summary).toBe("Reduced quality");
      expect(env.warnings).toEqual(["w1"]);
      expect(isCacheable(env)).toBe(true);
    },
  );

  it("marks isError results as errors", () => {
    const env = normalizeEnvelope({
      isError: true,
      structuredContent: { status: "ok", summary: "x" },
    });
    expect(env.status).toBe("error");
  });
});
