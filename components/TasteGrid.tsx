"use client";

import type { Evidence, TourPlan } from "@/lib/plan/schema";
import { EvidenceToggle } from "./EvidencePanel";
import { AgentBadge, Panel, QlooBadge, SectionTitle } from "./ui";

export function TasteGrid({ plan, index }: { plan: TourPlan; index: Map<string, Evidence> }) {
  return (
    <div className="space-y-6">
      <Panel aria-labelledby="crossover-title">
        <SectionTitle id="crossover-title" kicker={<QlooBadge>recommend</QlooBadge>}>
          What else this audience likes
        </SectionTitle>
        {plan.crossover.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plan.crossover.map((group) => (
              <div key={group.category} className="rounded-xl border border-line bg-ink-3/50 p-4">
                <h3 className="text-sm font-semibold text-paper">{group.label}</h3>
                <ol className="mt-2 space-y-1 text-sm text-mist-2">
                  {group.items.map((item, i) => (
                    <li key={item.id} className="flex gap-2">
                      <span className="w-4 font-mono text-xs text-mist">{i + 1}</span>
                      <span className="min-w-0 truncate">{item.name}</span>
                    </li>
                  ))}
                </ol>
                <EvidenceToggle ids={[group.evidenceId]} index={index} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-mist">
            Qloo returned no crossover recommendations for this run.
          </p>
        )}
      </Panel>

      {plan.merchIdeas.length > 0 && (
        <Panel aria-labelledby="merch-title" className="border-dashed">
          <SectionTitle id="merch-title" kicker={<AgentBadge>Agent suggestion</AgentBadge>}>
            Merch &amp; promo ideas
          </SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2">
            {plan.merchIdeas.map((m) => (
              <li key={m.idea} className="rounded-xl border border-dashed border-line p-4">
                <p className="text-sm leading-relaxed text-paper">{m.idea}</p>
                {m.basedOn.length > 0 && (
                  <p className="mt-2 text-xs text-mist">Based on: {m.basedOn.join(", ")}</p>
                )}
                <EvidenceToggle ids={m.evidenceIds} index={index} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
