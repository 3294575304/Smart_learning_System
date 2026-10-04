import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { listPracticeSets } from "@/services/practice-sets/service";
import { practiceSetQuerySchema } from "@/services/practice-sets/types";
export async function GET(request: Request) {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const query = practiceSetQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) return apiError("练习组筛选条件无效", 400);
    return apiSuccess(await listPracticeSets(student, query.data), 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (error) {
    return recommendationApiError(error);
  }
}
