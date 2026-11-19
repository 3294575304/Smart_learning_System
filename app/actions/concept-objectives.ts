"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  confirmDerivedConceptObjectiveLinks,
  deriveConceptObjectiveLinks,
  reviewConceptObjectiveLink,
} from "@/services/learner-profiles/concept-objectives";

const reviewVersionSchema = z.string().regex(/^c[a-z0-9]+\/c[a-z0-9]+$/);

export async function reviewConceptObjectiveLinkAction(formData: FormData) {
  const teacher = await requireAuthenticatedUser([Role.TEACHER]);
  const input = z
    .object({
      linkId: z.string().cuid(),
      courseId: z.string().cuid(),
      reviewVersion: reviewVersionSchema,
      intent: z.enum(["dismiss", "confirm"]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const { intent, ...scope } = input.data;
  const reviewed = await reviewConceptObjectiveLink({
    teacherId: teacher.id,
    ...scope,
    action: intent,
  });
  const path = `/teacher/courses/${scope.courseId}/objective-map`;
  revalidatePath(path);
  if (!reviewed) redirect(`${path}?stale=1`);
}

export async function rederiveConceptObjectiveLinksAction(formData: FormData) {
  const teacher = await requireAuthenticatedUser([Role.TEACHER]);
  const input = z
    .object({
      courseId: z.string().cuid(),
      token: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const { courseId, token } = input.data;
  const applied = await deriveConceptObjectiveLinks(
    teacher.id,
    courseId,
    token,
  );
  const path = `/teacher/courses/${courseId}/objective-map`;
  revalidatePath(path);
  redirect(`${path}?${applied ? "applied=1" : "preview=1&stale=1"}`);
}

export async function confirmDerivedConceptObjectiveLinksAction(
  formData: FormData,
) {
  const teacher = await requireAuthenticatedUser([Role.TEACHER]);
  const input = z
    .object({
      courseId: z.string().cuid(),
      reviewVersion: reviewVersionSchema,
      objectiveCode: z.string().min(1).max(50).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const confirmed = await confirmDerivedConceptObjectiveLinks({
    teacherId: teacher.id,
    ...input.data,
  });
  const path = `/teacher/courses/${input.data.courseId}/objective-map`;
  revalidatePath(path);
  if (confirmed === null) redirect(`${path}?stale=1`);
}
