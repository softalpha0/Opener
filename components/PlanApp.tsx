"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorCopy, formatDateTime } from "@/lib/plan/format";
import type { PlanEvent, TourPlan } from "@/lib/plan/schema";
import { readPlanStream } from "@/lib/plan/sse";
import { AgentTimeline, type TimelineItem } from "./AgentTimeline";
import { ArtistForm, type ArtistChoice } from "./ArtistForm";
import { CandidatePicker, type CandidateOption } from "./CandidatePicker";
import { PlanResults } from "./PlanResults";
import { Button, Panel, QlooBadge } from "./ui";

const TourMap = dynamic(() => import("./TourMap"), {
  ssr: false,
  loading: () => <div className="dot-grid h-full min-h-[320px] rounded-2xl bg-ink-3" aria-hidden />,
});

type Phase =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "needs_input"; input: string; summary: string; candidates: CandidateOption[] }
  | { kind: "empty"; message: string }
  | { kind: "error"; code: string; message: string; recovery: string }
  | { kind: "done"; plan: TourPlan };

interface SavedSample {
  slug: string;
  artist: string;
  region: string;
  savedAt: string;
}

export interface PlanAppProps {
  initial: ArtistChoice;
  autoStart: boolean;
  sample?: string | undefined;
}

export function PlanApp({ initial, autoStart, sample }: PlanAppProps) {
  const [choice, setChoice] = useState<ArtistChoice>(initial);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [status, setStatus] = useState<string>("");
  const [heat, setHeat] = useState<Array<{ lat: number; lng: number; affinity: number }>>([]);
  const [saved, setSaved] = useState<SavedSample[] | null>(null);
  const abort = useRef<AbortController | null>(null);
  const started = useRef(false);

  const loadSample = useCallback(async (slug: string) => {
    setPhase({ kind: "running" });
    setStatus("Loading a saved plan");
    setTimeline([]);
    const res = await fetch(`/api/samples/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      setPhase({
        kind: "error",
        code: "NO_SAMPLE",
        message: "That saved plan isn’t available.",
        recovery: "Run a live plan instead.",
      });
      return;
    }
    const plan = (await res.json()) as TourPlan;
    window.history.replaceState(null, "", `/plan?sample=${encodeURIComponent(slug)}`);
    setChoice({ artist: plan.query.artistInput, region: plan.query.region });
    setPhase({ kind: "done", plan });
  }, []);

  const run = useCallback(async (next: ArtistChoice) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setChoice(next);
    setPhase({ kind: "running" });
    setTimeline([]);
    setHeat([]);
    setStatus("Starting");

    const params = new URLSearchParams({ artist: next.artist, region: next.region });
    if (next.entityId) params.set("id", next.entityId);
    window.history.replaceState(null, "", `/plan?${params.toString()}`);

    let finished = false;
    const onEvent = (event: PlanEvent) => {
      switch (event.type) {
        case "status":
          setStatus(event.message);
          break;
        case "tool":
          setTimeline((items) => {
            const rest = items.filter((i) => i.id !== event.evidence.id);
            const merged: TimelineItem = {
              ...items.find((i) => i.id === event.evidence.id),
              ...event.evidence,
              running: event.phase === "start",
            };
            return [...rest, merged].sort((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)));
          });
          break;
        case "heat":
          setHeat((h) => [...h, ...event.points]);
          break;
        case "needs_input":
          finished = true;
          setPhase({
            kind: "needs_input",
            input: event.input,
            summary: event.summary,
            candidates: event.candidates,
          });
          break;
        case "empty":
          finished = true;
          setPhase({ kind: "empty", message: event.message });
          break;
        case "error":
          finished = true;
          setPhase({
            kind: "error",
            code: event.code,
            message: event.message,
            recovery: event.recovery,
          });
          break;
        case "plan":
          finished = true;
          setPhase({ kind: "done", plan: event.plan });
          break;
        case "done":
          break;
      }
    };

    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artist: next.artist,
          region: next.region,
          ...(next.entityId ? { entityId: next.entityId } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        setPhase({
          kind: "error",
          code: res.status === 429 ? "rate_limited" : "BAD_REQUEST",
          message: data.message ?? data.error ?? "The request was rejected.",
          recovery: "",
        });
        return;
      }
      await readPlanStream(res.body, onEvent, controller.signal);
      if (!finished && !controller.signal.aborted) {
        setPhase({
          kind: "error",
          code: "STREAM",
          message: "The connection closed before the plan finished.",
          recovery: "Try again.",
        });
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setPhase({
        kind: "error",
        code: "NETWORK",
        message: "Couldn’t reach the Opener server.",
        recovery: "Check your connection and try again.",
      });
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (sample) void loadSample(sample);
    else if (autoStart && initial.artist) void run(initial);
  }, [autoStart, initial, loadSample, run, sample]);

  useEffect(() => {
    if (phase.kind !== "error" || saved !== null) return;
    fetch("/api/samples")
      .then((r) => r.json())
      .then((d: { samples: SavedSample[] }) => setSaved(d.samples))
      .catch(() => setSaved([]));
  }, [phase.kind, saved]);

  useEffect(() => () => abort.current?.abort(), []);

  const running = phase.kind === "running";

  return (
    <div className="space-y-6">
      <Panel className="relative overflow-visible">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Plan a tour</h1>
          <QlooBadge>live Qloo taste graph</QlooBadge>
        </div>
        <ArtistForm initial={choice} busy={running} onSubmit={(c) => void run(c)} />
      </Panel>

      {phase.kind === "idle" && (
        <Panel>
          <p className="text-mist-2">
            Enter an artist and a region. Opener resolves the artist in Qloo, maps where their
            audience affinity is strongest, picks openers whose fans over-index with that audience,
            and reads what else the crowd likes. Every claim links back to the Qloo call behind it.
          </p>
        </Panel>
      )}

      {(running || ((phase.kind === "error" || phase.kind === "empty") && timeline.length > 0)) && (
        <section
          aria-label="Agent run"
          className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
        >
          <Panel>
            <h2 className="mb-3 font-display text-lg font-semibold">Agent timeline</h2>
            <AgentTimeline items={timeline} status={running ? status : undefined} compact />
          </Panel>
          <div className="h-[360px] lg:h-auto lg:min-h-[420px]">
            <TourMap
              heat={heat}
              stops={[]}
              label="Live map of audience heat as Qloo results arrive"
            />
          </div>
        </section>
      )}

      {phase.kind === "needs_input" && (
        <CandidatePicker
          input={phase.input}
          summary={phase.summary}
          candidates={phase.candidates}
          onPick={(c) => void run({ artist: c.name, entityId: c.id, region: choice.region })}
        />
      )}

      {phase.kind === "empty" && (
        <Panel role="status">
          <h2 className="font-display text-xl font-semibold">No match yet</h2>
          <p className="mt-2 text-mist-2">{phase.message}</p>
        </Panel>
      )}

      {phase.kind === "error" && (
        <Panel role="alert" className="border-red-400/30">
          {(() => {
            const copy = errorCopy(phase.code, phase.message, phase.recovery);
            return (
              <>
                <h2 className="font-display text-xl font-semibold">{copy.title}</h2>
                <p className="mt-2 text-mist-2">{copy.body}</p>
              </>
            );
          })()}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => void run(choice)}>
              Try again
            </Button>
            {saved?.map((s) => (
              <Button key={s.slug} variant="ghost" onClick={() => void loadSample(s.slug)}>
                View a saved plan for {s.artist}{" "}
                <span className="text-xs text-mist">(saved {formatDateTime(s.savedAt)})</span>
              </Button>
            ))}
          </div>
          {saved && saved.length === 0 && (
            <p className="mt-3 text-sm text-mist">
              No saved plans are bundled with this deployment.
            </p>
          )}
        </Panel>
      )}

      {phase.kind === "done" && (
        <>
          <PlanResults
            plan={phase.plan}
            onPickAlternative={(alt) =>
              void run({ artist: alt.name, entityId: alt.id, region: choice.region })
            }
          />
          <details className="rounded-2xl border border-line bg-ink-2/60 p-4">
            <summary className="cursor-pointer text-sm text-mist-2">
              Agent timeline for this run ({phase.plan.evidence.length} Qloo calls)
            </summary>
            <div className="mt-3">
              <AgentTimeline items={phase.plan.evidence.map((e) => ({ ...e, running: false }))} />
            </div>
          </details>
        </>
      )}

      <p className="text-center text-xs text-mist">
        Qloo results describe aggregate audience affinities, not individual fans or ticket sales.{" "}
        <Link href="/how-it-works" className="underline underline-offset-4 hover:text-paper">
          How Opener works
        </Link>
      </p>
    </div>
  );
}
