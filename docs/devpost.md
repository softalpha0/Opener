# Opener: Devpost write-up

**Elevator pitch:** An AI tour-routing agent for independent artists. It plans the tour around where Qloo says the fans are, and shows you the tour a plain LLM would have guessed instead.

## Inspiration

Ask a language model where an indie artist should tour and you get the biggest cities in the country. Small teams make the same guess, and it's how tours lose money: big rooms where nobody knows the act, while the towns where the audience clusters get skipped. Qloo answers the booker's real question: where does this audience over-index, and who else do they like?

## What it does

Every plan has a **Generic vs Opener** comparison: a tour picked without data (the same model with only the artist's name and countries, or the largest cities when the model is unavailable) next to Opener's, with each generic city looked up in Qloo's heatmaps. For Phoebe Bridgers in North America, five of the eight big-city picks (New York, Los Angeles, Chicago, Houston, Calgary) had no match in Qloo's top heat cells for her. Opener routes her through Boston, Portland, Seattle and Vancouver instead, the top cities in Qloo's heatmaps. For stars with audiences everywhere, like Sia, the guess and Qloo mostly agree (6 of 8). Opener matters most for indie acts.

You type an artist and a region, and Opener:

- resolves the artist in Qloo, and asks you to choose if the name is ambiguous;
- maps where the audience over-indexes in each country and turns it into a routed 5–8 stop tour;
- explains each stop in plain words: its rank in Qloo's heatmap for that country, its affinity score and how many heat cells it covers;
- suggests openers per city from artists Qloo recommends to the same audience, located in that city;
- shows who over-indexes and what else the crowd likes.

An **Under the hood** drawer lists every Qloo call with its input, timing and the fields Opener used.

## What makes it Qloo-powered

Without Qloo, Opener has no cities, openers or audience. Each call decides something:

- `qloo_describe`: which artist this is, or a stop to ask you.
- `qloo_where_popular`, one per country: which cities make the tour and in what rank.
- `qloo_recommend` (`target_type: artist`, `signal_location: "City, Country"`): the openers for each city.
- `qloo_compare_audiences`: why the lead opener fits, from tags both audiences share.
- `qloo_audience_demographics`, `qloo_entity_tags`, `qloo_trends`: who the crowd is and whether the artist is rising.
- `qloo_recommend` for brands, TV, film, podcasts and places: merch and promo ideas.

The comparison reuses the heatmaps, so it costs no extra Qloo calls.

## How we built it

Next.js 15 in one Docker container that keeps `qloo mcp` running over stdio. A Gemini agent (free tier; Claude also works) chooses Qloo calls from the real tool schemas. Code does everything numeric: cell-to-city mapping, per-country ranking and routing. The server checks the model's draft against the recorded calls and drops any city, opener or citation Qloo didn't return. Results are cached for 24 hours.

## Challenges we ran into

- Heatmaps return grid cells, not cities, so we built cell-to-city mapping.
- Scores are relative to each country: every country's best cell is about 1.0. Our first worldwide plan ranked Lagos level with London, so plans now rank within each country.
- Gemini's free tier was busy or out of quota, so we added model fallbacks, retries and a fixed planner.

## Accomplishments that we're proud of

- Every number on the page traces to a Qloo call you can open.
- The no-Qloo comparison is on every plan, not just in the pitch.
- 85 unit tests and 10 end-to-end runs, in CI, none touching the live API.

## What we learned

Read the raw numbers before trusting a ranking. Treat the model's output as a draft to check, not an answer to show.

## What's next for Opener

Venue capacity, dates and drive times, and recorded comparisons for niche artists, where we expect the gap to be largest.

## Built with

`qloo` · `qloo-harness` · `mcp` · `gemini` · `next.js` · `react` · `typescript` · `tailwindcss` · `maplibre` · `zod` · `docker` · `render` · `vitest` · `playwright` · `github-actions` · `geonames`
