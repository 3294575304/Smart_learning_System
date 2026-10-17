import { z } from "zod";
import { normalizeStudentNo } from "@/services/student-identities/normalization";

export const rosterQuerySchema = z.object({
  classroomId: z.string().cuid().optional(),
  keyword: z.string().trim().max(100).default(""),
  status: z.enum(["ACTIVE", "PENDING", "REMOVED", "ALL"]).default("ACTIVE"),
  page: z.coerce.number().int().min(1).default(1),
});
export const rosterMutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("EDIT_MEMBER"),
      membershipId: z.string().cuid(),
      expectedUpdatedAt: z.string().datetime(),
      name: z.string().trim().min(2).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("ADD"),
      classroomId: z.string().cuid(),
      studentNo: z
        .string()
        .transform(normalizeStudentNo)
        .pipe(
          z
            .string()
            .min(1)
            .max(50)
            .regex(/^[A-Z0-9_-]+$/, "学号只能包含字母、数字、下划线或横线"),
        ),
      name: z.string().trim().min(2).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("EDIT"),
      assignmentId: z.string().cuid(),
      expectedUpdatedAt: z.string().datetime(),
      studentNo: z
        .string()
        .transform(normalizeStudentNo)
        .pipe(
          z
            .string()
            .min(1)
            .max(50)
            .regex(/^[A-Z0-9_-]+$/),
        ),
      name: z.string().trim().min(2).max(100),
    })
    .strict(),
  z
    .object({
      action: z.enum(["REMOVE", "RESTORE"]),
      kind: z.enum(["MEMBER", "PENDING"]),
      id: z.string().cuid(),
      expectedUpdatedAt: z.string().datetime(),
    })
    .strict(),
]);
export type RosterMutation = z.infer<typeof rosterMutationSchema>;
