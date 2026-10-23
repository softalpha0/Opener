import { toolLabel } from "./format";
import type { TourPlan } from "./schema";

/** Plain-markdown export of a plan for "Copy plan". */
export function planToMarkdown(plan: TourPlan, url?: string): string {
  const lines: string[] = [];
  lines.push(`# ${plan.artist.name}: tour plan (${plan.query.regionLabel})`, "");
  if (plan.saved) lines.push(`_Saved result from ${plan.saved.savedAt}. Not live data._`, "");
  lines.push(
    `_Generated ${plan.generatedAt} by Opener (${plan.mode === "agent" ? `agent, ${plan.model ?? "LLM"}` : "deterministic planner"}) from Qloo taste-graph results._`,
    "",
  );
  lines.push("## Summary (agent interpretation)", "", plan.summary, "");
  lines.push("## Route", "");
  for (const stop of plan.stops) {
    lines.push(
      `${stop.order}. **${stop.city}**, ${stop.region ? `${stop.region}, ` : ""}${stop.country}: affinity ${stop.affinityScore?.toFixed(2) ?? "–"} (${stop.area ? `#${stop.demandRank} in ${stop.area}` : `demand rank #${stop.demandRank}`}) [${stop.evidenceIds.join(", ")}]`,
    );
    lines.push(`   - ${stop.reason}`);
    if (stop.openers.length)
      lines.push(`   - Openers: ${stop.openers.map((o) => o.name).join(", ")}`);
  }
  lines.push("");
  if (plan.openerSpotlight) {
    lines.push(
      "## Opener spotlight",
      "",
      `**${plan.openerSpotlight.openerName}**: ${plan.openerSpotlight.note}`,
    );
    if (plan.openerSpotlight.shared.length)
      lines.push(`Signals: ${plan.openerSpotlight.shared.map((s) => s.name).join(", ")}`);
    lines.push("");
  }
  lines.push("## Audience", "", `Momentum: **${plan.momentum.direction}**. ${plan.momentum.note}`);
  if (plan.demographics.items.length) {
    lines.push("", "Relative affinity by group (positive = above average):");
    for (const d of plan.demographics.items)
      lines.push(`- ${d.group} ${d.label}: ${d.value >= 0 ? "+" : ""}${d.value.toFixed(2)}`);
  }
  if (plan.artist.tags.length)
    lines.push("", `Tags: ${plan.artist.tags.map((t) => t.name).join(", ")}`);
  lines.push("");
  if (plan.crossover.length) {
    lines.push("## Crossover tastes", "");
    for (const c of plan.crossover)
      lines.push(`- **${c.label}**: ${c.items.map((i) => i.name).join(", ")} [${c.evidenceId}]`);
    lines.push("");
  }
  if (plan.merchIdeas.length) {
    lines.push("## Merch & promo ideas (agent suggestions)", "");
    for (const m of plan.merchIdeas) lines.push(`- ${m.idea} [${m.evidenceIds.join(", ")}]`);
    lines.push("");
  }
  lines.push("## Qloo evidence", "");
  for (const e of plan.evidence)
    lines.push(`- ${e.id} · ${toolLabel(e.tool)} · ${e.status} · ${e.summary}`);
  lines.push("", "## Limitations", "", ...plan.limitations.map((l) => `- ${l}`));
  if (url) lines.push("", url);
  return lines.join("\n");
}
