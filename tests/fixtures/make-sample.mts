// Regenerates tests/fixtures/samples/fixture-artist.json from the fake Qloo server.
// Test-only data: every name in it is fictional. Run: npx tsx tests/fixtures/make-sample.mts
import { writeFileSync } from "node:fs";
import { runPlan } from "../../lib/agent/runner";
import { fakeCaller } from "./fake-qloo";

const plan = await runPlan(
  { artist: "Fixture Artist", region: "north-america" },
  { qloo: fakeCaller(), llm: null, now: () => new Date("2026-10-01T12:00:00Z") },
  () => undefined,
);
if (!plan) throw new Error("fixture plan failed");
plan.saved = { savedAt: "2026-10-01T12:00:00.000Z", label: "Test fixture (fictional data)" };
writeFileSync(
  new URL("./samples/fixture-artist.json", import.meta.url),
  `${JSON.stringify(plan, null, 2)}\n`,
);
console.log("wrote fixture-artist.json");
