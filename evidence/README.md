# Evidence

Real outputs from Opener, so a reviewer can check the claims in the README without running anything.

| Folder                                                                       | Artist and region                               | Stops | Qloo calls |
| ---------------------------------------------------------------------------- | ----------------------------------------------- | ----- | ---------- |
| [`phoebe-bridgers-north-america/`](phoebe-bridgers-north-america/summary.md) | Phoebe Bridgers, US and Canada                  | 8     | 16         |
| [`khruangbin-europe/`](khruangbin-europe/summary.md)                         | Khruangbin, Germany, France, Netherlands, Spain | 8     | 17         |
| [`rema-africa/`](rema-africa/summary.md)                                     | Rema, Nigeria, Ghana, South Africa, Kenya       | 8     | 17         |
| [`sia-worldwide/`](sia-worldwide/summary.md)                                 | Sia, US, UK, Germany, Nigeria, Australia        | 8     | 18         |

All four were captured from https://opener-9w48.onrender.com on 2026-10-25 with `npm run evidence`.

Each folder has:

- `plan.json`: the full plan, including every Qloo call (tool, redacted input, status, timing, key result fields).
- `comparison.json`: the generic tour and where Qloo ranks each of its cities.
- `summary.md`: the same in two short tables.

## Notes

- These plans were built by the deterministic planner and the generic tours are the population baseline: Gemini's free quota was spent when they were captured. The Qloo calls and results are the same either way; the agent changes which calls are made and how the reasons are worded. Each `summary.md` states which planner and which generic tour it used.
- `tests/fixtures/recorded/sia-worldwide.json` is an older capture (2026-10-23) kept as a test fixture.
- No secrets: the Qloo key never enters plan JSON.

## Reproduce from the live link

On the live app, open a sample (for example `https://opener-9w48.onrender.com/plan?artist=Sia&region=worldwide`), then click **Generic vs Opener** and **Under the hood**. **Download JSON** saves the plan.

To capture all sample artists into this folder in one go (plans and LLM comparisons from the live app):

```sh
npm run evidence -- https://opener-9w48.onrender.com
```

Or one artist: `npm run evidence -- https://opener-9w48.onrender.com "Rema" africa`. To rebuild a folder from a downloaded plan, offline: `npm run evidence -- --from-file plan.json`.

Live plans count against the app's rate limit (5 a minute per IP) and Qloo quota, and results change as Qloo's data updates, so a new capture will not match these files exactly.
