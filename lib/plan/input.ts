import { z } from "zod";
import { REGIONS } from "./regions";

const cleanText = (s: string) =>
  s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Public artist names and region presets only: no personal data is accepted. */
export const PlanRequestSchema = z.object({
  artist: z.string().transform(cleanText).pipe(z.string().min(1, "Enter an artist name.").max(100)),
  entityId: z
    .string()
    .regex(/^[0-9A-Fa-f-]{36}$/)
    .optional(),
  region: z.enum(REGIONS.map((r) => r.id) as [string, ...string[]]).optional(),
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

export const ResolveRequestSchema = z.object({
  name: z.string().transform(cleanText).pipe(z.string().min(2).max(100)),
});
