# Devpost submission: Opener

## Project name

Opener

## Elevator pitch (under 200 characters)

Opener is an AI tour-routing agent for indie musicians. It uses Qloo's taste graph to find where an artist's fans cluster, suggest openers and read the crowd, with sources.

## About the project

### Inspiration

Small artists and their managers plan tours with very little data. Cities get picked because the band played there last year or because an agent knows a promoter. Openers get booked because they're free that week. A general chatbot doesn't help much: ask it where an indie act should play and it lists the biggest cities in the country.

Qloo's taste graph answers a different question: where does this particular audience over-index, and what else do those people like? We wanted to see whether an agent could turn that into a plan a booking agent would actually read.

### What it does

You type an artist and pick a region. Opener:

- resolves the artist in Qloo, and asks you to choose if the name is ambiguous;
- pulls Qloo heatmaps for the region and turns the hottest cells into 5–8 routed tour stops, each with a reason tied to a specific Qloo result;
- suggests openers for each stop from artists Qloo recommends for the headliner's audience, using a city location signal for the top markets, and compares the two audiences for the lead pick;
- shows who over-indexes in the audience (relative age and gender affinity), audience tags, and the brands, shows, films, podcasts and local places the audience likes;
- reads the artist's popularity trend over the past year.

Every card has a "Qloo evidence" toggle with the tool name, the redacted request and the key result fields. The agent's own words are marked as interpretation, separate from Qloo data. You can copy the plan as Markdown, download it as JSON, or share a link.

### How we built it

Opener is one Next.js 15 app running in a Docker container. The backend starts `qloo mcp` from the Qloo harness once, keeps it alive, and talks to it over stdio with the MCP SDK. Every tool call goes through a small client that caches results for 24 hours (memory plus disk), retries only errors Qloo marks as retryable, and respawns the MCP process if it dies.

The agent is Claude (Sonnet 5.5 by default) in a tool-calling loop with the real Qloo tool schemas from `listTools()`. Each call gets an evidence ID and streams to the browser over server-sent events, so you can watch the agent work. Claude finishes with a JSON draft; the server validates it with Zod and then rebuilds the plan from the evidence. A stop survives only if its city matches a city derived from a heatmap result, and an opener survives only if it appeared in a recommend or rank result. Numbers always come from Qloo, never from the model. If there's no LLM key, a fixed tool chain builds the whole plan.

The map is MapLibre with free Carto tiles. Tests are Vitest (including a fake MCP server and a fake LLM that tries to sneak in invented cities) and Playwright.

### Challenges we ran into

- **Heatmaps return grid cells, not cities.** `qloo_where_popular` gives latitude, longitude and affinity per cell. To turn that into tour stops we bundled a GeoNames city table and map each cell to the nearest large city within 90 km, keeping each city's strongest cell.
- **`within` has to be a real locality.** Continent names aren't reliable matches, so region presets expand to a few large countries each. That trades some coverage for answers that don't fail.
- **We built most of it without live data.** We wrote a fake `qloo mcp` that returns the harness's real result shapes (read from the harness source and Qloo's docs) with obviously fictional names, and drove the whole pipeline, UI and tests from it.
- **Keeping the model honest.** Early on it was clear the model could name a city or opener that no tool returned. Rather than trusting the prompt, the server cross-checks every stop, opener and evidence ID against the recorded tool calls and drops what doesn't match.
- **Deployment details.** `next.config.ts` needed TypeScript at runtime, which the slim production image didn't have, so the config moved to `.mjs`. The map's canvas also stretched the route grid past a 375px screen until we fixed the column sizing, and the WebGL map was the main source of blocking time on the plan page until we mounted it only when scrolled into view.

### Accomplishments that we're proud of

- Every number and name on the page traces back to a Qloo call you can open.
- Ambiguous artists are never guessed: Opener stops and shows the candidates.
- The agent and the fixed tool chain share the same evidence and validation, so the plan degrades instead of failing when the LLM is slow or missing.
- Lighthouse on mobile: 99 performance and 100 accessibility on the landing page, 95 and 100 on the plan page.

### What we learned

- The harness's `needs_input` status and its resolution candidates make "don't guess" easy to build in, as long as you pass the resolved Qloo ID (not the name) to every later call.
- Qloo demographic values are relative affinities, not shares of the audience. That changed the UI from percentage bars to above/below-average bars.
- `qloo_trends` puts its data under `series`, not `results`, so normalizing the envelope early saved a lot of special cases.
- An agent is more useful when the server treats its output as a draft to check, not an answer to display.

### What's next for Opener

- Venue capacity matching per city
- Date and drive-time aware routing
- A read-only plan page that booking agents can comment on
- Ranking every city's opener shortlist with `qloo_rank`

## Built with

`qloo` · `qloo-harness` · `mcp` · `claude` · `anthropic` · `next.js` · `react` · `typescript` · `tailwindcss` · `maplibre` · `openstreetmap` · `zod` · `docker` · `render` · `vitest` · `playwright` · `geonames`
