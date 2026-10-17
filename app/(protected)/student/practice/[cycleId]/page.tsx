import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { RecommendationPracticeSet } from "@/components/recommendations/recommendation-practice-set";
import { getPracticeSet } from "@/services/practice-sets/service";
import { getRecommendationDetail } from "@/services/recommendations/service";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  AuthorizationError,
  ResourceNotFoundError,
} from "@/services/auth/policy";
import { getStudentPracticeSession } from "@/services/course-recommendations/service";

interface Props {
  params: Promise<{ cycleId: string }>;
}

export default async function StudentPracticeSessionPage({ params }: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const { cycleId } = await params;
  try {
    const session = await getStudentPracticeSession(student.id, cycleId);
    const entry =
      session.items.find((item) => item.status === "STARTED") ??
      session.items.find((item) => item.status === "PENDING") ??
      session.items[0];
    if (!entry) notFound();
    const set = await getPracticeSet(student, entry.id);
    const recommendation = await getRecommendationDetail(student, entry.id);
    return (
      <RecommendationPracticeSet
        set={set}
        initialRecommendation={recommendation}
      />
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    if (error instanceof AuthorizationError) redirect("/403");
    throw error;
  }
}
