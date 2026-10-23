const SECRET_KEY_PATTERN =
  /(api[_-]?key|token|secret|password|authorization|auth|cookie|credential)/i;
const MAX_STRING = 240;

function secretValues(): string[] {
  return [
    process.env.QLOO_API_KEY,
    process.env.ANTHROPIC_API_KEY,
    process.env.OPENAI_API_KEY,
  ].filter((v): v is string => typeof v === "string" && v.length >= 8);
}

/** Replace any configured secret value that appears inside a string. */
export function scrubString(value: string, secrets: string[] = secretValues()): string {
  let out = value;
  for (const secret of secrets) out = out.split(secret).join("[redacted]");
  return out.length > MAX_STRING ? `${out.slice(0, MAX_STRING)}…` : out;
}

/**
 * Deep-copy a value for display or logging: drops secret-looking keys, scrubs secret values,
 * truncates long strings and caps depth/array length.
 */
export function redact(value: unknown, depth = 0, secrets: string[] = secretValues()): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return scrubString(value, secrets);
  if (value === undefined || typeof value === "function" || typeof value === "symbol")
    return undefined;
  if (depth >= 6) return "[…]";
  if (Array.isArray(value))
    return value.slice(0, 25).map((item) => redact(item, depth + 1, secrets));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      const next = redact(item, depth + 1, secrets);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return undefined;
}
