import { redact, scrubString } from "./qloo/redact";

type Level = "info" | "warn" | "error";

/** Structured, secret-scrubbed logging. Never pass raw env or headers here. */
export function log(level: Level, message: string, fields?: Record<string, unknown>): void {
  const line = JSON.stringify({
    level,
    msg: scrubString(message),
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
    at: new Date().toISOString(),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
