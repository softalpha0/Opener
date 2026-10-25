import { cityKey, distanceKm, nearestCity, type City } from "../geo/cities";

/** Cities closer than this merge into the larger one (one market, one show). */
export const MERGE_KM = 110;
import type { HeatPoint } from "../qloo/parse";

export interface CityDemand {
  city: City;
  affinity: number;
  cells: number;
  meanPopularity?: number;
  bestCell: HeatPoint;
}

/**
 * Collapse Qloo heat cells into touring cities: each cell maps to the nearest bundled city
 * within 90 km, and a city scores by its strongest cell (ties broken by cell count).
 * Cells far from any bundled city are dropped rather than guessed.
 */
/** `countryCode` keeps cells on the searched country's side of a border (a US cell near Buffalo is not Toronto). */
export function citiesFromHeat(points: HeatPoint[], countryCode?: string): CityDemand[] {
  const byCity = new Map<
    string,
    {
      city: City;
      affinity: number;
      cells: number;
      popSum: number;
      popN: number;
      bestCell: HeatPoint;
    }
  >();
  for (const point of points) {
    const match = nearestCity(point.lat, point.lng, 90, countryCode);
    if (!match) continue;
    const key = cityKey(match.city);
    const current = byCity.get(key);
    if (!current) {
      byCity.set(key, {
        city: match.city,
        affinity: point.affinity,
        cells: 1,
        popSum: point.popularity ?? 0,
        popN: point.popularity === undefined ? 0 : 1,
        bestCell: point,
      });
    } else {
      current.cells++;
      if (point.popularity !== undefined) {
        current.popSum += point.popularity;
        current.popN++;
      }
      if (point.affinity > current.affinity) {
        current.affinity = point.affinity;
        current.bestCell = point;
      }
    }
  }
  // Merge neighbouring cities into the biggest one nearby, largest first.
  const merged: Array<{
    city: City;
    affinity: number;
    cells: number;
    popSum: number;
    popN: number;
    bestCell: HeatPoint;
  }> = [];
  for (const entry of [...byCity.values()].sort((a, b) => b.city.pop - a.city.pop)) {
    const host = merged.find(
      (m) => distanceKm(m.city.lat, m.city.lng, entry.city.lat, entry.city.lng) < MERGE_KM,
    );
    if (!host) {
      merged.push({ ...entry });
      continue;
    }
    host.cells += entry.cells;
    host.popSum += entry.popSum;
    host.popN += entry.popN;
    if (entry.affinity > host.affinity) {
      host.affinity = entry.affinity;
      host.bestCell = entry.bestCell;
    }
  }
  return merged
    .map(({ popSum, popN, ...rest }) => ({
      ...rest,
      ...(popN ? { meanPopularity: popSum / popN } : {}),
    }))
    .sort(compareDemand);
}

/**
 * Heatmap affinities often differ only in the third or fourth decimal (0.9999 vs 0.9997),
 * which is noise. Treat scores equal to two decimals as a tie and prefer the city with
 * more heat cells, then higher in-area popularity, then the larger metro.
 */
export function compareDemand(a: CityDemand, b: CityDemand): number {
  const round = (n: number) => Math.round(n * 100);
  return (
    round(b.affinity) - round(a.affinity) ||
    b.cells - a.cells ||
    (b.meanPopularity ?? 0) - (a.meanPopularity ?? 0) ||
    b.city.pop - a.city.pop
  );
}

/** Greedy nearest-neighbour route starting at the highest-demand city. */
export function routeOrder<T extends { lat: number; lng: number }>(
  stops: T[],
  distance: (a: T, b: T) => number,
): T[] {
  if (stops.length <= 2) return [...stops];
  const [first, ...rest] = stops;
  if (!first) return [];
  const route = [first];
  const remaining = [...rest];
  while (remaining.length) {
    const last = route[route.length - 1] as T;
    let bestIndex = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (distance(last, remaining[i] as T) < distance(last, remaining[bestIndex] as T))
        bestIndex = i;
    }
    route.push(remaining.splice(bestIndex, 1)[0] as T);
  }
  return route;
}
