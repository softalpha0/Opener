import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { LIMITATIONS } from "@/lib/agent/compose";

export const metadata: Metadata = {
  title: "How it works · Opener",
  description: "Opener's architecture, Qloo tool chain, data handling and limitations.",
};

const TOOLS = [
  [
    "qloo_describe",
    "Resolve the typed name to one Qloo artist; ambiguous names go back to you as a choice.",
    "Header, “Not the right artist?”",
  ],
  [
    "qloo_where_popular",
    "Heatmap of the artist’s query-relative affinity inside each area of the chosen region.",
    "Map heat, city ranking, stop reasons",
  ],
  [
    "qloo_recommend (artist)",
    "Artists with strong affinity among the headliner’s audience, broad and with a city location signal.",
    "Openers on each stop",
  ],
  [
    "qloo_rank",
    "Available to the agent to order an opener shortlist for one city.",
    "Openers (agent runs)",
  ],
  [
    "qloo_compare_audiences",
    "Headliner vs. the lead opener in one analysis request.",
    "“Why … opens” spotlight",
  ],
  [
    "qloo_recommend (brand, tv_show, movie, podcast, place)",
    "What else the audience likes; places are scoped to the top city.",
    "Crossover grid, merch ideas",
  ],
  ["qloo_audience_demographics", "Relative age and gender affinities.", "Who over-indexes"],
  [
    "qloo_entity_tags",
    "Concepts that characterise the artist.",
    "Audience tags, poster mood board",
  ],
  ["qloo_trends", "Weekly population percentile over the past year.", "Momentum"],
  ["qloo_capabilities", "Readiness check that makes no Qloo request.", "/api/health"],
];

function Box({
  x,
  y,
  w,
  h,
  title,
  sub,
  accent = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="14"
        fill={accent ? "#1d1929" : "#15121f"}
        stroke={accent ? "#FFC45C" : "#2a2538"}
        strokeWidth="1.5"
      />
      <text
        x={x + w / 2}
        y={y + h / 2 - 4}
        textAnchor="middle"
        fill="#F5F2FA"
        fontSize="15"
        fontWeight="600"
      >
        {title}
      </text>
      <text x={x + w / 2} y={y + h / 2 + 16} textAnchor="middle" fill="#968FAA" fontSize="11.5">
        {sub}
      </text>
    </g>
  );
}

