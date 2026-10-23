import type { TrendPoint } from "../qloo/parse";

export interface Momentum {
  direction: "rising" | "steady" | "falling" | "unknown";
  note: string;
  series: Array<{ date: string; value: number }>;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Compare the average population percentile at the start and end of the window.
 * A move of 2+ percentile points counts as rising or falling.
 */
export function computeMomentum(points: TrendPoint[]): Momentum {
  const series = points
    .filter((p): p is TrendPoint & { percentile: number } => typeof p.percentile === "number")
    .map((p) => ({ date: p.date, value: p.percentile }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (series.length < 4) {
    return {
      direction: "unknown",
      note: "Qloo returned too few trend points to call a direction.",
      series,
    };
  }
  const k = Math.min(4, Math.floor(series.length / 2));
  const early = mean(series.slice(0, k).map((p) => p.value));
  const late = mean(series.slice(-k).map((p) => p.value));
  const diff = late - early;
  const direction = diff >= 2 ? "rising" : diff <= -2 ? "falling" : "steady";
  const first = series[0]?.date ?? "";
  const last = series[series.length - 1]?.date ?? "";
  return {
    direction,
    note: `Qloo population percentile moved from an average of ${early.toFixed(1)} in the earliest weeks to ${late.toFixed(1)} in the latest (${first} to ${last}).`,
    series,
  };
}
