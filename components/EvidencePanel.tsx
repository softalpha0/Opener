"use client";

import { useState } from "react";
import { TOOL_ASKS, formatDateTime, toolLabel } from "@/lib/plan/format";
import type { Evidence } from "@/lib/plan/schema";
import { QlooBadge, StatusDot, cx } from "./ui";

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-lg bg-ink p-3 text-[11px] leading-relaxed text-mist-2">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function EvidenceDetail({ evidence }: { evidence: Evidence }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-gold">{evidence.id}</span>
        <span className="font-mono text-xs text-paper">{evidence.tool}</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-mist-2">
          <StatusDot status={evidence.status} />
          {evidence.status}
        </span>
        <span className="text-xs text-mist">
          {evidence.resultCount} result{evidence.resultCount === 1 ? "" : "s"} ·{" "}
          {evidence.cached ? "cached" : "live"}
          {evidence.durationMs !== undefined && !evidence.cached
            ? ` · ${(evidence.durationMs / 1000).toFixed(1)}s`
            : ""}{" "}
          · {formatDateTime(evidence.fetchedAt)}
        </span>
      </div>
      <p className="text-mist-2">
        <span className="text-paper">Why: </span>
        {evidence.purpose}
      </p>
      {TOOL_ASKS[evidence.tool] && (
        <p className="text-xs text-mist">
          <span className="text-mist-2">What it asks Qloo: </span>
          {TOOL_ASKS[evidence.tool]}
        </p>
      )}
      <p className="text-paper">{evidence.summary}</p>
      {evidence.warnings.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-gold">
          {evidence.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-mist">Request input (redacted)</p>
        <Json value={evidence.inputRedacted} />
      </div>
      {evidence.keyFields !== undefined && evidence.keyFields !== null && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-mist">Key result fields</p>
          <Json value={evidence.keyFields} />
        </div>
      )}
    </div>
  );
}

/** Inline, expandable "Qloo evidence" for a card: lists the tool calls behind it. */
export function EvidenceToggle({
  ids,
  index,
  className,
}: {
  ids: string[];
  index: Map<string, Evidence>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const items = ids.map((id) => index.get(id)).filter((e): e is Evidence => e !== undefined);
  if (!items.length) return null;
  return (
    <div className={cx("mt-3", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-8 items-center gap-2 rounded-full text-xs font-medium text-gold hover:text-paper"
      >
        <span aria-hidden className={cx("transition", open && "rotate-90")}>
          ▸
        </span>
        Qloo evidence
        <span className="font-mono text-[11px] text-mist">
          {items.length === 1 && items[0]
            ? `${items[0].id} · ${toolLabel(items[0].tool)}`
            : `${items.length} calls`}
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-4 rounded-xl border border-gold/20 bg-ink-3/60 p-3">
          {items.map((e) => (
            <EvidenceDetail key={e.id} evidence={e} />
          ))}
        </div>
      )}
    </div>
  );
}

/** "Under the hood": the full list of every Qloo call in the run. */
export function EvidenceDrawer({
  evidence,
  open,
  onClose,
}: {
  evidence: Evidence[];
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-title"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div aria-hidden className="absolute inset-0" onClick={onClose} />
      <div className="relative h-full w-full max-w-xl overflow-y-auto border-l border-line bg-ink-2 p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="evidence-title" className="font-display text-2xl font-semibold">
              Under the hood
            </h2>
            <p className="mt-1 text-sm text-mist-2">
              Every Qloo call behind this plan, in order: the harness tool (via{" "}
              <code className="font-mono text-xs">qloo mcp</code>), why it was called, its redacted
              input, status, timing and the result fields Opener used. The API key never appears
              here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="min-h-11 rounded-full border border-line px-4 text-sm text-paper hover:border-mist/60"
          >
            Close
          </button>
        </div>
        <QlooBadge>{evidence.length} calls</QlooBadge>
        <ol className="mt-4 space-y-4">
          {evidence.map((e) => (
            <li key={e.id} className="rounded-xl border border-line bg-ink-3/50 p-4">
              <EvidenceDetail evidence={e} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
