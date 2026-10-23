/**
 * Test-only fake of `qloo mcp`. Every name and number here is fictional fixture data that
 * mimics the harness result shapes (harness 0.1.26); it is never shown as real Qloo data.
 */
import type { CallOutcome, McpConnection } from "../../lib/qloo/client";
import { normalizeEnvelope } from "../../lib/qloo/envelope";
import type { ToolArgs } from "../../lib/qloo/types";
import schemas from "../../docs/qloo-tool-schemas.json";

export const ARTIST_ID = "00000000-0000-4000-8000-000000000001";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const entity = (n: number, name: string, extra: Record<string, unknown> = {}) => ({
  entity_id: id(n),
  name,
  type: "urn:entity",
  popularity: 0.9 - n / 1000,
  affinity: Math.max(0.1, 0.95 - (n % 50) / 100),
  ...extra,
});

const cells: Record<string, Array<[number, number, number]>> = {
  "united states": [
    [41.88, -87.63, 0.99],
    [41.85, -87.68, 0.97],
    [40.71, -74.0, 0.96],
    [45.52, -122.68, 0.95],
    [47.61, -122.33, 0.94],
    [42.36, -71.06, 0.93],
    [30.27, -97.74, 0.91],
    [39.74, -104.99, 0.9],
    [44.98, -93.27, 0.88],
    [10.0, -140.0, 0.87],
  ],
  "united kingdom": [
    [51.5, -0.12, 1],
    [53.48, -2.24, 0.99],
  ],
  germany: [
    [52.52, 13.4, 1],
    [48.14, 11.58, 0.99],
  ],
  nigeria: [[6.45, 3.39, 1]],
  australia: [
    [-33.87, 151.21, 1],
    [-37.81, 144.96, 0.99],
  ],
  canada: [
    [43.65, -79.38, 0.97],
    [45.5, -73.57, 0.92],
  ],
};

