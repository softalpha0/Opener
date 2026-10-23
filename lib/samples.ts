import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TourPlanSchema, type TourPlan } from "./plan/schema";

/** Sample artists shown on the landing page and pre-warmed at deploy time. */
export const SAMPLE_ARTISTS = [
  {
    slug: "phoebe-bridgers",
    name: "Phoebe Bridgers",
    region: "north-america",
    blurb: "Indie folk",
  },
  { slug: "khruangbin", name: "Khruangbin", region: "europe", blurb: "Psychedelic trio" },
  { slug: "japanese-breakfast", name: "Japanese Breakfast", region: "us", blurb: "Indie pop" },
] as const;

export const SAMPLES_DIR = process.env.OPENER_SAMPLES_DIR || join(process.cwd(), "data", "samples");

export interface SavedSampleInfo {
  slug: string;
  artist: string;
  region: string;
  savedAt: string;
}

/** Saved plans committed under data/samples (written by `npm run warm-cache`). */
export function listSavedSamples(dir = SAMPLES_DIR): SavedSampleInfo[] {
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files.flatMap((file) => {
    const plan = readSavedSample(file.replace(/\.json$/, ""), dir);
    return plan?.saved
      ? [
          {
            slug: file.replace(/\.json$/, ""),
            artist: plan.artist.name,
            region: plan.query.regionLabel,
            savedAt: plan.saved.savedAt,
          },
        ]
      : [];
  });
}

export function readSavedSample(slug: string, dir = SAMPLES_DIR): TourPlan | undefined {
  if (!/^[a-z0-9-]+$/.test(slug)) return undefined;
  try {
    const parsed = TourPlanSchema.safeParse(
      JSON.parse(readFileSync(join(dir, `${slug}.json`), "utf8")),
    );
    return parsed.success && parsed.data.saved ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
