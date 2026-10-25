"use client";

import { toolLabel } from "@/lib/plan/format";
import { PLAN_STAGES, type Evidence, type PlanStageId } from "@/lib/plan/schema";
import { StatusDot, cx } from "./ui";

export type TimelineItem = Partial<Evidence> & {
  id: string;
  tool: string;
  purpose: string;
  running: boolean;
};

const ICONS: Record<string, string> = {
  qloo_describe: "◎",
  qloo_where_popular: "⌖",
  qloo_recommend: "✦",
  qloo_rank: "≡",
  qloo_compare_audiences: "⇄",
  qloo_entity_tags: "#",
  qloo_audience_demographics: "◐",
  qloo_trends: "↗",
  qloo_find_tags: "⌕",
};

function shortInput(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  return Object.entries(input)
    .filter(([k]) => !["limit", "explain", "entity_type", "type"].includes(k))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join(" · ")
    .slice(0, 110);
}

export function AgentTimeline({
  items,
  status,
  compact,
}: {
  items: TimelineItem[];
  status?: string | undefined;
  compact?: boolean;
}) {
  return (
    <div>
      {status && (
        <p className="mb-3 flex items-center gap-2 text-sm text-mist-2" aria-live="polite">
          <span aria-hidden className="h-2 w-2 rounded-full bg-ember pulse-soft" />
          {status}
        </p>
      )}
      <ol
        className={cx("relative space-y-2", compact ? "max-h-72 overflow-y-auto pr-1" : "")}
        aria-label="Agent tool calls"
      >
        {items.map((item) => (
          <li
            key={item.id}
            className="flex gap-3 rounded-xl border border-line bg-ink-3/50 px-3 py-2.5"
          >
            <span aria-hidden className="mt-0.5 w-5 shrink-0 text-center font-mono text-gold">
              {ICONS[item.tool] ?? "•"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-medium text-paper">{toolLabel(item.tool)}</span>
                <span className="font-mono text-[11px] text-mist">{item.id}</span>
                <span className="inline-flex items-center gap-1 text-xs text-mist-2">
                  <StatusDot status={item.running ? "running" : (item.status ?? "ok")} />
                  {item.running ? "running" : item.status}
                  {!item.running && item.cached ? " · cached" : ""}
                  {!item.running && !item.cached && item.durationMs !== undefined
                    ? ` · ${(item.durationMs / 1000).toFixed(1)}s`
                    : ""}
                </span>
              </div>
              <p className="truncate text-xs text-mist">{shortInput(item.inputRedacted)}</p>
              {!item.running && item.summary && (
                <p className="mt-0.5 text-xs text-mist-2">{item.summary}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export type StageState = Partial<
  Record<PlanStageId, { state: "start" | "done"; ms?: number; detail?: string }>
>;

/** The agent's four steps with live status and duration. */
export function StageStrip({ stages, running }: { stages: StageState; running: boolean }) {
  return (
    <ol className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Agent steps">
      {PLAN_STAGES.map((s, i) => {
        const st = stages[s.id];
        const status = st?.state === "done" ? "ok" : st && running ? "running" : "pending";
        return (
          <li
            key={s.id}
            className={cx(
              "rounded-xl border px-3 py-2",
              st?.state === "done" ? "border-gold/30 bg-gold/5" : "border-line bg-ink-3/40",
            )}
          >
            <p className="flex items-center gap-2 text-sm text-paper">
              <StatusDot status={status} />
              <span className="font-mono text-[11px] text-mist">{i + 1}</span>
              {s.label}
              {st?.ms !== undefined && (
                <span className="ml-auto font-mono text-[11px] text-mist">
                  {(st.ms / 1000).toFixed(1)}s
                </span>
              )}
            </p>
            {st?.detail && <p className="mt-0.5 pl-4 text-xs text-mist">{st.detail}</p>}
          </li>
        );
      })}
    </ol>
  );
}
