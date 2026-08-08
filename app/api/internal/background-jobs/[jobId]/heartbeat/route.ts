import { apiSuccess } from "@/lib/api-response";
import { heartbeatBackgroundJob } from "@/services/background-jobs/repository";
import { assertBackgroundWorkerRequest } from "@/services/background-jobs/worker-auth";
import { backgroundWorkerRouteError } from "@/services/background-jobs/worker-route";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    assertBackgroundWorkerRequest(request);
    const { jobId } = await context.params;
    return apiSuccess(
      await heartbeatBackgroundJob(jobId, await request.json()),
    );
  } catch (error: unknown) {
    return backgroundWorkerRouteError(error);
  }
}
