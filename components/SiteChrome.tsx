import Link from "next/link";

export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/softalpha0/opener";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-tight ${className}`}>
      <span className="text-ember">●</span> Opener
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
      <Link href="/" className="text-lg text-paper" aria-label="Opener home">
        <Wordmark />
      </Link>
      <nav aria-label="Main" className="flex items-center gap-1 text-sm sm:gap-4">
        <Link href="/how-it-works" className="rounded-full px-3 py-2 text-mist-2 hover:text-paper">
          How it works
        </Link>
        <Link
          href="/plan"
          className="rounded-full bg-ink-3 px-4 py-2 font-medium text-paper ring-1 ring-line hover:ring-mist/60"
        >
          Plan a tour
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-mist sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <Wordmark className="text-paper" />
          <p className="mt-1">Built for the Qloo Agentic Hackathon. Taste data from Qloo.</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <a href={REPO_URL} className="hover:text-paper">
            GitHub
          </a>
          <Link href="/how-it-works" className="hover:text-paper">
            How it works
          </Link>
          <a href={`${REPO_URL}/blob/main/LICENSE`} className="hover:text-paper">
            MIT License
          </a>
        </div>
      </div>
    </footer>
  );
}
