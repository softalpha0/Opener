import rawCities from "./cities.json";

/** Compact city row from GeoNames cities15000 (CC BY 4.0). */
export interface City {
  n: string;
  a: string;
  cc: string;
  c: string;
  lat: number;
  lng: number;
  pop: number;
}

export const CITIES = rawCities as City[];

const EARTH_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Nearest bundled city to a point, preferring larger cities when several are close
 * (a heat cell between two suburbs should map to the metro a tour would actually play).
 */
export function nearestCity(
  lat: number,
  lng: number,
  maxKm = 90,
  countryCode?: string,
): { city: City; km: number } | undefined {
  let best: { city: City; km: number; score: number } | undefined;
  for (const city of CITIES) {
    if (countryCode && city.cc !== countryCode) continue;
    if (Math.abs(city.lat - lat) > 2 || Math.abs(city.lng - lng) > 3) continue;
    const km = distanceKm(lat, lng, city.lat, city.lng);
    if (km > maxKm) continue;
    // Gravity-style score: coarse heat cells land on the metro a tour would play, not a suburb,
    // while a cell well inside a mid-size city still maps to it.
    const score = km / Math.sqrt(city.pop / 100_000);
    if (!best || score < best.score) best = { city, km, score };
  }
  return best ? { city: best.city, km: best.km } : undefined;
}

export function cityKey(city: Pick<City, "n" | "cc">): string {
  return `${city.n}|${city.cc}`.toLowerCase();
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Look up a city by name (and optional country) in the bundled table. */
export function findCity(name: string, country?: string): City | undefined {
  const target = fold(name);
  const countryFold = country ? fold(country) : undefined;
  return CITIES.find(
    (c) =>
      fold(c.n) === target &&
      (!countryFold || fold(c.c) === countryFold || c.cc.toLowerCase() === countryFold),
  );
}

/** ISO code for an area name that is a country in the bundled table ("Germany" → "DE"). */
export function countryCodeFor(area: string): string | undefined {
  const target = fold(area);
  return CITIES.find((c) => fold(c.c) === target)?.cc;
}
