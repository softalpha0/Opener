import { listSavedSamples } from "@/lib/samples";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ samples: listSavedSamples() });
}
