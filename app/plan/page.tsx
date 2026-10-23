import type { Metadata } from "next";
import { PlanApp } from "@/components/PlanApp";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { DEFAULT_REGION, REGIONS } from "@/lib/plan/regions";

export const metadata: Metadata = {
  title: "Plan a tour · Opener",
  description:
    "Map where an artist's audience affinity is strongest, pick openers and read the crowd, with Qloo evidence for every claim.",
};

type Search = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PlanPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const artist = (first(params.artist) ?? "").slice(0, 100);
  const regionParam = first(params.region);
  const region = REGIONS.some((r) => r.id === regionParam)
    ? (regionParam as string)
    : DEFAULT_REGION;
  const id = first(params.id);
  const entityId = id && /^[0-9A-Fa-f-]{36}$/.test(id) ? id : undefined;
  const sample = first(params.sample);

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6">
        <PlanApp
          initial={{ artist, region, ...(entityId ? { entityId } : {}) }}
          autoStart={Boolean(artist)}
          sample={sample && /^[a-z0-9-]+$/.test(sample) ? sample : undefined}
        />
      </main>
      <SiteFooter />
    </>
  );
}
