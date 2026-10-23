import { getQloo, serverState } from "@/lib/server";
import { ResolveRequestSchema } from "@/lib/plan/input";
import { parseAlternatives, parseEntities, parseResolutionIssues } from "@/lib/qloo/parse";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST {name} → artist candidates from qloo_describe (cached 24h). */
export async function POST(request: Request) {
  const parsed = ResolveRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { status: "invalid", message: "Type at least two characters." },
      { status: 400 },
    );

  const limit = serverState().resolveLimiter.check(clientIp(request.headers));
  if (!limit.allowed) {
    return Response.json(
      { status: "rate_limited", message: "Too many lookups. Pause for a moment." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const { envelope } = await getQloo().call("qloo_describe", {
    entity: parsed.data.name,
    type: "artist",
  });
  switch (envelope.status) {
    case "ok":
    case "partial":
    case "degraded": {
      const entity = parseEntities(envelope.results)[0];
      if (!entity) return Response.json({ status: "not_found" });
      return Response.json({
        status: "resolved",
        entity: {
          id: entity.id,
          name: entity.name,
          ...(entity.description ? { description: entity.description } : {}),
          ...(entity.image ? { image: entity.image } : {}),
        },
        alternatives: parseAlternatives(envelope).slice(0, 4),
        notice: envelope.status === "ok" ? undefined : envelope.summary,
      });
    }
    case "needs_input": {
      const candidates = parseResolutionIssues(envelope).flatMap((i) => i.candidates);
      return Response.json(
        candidates.length
          ? { status: "ambiguous", summary: envelope.summary, candidates }
          : { status: "not_found" },
      );
    }
    case "empty":
      return Response.json({ status: "not_found" });
    case "error":
      return Response.json(
        {
          status: "error",
          code: envelope.error?.code ?? "UNKNOWN",
          message: envelope.summary,
          recovery: envelope.error?.recovery ?? "Try again later.",
        },
        { status: 502 },
      );
  }
}
