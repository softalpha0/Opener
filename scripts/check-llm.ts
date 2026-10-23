/**
 * One small request to the configured LLM, to check the key, model and network.
 *   npm run check-llm
 */
import { createLlmProvider } from "../lib/agent/llm";
import { scrubString } from "../lib/qloo/redact";

async function main() {
  const llm = createLlmProvider();
  if (!llm) {
    console.log(
      "No LLM configured: set GEMINI_API_KEY (or ANTHROPIC_API_KEY). Opener will use the deterministic planner.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Provider: ${llm.id}  Model: ${llm.model}`);
  const started = Date.now();
  try {
    const text = await llm.complete(
      "Answer with one word.",
      "Reply with the word OK.",
      Date.now() + 30_000,
    );
    console.log(
      `OK in ${Date.now() - started} ms. Model replied: ${JSON.stringify(text.trim().slice(0, 40))}`,
    );
  } catch (error) {
    console.log(
      `FAILED after ${Date.now() - started} ms: ${scrubString(error instanceof Error ? error.message : String(error))}`,
    );
    process.exitCode = 1;
  }
}

void main();
