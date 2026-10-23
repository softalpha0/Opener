import type { ReactNode } from "react";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Marks content that came straight from a Qloo tool result. */
export function QlooBadge({
  children = "Qloo data",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gold",
        className,
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
      {children}
    </span>
  );
}

/** Marks the agent's own interpretation, kept visually distinct from Qloo data. */
export function AgentBadge({
  children = "Agent interpretation",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border border-dashed border-mist/50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-mist-2",
        className,
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 rotate-45 border border-mist-2" />
      {children}
    </span>
  );
}

export function Panel({
  children,
  className,
  as: Tag = "section",
  ...rest
}: { children: ReactNode; className?: string; as?: "section" | "div" | "article" } & Record<
  string,
  unknown
>) {
  return (
    <Tag
      className={cx("rounded-2xl border border-line bg-ink-2/80 p-5 sm:p-6", className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function SectionTitle({
  children,
  kicker,
  id,
}: {
  children: ReactNode;
  kicker?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="font-display text-xl font-semibold text-paper sm:text-2xl">
        {children}
      </h2>
      {kicker}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "quiet";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-ember text-ink hover:bg-[#ff8f61]",
        variant === "ghost" && "border border-line bg-ink-3 text-paper hover:border-mist/60",
        variant === "quiet" && "text-mist-2 hover:text-paper",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function StatusDot({ status }: { status: string }) {
  const color =
    status === "ok"
      ? "bg-emerald-400"
      : status === "partial" || status === "degraded"
        ? "bg-gold"
        : status === "running"
          ? "bg-ember pulse-soft"
          : status === "error"
            ? "bg-red-400"
            : "bg-mist";
  return <span aria-hidden className={cx("inline-block h-2 w-2 shrink-0 rounded-full", color)} />;
}
