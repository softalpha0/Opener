import Link from "next/link";
import { HeroRoute } from "@/components/HeroRoute";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SAMPLE_ARTISTS } from "@/lib/samples";
import { regionById } from "@/lib/plan/regions";

const PROBLEMS = [
  {
    title: "Routing runs on habit",
    body: "Indie tours often follow last year’s cities, an agent’s contacts or a streaming dashboard, with little view of where the audience actually clusters.",
  },
  {
    title: "Openers are picked by who’s free",
    body: "A support slot works best when both fan bases overlap, but that overlap is rarely measured before the offer goes out.",
  },
  {
    title: "Promo is guesswork",
    body: "Merch, podcast pitches and pre-show events land better when they match what the crowd already likes. Most small teams have no way to check.",
  },
];

const STEPS = [
  {
    n: 1,
    title: "Resolve",
    tool: "qloo_describe",
    body: "Match the artist to one Qloo entity. If two artists share the name, you choose; Opener never guesses.",
  },
  {
    n: 2,
    title: "Map demand",
    tool: "qloo_where_popular",
    body: "Pull Qloo heatmaps for the region and turn the hottest cells into a ranked, routed list of cities.",
  },
  {
    n: 3,
    title: "Pick openers",
    tool: "qloo_recommend · qloo_compare_audiences",
    body: "Find artists whose fans over-index with the headliner’s audience, scoped to each top city, and justify the lead pick.",
  },
  {
    n: 4,
    title: "Read the crowd",
    tool: "qloo_audience_demographics · qloo_trends",
    body: "See who over-indexes, whether momentum is rising, and which brands, shows and podcasts the audience shares.",
  },
];

const COMPARE = [
  [
    "Where to play",
    "Names big-market cities from general knowledge",
    "Ranks cities from Qloo heatmap cells for this artist, with the affinity score shown",
  ],
  [
    "Who should open",
    "Suggests artists that sound similar",
    "Uses artists Qloo recommends for this audience, scoped by city, and compares the two fan bases",
  ],
  [
    "Who the fans are",
    "Repeats genre stereotypes",
    "Shows Qloo’s relative age and gender affinities, labelled as relative",
  ],
  ["Is it working", "Can’t tell", "Reads Qloo’s weekly popularity trend for the last year"],
  [
    "Can you check it",
    "No sources",
    "Every card opens the Qloo call behind it, with the redacted request",
  ],
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div
            aria-hidden
            className="glow-ember pointer-events-none absolute -left-32 top-0 h-96 w-96"
          />
          <div className="relative">
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-gold">
              AI tour routing for independent artists
            </p>
            <h1 className="font-display mt-4 text-6xl font-bold leading-[0.95] sm:text-7xl lg:text-8xl">
              Opener
            </h1>
            <p className="font-display mt-5 max-w-lg text-2xl font-semibold leading-snug text-paper sm:text-3xl">
              Tour where your fans actually are.
            </p>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-mist-2">
              Type an artist. Opener’s agent reads Qloo’s taste graph to find the cities where their
              audience affinity runs hottest, suggests openers whose fans overlap, and shows what
              else the crowd likes. Every claim links to the Qloo result behind it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/plan"
                className="inline-flex min-h-12 items-center rounded-full bg-ember px-7 text-base font-semibold text-ink hover:bg-[#ff8f61]"
              >
                Plan a tour
              </Link>
              <Link
                href="/how-it-works"
                className="text-sm font-medium text-mist-2 underline-offset-4 hover:text-paper hover:underline"
              >
                How it works
              </Link>
            </div>
          </div>
          <div className="relative">
            <HeroRoute />
          </div>
        </section>

        <section aria-labelledby="problem-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="problem-title" className="font-display text-3xl font-bold sm:text-4xl">
            Routing is still guesswork
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {PROBLEMS.map((p) => (
              <div key={p.title} className="rounded-2xl border border-line bg-ink-2 p-6">
                <h3 className="font-display text-xl font-semibold text-gold">{p.title}</h3>
                <p className="mt-3 leading-relaxed text-mist-2">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="how-title" className="font-display text-3xl font-bold sm:text-4xl">
            How it works
          </h2>
          <ol className="relative mt-10 grid gap-6 md:grid-cols-4">
            <span
              aria-hidden
              className="absolute left-5 right-5 top-5 hidden border-t-2 border-dashed border-ember/50 md:block"
            />
            {STEPS.map((s) => (
              <li key={s.n} className="relative">
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-ember font-display text-lg font-bold text-ink">
                  {s.n}
                </span>
                <h3 className="font-display mt-4 text-xl font-semibold">{s.title}</h3>
                <p className="mt-1 font-mono text-xs text-gold">{s.tool}</p>
                <p className="mt-2 text-sm leading-relaxed text-mist-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="examples-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="examples-title" className="font-display text-3xl font-bold sm:text-4xl">
            Try an example
          </h2>
          <p className="mt-3 max-w-2xl text-mist-2">
            Each runs a live plan (or loads it from the 24-hour cache if someone ran it recently).
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SAMPLE_ARTISTS.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/plan?artist=${encodeURIComponent(a.name)}&region=${a.region}`}
                  className="group block h-full rounded-2xl border border-line bg-ink-2 p-6 transition hover:border-ember/60"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-mist">{a.blurb}</p>
                  <p className="font-display mt-2 text-2xl font-semibold">{a.name}</p>
                  <p className="mt-4 text-sm text-gold">
                    {regionById(a.region).label} route{" "}
                    <span aria-hidden className="inline-block transition group-hover:translate-x-1">
                      →
                    </span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="why-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="why-title" className="font-display text-3xl font-bold sm:text-4xl">
            Why Qloo
          </h2>
          <p className="mt-3 max-w-2xl text-mist-2">
            A language model on its own can only guess at taste and geography. Opener lets the model
            plan, but only with what Qloo returns.
          </p>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-ink-3 text-mist-2">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Question
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    An LLM alone
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-gold">
                    Opener with Qloo
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(([q, llm, opener]) => (
                  <tr key={q} className="border-t border-line bg-ink-2">
                    <th scope="row" className="px-4 py-3 font-medium text-paper">
                      {q}
                    </th>
                    <td className="px-4 py-3 text-mist">{llm}</td>
                    <td className="px-4 py-3 text-paper">{opener}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
