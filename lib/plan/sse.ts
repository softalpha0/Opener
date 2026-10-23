import type { PlanEvent } from "./schema";

/** Parse a text/event-stream body into PlanEvents (one JSON object per `data:` line). */
export async function readPlanStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: PlanEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            onEvent(JSON.parse(line.slice(6)) as PlanEvent);
          } catch {
            // ignore a malformed line
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
