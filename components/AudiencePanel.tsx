"use client";

import type { Evidence, TourPlan } from "@/lib/plan/schema";
import { EvidenceToggle } from "./EvidencePanel";
import { Panel, QlooBadge, SectionTitle, cx } from "./ui";

function DivergingBar({ label, value }: { label: string; value: number }) {
  const width = Math.min(50, Math.abs(value) * 50);
  return (
    <div className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2 text-xs">
      <span className="truncate capitalize text-mist-2">{label}</span>
      <div className="relative h-2 rounded-full bg-ink" aria-hidden>
        <span className="absolute left-1/2 top-[-3px] h-[14px] w-px bg-mist/40" />
        <span
          className={cx("absolute top-0 h-2 rounded-full", value >= 0 ? "bg-ember" : "bg-mist/60")}
          style={
            value >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }
          }
        />
      </div>
      <span className="text-right font-mono text-mist-2">
        {value >= 0 ? "+" : ""}
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function Sparkline({ series }: { series: Array<{ date: string; value: number }> }) {
  if (series.length < 2) return null;
  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = series
    .map((p, i) => `${(i / (series.length - 1)) * 100},${30 - ((p.value - min) / span) * 26 - 2}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 30"
      className="h-12 w-full"
      role="img"
      aria-label={`Population percentile from ${series[0]?.date} to ${series[series.length - 1]?.date}`}
    >
      <polyline
        points={pts}
        fill="none"
        stroke="#FFC45C"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const MOMENTUM_COPY = {
  rising: "Rising",
  steady: "Steady",
  falling: "Cooling",
  unknown: "Unknown",
} as const;

export function AudiencePanel({ plan, index }: { plan: TourPlan; index: Map<string, Evidence> }) {
  const age = plan.demographics.items.filter((d) => d.group === "age");
  const gender = plan.demographics.items.filter((d) => d.group === "gender");
  return (
    <Panel aria-labelledby="audience-title">
      <SectionTitle
        id="audience-title"
        kicker={<QlooBadge>demographics · tags · trends</QlooBadge>}
      >
        Read the crowd
      </SectionTitle>
      <div className="grid gap-6 md:grid-cols-3">
        <div>
          <h3 className="text-sm font-semibold text-paper">Momentum</h3>
          <p
            className={cx(
              "mt-1 font-display text-3xl font-bold",
              plan.momentum.direction === "rising" ? "text-gold" : "text-paper",
            )}
          >
            {MOMENTUM_COPY[plan.momentum.direction]}
          </p>
          <Sparkline series={plan.momentum.series} />
          <p className="mt-1 text-xs leading-relaxed text-mist">{plan.momentum.note}</p>
          {plan.momentum.evidenceId && (
            <EvidenceToggle ids={[plan.momentum.evidenceId]} index={index} />
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-paper">Who over-indexes</h3>
          <p className="mb-3 text-xs text-mist">
            Relative affinity vs. average (not shares of fans).
          </p>
          {plan.demographics.items.length ? (
            <div className="space-y-2">
              {age.map((d) => (
                <DivergingBar key={`a-${d.label}`} label={d.label} value={d.value} />
              ))}
              {gender.length > 0 && <div className="h-1" />}
              {gender.map((d) => (
                <DivergingBar key={`g-${d.label}`} label={d.label} value={d.value} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-mist">Qloo returned no demographic data for this artist.</p>
          )}
          {plan.demographics.evidenceId && (
            <EvidenceToggle ids={[plan.demographics.evidenceId]} index={index} />
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-paper">Audience tags</h3>
          {plan.artist.tags.length ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {plan.artist.tags.map((t) => (
                <li
                  key={t.id}
                  className="rounded-full border border-line bg-ink-3 px-3 py-1 text-xs text-mist-2"
                >
                  {t.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-mist">No tags returned.</p>
          )}
          <EvidenceToggle ids={plan.artist.evidenceIds.slice(1)} index={index} />
        </div>
      </div>
    </Panel>
  );
}
