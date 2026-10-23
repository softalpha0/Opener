"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Renders children only once the placeholder nears the viewport (keeps WebGL off the critical path). */
export function LazyMount({
  children,
  className,
  rootMargin = "200px",
}: {
  children: ReactNode;
  className?: string;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, visible]);
  return (
    <div ref={ref} className={className}>
      {visible ? (
        children
      ) : (
        <div className="dot-grid h-full min-h-[320px] rounded-2xl bg-ink-3" aria-hidden />
      )}
    </div>
  );
}
