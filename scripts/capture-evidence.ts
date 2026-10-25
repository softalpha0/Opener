/**
 * Capture evidence/ from a running Opener (the live link or localhost).
 *   npm run evidence -- https://your-app.onrender.com            # the sample artists
 *   npm run evidence -- https://your-app.onrender.com "Artist" region
 *   npm run evidence -- --from-file path/to/plan.json            # a saved plan, offline
 *
 * For each artist it writes evidence/<slug>/plan.json (the Qloo-ranked tour with every Qloo
 * call), comparison.json (the generic tour and how Qloo ranks each of its cities) and
 * summary.md. It uses the same public API a browser does, so it never sees the Qloo key.
 * --from-file builds the comparison locally with the population baseline (no LLM, no network).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compareTours, populationBaseline, type TourComparison } from "../lib/plan/generic";
import { TourPlanSchema, type PlanEvent, type TourPlan } from "../lib/plan/schema";
import { SAMPLE_ARTISTS } from "../lib/samples";
import { qlooStanding, rowVerdict } from "../lib/plan/verdict";

const OUT = join(process.cwd(), "evidence");

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function livePlan(base: string, artist: string, region: string): Promise<TourPlan> {
  const res = await fetch(`${base}/api/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ artist, region }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok || !res.body) throw new Error(`POST /api/plan → ${res.status}: ${await res.text()}`);
  const text = await res.text();
  for (const chunk of text.split("\n\n")) {
    const line = chunk.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    const event = JSON.parse(line.slice(6)) as PlanEvent;
    if (event.type === "plan") return TourPlanSchema.parse(event.plan);
    if (event.type === "error") throw new Error(`${event.code}: ${event.message}`);
    if (event.type === "empty") throw new Error(event.message);
    if (event.type === "needs_input")
      throw new Error(
        `"${artist}" is ambiguous in Qloo: ${event.candidates.map((c) => c.name).join(", ")}`,
      );
  }
  throw new Error("The plan stream ended without a plan.");
}

async function liveComparison(base: string, plan: TourPlan): Promise<TourComparison> {
  const res = await fetch(`${base}/api/compare`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json()) as { comparison?: TourComparison; message?: string };
  if (!res.ok || !body.comparison)
    throw new Error(`POST /api/compare → ${res.status}: ${body.message ?? "no comparison"}`);
  return body.comparison;
}

function summary(plan: TourPlan, c: TourComparison, source: string): string {
  const ev = new Map(plan.evidence.map((e) => [e.id, e]));
  const lines = [
    `# ${plan.artist.name}: ${plan.query.regionLabel}`,
    "",
    `- Source: ${source}`,
    `- Plan generated: ${plan.generatedAt} by the ${plan.mode === "agent" ? `agent (${plan.model})` : "deterministic planner"}`,
    `- Countries searched: ${plan.query.within.join(", ")}`,
    `- Qloo calls: ${plan.evidence.length} (${[...new Set(plan.evidence.map((e) => e.tool))].join(", ")})`,
    "",
    "## Qloo-ranked tour (Opener)",
    "",
    "| # | City | Qloo signal | Heatmap call |",
    "|---|---|---|---|",
    ...plan.stops.map((s) => {
      const call = ev.get(s.evidenceIds[0] ?? "");
      const rank = s.area ? `#${s.demandRank} in ${s.area}` : `#${s.demandRank}`;
      return `| ${s.order} | ${s.city}, ${s.country} | ${rank}, affinity ${s.affinityScore?.toFixed(2) ?? "?"}, ${s.heatCells ?? "?"} cells | ${call ? `${call.id} \`${call.tool}\` within ${String(call.inputRedacted.within ?? "")}` : ""} |`;
    }),
    "",
    "Openers per stop:",
    "",
    ...plan.stops.map(
      (s) =>
        `- ${s.city}: ${s.openers.map((o) => `${o.name}${o.affinity !== undefined ? ` (${o.affinity.toFixed(2)})` : ""}`).join(", ") || "none"}`,
    ),
    "",
    `## Generic tour (${c.generic.source === "llm" ? `${c.generic.model}, no tools, no Qloo data` : "largest cities by population"})`,
    "",
    ...(c.generic.note ? [`> ${c.generic.note}`, ""] : []),
    "| # | City | What Qloo says |",
    "|---|---|---|",
    ...c.rows.map((r, i) => `| ${i + 1} | ${r.city}, ${r.country} | ${rowVerdict(r)} |`),
    "",
    `- Generic cities Opener also picked: ${c.overlap} of ${c.rows.length}`,
    `- Generic cities in Qloo's top 3 for their country: ${c.qlooTop3} of ${c.rows.length}`,
    `- Generic cities with no Qloo heatmap match: ${c.noSignal}`,
    "",
    "Opener stops the generic tour missed:",
    "",
    ...c.openerOnly.map((o) => `- ${o.city}, ${o.country}: ${qlooStanding(o.qloo)}`),
    "",
  ];
  return lines.join("\n");
}

function write(slug: string, plan: TourPlan, c: TourComparison, source: string) {
  const dir = join(OUT, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "plan.json"), JSON.stringify(plan, null, 2) + "\n");
  writeFileSync(join(dir, "comparison.json"), JSON.stringify(c, null, 2) + "\n");
  writeFileSync(join(dir, "summary.md"), summary(plan, c, source));
  console.error(
    `wrote evidence/${slug}/ (${plan.stops.length} stops, ${plan.evidence.length} Qloo calls)`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--from-file") {
    const file = args[1];
    if (!file) throw new Error("Usage: npm run evidence -- --from-file plan.json");
    const plan = TourPlanSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    const c = compareTours(plan, {
      source: "population",
      generatedAt: new Date().toISOString(),
      stops: populationBaseline(plan.query.within, Math.max(plan.stops.length, 5)),
      note: "Built offline from a saved plan, so the generic tour is the population baseline (no LLM call).",
    });
    write(`${slugify(plan.artist.name)}-${plan.query.region}`, plan, c, `saved plan file ${file}`);
    return;
  }
  const base = args[0]?.replace(/\/$/, "");
  if (!base?.startsWith("http")) {
    throw new Error('Usage: npm run evidence -- https://your-app.onrender.com ["Artist" region]');
  }
  const targets = args[1]
    ? [{ name: args[1], region: args[2] ?? "north-america" }]
    : SAMPLE_ARTISTS.map((a) => ({ name: a.name, region: a.region }));
  for (const t of targets) {
    try {
      const plan = await livePlan(base, t.name, t.region);
      const c = await liveComparison(base, plan);
      write(`${slugify(t.name)}-${t.region}`, plan, c, `${base} on ${new Date().toISOString()}`);
    } catch (error) {
      console.error(`${t.name}: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
