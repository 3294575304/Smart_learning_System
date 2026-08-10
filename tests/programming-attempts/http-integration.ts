import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { resolve } from "node:path";
import {
  CourseStatus,
  KnowledgeGraphNodeType,
  KnowledgeGraphSourceType,
  KnowledgeGraphStatus,
  MembershipStatus,
  PrismaClient,
  ProgrammingAttemptStatus,
  ProgrammingTestVisibility,
  QuestionGraphBindingType,
  QuestionType,
  QuestionVisibility,
  SyllabusParseStatus,
  SubmissionStatus,
} from "@prisma/client";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";
import { assertIsolatedIntegrationEnvironment } from "../integration/database";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ExecutorSubmission {
  requestId: string;
  sourceCode: string;
  stdin: string;
  networkAccess: boolean;
  metadata: { jobId: string; purpose: string };
}

assertIsolatedIntegrationEnvironment("HTTP_INTEGRATION_SCHEMA");
const prisma = new PrismaClient();
const applicationPort = 3116;
const executorPort = 3216;
const baseUrl = `http://127.0.0.1:${applicationPort}`;
const externalExecutorUrl =
  process.env.PROGRAMMING_RUNTIME_EXECUTOR_URL?.trim() || null;
const externalExecutorApiKey =
  process.env.PROGRAMMING_RUNTIME_EXECUTOR_API_KEY?.trim() || null;
if (Boolean(externalExecutorUrl) !== Boolean(externalExecutorApiKey)) {
  throw new Error(
    "PROGRAMMING_RUNTIME_EXECUTOR_URL and PROGRAMMING_RUNTIME_EXECUTOR_API_KEY must be configured together",
  );
}
const usesExternalExecutor = externalExecutorUrl !== null;
const executorUrl = externalExecutorUrl ?? `http://127.0.0.1:${executorPort}`;
const workerSecret = "programming-http-integration-worker-secret-v1";
const executorSecret =
  externalExecutorApiKey ?? "programming-http-integration-executor-secret-v1";
const sessionIds: string[] = [];
const applicationOutput: string[] = [];
const workerOutput: string[] = [];
const executorInputs: ExecutorSubmission[] = [];
let application: ChildProcess | null = null;
let worker: ChildProcess | null = null;

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const executionById = new Map<string, ExecutorSubmission>();
const executionByRequestId = new Map<string, string>();
const executor = createServer(async (request, response) => {
  if (request.headers.authorization !== `Bearer ${executorSecret}`) {
    json(response, 401, { error: "UNAUTHORIZED" });
    return;
  }
  const url = new URL(request.url ?? "/", executorUrl);
  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, {
      status: "ok",
      executorVersion: "integration-gvisor-v1",
      active: 0,
      queued: 0,
      maxConcurrency: 1,
      maxQueueDepth: 10,
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/v1/executions") {
    const input = (await readJson(request)) as ExecutorSubmission;
    assert.equal(input.networkAccess, false);
    assert.equal(input.metadata.purpose, "FUTURE_JUDGE");
    const existing = executionByRequestId.get(input.requestId);
    if (existing) {
      json(response, 200, {
        executionId: existing,
        executorVersion: "integration-gvisor-v1",
      });
      return;
    }
    const executionId = `exec_${randomUUID()}`;
    executionByRequestId.set(input.requestId, executionId);
    executionById.set(executionId, input);
    executorInputs.push(input);
    json(response, 202, {
      executionId,
      executorVersion: "integration-gvisor-v1",
    });
    return;
  }
  const resultMatch = /^\/v1\/executions\/([^/]+)$/u.exec(url.pathname);
  if (request.method === "GET" && resultMatch) {
    const executionId = decodeURIComponent(resultMatch[1] ?? "");
    const input = executionById.get(executionId);
    if (!input) {
      json(response, 404, { error: "EXECUTION_NOT_FOUND" });
      return;
    }
    const value = Number(input.stdin.trim());
    const stdout = `${value * value}\n`;
    json(response, 200, {
      executionId,
      status: "SUCCEEDED",
      executorVersion: "integration-gvisor-v1",
      errorType: "NONE",
      exitCode: 0,
      stdout,
      stderr: "",
      resourceUsage: {
        cpuTimeMs: null,
        wallTimeMs: 12,
        peakMemoryBytes: null,
        outputBytes: Buffer.byteLength(stdout),
        processCount: null,
      },
      tests: [],
    });
    return;
  }
  const cancelMatch = /^\/v1\/executions\/([^/]+)\/cancel$/u.exec(url.pathname);
  if (request.method === "POST" && cancelMatch) {
    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
    return;
  }
  json(response, 404, { error: "NOT_FOUND" });
});

