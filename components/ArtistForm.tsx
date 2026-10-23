"use client";

import { useEffect, useId, useRef, useState } from "react";
import { REGIONS } from "@/lib/plan/regions";
import { Button, cx } from "./ui";

interface Suggestion {
  id: string;
  name: string;
  description?: string;
  primary?: boolean;
}

type ResolveResponse =
  | { status: "resolved"; entity: Suggestion; alternatives: Suggestion[] }
  | { status: "ambiguous"; candidates: Suggestion[] }
  | { status: "not_found" | "invalid" | "rate_limited" | "error"; message?: string };

export interface ArtistChoice {
  artist: string;
  entityId?: string;
  region: string;
}

export function ArtistForm({
  initial,
  busy,
  onSubmit,
}: {
  initial: ArtistChoice;
  busy: boolean;
  onSubmit: (choice: ArtistChoice) => void;
}) {
  const [artist, setArtist] = useState(initial.artist);
  const [entityId, setEntityId] = useState<string | undefined>(initial.entityId);
  const [region, setRegion] = useState(initial.region);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [hint, setHint] = useState<string>("");
  const listId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQuery = useRef("");

  useEffect(() => {
    setArtist(initial.artist);
    setEntityId(initial.entityId);
    setRegion(initial.region);
  }, [initial.artist, initial.entityId, initial.region]);

  function lookup(name: string) {
    if (timer.current) clearTimeout(timer.current);
    if (name.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      lastQuery.current = name;
      try {
        const res = await fetch("/api/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const data = (await res.json()) as ResolveResponse;
        if (lastQuery.current !== name) return;
        if (data.status === "resolved") {
          setSuggestions([{ ...data.entity, primary: true }, ...data.alternatives]);
          setHint("");
        } else if (data.status === "ambiguous") {
          setSuggestions(data.candidates);
          setHint("Several artists share this name. Pick one.");
        } else {
          setSuggestions([]);
          setHint(data.status === "not_found" ? "No Qloo artist matches that name yet." : "");
        }
        setOpen(data.status === "resolved" || data.status === "ambiguous");
        setActive(-1);
      } catch {
        setSuggestions([]);
      }
    }, 600);
  }

  function choose(s: Suggestion) {
    setArtist(s.name);
    setEntityId(s.id);
    setOpen(false);
    setHint("");
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (!artist.trim()) return;
        setOpen(false);
        onSubmit({ artist: artist.trim(), ...(entityId ? { entityId } : {}), region });
      }}
    >
      <div className="relative">
        <label htmlFor="artist" className="mb-1.5 block text-sm font-medium text-mist-2">
          Artist
        </label>
        <input
          id="artist"
          name="artist"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          maxLength={100}
          placeholder="e.g. an artist you manage"
          value={artist}
          onChange={(e) => {
            setArtist(e.target.value);
            setEntityId(undefined);
            lookup(e.target.value);
          }}
          onKeyDown={(e) => {
            if (!open || !suggestions.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              const s = suggestions[active];
              if (s) choose(s);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="min-h-12 w-full rounded-xl border border-line bg-ink-3 px-4 text-base text-paper placeholder:text-mist focus:border-gold/60"
        />
        {open && suggestions.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-ink-2 p-1 shadow-2xl"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                className={cx(
                  "cursor-pointer rounded-lg px-3 py-2",
                  i === active ? "bg-ink-3" : "hover:bg-ink-3",
                )}
              >
                <span className="text-sm text-paper">{s.name}</span>
                {s.primary && (
                  <span className="ml-2 text-[11px] uppercase tracking-wide text-gold">
                    best match
                  </span>
                )}
                {s.description && (
                  <span className="block truncate text-xs text-mist">{s.description}</span>
                )}
              </li>
            ))}
            <li className="px-3 py-1.5 text-[11px] text-mist">Matches from Qloo · qloo_describe</li>
          </ul>
        )}
        <p className="mt-1 min-h-4 text-xs text-mist" aria-live="polite">
          {entityId ? "Linked to a specific Qloo artist." : hint}
        </p>
      </div>
      <div>
        <label htmlFor="region" className="mb-1.5 block text-sm font-medium text-mist-2">
          Region focus
        </label>
        <select
          id="region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="min-h-12 w-full rounded-xl border border-line bg-ink-3 px-3 text-base text-paper sm:w-48"
        >
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <p className="mt-1 min-h-4 text-xs text-mist">&nbsp;</p>
      </div>
      <div>
        <Button
          type="submit"
          disabled={busy || !artist.trim()}
          className="min-h-12 w-full sm:w-auto"
        >
          {busy ? "Planning…" : "Plan the tour"}
        </Button>
        <p className="mt-1 min-h-4 text-xs text-mist">&nbsp;</p>
      </div>
    </form>
  );
}
