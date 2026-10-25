"use client";

import { whyThisCity } from "@/lib/plan/format";
import type { Evidence, Stop } from "@/lib/plan/schema";
import { EvidenceToggle } from "./EvidencePanel";
import { QlooBadge, cx } from "./ui";

function AffinityMeter({ value }: { value: number | undefined }) {
  const pct = Math.round(Math.max(0, Math.min(1, value ?? 0)) * 100);
  return (
    <div
      className="flex items-center gap-2"
      aria-label={`Heatmap affinity ${value?.toFixed(2) ?? "unknown"} out of 1`}
    >
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink">
        <div
          className="h-full rounded-full bg-gradient-to-r from-ember to-gold"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-xs text-gold">{value?.toFixed(2) ?? "–"}</span>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function CityCard({
  stop,
  index,
  active,
  onFocus,
}: {
  stop: Stop;
  index: Map<string, Evidence>;
  active: boolean;
  onFocus: () => void;
}) {
  return (
    <article
      id={`stop-${stop.order}`}
      className={cx(
        "rounded-2xl border bg-ink-2/80 p-4 transition sm:p-5",
        active ? "border-gold/60 shadow-[0_0_40px_-12px_rgba(255,196,92,0.45)]" : "border-line",
      )}
      onMouseEnter={onFocus}
      onFocus={onFocus}
      tabIndex={-1}
    >
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ember font-display text-lg font-bold text-ink">
          {stop.order}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="font-display text-xl font-semibold">
              {stop.city}
              <span className="ml-2 text-sm font-normal text-mist">
                {[stop.region, stop.country].filter(Boolean).join(", ")}
              </span>
            </h3>
            <span className="text-xs text-mist">
              {stop.area
                ? `#${stop.demandRank} in ${stop.area}`
                : `Demand rank #${stop.demandRank}`}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <AffinityMeter value={stop.affinityScore} />
            {stop.heatCells !== undefined && (
              <span className="text-xs text-mist">
                {stop.heatCells} heat cell{stop.heatCells === 1 ? "" : "s"}
              </span>
            )}
            <QlooBadge>where popular</QlooBadge>
          </div>
          <div className="mt-3 rounded-xl border border-gold/20 bg-gold/5 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gold">
              Why this city · Qloo signals
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-mist-2">
              {whyThisCity(stop, index).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-mist-2">{stop.reason}</p>
        </div>
      </div>

      {stop.openers.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-mist">
            Suggested openers
          </p>
          <ul
            className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2"
            aria-label={`Openers for ${stop.city}`}
          >
            {stop.openers.map((opener) => (
              <li
                key={opener.id}
                className="w-60 shrink-0 snap-start rounded-xl border border-line bg-ink-3/60 p-3"
              >
                <div className="flex items-center gap-3">
                  {opener.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={opener.image}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-xs font-semibold text-gold"
                    >
                      {initials(opener.name)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium text-paper">{opener.name}</p>
                    {opener.affinity !== undefined && (
                      <p className="font-mono text-[11px] text-gold">
                        affinity {opener.affinity.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-mist-2">{opener.overlapNote}</p>
                <EvidenceToggle ids={opener.evidenceIds} index={index} className="mt-1" />
              </li>
            ))}
          </ul>
        </div>
      )}
      <EvidenceToggle ids={stop.evidenceIds} index={index} />
    </article>
  );
}
