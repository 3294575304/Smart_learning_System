import { z } from "zod";

const answerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("CHOICE"),
    optionIds: z.array(z.string().max(128)).max(50),
  }),
  z.object({ kind: z.literal("BOOLEAN"), value: z.boolean().nullable() }),
  z.object({ kind: z.enum(["TEXT", "CODE"]), value: z.string().max(100000) }),
]);
const snapshotSchema = z.object({
  at: z.number().finite(),
  current: z.string(),
  drafts: z.record(answerSchema),
  keys: z.record(z.string().uuid()),
});
export function parsePracticeDraft(
  value: unknown,
  allowedIds: string[],
  now = Date.now(),
) {
  const parsed = snapshotSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.at > now ||
    now - parsed.data.at > 24 * 60 * 60 * 1000
  )
    return null;
  const ids = new Set(allowedIds);
  return {
    ...parsed.data,
    current: ids.has(parsed.data.current) ? parsed.data.current : allowedIds[0],
    drafts: Object.fromEntries(
      Object.entries(parsed.data.drafts).filter(([id]) => ids.has(id)),
    ),
    keys: Object.fromEntries(
      Object.entries(parsed.data.keys).filter(([id]) => ids.has(id)),
    ),
  };
}
