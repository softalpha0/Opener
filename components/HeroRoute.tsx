/** Decorative route-on-map motif: heat zones, numbered stops and a dashed route. */
const STOPS = [
  { x: 92, y: 210, r: 54 },
  { x: 205, y: 132, r: 40 },
  { x: 318, y: 176, r: 64 },
  { x: 428, y: 98, r: 36 },
  { x: 492, y: 232, r: 48 },
];

export function HeroRoute() {
  const path = STOPS.map((s, i) => `${i === 0 ? "M" : "L"}${s.x},${s.y}`).join(" ");
  return (
    <div
      className="dot-grid relative aspect-[5/3] w-full overflow-hidden rounded-3xl border border-line bg-ink-2"
      aria-hidden
    >
      <svg viewBox="0 0 580 330" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="heat" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFC45C" stopOpacity="0.75" />
            <stop offset="45%" stopColor="#FF7A45" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#FF7A45" stopOpacity="0" />
          </radialGradient>
        </defs>
        {STOPS.map((s, i) => (
          <circle
            key={`h${i}`}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill="url(#heat)"
            className="pulse-soft"
            style={{ transformOrigin: `${s.x}px ${s.y}px`, animationDelay: `${i * 0.4}s` }}
          />
        ))}
        <path
          d={path}
          fill="none"
          stroke="#FF7A45"
          strokeWidth="2"
          strokeLinecap="round"
          className="route-dash"
        />
        {STOPS.map((s, i) => (
          <g key={`s${i}`}>
            <circle cx={s.x} cy={s.y} r="13" fill="#FF7A45" stroke="#0E0C16" strokeWidth="3" />
            <text
              x={s.x}
              y={s.y + 4.5}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill="#0E0C16"
            >
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-mist">
        <span className="rounded-full bg-ink/80 px-2.5 py-1">● heat = audience affinity</span>
        <span className="rounded-full bg-ink/80 px-2.5 py-1">illustration, not data</span>
      </div>
    </div>
  );
}
