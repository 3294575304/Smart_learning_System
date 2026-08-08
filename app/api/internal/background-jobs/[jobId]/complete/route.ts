import { apiSuccess } from "@/lib/api-response";
import { completeBackgroundJob } from "@/services/background-jobs/repository";
import { assertBackgroundWorkerRequest } from "@/services/background-jobs/worker-auth";
import { backgroundWorkerRouteError } from "@/services/background-jobs/worker-route";
import { sanitizedInternalExecutionResult } from "@/services/sandbox-executor/redaction";
import { sandboxExecutionResultSchema } from "@/services/sandbox-executor/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    assertBackgroundWorkerRequest(request);
    const { jobId } = await context.params;
    const body = await request.json();
    const result = sanitizedInternalExecutionResult(
      sandboxExecutionResultSchema.parse(body.result),
    );
    return apiSuccess(
      await completeBackgroundJob(jobId, {
        leaseId: body.leaseId,
        result,
        resourceUsage: result.resourceUsage ?? {},
      }),
    );
  } catch (error: unknown) {
    return backgroundWorkerRouteError(error);
  }
}
