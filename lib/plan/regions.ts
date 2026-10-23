/**
 * Region presets. qloo_where_popular needs a `within` area that Qloo can resolve to a
 * locality, so each preset expands to country-level queries (continent names are not
 * reliable locality matches). Each area costs one Qloo call.
 */
export interface RegionPreset {
  id: string;
  label: string;
  within: string[];
}

export const REGIONS: RegionPreset[] = [
  {
    id: "worldwide",
    label: "Worldwide",
    within: ["United States", "United Kingdom", "Germany", "Australia"],
  },
  { id: "north-america", label: "North America", within: ["United States", "Canada"] },
  { id: "us", label: "United States", within: ["United States"] },
  { id: "europe", label: "Europe", within: ["Germany", "France", "Netherlands", "Spain"] },
  { id: "uk", label: "UK & Ireland", within: ["United Kingdom", "Ireland"] },
  {
    id: "latin-america",
    label: "Latin America",
    within: ["Mexico", "Brazil", "Argentina", "Chile"],
  },
  { id: "oceania", label: "Australia & NZ", within: ["Australia", "New Zealand"] },
];

export const DEFAULT_REGION = "north-america";

export function regionById(id: string | undefined): RegionPreset {
  return (
    REGIONS.find((r) => r.id === id) ??
    (REGIONS.find((r) => r.id === DEFAULT_REGION) as RegionPreset)
  );
}
