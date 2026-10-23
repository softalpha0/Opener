"use client";

import { Panel, QlooBadge } from "./ui";

export interface CandidateOption {
  id: string;
  name: string;
  type?: string;
  description?: string;
  popularity?: number;
}

export function CandidatePicker({
  input,
  summary,
  candidates,
  onPick,
}: {
  input: string;
  summary: string;
  candidates: CandidateOption[];
  onPick: (c: CandidateOption) => void;
}) {
  return (
    <Panel aria-labelledby="pick-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pick-title" className="font-display text-2xl font-semibold">
          Which “{input}”?
        </h2>
        <QlooBadge>qloo_describe · needs input</QlooBadge>
      </div>
      <p className="mt-2 text-sm text-mist-2">
        {summary} Opener won’t guess between artists who share a name.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {candidates.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className="h-full w-full rounded-xl border border-line bg-ink-3/60 p-4 text-left transition hover:border-gold/60"
            >
              <span className="block font-medium text-paper">{c.name}</span>
              {c.description && (
                <span className="mt-1 block text-sm text-mist-2">{c.description}</span>
              )}
              <span className="mt-2 block font-mono text-[11px] text-mist">{c.id}</span>
              {c.popularity !== undefined && (
                <span className="mt-1 block text-xs text-mist">
                  Qloo popularity {c.popularity.toFixed(2)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
