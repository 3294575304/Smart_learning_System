"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  assertTeacherOwnsCourse,
  confirmDerivedConceptObjectiveLinks,
  deriveConceptObjectiveLinks,
  reviewConceptObjectiveLink,
} from "@/services/learner-profiles/concept-objectives";

export async function reviewConceptObjectiveLinkAction(formData: FormData) {
  const teacher = await requireAuthenticatedUser([Role.TEACHER]);
  const linkId = String(formData.get("linkId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  if (!linkId || !courseId) return;
  await reviewConceptObjectiveLink({
    teacherId: teacher.id,
    linkId,
    action: formData.get("intent") === "confirm" ? "confirm" : "dismiss",
  });
  revalidatePath(`/teacher/courses/${courseId}/objective-map`);
}

export async function rederiveConceptObjectiveLinksAction(formData: FormData) {
  const teacher = await requireAuthenticatedUser([Role.TEACHER]);
  const courseId = String(formData.get("courseId") ?? "");
  if (!courseId) return;
  await assertTeacherOwnsCourse(teacher.id, courseId);
  await deriveConceptObjectiveLinks(courseId);
  revalidatePath(`/teacher/courses/${courseId}/objective-map`);
}

export async function confirmDerivedConceptObjectiveLinksAction(
  formData: FormData,
) {
  const teacher = await requireAuthenticatedUser([Role.TEACHER]);
  const courseId = String(formData.get("courseId") ?? "");
  if (!courseId) return;
  const objectiveCode =
    String(formData.get("objectiveCode") ?? "") || undefined;
  await confirmDerivedConceptObjectiveLinks({
    teacherId: teacher.id,
    courseId,
    objectiveCode,
  });
  revalidatePath(`/teacher/courses/${courseId}/objective-map`);
}
