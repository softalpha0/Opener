# Architecture

Opener is one deployable service: a Next.js 15 app run with `next start` in a long-running Docker container. The same process owns a single `qloo mcp` child process.

```
Browser ──POST /api/plan──▶ Next.js route ──▶ runPlan()
   ▲                                            │
   └──────── SSE: status, tool, heat, plan ◀────┤
                                                ├─▶ Agent loop (Gemini/Claude, tools)  ─┐
                                                └─▶ Fixed tool chain (gap fill)         ├─▶ Toolbox ─▶ QlooService ─stdio─▶ qloo mcp ─▶ Qloo API
                                                                                        ┘   (evidence IDs, budget)  (cache, retry, respawn)
```

## Modules

| Path                   | Role                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/qloo/client.ts`   | `QlooService`: lazy singleton MCP connection, `listTools()`, `call()` with 24h cache and bounded retries, respawn on transport failure, readiness via `qloo_capabilities`. |
| `lib/qloo/envelope.ts` | Normalizes every tool result into `{status, summary, results, result_count, warnings, error?}`.                                                                            |
| `lib/qloo/cache.ts`    | `TtlCache`: in-memory LRU in front of one JSON file per key on disk.                                                                                                       |
| `lib/qloo/parse.ts`    | Typed readers for entities, candidates, heat cells, demographics, trends, tags and compare results.                                                                        |
| `lib/qloo/tools.ts`    | Argument types mirroring `docs/qloo-tool-schemas.json`.                                                                                                                    |
| `lib/qloo/redact.ts`   | Removes secret-looking keys and configured secret values before anything is shown or logged.                                                                               |
| `lib/agent/toolbox.ts` | Per-run recorder: evidence IDs, redacted inputs, key fields, call/time budget, SSE events.                                                                                 |
| `lib/agent/llm.ts`     | Provider interface, provider selection, and the Anthropic tool-calling loop.                                                                                               |
| `lib/agent/gemini.ts`  | Gemini tool-calling loop (Google Interactions API, stateless).                                                                                                             |
| `lib/agent/prompt.ts`  | System prompt and JSON extraction.                                                                                                                                         |
| `lib/agent/gather.ts`  | Fixed tool chain steps (`ensureHeat`, `ensureOpeners`, …) that skip work the agent already did.                                                                            |
| `lib/agent/compose.ts` | Builds the `TourPlan` from evidence plus the agent draft, dropping anything ungrounded.                                                                                    |
| `lib/agent/runner.ts`  | Orchestrates a run: resolve → agent → gap fill → compose → validate.                                                                                                       |
| `lib/plan/schema.ts`   | Zod schemas for `TourPlan`, the agent draft and SSE events.                                                                                                                |
| `lib/geo/cities.ts`    | Nearest-city lookup over the bundled GeoNames subset.                                                                                                                      |

## Run budget

- 20 Qloo calls per plan, about 90 seconds for the agent loop (`OPENER_AGENT_TIME_MS`), and the fallback planner always gets at least 45 seconds of its own.
- Cache key: SHA-256 of the tool name plus normalized arguments (sorted keys, trimmed lower-case strings).
- Plans are also cached for 24 hours by (artist or entity ID, region); cached plans skip the per-IP rate limit.

## Status handling

| Status                 | Behaviour                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ok`                   | Rendered.                                                                                                                  |
| `empty`                | "No match" message with a hint to refine.                                                                                  |
| `needs_input`          | Run stops; candidates shown; nothing is auto-picked.                                                                       |
| `partial` / `degraded` | Rendered, with a notice using the result's summary.                                                                        |
| `error`                | Retried up to twice only when `error.retryable`; otherwise the UI shows friendly copy, a retry button and any saved plans. |
