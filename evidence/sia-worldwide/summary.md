# Sia: Worldwide

- Source: saved plan file tests/fixtures/recorded/sia-worldwide.json
- Plan generated: 2026-10-23T21:40:40.714Z by the deterministic planner
- Countries searched: United States, United Kingdom, Germany, Nigeria, Australia
- Qloo calls: 19 (qloo_describe, qloo_trends, qloo_recommend, qloo_where_popular, qloo_entity_tags, qloo_audience_demographics, qloo_compare_audiences)

## Qloo-ranked tour (Opener)

| #   | City                         | Qloo signal                 | Heatmap call                                   |
| --- | ---------------------------- | --------------------------- | ---------------------------------------------- |
| 1   | London, United Kingdom       | #1, affinity 1.00, 12 cells | ev3 `qloo_where_popular` within United Kingdom |
| 2   | Munich, Germany              | #7, affinity 1.00, 5 cells  | ev4 `qloo_where_popular` within Germany        |
| 3   | Berlin, Germany              | #3, affinity 1.00, 5 cells  | ev4 `qloo_where_popular` within Germany        |
| 4   | Lagos, Nigeria               | #2, affinity 1.00, 5 cells  | ev5 `qloo_where_popular` within Nigeria        |
| 5   | New York City, United States | #4, affinity 1.00, 2 cells  | ev2 `qloo_where_popular` within United States  |
| 6   | Toronto, Canada              | #5, affinity 1.00, 1 cells  | ev2 `qloo_where_popular` within United States  |
| 7   | Los Angeles, United States   | #6, affinity 1.00, 3 cells  | ev2 `qloo_where_popular` within United States  |
| 8   | San Francisco, United States | #8, affinity 1.00, 2 cells  | ev2 `qloo_where_popular` within United States  |

Openers per stop:

- London: Ellie Goulding (0.93), Sam Smith (0.92), Clean Bandit (0.92)
- Munich: Katy Perry (0.92), Marina & the Diamonds (0.92), Calvin Harris (0.92)
- Berlin: Sam Smith (0.92), MØ (0.92), Lorde
- Lagos: Rihanna, Labrinth, The Weeknd
- New York City: Ellie Goulding (0.93), Sam Smith (0.92), Calvin Harris (0.92)
- Toronto: Lady Gaga (0.92), Iggy Azalea (0.91), Jessie J (0.91)
- Los Angeles: Ellie Goulding (0.93), Sam Smith (0.92), Katy Perry (0.92)
- San Francisco: Ellie Goulding (0.93), Sam Smith (0.92), Katy Perry (0.92)

## Generic tour (largest cities by population)

> Built offline from a saved plan, so the generic tour is the population baseline (no LLM call).

| #   | City                         | What Qloo says                                                                          |
| --- | ---------------------------- | --------------------------------------------------------------------------------------- |
| 1   | New York City, United States | #2 of 11 cities in Qloo's United States heatmap (affinity 1.00). Opener also picked it. |
| 2   | London, United Kingdom       | #1 of 4 cities in Qloo's United Kingdom heatmap (affinity 1.00). Opener also picked it. |
| 3   | Berlin, Germany              | #1 of 8 cities in Qloo's Germany heatmap (affinity 1.00). Opener also picked it.        |
| 4   | Lagos, Nigeria               | #1 of 8 cities in Qloo's Nigeria heatmap (affinity 1.00). Opener also picked it.        |
| 5   | Sydney, Australia            | #1 of 6 cities in Qloo's Australia heatmap (affinity 1.00).                             |
| 6   | Los Angeles, United States   | #1 of 11 cities in Qloo's United States heatmap (affinity 1.00). Opener also picked it. |
| 7   | Birmingham, United Kingdom   | Not among the cities Opener matched to Qloo's top heatmap cells for this country.       |
| 8   | Hamburg, Germany             | #5 of 8 cities in Qloo's Germany heatmap (affinity 1.00).                               |

- Generic cities Opener also picked: 5 of 8
- Generic cities in Qloo's top 3 for their country: 6 of 8
- Generic cities with no Qloo heatmap match: 1

Opener stops the generic tour missed:

- Munich, Germany: #2 of 8 cities in Qloo's Germany heatmap (affinity 1.00)
- Toronto, Canada: No Qloo heatmap match
- San Francisco, United States: #3 of 11 cities in Qloo's United States heatmap (affinity 1.00)
