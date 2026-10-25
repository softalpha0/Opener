"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { evidenceIndex, formatDateTime } from "@/lib/plan/format";
import type { TourPlan } from "@/lib/plan/schema";
import { AudiencePanel } from "./AudiencePanel";
import { CityCard } from "./CityCard";
import { EvidenceDrawer, EvidenceToggle } from "./EvidencePanel";
import { GenericCompare } from "./GenericCompare";
import { LazyMount } from "./LazyMount";
import { PlanActions } from "./PlanActions";
import { TasteGrid } from "./TasteGrid";
import { AgentBadge, Panel, QlooBadge, SectionTitle } from "./ui";

const TourMap = dynamic(() => import("./TourMap"), {
  ssr: false,
  loading: () => <div className="dot-grid h-full min-h-[320px] rounded-2xl bg-ink-3" aria-hidden />,
});

export function PlanResults({
  plan,
  onPickAlternative,
}: {
  plan: TourPlan;
  onPickAlternative: (alt: { id: string; name: string }) => void;
}) {
  const index = useMemo(() => evidenceIndex(plan), [plan]);
  const [active, setActive] = useState<number | undefined>(plan.stops[0]?.order);
  const [drawer, setDrawer] = useState(false);
  const [compareRequested, setCompareRequested] = useState(0);
  const mapStops = useMemo(
    () =>
      plan.stops.flatMap((s) =>
        s.lat !== undefined && s.lng !== undefined
          ? [{ order: s.order, city: s.city, lat: s.lat, lng: s.lng }]
          : [],
      ),
    [plan.stops],
  );

  return (
    <div className="space-y-6">
      {plan.saved && (
        <div
          role="note"
          className="rounded-xl border border-gold/50 bg-gold/10 px-4 py-3 text-sm text-gold"
        >
          <strong>Saved result from {formatDateTime(plan.saved.savedAt)}.</strong> This is a stored
          plan, not a live Qloo run.
        </div>
      )}

      <Panel aria-labelledby="plan-title" className="relative overflow-hidden">
        <div
          aria-hidden
          className="glow-ember pointer-events-none absolute -right-20 -top-24 h-72 w-72"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            {plan.artist.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={plan.artist.image} alt="" className="h-16 w-16 rounded-2xl object-cover" />
            )}
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-mist">
                Tour plan · {plan.query.regionLabel}
              </p>
              <h1 id="plan-title" className="font-display text-3xl font-bold sm:text-4xl">
                {plan.artist.name}
              </h1>
              {plan.artist.description && (
                <p className="mt-1 max-w-xl text-sm text-mist-2">{plan.artist.description}</p>
              )}
              <p className="mt-2 text-xs text-mist">
                {plan.mode === "agent"
                  ? `Planned by the agent (${plan.model})`
                  : "Planned by the deterministic planner"}{" "}
                · {formatDateTime(plan.generatedAt)} · {plan.evidence.length} Qloo calls
              </p>
            </div>
          </div>
          <QlooBadge>resolved via qloo_describe</QlooBadge>
        </div>
        {plan.artist.alternatives.length > 0 && (
          <p className="relative mt-4 text-sm text-mist">
            Not the right artist?{" "}
            {plan.artist.alternatives.map((alt, i) => (
              <span key={alt.id}>
                {i > 0 && ", "}
                <button
                  type="button"
                  className="text-gold underline-offset-4 hover:underline"
                  onClick={() => onPickAlternative(alt)}
                >
                  {alt.name}
                </button>
              </span>
            ))}
          </p>
        )}
        <div className="relative mt-5 rounded-xl border border-dashed border-line bg-ink/40 p-4">
          <AgentBadge />
          <p className="mt-2 leading-relaxed text-paper">{plan.summary}</p>
        </div>
        <div className="relative mt-5">
          <PlanActions
            plan={plan}
            onEvidence={() => setDrawer(true)}
            onCompare={() => setCompareRequested((n) => n + 1)}
          />
        </div>
      </Panel>

      {plan.notices.length > 0 && (
        <ul className="space-y-2" aria-label="Notices">
          {plan.notices.map((n, i) => (
            <li
              key={i}
              className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-2.5 text-sm text-mist-2"
            >
              <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-gold">
                {n.level === "info" ? "Note" : n.level}
              </span>
              {n.message}
            </li>
          ))}
        </ul>
      )}

      <section
        aria-labelledby="route-title"
        className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
      >
        <div className="min-w-0 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">
          <LazyMount className="h-[360px] lg:h-full">
            <TourMap
              heat={plan.heat}
              stops={mapStops}
              activeOrder={active}
              label={`Map of ${plan.artist.name}'s audience heat and tour route`}
              onSelect={(order) => {
                setActive(order);
                document
                  .getElementById(`stop-${order}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            />
          </LazyMount>
        </div>
        <div>
          <SectionTitle id="route-title" kicker={<QlooBadge>where popular · recommend</QlooBadge>}>
            The route
          </SectionTitle>
          {plan.stops.length ? (
            <ol className="space-y-4">
              {plan.stops.map((stop) => (
                <li key={stop.order}>
                  <CityCard
                    stop={stop}
                    index={index}
                    active={active === stop.order}
                    onFocus={() => setActive(stop.order)}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <Panel>
              <p className="text-mist-2">
                Qloo didn’t return enough location signal to build a route in{" "}
                {plan.query.regionLabel}. Try “Worldwide” or another region.
              </p>
            </Panel>
          )}
        </div>
      </section>

      <GenericCompare plan={plan} requested={compareRequested} />

      {plan.openerSpotlight && (
        <Panel aria-labelledby="spotlight-title">
          <SectionTitle id="spotlight-title" kicker={<QlooBadge>compare audiences</QlooBadge>}>
            Why {plan.openerSpotlight.openerName} opens
          </SectionTitle>
          <p className="text-mist-2">{plan.openerSpotlight.note}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {plan.openerSpotlight.shared.map((s) => (
              <li
                key={s.name}
                className="rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-xs text-gold"
              >
                {s.name}
                {s.type && <span className="ml-1 text-mist">· {s.type}</span>}
              </li>
            ))}
          </ul>
          <EvidenceToggle ids={plan.openerSpotlight.evidenceIds} index={index} />
        </Panel>
      )}

      <AudiencePanel plan={plan} index={index} />
      <TasteGrid plan={plan} index={index} />

      <Panel aria-labelledby="limits-title">
        <SectionTitle id="limits-title">What this plan does not tell you</SectionTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm text-mist-2">
          {plan.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Panel>

      <EvidenceDrawer evidence={plan.evidence} open={drawer} onClose={() => setDrawer(false)} />
    </div>
  );
}
