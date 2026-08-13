import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { TeachingProgressPanel } from "@/components/courses/teaching-progress-panel";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import {
  getRecommendationPolicy,
  getTeachingProgress,
} from "@/services/course-recommendations/service";

export default async function TeachingProgressPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const { courseId } = await params;
  try {
    const [data, policy] = await Promise.all([
      getTeachingProgress(teacher.id, courseId),
      getRecommendationPolicy(teacher.id, courseId),
    ]);
    return (
      <TeachingProgressPanel courseId={courseId} data={data} policy={policy} />
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