function Arrow({ d, label, lx, ly }: { d: string; label?: string; lx?: number; ly?: number }) {
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="#FF7A45"
        strokeWidth="1.6"
        strokeDasharray="5 5"
        markerEnd="url(#arrow)"
      />
      {label && (
        <text x={lx} y={ly} fill="#b7b1c8" fontSize="11" textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}

export default function HowItWorks() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">How Opener works</h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-mist-2">
          One Node service runs the web app, the agent and a long-lived{" "}
          <code className="text-gold">qloo mcp</code> process. The browser never talks to Qloo and
          never sees a key.
        </p>

        <section aria-labelledby="arch-title" className="mt-12">
          <h2 id="arch-title" className="font-display text-2xl font-semibold">
            Architecture
          </h2>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-ink-2 p-4">
            <svg
              viewBox="0 0 900 380"
              className="min-w-[720px]"
              role="img"
              aria-labelledby="arch-desc"
            >
              <desc id="arch-desc">
                The browser sends an artist and region to the Next.js server. The server runs the
                agent loop with an LLM (Gemini or Claude), which calls Qloo tools through a cached
                client connected to a qloo mcp process over stdio. qloo mcp calls the Qloo hackathon
                API. Progress streams back to the browser over server-sent events.
              </desc>
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="#FF7A45" />
                </marker>
              </defs>
              <Box x={20} y={150} w={150} h={80} title="Browser" sub="/plan · no keys" />
              <rect
                x={215}
                y={30}
                width={460}
                height={330}
                rx="20"
                fill="none"
                stroke="#2a2538"
                strokeDasharray="4 6"
              />
              <text x={235} y={56} fill="#968FAA" fontSize="12">
                Docker container · Node 22 · long-running
              </text>
              <Box
                x={240}
                y={150}
                w={170}
                h={80}
                title="Next.js API"
                sub="/api/plan (SSE) · rate limit"
                accent
              />
              <Box x={470} y={70} w={180} h={70} title="Agent loop" sub="Gemini / Claude · tools" />
              <Box
                x={470}
                y={180}
                w={180}
                h={70}
                title="Qloo client"
                sub="24h cache · retries · evidence"
                accent
              />
              <Box x={470} y={280} w={180} h={60} title="qloo mcp" sub="stdio · harness ≥ 0.1.26" />
              <Box x={720} y={150} w={160} h={80} title="Qloo API" sub="hackathon.api.qloo.com" />
              <Arrow d="M170,180 L236,180" label="artist, region" lx={203} ly={170} />
              <Arrow d="M240,205 L174,205" label="events" lx={207} ly={222} />
              <Arrow d="M410,170 C440,150 440,110 466,105" />
              <Arrow d="M560,140 L560,176" label="tool calls" lx={600} ly={163} />
              <Arrow d="M410,205 L466,212" />
              <Arrow d="M560,250 L560,276" />
              <Arrow
                d="M650,310 C700,300 760,280 790,234"
                label="QLOO_API_KEY (server only)"
                lx={735}
                ly={318}
              />
            </svg>
          </div>
        </section>

        <section aria-labelledby="loop-title" className="mt-12 grid gap-6 lg:grid-cols-2">
          <div>
            <h2 id="loop-title" className="font-display text-2xl font-semibold">
              The agent loop
            </h2>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-mist-2">
              <li>
                The server resolves the artist with <code className="text-gold">qloo_describe</code>
                . An ambiguous name stops the run and shows the candidates.
              </li>
              <li>
                The LLM (Gemini by default, or Claude) gets the real Qloo tool schemas (from{" "}
                <code className="text-gold">listTools()</code>) and plans: heatmaps, openers, crowd,
                comparison. It can make up to 20 Qloo calls in about 90 seconds.
              </li>
              <li>
                Each call goes through the cached client, gets an evidence ID, and streams to your
                timeline.
              </li>
              <li>
                The model answers with a JSON draft. The server checks it with Zod (one repair pass
                if needed) and keeps only stops that match heatmap cities and openers that appear in
                Qloo results.
              </li>
              <li>
                Any missing section is filled by a fixed tool chain. Without an LLM key, that chain
                builds the whole plan.
              </li>
            </ol>
          </div>
          <div>
            <h2 className="font-display text-2xl font-semibold">Data handling</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-mist-2">
              <li>
                Only public artist names and country names are sent to Qloo. No accounts, emails or
                locations of visitors are collected.
              </li>
              <li>
                The Qloo key lives in the server environment and is passed only to the{" "}
                <code className="text-gold">qloo mcp</code> child process. It is scrubbed from logs
                and evidence.
              </li>
              <li>
                Results are cached for 24 hours by tool and normalized arguments, so repeat plans
                don’t spend quota.
              </li>
              <li>
                Qloo data is marked with a gold “Qloo data” badge; the agent’s own words carry a
                dashed “Agent interpretation” badge.
              </li>
              <li>
                Results describe aggregate affinities. Opener never says how many fans will attend
                or buy.
              </li>
            </ul>
          </div>
        </section>

        <section aria-labelledby="chain-title" className="mt-12">
          <h2 id="chain-title" className="font-display text-2xl font-semibold">
            Tool chain
          </h2>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-ink-3 text-mist-2">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Qloo tool
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    What Opener asks
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Where you see it
                  </th>
                </tr>
              </thead>
              <tbody>
                {TOOLS.map(([tool, ask, where]) => (
                  <tr key={tool} className="border-t border-line bg-ink-2">
                    <th scope="row" className="px-4 py-3 font-mono text-xs font-normal text-gold">
                      {tool}
                    </th>
                    <td className="px-4 py-3 text-mist-2">{ask}</td>
                    <td className="px-4 py-3 text-paper">{where}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="limits-title" className="mt-12">
          <h2 id="limits-title" className="font-display text-2xl font-semibold">
            Limitations
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-mist-2">
            {LIMITATIONS.map((l) => (
              <li key={l}>{l}</li>
            ))}
            <li>
              Region presets search a few large countries each (Qloo needs a locality it can
              resolve), so smaller markets can be missed. Coverage varies by region.
            </li>
          </ul>
          <Link
            href="/plan"
            className="mt-8 inline-flex min-h-12 items-center rounded-full bg-ember px-7 font-semibold text-ink hover:bg-[#ff8f61]"
          >
            Plan a tour
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
