/**
 * Run one plan from the command line against the real `qloo mcp` server.
 *   npm run plan -- "Artist Name" [region]
 * Regions: worldwide, north-america, us, europe, uk, latin-america, oceania.
 */
import { runPlan } from "../lib/agent/runner";
import { createLlmProvider } from "../lib/agent/llm";
import { QlooService } from "../lib/qloo/client";
import type { PlanEvent } from "../lib/plan/schema";

async function main() {
  const [artist, region] = process.argv.slice(2);
  if (!artist) {
    console.error('Usage: npm run plan -- "Artist Name" [region]');
    process.exit(2);
  }
  const qloo = new QlooService();
  const llm = createLlmProvider();
  console.error(
    `Planner: ${llm ? `agent (${llm.model})` : "deterministic (no GEMINI_API_KEY or ANTHROPIC_API_KEY)"}`,
  );
  const onEvent = (e: PlanEvent) => {
    if (e.type === "status") console.error(`… ${e.message}`);
    if (e.type === "tool" && e.phase === "end") {
      console.error(
        `  ${e.evidence.id.padEnd(5)} ${e.evidence.tool.padEnd(28)} ${e.evidence.status}${e.evidence.cached ? " (cached)" : ""}  ${e.evidence.summary ?? ""}`,
      );
    }
    if (e.type === "needs_input") {
      console.error(`Ambiguous artist. Pick one and pass its ID as the name:`);
      for (const c of e.candidates)
        console.error(`  ${c.id}  ${c.name}${c.description ? ` (${c.description})` : ""}`);
    }
    if (e.type === "empty") console.error(e.message);
    if (e.type === "error") console.error(`Error ${e.code}: ${e.message}\n${e.recovery}`);
  };
  try {
    const isId = /^[0-9a-f-]{36}$/i.test(artist);
    const plan = await runPlan(
      { artist, ...(isId ? { entityId: artist } : {}), ...(region ? { region } : {}) },
      { qloo, llm },
      onEvent,
    );
    if (plan) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    process.exitCode = plan ? 0 : 1;
  } finally {
    await qloo.close();
  }
}

void main();
