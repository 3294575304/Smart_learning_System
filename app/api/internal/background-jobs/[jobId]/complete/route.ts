import { apiSuccess } from "@/lib/api-response";
import { completeBackgroundJob } from "@/services/background-jobs/repository";
import { assertBackgroundWorkerRequest } from "@/services/background-jobs/worker-auth";
import { backgroundWorkerRouteError } from "@/services/background-jobs/worker-route";
import { sanitizedInternalExecutionResult } from "@/services/sandbox-executor/redaction";
import { sandboxExecutionResultSchema } from "@/services/sandbox-executor/schemas";
import { prisma } from "@/lib/prisma";
import { completeProgrammingJob } from "@/services/programming-attempts/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    assertBackgroundWorkerRequest(request);
    const { jobId } = await context.params;
    const body = await request.json();
    const job = await prisma.backgroundJob.findUnique({
      where: { id: jobId },
      select: { type: true },
    });
    if (job?.type === "PYTHON_PUBLIC_RUN" || job?.type === "PYTHON_JUDGE") {
      return apiSuccess(await completeProgrammingJob(jobId, body));
    }
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
