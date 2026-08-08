import { apiSuccess } from "@/lib/api-response";
import { recoverExpiredBackgroundJobs } from "@/services/background-jobs/repository";
import { assertBackgroundWorkerRequest } from "@/services/background-jobs/worker-auth";
import { backgroundWorkerRouteError } from "@/services/background-jobs/worker-route";

export async function POST(request: Request) {
  try {
    assertBackgroundWorkerRequest(request);
    return apiSuccess(await recoverExpiredBackgroundJobs());
  } catch (error: unknown) {
    return backgroundWorkerRouteError(error);
  }
}
