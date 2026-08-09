import { apiSuccess } from "@/lib/api-response";
import { failBackgroundJob } from "@/services/background-jobs/repository";
import { assertBackgroundWorkerRequest } from "@/services/background-jobs/worker-auth";
import { backgroundWorkerRouteError } from "@/services/background-jobs/worker-route";
import { prisma } from "@/lib/prisma";
import { failProgrammingJob } from "@/services/programming-attempts/service";

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
    return apiSuccess(
      job?.type === "PYTHON_PUBLIC_RUN" || job?.type === "PYTHON_JUDGE"
        ? await failProgrammingJob(jobId, body)
        : await failBackgroundJob(jobId, body),
    );
  } catch (error: unknown) {
    return backgroundWorkerRouteError(error);
  }
}
