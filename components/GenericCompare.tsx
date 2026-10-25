"use client";

import { useEffect, useRef, useState } from "react";
import type { TourComparison } from "@/lib/plan/generic";
import type { TourPlan } from "@/lib/plan/schema";
import { qlooStanding, rowVerdict } from "@/lib/plan/verdict";
import { AgentBadge, Button, Panel, QlooBadge, SectionTitle, cx } from "./ui";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; comparison: TourComparison }
  | { kind: "error"; message: string };

/** "Without Qloo vs with Qloo": a plain-LLM tour next to Opener's Qloo-ranked route. */
export function GenericCompare({ plan, requested }: { plan: TourPlan; requested: number }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const ref = useRef<HTMLElement>(null);

  async function run() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
        signal: AbortSignal.timeout(45_000),
      });
      const body = (await res.json().catch(() => ({}))) as {
        comparison?: TourComparison;
        message?: string;
        error?: string;
      };
      if (!res.ok || !body.comparison) {
        setState({
          kind: "error",
          message: body.message ?? body.error ?? "Couldn't build the comparison.",
        });
        return;
      }
      setState({ kind: "ready", comparison: body.comparison });
    } catch {
      setState({ kind: "error", message: "The comparison timed out. Try again in a moment." });
    }
  }

  useEffect(() => {
    if (requested === 0) return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (state.kind === "idle" || state.kind === "error") void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  // A new plan resets the comparison.
  useEffect(() => setState({ kind: "idle" }), [plan]);

  return (
    <Panel ref={ref} aria-labelledby="compare-title" id="compare">
      <SectionTitle id="compare-title" kicker={<QlooBadge>no extra Qloo calls</QlooBadge>}>
        Generic tour vs Opener
      </SectionTitle>
      <p className="text-sm text-mist-2">
        What would a tour look like without Qloo? Opener asks the same model for a tour using only
        the artist’s name and the countries, with no tools and no Qloo data, then looks up every
        city it suggests in the Qloo heatmaps this plan already fetched.
      </p>

      {state.kind === "idle" && (
        <Button className="mt-4" onClick={() => void run()}>
          Compare with a generic tour
        </Button>
      )}
      {state.kind === "loading" && (
        <p className="mt-4 flex items-center gap-2 text-sm text-mist-2" role="status">
          <span aria-hidden className="h-2 w-2 rounded-full bg-ember pulse-soft" />
          Asking for a generic tour and ranking it against Qloo…
        </p>
      )}
      {state.kind === "error" && (
        <div className="mt-4 flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-gold">{state.message}</p>
          <Button variant="ghost" onClick={() => void run()}>
            Try again
          </Button>
        </div>
      )}
      {state.kind === "ready" && <ComparisonView plan={plan} c={state.comparison} />}
    </Panel>
  );
}

function ComparisonView({ plan, c }: { plan: TourPlan; c: TourComparison }) {
  const total = c.rows.length;
  const source =
    c.generic.source === "llm"
      ? `Generic tour by ${c.generic.model} from its own knowledge`
      : "Generic tour: the largest cities by population";
  return (
    <div className="mt-5 space-y-5">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Comparison summary">
        <Stat value={`${c.overlap} of ${total}`} label="generic cities Opener also picked" />
        <Stat
          value={`${c.qlooTop3} of ${total}`}
          label="generic cities in Qloo’s top 3 for their country"
        />
        <Stat value={`${c.noSignal}`} label="generic cities with no Qloo heatmap match" />
      </ul>
      {c.generic.note && <p className="text-xs text-gold">{c.generic.note}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-semibold">Without Qloo</h3>
            <AgentBadge>{c.generic.source === "llm" ? "model guess" : "population"}</AgentBadge>
          </div>
          <p className="mb-3 text-xs text-mist">{source}</p>
          <ol className="space-y-2">
            {c.rows.map((row, i) => (
              <li
                key={`${row.city}-${i}`}
                className={cx(
                  "rounded-xl border px-3 py-2.5",
                  row.openerOrder !== undefined
                    ? "border-gold/40 bg-gold/5"
                    : "border-line bg-ink-3/50",
                )}
              >
                <p className="text-sm font-medium text-paper">
                  {i + 1}. {row.city}
                  <span className="ml-1 font-normal text-mist">{row.country}</span>
                </p>
                {row.why && <p className="mt-0.5 text-xs text-mist">{row.why}</p>}
                <p
                  className={cx(
                    "mt-1 text-xs",
                    row.qloo && row.qloo.rank <= 3 ? "text-gold" : "text-mist-2",
                  )}
                >
                  Qloo: {rowVerdict(row)}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-semibold">With Qloo (Opener)</h3>
            <QlooBadge>heatmap ranked</QlooBadge>
          </div>
          <p className="mb-3 text-xs text-mist">
            Ranked by {plan.artist.name}’s audience affinity in each country searched.
          </p>
          <ol className="space-y-2">
            {plan.stops.map((stop) => {
              const missed = c.openerOnly.find((o) => o.order === stop.order);
              return (
                <li
                  key={stop.order}
                  className={cx(
                    "rounded-xl border px-3 py-2.5",
                    missed ? "border-ember/50 bg-ember/5" : "border-gold/40 bg-gold/5",
                  )}
                >
                  <p className="text-sm font-medium text-paper">
                    {stop.order}. {stop.city}
                    <span className="ml-1 font-normal text-mist">{stop.country}</span>
                  </p>
                  <p className="mt-1 text-xs text-mist-2">
                    {missed
                      ? `Generic tour missed it. Qloo: ${qlooStanding(missed.qloo)}.`
                      : "In both tours."}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <p className="text-xs text-mist">
        Qloo heatmap scores are relative within each country, so ranks compare cities inside one
        country, not across countries. Cities are matched by Opener from Qloo heat cells using a
        bundled city table.
      </p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <li className="rounded-xl border border-line bg-ink-3/50 px-4 py-3">
      <p className="font-display text-2xl font-bold text-gold">{value}</p>
      <p className="text-xs text-mist-2">{label}</p>
    </li>
  );
}