async function listenExecutor(): Promise<void> {
  if (usesExternalExecutor) return;
  await new Promise<void>((resolveListen, reject) => {
    executor.once("error", reject);
    executor.listen(executorPort, "127.0.0.1", () => resolveListen());
  });
}

async function waitForApplication(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(
    `Programming integration application did not start:\n${applicationOutput.join("")}`,
  );
}

async function sessionCookie(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 180_000),
    },
  });
  sessionIds.push(session.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function requestJson(
  path: string,
  cookie?: string,
  method = "GET",
  body?: unknown,
) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function waitForAttempt(attemptId: string, cookie: string) {
  for (let index = 0; index < 100; index += 1) {
    const response = await requestJson(
      `/api/student/programming-attempts/${attemptId}`,
      cookie,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as ApiSuccess<{
      id: string;
      kind: "PUBLIC_RUN" | "FORMAL_JUDGE";
      status: ProgrammingAttemptStatus;
      score: number | null;
      maxScore: number;
      cases: Array<Record<string, unknown>>;
    }>;
    if (
      body.data.status === ProgrammingAttemptStatus.SUCCEEDED ||
      body.data.status === ProgrammingAttemptStatus.SYSTEM_ERROR ||
      body.data.status === ProgrammingAttemptStatus.CANCELLED
    ) {
      return body.data;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Programming attempt ${attemptId} did not finish`);
}

async function createPublishedGraphFixture(
  courseId: string,
  teacherId: string,
  conceptId: string,
) {
  const suffix = randomBytes(5).toString("hex");
  const syllabus = await prisma.courseSyllabus.create({
    data: {
      courseId,
      uploadedById: teacherId,
      versionNumber: 1,
      originalName: "programming-runtime-test.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      storageKey: `programming-runtime/${suffix}/syllabus.pdf`,
    },
  });
  const parseDraft = await prisma.syllabusParseDraft.create({
    data: {
      courseId,
      syllabusId: syllabus.id,
      requestedById: teacherId,
      status: SyllabusParseStatus.SUCCEEDED,
      parserVersion: `runtime-parser-${suffix}`,
      promptVersion: "runtime-prompt-v1",
      ruleVersion: "runtime-rule-v1",
      structuredResult: {},
    },
  });
  const syllabusReview = await prisma.syllabusReviewRevision.create({
    data: {
      courseId,
      syllabusId: syllabus.id,
      parseDraftId: parseDraft.id,
      editedById: teacherId,
      revisionNumber: 1,
      structureJson: {},
    },
  });
  const publishedSyllabus = await prisma.publishedSyllabusStructure.create({
    data: {
      courseId,
      syllabusId: syllabus.id,
      parseDraftId: parseDraft.id,
      reviewRevisionId: syllabusReview.id,
      publishedById: teacherId,
      versionNumber: 1,
      structureJson: {},
    },
  });
  const graphDraft = await prisma.knowledgeGraphDraft.create({
    data: {
      courseId,
      sourceSyllabusStructureId: publishedSyllabus.id,
      requestedById: teacherId,
      status: KnowledgeGraphStatus.SUCCEEDED,
      generatorVersion: `runtime-generator-${suffix}`,
      promptVersion: "runtime-prompt-v1",
      ruleVersion: "runtime-rule-v1",
      progress: 100,
      successCount: 1,
      deterministicStructureJson: {},
      generatedStructureJson: {},
    },
  });
  const graphReview = await prisma.knowledgeGraphReviewRevision.create({
    data: {
      courseId,
      graphDraftId: graphDraft.id,
      sourceSyllabusStructureId: publishedSyllabus.id,
      editedById: teacherId,
      revisionNumber: 1,
      structureJson: {},
    },
  });
  const graph = await prisma.publishedKnowledgeGraphVersion.create({
    data: {
      courseId,
      sourceSyllabusStructureId: publishedSyllabus.id,
      graphDraftId: graphDraft.id,
      reviewRevisionId: graphReview.id,
      publishedById: teacherId,
      versionNumber: 1,
      structureJson: {},
      nodes: {
        create: {
          conceptId,
          nodeType: KnowledgeGraphNodeType.KNOWLEDGE_POINT,
          code: "PY-RUNTIME",
          name: "Python 输入输出",
          sourceType: KnowledgeGraphSourceType.TEACHER,
          sourceRefs: [],
          sortOrder: 1,
        },
      },
    },
    include: { nodes: true },
  });
  await prisma.course.update({
    where: { id: courseId },
    data: {
      currentPublishedSyllabusStructureId: publishedSyllabus.id,
      currentPublishedKnowledgeGraphVersionId: graph.id,
    },
  });
  return graph;
}

async function main(): Promise<void> {
  process.env.BACKGROUND_JOB_WORKER_SECRET = workerSecret;
  await listenExecutor();
  application = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(applicationPort),
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  application.stdout?.on("data", (chunk: Buffer) =>
    applicationOutput.push(chunk.toString()),
  );
  application.stderr?.on("data", (chunk: Buffer) =>
    applicationOutput.push(chunk.toString()),
  );

  try {
    await waitForApplication();
    worker = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve("services/programming-judge-worker/src/main.ts"),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          APPLICATION_INTERNAL_URL: baseUrl,
          BACKGROUND_JOB_WORKER_SECRET: workerSecret,
          SANDBOX_EXECUTOR_URL: executorUrl,
          SANDBOX_EXECUTOR_API_KEY: executorSecret,
          PROGRAMMING_JUDGE_WORKER_ID: "programming-http-integration-worker",
          PROGRAMMING_JUDGE_POLL_INTERVAL_MS: "100",
          PROGRAMMING_JUDGE_LEASE_DURATION_MS: "10000",
          PROGRAMMING_JUDGE_RECOVERY_INTERVAL_MS: "5000",
        },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    worker.stdout?.on("data", (chunk: Buffer) =>
      workerOutput.push(chunk.toString()),
    );
    worker.stderr?.on("data", (chunk: Buffer) =>
      workerOutput.push(chunk.toString()),
    );

    const suffix = randomBytes(5).toString("hex");
    const [teacher, teacherTwo, student, outsider, template, knowledgePoint] =
      await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { email: "teacher@example.com" },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: "teacher2@example.com" },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: "student2@example.com" },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: "student3@example.com" },
        }),
        prisma.courseTemplate.findFirstOrThrow({ where: { isActive: true } }),
        prisma.knowledgePoint.findFirstOrThrow(),
      ]);
    const [teacherCookie, teacherTwoCookie, studentCookie, outsiderCookie] =
      await Promise.all([
        sessionCookie(teacher.id),
        sessionCookie(teacherTwo.id),
        sessionCookie(student.id),
        sessionCookie(outsider.id),
      ]);
    const course = await prisma.course.create({
      data: {
        templateId: template.id,
        teacherId: teacher.id,
        courseNo: `PR-${suffix}`,
        term: "2026-test",
        name: "Programming runtime integration course",
        status: CourseStatus.ACTIVE,
        publishedAt: new Date(),
      },
    });
    const classroom = await prisma.classroom.create({
      data: {
        teacherId: teacher.id,
        courseId: course.id,
        name: "Programming runtime integration class",
        joinCode: `PR${suffix}`,
        memberships: {
          create: { studentId: student.id, status: MembershipStatus.ACTIVE },
        },
      },
    });
    const concept = await prisma.knowledgeGraphConcept.create({
      data: { courseId: course.id, stableKey: "python-runtime-io" },
    });
    const graph = await createPublishedGraphFixture(
      course.id,
      teacher.id,
      concept.id,
    );

    const questionResponse = await requestJson(
      "/api/teacher/questions",
      teacherCookie,
      "POST",
      {
        title: "Python 平方计算",
        content: "读取一个整数并输出它的平方。",
        type: QuestionType.PYTHON_PROGRAMMING,
        difficulty: 2,
        options: [],
        answer: { kind: "PROGRAMMING" },
        explanation: "读取整数后输出 n * n。",
        knowledgePointIds: [knowledgePoint.id],
        tags: ["python", "runtime"],
        visibility: QuestionVisibility.PRIVATE,
      },
    );
    assert.equal(questionResponse.status, 201);
    const question = (await questionResponse.json()) as ApiSuccess<{
      id: string;
    }>;
    const configInput = {
      standardCode: "n = int(input())\nprint(n * n)\n",
      starterCode: "n = int(input())\n",
      totalPoints: 10,
      limits: {
        cpuTimeMs: 1000,
        wallTimeMs: 2000,
        memoryBytes: 64 * 1024 * 1024,
        outputBytes: 16 * 1024,
        processCount: 4,
      },
      testCases: [
        {
          visibility: ProgrammingTestVisibility.PUBLIC,
          name: "公开样例",
          stdin: "2\n",
          expectedOutput: "4\n",
          points: 4,
          sortOrder: 1,
        },
        {
          visibility: ProgrammingTestVisibility.HIDDEN,
          name: "隐藏用例-不得泄露",
          stdin: "3\n",
          expectedOutput: "9\n",
          points: 6,
          sortOrder: 2,
        },
      ],
    };
    const configPath = `/api/teacher/questions/${question.data.id}/programming-config`;
    assert.equal(
      (await requestJson(configPath, studentCookie, "POST", configInput))
        .status,
      403,
    );
    assert.equal(
      (await requestJson(configPath, teacherTwoCookie, "POST", configInput))
        .status,
      404,
    );
    assert.equal(
      (await requestJson(configPath, teacherCookie, "POST", configInput))
        .status,
      201,
    );

    await prisma.questionKnowledgeGraphBindingSet.create({
      data: {
        questionId: question.data.id,
        courseId: course.id,
        revision: 1,
        bindings: {
          create: {
            questionId: question.data.id,
            courseId: course.id,
            conceptId: concept.id,
            sourceGraphVersionId: graph.id,
            sourceNodeId: graph.nodes[0]!.id,
            bindingType: QuestionGraphBindingType.PRIMARY,
            createdById: teacher.id,
          },
        },
      },
    });

    const assignmentResponse = await requestJson(
      "/api/teacher/assignments",
      teacherCookie,
      "POST",
      {
        title: `Python 判题联调-${suffix}`,
        description: "验证公开运行、隐藏判题和证据投影",
        classroomId: classroom.id,
        publishedAt: new Date(Date.now() - 60_000).toISOString(),
        dueAt: new Date(Date.now() + 3_600_000).toISOString(),
        allowResubmission: false,
        questions: [{ questionId: question.data.id, sortOrder: 1, points: 10 }],
      },
    );
    assert.equal(assignmentResponse.status, 201);
    const assignment = (await assignmentResponse.json()) as ApiSuccess<{
      id: string;
    }>;
    assert.equal(
      (
        await requestJson(
          `/api/teacher/assignments/${assignment.data.id}/publish`,
          teacherCookie,
          "POST",
        )
      ).status,
      200,
    );
    const snapshot =
      await prisma.assignmentProgrammingConfigSnapshot.findFirstOrThrow({
        where: { assignmentQuestion: { assignmentId: assignment.data.id } },
      });
    assert.equal(snapshot.configRevisionNumber, 1);

    assert.equal(
      (
        await requestJson(
          `/api/student/assignments/${assignment.data.id}`,
          outsiderCookie,
        )
      ).status,
      404,
    );
    const startResponse = await requestJson(
      `/api/student/assignments/${assignment.data.id}/attempts`,
      studentCookie,
      "POST",
      { idempotencyKey: randomUUID() },
    );
    assert.equal(startResponse.status, 201);
    const submission = (await startResponse.json()) as ApiSuccess<{
      id: string;
      version: number;
      questions: Array<{ id: string; type: QuestionType }>;
    }>;
    const assignmentQuestion = submission.data.questions.find(
      (item) => item.type === QuestionType.PYTHON_PROGRAMMING,
    );
    assert.ok(assignmentQuestion);
    const sourceCode = "n = int(input())\nprint(n * n)\n";
    const publicRunResponse = await requestJson(
      `/api/student/submissions/${submission.data.id}/programming-runs`,
      studentCookie,
      "POST",
      {
        assignmentQuestionId: assignmentQuestion.id,
        sourceCode,
        idempotencyKey: randomUUID(),
      },
    );
    assert.equal(publicRunResponse.status, 202);
    const publicRun = (await publicRunResponse.json()) as ApiSuccess<{
      attemptId: string;
    }>;
    assert.equal(
      (
        await requestJson(
          `/api/student/programming-attempts/${publicRun.data.attemptId}`,
          outsiderCookie,
        )
      ).status,
      404,
    );
    const publicResult = await waitForAttempt(
      publicRun.data.attemptId,
      studentCookie,
    );
    assert.equal(publicResult.status, ProgrammingAttemptStatus.SUCCEEDED);
    assert.equal(publicResult.kind, "PUBLIC_RUN");
    assert.equal(publicResult.score, null);
    assert.equal(publicResult.cases.length, 1);
    assert.equal(
      publicResult.cases[0]?.stdout,
      "4\n",
      JSON.stringify(publicResult),
    );

    const saveResponse = await requestJson(
      `/api/student/submissions/${submission.data.id}/answers`,
      studentCookie,
      "PUT",
      {
        version: submission.data.version,
        answers: [
          {
            assignmentQuestionId: assignmentQuestion.id,
            kind: "CODE",
            value: sourceCode,
          },
        ],
      },
    );
    assert.equal(saveResponse.status, 200);
    assert.equal(
      (
        await requestJson(
          `/api/student/submissions/${submission.data.id}/submit`,
          studentCookie,
          "POST",
        )
      ).status,
      200,
    );
    const formal = await prisma.programmingAttempt.findFirstOrThrow({
      where: {
        studentAnswer: { submissionId: submission.data.id },
        kind: "FORMAL_JUDGE",
      },
    });
    const formalResult = await waitForAttempt(formal.id, studentCookie);
    assert.equal(formalResult.status, ProgrammingAttemptStatus.SUCCEEDED);
    assert.equal(formalResult.kind, "FORMAL_JUDGE");
    assert.equal(formalResult.score, 10);
    assert.equal(formalResult.maxScore, 10);
    assert.equal(formalResult.cases.length, 2);
    const formalJson = JSON.stringify(formalResult);
    assert.equal(formalJson.includes("隐藏用例-不得泄露"), false);
    assert.equal(formalJson.includes('"stdin"'), false);
    assert.equal(formalJson.includes('"expectedOutput"'), false);
    assert.equal(formalJson.includes('"stdout"'), false);
    assert.equal(formalJson.includes('"stderr"'), false);

    const [storedAnswer, storedSubmission, storedResults, events, evidence] =
      await Promise.all([
        prisma.studentAnswer.findFirstOrThrow({
          where: { submissionId: submission.data.id },
        }),
        prisma.submission.findUniqueOrThrow({
          where: { id: submission.data.id },
        }),
        prisma.programmingTestCaseResult.findMany({
          where: { attemptId: formal.id },
          orderBy: { caseIndex: "asc" },
        }),
        prisma.learningEvent.findMany({
          where: { sourceType: "STUDENT_ANSWER" },
        }),
        prisma.studentAnswerConceptEvidence.findMany({
          where: { assignmentId: assignment.data.id },
        }),
      ]);
    assert.equal(storedAnswer.score?.toNumber(), 10);
    assert.equal(storedAnswer.gradingStatus, "AUTO_GRADED");
    assert.equal(storedSubmission.status, SubmissionStatus.GRADED);
    assert.equal(storedResults.length, 2);
    assert.equal(
      storedResults.find(
        (item) => item.visibility === ProgrammingTestVisibility.HIDDEN,
      )?.stdout,
      null,
    );
    assert.equal(
      storedResults.find(
        (item) => item.visibility === ProgrammingTestVisibility.HIDDEN,
      )?.stderr,
      null,
    );
    assert.equal(events.length, 1);
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0]?.score?.toNumber(), 10);
    if (!usesExternalExecutor) {
      assert.equal(executorInputs.length, 3);
      assert.equal(
        executorInputs.every((input) => input.networkAccess === false),
        true,
      );
    }

    console.info(
      `Programming runtime HTTP integration passed (${usesExternalExecutor ? "real remote executor" : "controlled executor double"}): public run, hidden judge, grade and concept evidence.`,
    );
  } finally {
    worker?.kill();
    application?.kill();
    if (!usesExternalExecutor) {
      await new Promise<void>((resolveClose) =>
        executor.close(() => resolveClose()),
      );
    }
    if (sessionIds.length > 0) {
      await prisma.authSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
    }
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack : String(error);
  console.error(message);
  if (workerOutput.length > 0) {
    console.error(`Worker output:\n${workerOutput.join("")}`);
  }
  if (applicationOutput.length > 0) {
    console.error(`Application output:\n${applicationOutput.join("")}`);
  }
  process.exitCode = 1;
});
