"use client";

import { useState } from "react";
import { planToMarkdown } from "@/lib/plan/markdown";
import type { TourPlan } from "@/lib/plan/schema";
import { Button } from "./ui";

export function PlanActions({
  plan,
  onEvidence,
  onCompare,
}: {
  plan: TourPlan;
  onEvidence: () => void;
  onCompare: () => void;
}) {
  const [message, setMessage] = useState("");

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(done);
    } catch {
      setMessage("Copy failed. Your browser blocked clipboard access.");
    }
    setTimeout(() => setMessage(""), 3000);
  }

  function download() {
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `opener-${plan.artist.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${plan.query.region}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function shareUrl() {
    const url = new URL(window.location.origin + "/plan");
    if (plan.saved) {
      url.searchParams.set(
        "sample",
        window.location.search.match(/sample=([a-z0-9-]+)/)?.[1] ?? "",
      );
    } else {
      url.searchParams.set("artist", plan.query.artistInput);
      url.searchParams.set("region", plan.query.region);
      url.searchParams.set("id", plan.artist.id);
    }
    return url.toString();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={onCompare}>Generic vs Opener</Button>
      <Button variant="ghost" onClick={onEvidence}>
        Under the hood ({plan.evidence.length} Qloo calls)
      </Button>
      <Button
        variant="ghost"
        onClick={() => copy(planToMarkdown(plan, shareUrl()), "Plan copied as Markdown.")}
      >
        Copy plan
      </Button>
      <Button variant="ghost" onClick={download}>
        Download JSON
      </Button>
      <Button variant="ghost" onClick={() => copy(shareUrl(), "Share link copied.")}>
        Share
      </Button>
      <span className="text-sm text-gold" role="status" aria-live="polite">
        {message}
      </span>
    </div>
  );
}
