/**
 * Pre-warm the Qloo cache for the sample artists and save their plans to data/samples/.
 * Needs QLOO_API_KEY (and optionally GEMINI_API_KEY or ANTHROPIC_API_KEY). Commit the JSON files it writes:
 * they are the "saved result" fallback when live Qloo calls fail.
 */
import { getQloo } from "../lib/qloo/client";
import { warmSamples } from "../lib/warm";

async function main() {
  const results = await warmSamples({
    writeSamples: true,
    onEvent: (slug, e) => {
      if (e.type === "tool" && e.phase === "end")
        console.error(
          `[${slug}] ${e.evidence.id} ${e.evidence.tool} ${e.evidence.status}${e.evidence.cached ? " (cached)" : ""}`,
        );
    },
  });
  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.slug}: ${r.detail}`);
  await getQloo().close();
  process.exitCode = results.every((r) => r.ok) ? 0 : 1;
}

void main();
