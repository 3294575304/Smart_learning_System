import { Role } from "@prisma/client";
import { after } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { knowledgeGraphApiError } from "@/lib/knowledge-graph-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { courseIdSchema } from "@/services/courses/schemas";
import {
  executeTeacherKnowledgeGraphAiEnhancement,
  queueTeacherKnowledgeGraphAiEnhancement,
} from "@/services/knowledge-graph/service";

interface Context {
  params: Promise<{ courseId: string; draftId: string }>;
}

export async function POST(request: Request, context: Context) {
  const params = await context.params;
  const courseId = courseIdSchema.safeParse(params.courseId);
  const draftId = z.string().cuid().safeParse(params.draftId);
  if (!courseId.success || !draftId.success)
    return apiError("课程或图谱草稿 ID 格式无效", 400, undefined, "INVALID_ID");
  try {
    const user = await requireAuthenticatedUser([Role.TEACHER]);
    const queued = await queueTeacherKnowledgeGraphAiEnhancement(
      user.id,
      courseId.data,
      draftId.data,
    );
    if (queued.shouldExecute) {
      const requestContext = auditRequestContext(request);
      after(async () => {
        try {
          await executeTeacherKnowledgeGraphAiEnhancement(
            user.id,
            courseId.data,
            draftId.data,
            requestContext,
          );
        } catch {
          // The persistent AI enhancement state exposes a safe warning to polling clients.
        }
      });
    }
    return apiSuccess(queued, queued.reused ? 200 : 202);
  } catch (error) {
    return knowledgeGraphApiError(error);
  }
}
