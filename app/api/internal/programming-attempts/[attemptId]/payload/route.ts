import { apiError, apiSuccess } from "@/lib/api-response";
import { assertBackgroundWorkerRequest } from "@/services/background-jobs/worker-auth";
import { backgroundWorkerRouteError } from "@/services/background-jobs/worker-route";
import { programmingAttemptPathSchema } from "@/services/programming-attempts/schemas";
import { getProgrammingAttemptPayload } from "@/services/programming-attempts/service";

type Context = { params: Promise<{ attemptId: string }> };

export async function GET(request: Request, context: Context) {
  const path = programmingAttemptPathSchema.safeParse(await context.params);
  if (!path.success) return apiError("Attempt ID 格式无效", 400);
  try {
    assertBackgroundWorkerRequest(request);
    return apiSuccess(await getProgrammingAttemptPayload(path.data.attemptId));
  } catch (error) {
    return backgroundWorkerRouteError(error);
  }
}
