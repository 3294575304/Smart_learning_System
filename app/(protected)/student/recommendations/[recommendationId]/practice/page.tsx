import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { RecommendationPracticeSet } from "@/components/recommendations/recommendation-practice-set";
import { getPracticeSet } from "@/services/practice-sets/service";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  AuthorizationError,
  ResourceNotFoundError,
} from "@/services/auth/policy";
import { getRecommendationDetail } from "@/services/recommendations/service";

interface Props {
  params: Promise<{ recommendationId: string }>;
}

export default async function RecommendationPracticePage({ params }: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const { recommendationId } = await params;
  try {
    const recommendation = await getRecommendationDetail(
      student,
      recommendationId,
    );
    const set = await getPracticeSet(student, recommendationId);
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
