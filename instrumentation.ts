/** Next.js server start hook: optionally pre-warm the sample artists' Qloo cache. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.OPENER_WARM_ON_START !== "true") return;
  const { warmInBackground } = await import("./lib/warm");
  warmInBackground();
}
