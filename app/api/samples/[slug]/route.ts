import { readSavedSample } from "@/lib/samples";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const plan = readSavedSample(slug);
  return plan
    ? Response.json(plan)
    : Response.json({ error: "No saved plan with that name." }, { status: 404 });
}
