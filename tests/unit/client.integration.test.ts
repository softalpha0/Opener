import { describe, expect, it } from "vitest";
import { TtlCache } from "@/lib/qloo/cache";
import { QlooService } from "@/lib/qloo/client";
import type { QlooEnvelope } from "@/lib/qloo/types";
import { fakeConnection } from "../fixtures/fake-qloo";

const memoryCache = () =>
  new TtlCache<QlooEnvelope>({ namespace: "t", ttlMs: 60_000, maxEntries: 50 });

describe("QlooService over a mocked MCP client", () => {
  it("connects once, lists tools and caches results by (tool, normalized args)", async () => {
    const conn = fakeConnection();
    let connects = 0;
    const svc = new QlooService(
      async () => {
        connects++;
        return conn;
      },
      memoryCache(),
      1,
    );
    expect((await svc.listTools()).map((t) => t.name)).toContain("qloo_where_popular");
    const first = await svc.call("qloo_describe", { entity: "Fixture Artist", type: "artist" });
    const second = await svc.call("qloo_describe", { type: "artist", entity: "  fixture artist " });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.envelope.status).toBe("ok");
    expect(conn.calls).toBe(1);
    expect(connects).toBe(1);
  });

  it("retries retryable errors at most twice, then returns the error uncached", async () => {
    const conn = fakeConnection(() => ({
      structuredContent: {
        status: "error",
        summary: "busy",
        results: [],
        error: { code: "QLOO_RATE_LIMIT", layer: "qloo", retryable: true, recovery: "Wait." },
      },
    }));
    const svc = new QlooService(async () => conn, memoryCache(), 1);
    const out = await svc.call("qloo_trends", { entities: ["x"] });
    expect(out.attempts).toBe(3);
    expect(out.envelope.error?.code).toBe("QLOO_RATE_LIMIT");
    expect(conn.calls).toBe(3);
    await svc.call("qloo_trends", { entities: ["x"] });
    expect(conn.calls).toBe(6);
  });

  it("does not retry non-retryable errors", async () => {
    const conn = fakeConnection(() => ({
      structuredContent: {
        status: "error",
        summary: "auth",
        results: [],
        error: { code: "QLOO_AUTH", layer: "qloo", retryable: false, recovery: "Set the key." },
      },
    }));
    const svc = new QlooService(async () => conn, memoryCache(), 1);
    const out = await svc.call("qloo_describe", { entity: "x" });
    expect(out.attempts).toBe(1);
    expect(conn.calls).toBe(1);
  });

  it("respawns the server when the transport dies mid-call", async () => {
    let connects = 0;
    let broken = true;
    const svc = new QlooService(
      async () => {
        connects++;
        return fakeConnection((name, args) => {
          if (broken) {
            broken = false;
            throw new Error("Connection closed");
          }
          return {
            structuredContent: {
              status: "ok",
              summary: "fine",
              results: [{ entity_id: "1", name: String(args.entity) }],
              result_count: 1,
              operation: name,
            },
          };
        });
      },
      memoryCache(),
      1,
    );
    const out = await svc.call("qloo_describe", { entity: "x" });
    expect(out.envelope.status).toBe("ok");
    expect(connects).toBe(2);
    expect(svc.stats().respawns).toBe(1);
  });

  it("reports readiness from qloo_capabilities", async () => {
    const svc = new QlooService(
      async () =>
        fakeConnection((name) =>
          name === "qloo_capabilities" ? { structuredContent: { adapter: { ready: true } } } : {},
        ),
      memoryCache(),
    );
    expect(await svc.readiness()).toEqual({ qloo: "ready", tools: 10 });
    const failing = new QlooService(async () => {
      throw new Error("spawn qloo ENOENT");
    }, memoryCache());
    expect((await failing.readiness()).qloo).toBe("missing");
  });
});