function body(tool: string, args: ToolArgs): Record<string, unknown> {
  const base = {
    schema_version: "1.0-preview.1",
    operation: tool.replace("qloo_", ""),
    warnings: [],
  };
  switch (tool) {
    case "qloo_describe": {
      if (String(args.entity).toLowerCase() === "twin name") {
        return {
          ...base,
          status: "needs_input",
          summary: "Choose the intended Qloo entity.",
          resolution: {
            issues: [
              {
                input: "Twin Name",
                kind: "ambiguous",
                field: "entity",
                candidates: [
                  { id: id(901), name: "Twin Name", description: "Fixture duo" },
                  { id: id(902), name: "Twin Name", description: "Fixture solo act" },
                ],
              },
            ],
          },
          results: [],
        };
      }
      if (String(args.entity).toLowerCase() === "nobody") {
        return {
          ...base,
          status: "needs_input",
          summary: "Choose the intended Qloo entity.",
          resolution: { issues: [{ input: "nobody", kind: "not_found" }] },
          results: [],
        };
      }
      return {
        ...base,
        status: "ok",
        summary: "Resolved 1 entity.",
        interpretation: {
          entity: {
            input: args.entity,
            entityId: ARTIST_ID,
            name: "Fixture Artist",
            match: "exact",
          },
        },
        resolution: {
          outcomes: [
            { status: "resolved", alternatives: [{ id: id(903), name: "Fixture Artist Tribute" }] },
          ],
        },
        results: [
          entity(1, "Fixture Artist", {
            properties: { short_description: "Fictional test artist" },
          }),
        ],
        result_count: 1,
      };
    }
    case "qloo_where_popular": {
      const list = cells[String(args.within).toLowerCase()] ?? [];
      return {
        ...base,
        status: list.length ? "ok" : "empty",
        summary: `${list.length} heat cells.`,
        results: list.map(([lat, lng, a]) => ({
          location: { latitude: lat, longitude: lng, geohash: "xxxx" },
          query: { affinity: a, affinity_rank: a, popularity: 0.5 },
        })),
        result_count: list.length,
      };
    }
    case "qloo_recommend": {
      const type = String(args.target_type);
      const offset =
        { artist: 100, brand: 200, tv_show: 300, movie: 400, podcast: 500, place: 600 }[type] ??
        700;
      const loc =
        typeof args.signal_location === "string" ? args.signal_location.split(",")[0] : "";
      const n = Number(args.limit ?? 10);
      const shift = loc ? loc.length : 0;
      const results = Array.from({ length: n }, (_, i) =>
        entity(
          offset + i + shift,
          `Fixture ${type} ${String.fromCharCode(65 + ((i + shift) % 26))}`,
        ),
      );
      if (type === "artist") results.unshift(entity(1, "Fixture Artist"));
      return {
        ...base,
        status: "ok",
        summary: `${results.length} recommendations.`,
        results,
        result_count: results.length,
      };
    }
    case "qloo_audience_demographics":
      return {
        ...base,
        status: "ok",
        summary: "Demographics.",
        results: [
          {
            entity_id: ARTIST_ID,
            query: {
              age: {
                "24_and_younger": 0.2,
                "25_to_29": 0.31,
                "30_to_34": 0.05,
                "35_to_44": -0.1,
                "45_to_54": -0.2,
                "55_and_older": -0.3,
              },
              gender: { male: -0.05, female: 0.05 },
            },
          },
        ],
        result_count: 1,
      };
    case "qloo_entity_tags":
      return {
        ...base,
        status: "partial",
        summary: "Some tags could not be scored.",
        results: [
          { id: "urn:tag:genre:fixture_one", name: "fixture folk", type: "urn:tag:genre" },
          { id: "urn:tag:genre:fixture_two", name: "fixture indie", type: "urn:tag:genre" },
        ],
        result_count: 2,
      };
    case "qloo_trends":
      return {
        ...base,
        status: "ok",
        summary: "1 series.",
        series: [
          {
            entity: { entityId: ARTIST_ID, name: "Fixture Artist" },
            points: Array.from({ length: 10 }, (_, i) => ({
              date: `2026-0${Math.floor(i / 4) + 1}-${String((i % 4) * 7 + 1).padStart(2, "0")}`,
              population_percentile: 70 + i,
            })),
          },
        ],
        result_count: 1,
      };
    case "qloo_compare_audiences":
      return {
        ...base,
        status: "ok",
        summary: "Compared.",
        results: {
          tags: [
            {
              tag_id: "urn:tag:genre:fixture_one",
              name: "fixture folk",
              subtype: "urn:tag:genre",
              query: { affinity: 0.8 },
            },
          ],
        },
      };
    default:
      return {
        ...base,
        status: "error",
        summary: "unsupported in fixture",
        results: [],
        error: { code: "FIXTURE", layer: "test", retryable: false, recovery: "n/a" },
      };
  }
}

/** A QlooCaller that answers from the fixtures (no MCP process). */
export function fakeCaller(log: Array<{ tool: string; args: ToolArgs }> = []) {
  return {
    log,
    async call(tool: string, args: ToolArgs): Promise<CallOutcome> {
      log.push({ tool, args });
      return {
        envelope: normalizeEnvelope({ structuredContent: body(tool, args) }),
        cached: false,
        fetchedAt: "2026-10-01T00:00:00.000Z",
        attempts: 1,
      };
    },
    async listTools() {
      return schemas.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown>,
      }));
    },
  };
}

/** A fake MCP connection for exercising QlooService itself. */
export function fakeConnection(
  handler?: (name: string, args: ToolArgs) => unknown,
): McpConnection & { calls: number; closed: boolean } {
  const conn = {
    calls: 0,
    closed: false,
    async listTools() {
      return {
        tools: schemas.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      };
    },
    async callTool(params: { name: string; arguments?: Record<string, unknown> }) {
      conn.calls++;
      if (handler) return handler(params.name, (params.arguments ?? {}) as ToolArgs);
      return { structuredContent: body(params.name, (params.arguments ?? {}) as ToolArgs) };
    },
    async close() {
      conn.closed = true;
    },
  };
  return conn;
}
