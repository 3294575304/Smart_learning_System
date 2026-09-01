import { createServer, type Server } from "node:http";
import { timingSafeEqual } from "node:crypto";

import type { BackgroundJob } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  claimNextBackgroundJob,
  failBackgroundJob,
  heartbeatBackgroundJob,
  recoverExpiredBackgroundJobs,
} from "@/services/background-jobs/repository";
import type { LongTaskWorkerConfig } from "@/services/background-worker/config";
import {
  knowledgeGraphJobInputSchema,
  qualityReportJobInputSchema,
  questionMappingJobInputSchema,
  syllabusParseJobInputSchema,
} from "@/services/background-worker/contracts";
import {
  KNOWLEDGE_GRAPH_AI_ENHANCEMENT_JOB_TYPE,
  KNOWLEDGE_GRAPH_JOB_TYPE,
} from "@/services/knowledge-graph/constants";
import {
  executeClaimedKnowledgeGraphAiEnhancementJob,
  executeClaimedKnowledgeGraphJob,
} from "@/services/knowledge-graph/service";
import { QUALITY_REPORT_JOB_TYPE } from "@/services/quality-reports/constants";
import { executeClaimedQualityReportJob } from "@/services/quality-reports/service";
import { QUESTION_MAPPING_JOB_TYPE } from "@/services/question-mapping/schemas";
import { executeClaimedQuestionMappingJob } from "@/services/question-mapping/service";
import { SYLLABUS_PARSE_JOB_TYPE } from "@/services/syllabus-parsing/constants";
import { executeClaimedSyllabusParseJob } from "@/services/syllabus-parsing/service";

const WORKER_VERSION = "persistent-long-task-worker-v1";
const ACCEPTED_TYPES = [
  QUALITY_REPORT_JOB_TYPE,
  KNOWLEDGE_GRAPH_JOB_TYPE,
  KNOWLEDGE_GRAPH_AI_ENHANCEMENT_JOB_TYPE,
  SYLLABUS_PARSE_JOB_TYPE,
  QUESTION_MAPPING_JOB_TYPE,
];

function authorized(value: string | undefined, expected: string) {
  const supplied = Buffer.from(value ?? "");
  const target = Buffer.from(`Bearer ${expected}`);
  return supplied.length === target.length && timingSafeEqual(supplied, target);
}

export class PersistentLongTaskWorker {
  private stopping = false;
  private wakeResolver: (() => void) | null = null;
  private wakeServer: Server | null = null;
  private lastRecoveryAt = 0;

  constructor(private readonly config: LongTaskWorkerConfig) {}

  async runForever() {
    this.wakeServer = createServer((request, response) => {
      if (
        request.method !== "POST" ||
        request.url !== "/wake" ||
        !authorized(request.headers.authorization, this.config.workerSecret)
      ) {
        response.writeHead(401).end();
        return;
      }
      this.wakeResolver?.();
      response.writeHead(204).end();
    });
    await new Promise<void>((resolve, reject) => {
      this.wakeServer!.once("error", reject);
      this.wakeServer!.listen(this.config.wakePort, "127.0.0.1", resolve);
    });

    while (!this.stopping) {
      try {
        if (
          Date.now() - this.lastRecoveryAt >=
          this.config.recoveryIntervalMs
        ) {
          await recoverExpiredBackgroundJobs();
          this.lastRecoveryAt = Date.now();
        }
        const job = await claimNextBackgroundJob({
          workerId: this.config.workerId,
          executorVersion: WORKER_VERSION,
          acceptedTypes: ACCEPTED_TYPES,
          leaseDurationMs: this.config.leaseDurationMs,
        });
        if (job?.currentLeaseId) await this.process(job);
        else await this.waitForWork();
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "long_task_worker_loop_error",
            error: error instanceof Error ? error.name : "UnknownError",
          }),
        );
        await this.waitForWork();
      }
    }
  }

  async stop() {
    this.stopping = true;
    this.wakeResolver?.();
    await new Promise<void>((resolve) => {
      if (!this.wakeServer) return resolve();
      this.wakeServer.close(() => resolve());
    });
    await prisma.$disconnect();
  }

  private waitForWork() {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, this.config.pollIntervalMs);
      this.wakeResolver = () => {
        clearTimeout(timer);
        this.wakeResolver = null;
        resolve();
      };
    });
  }

  private async process(job: BackgroundJob) {
    const leaseId = job.currentLeaseId!;
    let finished = false;
    const heartbeat = setInterval(
      () => {
        if (finished) return;
        void prisma.backgroundJob
          .findUnique({ where: { id: job.id }, select: { progress: true } })
          .then((current) =>
            heartbeatBackgroundJob(job.id, {
              leaseId,
              progress: Math.max(1, current?.progress ?? 0),
              leaseDurationMs: this.config.leaseDurationMs,
            }),
          )
          .catch(() => undefined);
      },
      Math.min(30_000, Math.floor(this.config.leaseDurationMs / 3)),
    );
    try {
      await this.dispatch(job, leaseId);
    } catch (error) {
      const stillOwned = await prisma.backgroundJob.findFirst({
        where: { id: job.id, status: "RUNNING", currentLeaseId: leaseId },
        select: { id: true },
      });
      if (stillOwned) {
        await failBackgroundJob(job.id, {
          leaseId,
          errorCode: "LONG_TASK_WORKER_ERROR",
          retryable: true,
          resourceUsage: {},
        }).catch(() => undefined);
      }
      console.error(
        JSON.stringify({
          event: "long_task_failed",
          jobId: job.id,
          jobType: job.type,
          error: error instanceof Error ? error.name : "UnknownError",
        }),
      );
    } finally {
      finished = true;
      clearInterval(heartbeat);
    }
  }

  private async dispatch(job: BackgroundJob, leaseId: string) {
    if (job.type === QUALITY_REPORT_JOB_TYPE) {
      const input = qualityReportJobInputSchema.parse(job.input);
      await executeClaimedQualityReportJob(
        input.reportId,
        job.id,
        leaseId,
        input.context ?? { ipAddress: null, userAgent: null },
      );
      return;
    }
    if (
      job.type === KNOWLEDGE_GRAPH_JOB_TYPE ||
      job.type === KNOWLEDGE_GRAPH_AI_ENHANCEMENT_JOB_TYPE
    ) {
      const input = knowledgeGraphJobInputSchema.parse(job.input);
      const context = input.context ?? { ipAddress: null, userAgent: null };
      if (job.type === KNOWLEDGE_GRAPH_JOB_TYPE)
        await executeClaimedKnowledgeGraphJob(job.id, leaseId, input, context);
      else
        await executeClaimedKnowledgeGraphAiEnhancementJob(
          job.id,
          leaseId,
          input,
          context,
        );
      return;
    }
    if (job.type === SYLLABUS_PARSE_JOB_TYPE) {
      await executeClaimedSyllabusParseJob(
        job.id,
        leaseId,
        syllabusParseJobInputSchema.parse(job.input),
      );
      return;
    }
    if (job.type === QUESTION_MAPPING_JOB_TYPE) {
      await executeClaimedQuestionMappingJob(
        job.id,
        leaseId,
        questionMappingJobInputSchema.parse(job.input),
      );
      return;
    }
    await failBackgroundJob(job.id, {
      leaseId,
      errorCode: "UNSUPPORTED_LONG_TASK",
      retryable: false,
      resourceUsage: {},
    });
  }
}
