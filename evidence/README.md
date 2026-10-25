# Evidence

Real outputs from Opener, so a reviewer can check the claims in the README without running anything.

| Folder                                       | What it is                                                                                                                  | Source                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| [`sia-worldwide/`](sia-worldwide/summary.md) | Sia across the US, UK, Germany, Nigeria and Australia: 19 real Qloo calls, the 8-stop plan, and the generic-tour comparison | Live Qloo hackathon API, 2026-10-23 |

Each folder has:

- `plan.json`: the full plan, including every Qloo call (tool, redacted input, status, timing, key result fields).
- `comparison.json`: the generic tour and where Qloo ranks each of its cities.
- `summary.md`: the same in two short tables.

## Notes on `sia-worldwide`

- The plan was captured from a live run on the October 23 build. That build ranked cities across countries and mapped one US cell near Buffalo to Toronto, which is why Toronto appears in its route. Both were fixed the same day; the comparison was recomputed from the same Qloo heat data with the current code, which ranks per country and keeps cells inside the country searched.
- The generic tour here is the population baseline, because the comparison was built offline from the saved plan. On the live app the generic tour comes from the configured model (no tools, no Qloo data) when a key is set.
- No secrets: the Qloo key never enters plan JSON.

## Reproduce from the live link

On the live app, open a sample (for example `LIVE_URL/plan?artist=Sia&region=worldwide`), then click **Generic vs Opener** and **Under the hood**. **Download JSON** saves the plan.

To capture all sample artists into this folder in one go (plans and LLM comparisons from the live app):

```sh
npm run evidence -- LIVE_URL
```

Or one artist: `npm run evidence -- LIVE_URL "Rema" africa`. To rebuild a folder from a downloaded plan, offline: `npm run evidence -- --from-file plan.json`.

Live plans count against the app's rate limit (5 a minute per IP) and Qloo quota, and results change as Qloo's data updates, so a new capture will not match these files exactly.
