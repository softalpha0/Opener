import type { ComparisonRow, QlooCityRank } from "./generic";

/** Plain-words Qloo standing for a city (client-safe: no city table import). */
export function qlooStanding(qloo: QlooCityRank | undefined): string {
  return qloo
    ? `#${qloo.rank} of ${qloo.of} cities in Qloo's ${qloo.area} heatmap (affinity ${qloo.affinity.toFixed(2)})`
    : "No Qloo heatmap match";
}

/** Plain-words verdict for one generic-tour city. */
export function rowVerdict(row: ComparisonRow): string {
  if (row.outsideSearch)
    return "Outside the countries Opener searched, so Qloo has no heatmap for it here.";
  if (!row.qloo)
    return "Not among the cities Opener matched to Qloo's top heatmap cells for this country.";
  const where = qlooStanding(row.qloo);
  return row.openerOrder !== undefined ? `${where}. Opener also picked it.` : `${where}.`;
}
