import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";
import { claimBackgroundJobById } from "@/services/background-jobs/repository";
import { EXAM_PAPER_JOB_TYPE } from "@/services/exams/paper-ai";
import { executeClaimedExamPaperJob } from "@/services/exams/paper-worker";
import { assertIsolatedIntegrationEnvironment } from "../integration/database";

assertIsolatedIntegrationEnvironment("HTTP_INTEGRATION_SCHEMA");
const prisma = new PrismaClient();

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolveListen, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolveListen);
  });
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("No local port");
  await new Promise<void>((resolveClose) => probe.close(() => resolveClose()));
  return address.port;
}

async function sessionCookie(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  return `${SESSION_COOKIE_NAME}=${token}`;
}

async function main() {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const output: string[] = [];
  const server = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (part: Buffer) => output.push(part.toString()));
  server.stderr.on("data", (part: Buffer) => output.push(part.toString()));
  try {
    let started = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        if ((await fetch(`${base}/login`)).ok) {
          started = true;
          break;
        }
      } catch {
        /* Next.js is starting. */
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    if (!started)
      throw new Error(`Exam HTTP server did not start: ${output.join("")}`);
    const [teacher, other, student, template] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { email: "teacher@example.com" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "teacher2@example.com" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "student@example.com" },
      }),
      prisma.courseTemplate.findFirstOrThrow(),
    ]);
    const [teacherCookie, otherCookie, studentCookie] = await Promise.all([
      sessionCookie(teacher.id),
      sessionCookie(other.id),
      sessionCookie(student.id),
    ]);
    const category = await prisma.questionCourseCategory.create({
      data: {
        name: "考试 HTTP 分类",
        normalizedName: `exam-http-${randomUUID()}`,
      },
    });
    const course = await prisma.course.create({
      data: {
        teacherId: teacher.id,
        templateId: template.id,
        questionCategoryId: category.id,
        name: "考试 HTTP 课程",
        courseNo: `EH-${randomUUID().slice(0, 6)}`,
        term: "2026",
        status: "ACTIVE",
      },
    });
    const classroom = await prisma.classroom.create({
      data: {
        teacherId: teacher.id,
        courseId: course.id,
        name: "考试 HTTP 班",
        joinCode: randomUUID(),
        memberships: { create: { studentId: student.id } },
      },
    });
    const paperText = `题号：1\n填空题 HTTP 上传题 ${randomUUID()} ____\n答案：正确\n解析：HTTP 集成验证。`;
    function uploadBody(confirmed: boolean) {
      const form = new FormData();
      form.set("courseId", course.id);
      form.set(
        "file",
        new File([paperText], "http-exam.txt", { type: "text/plain" }),
      );
      if (confirmed) form.set("confirmedBlank", "true");
      return form;
    }
    assert.equal(
      (
        await fetch(`${base}/api/teacher/exams/drafts`, {
          method: "POST",
          body: uploadBody(true),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(`${base}/api/teacher/exams/drafts`, {
          method: "POST",
          headers: { cookie: studentCookie },
          body: uploadBody(true),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/api/teacher/exams/drafts`, {
          method: "POST",
          headers: { cookie: teacherCookie },
          body: uploadBody(false),
        })
      ).status,
      400,
    );
    const upload = await fetch(`${base}/api/teacher/exams/drafts`, {
      method: "POST",
      headers: { cookie: teacherCookie },
      body: uploadBody(true),
    });
    assert.equal(upload.status, 202);
    const uploaded = (await upload.json()) as {
      data: { id: string; jobId: string };
    };
    const draftId = uploaded.data.id;
    assert.equal(
      (
        await fetch(`${base}/api/teacher/exams/drafts/${draftId}`, {
          headers: { cookie: otherCookie },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${base}/api/teacher/exams/drafts/${draftId}/source`, {
          headers: { cookie: otherCookie },
        })
      ).status,
      404,
    );
    const claimed = await claimBackgroundJobById(uploaded.data.jobId, {
      workerId: "exam-http",
      executorVersion: "test-v1",
      acceptedTypes: [EXAM_PAPER_JOB_TYPE],
      leaseDurationMs: 180_000,
    });
    assert.ok(claimed?.currentLeaseId);
    await executeClaimedExamPaperJob(
      uploaded.data.jobId,
      claimed.currentLeaseId,
      { draftId, revision: 1 },
    );
    async function draft() {
      const response = await fetch(
        `${base}/api/teacher/exams/drafts/${draftId}`,
        { headers: { cookie: teacherCookie } },
      );
      assert.equal(response.status, 200);
      return (
        (await response.json()) as {
          data: {
            revision: number;
            status: string;
            questions: Array<{
              id: string;
              revision: number;
              questionJson: unknown;
              reviewedRevision: number | null;
            }>;
          };
        }
      ).data;
    }
    let current = await draft();
    assert.equal(current.status, "READY");
    assert.equal(current.questions.length, 1);
    const questionId = current.questions[0].id;
    const questionBase = `${base}/api/teacher/exams/drafts/${draftId}/questions/${questionId}`;
    const reviewBeforeEdit = await fetch(`${questionBase}/review`, {
      method: "POST",
      headers: { cookie: teacherCookie, "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: current.questions[0].revision }),
    });
    assert.equal(reviewBeforeEdit.status, 400);
    const edited = await fetch(questionBase, {
      method: "PATCH",
      headers: { cookie: teacherCookie, "content-type": "application/json" },
      body: JSON.stringify({
        expectedRevision: current.questions[0].revision,
        question: current.questions[0].questionJson,
        points: 100,
      }),
    });
    assert.equal(edited.status, 200);
    current = await draft();
    const reviewed = await fetch(`${questionBase}/review`, {
      method: "POST",
      headers: { cookie: teacherCookie, "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: current.questions[0].revision }),
    });
    assert.equal(reviewed.status, 200);
    current = await draft();
    assert.equal(
      current.questions[0].reviewedRevision,
      current.questions[0].revision,
    );
    const configured = await fetch(
      `${base}/api/teacher/exams/drafts/${draftId}`,
      {
        method: "PATCH",
        headers: { cookie: teacherCookie, "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: current.revision,
          type: "MIDTERM",
          title: "HTTP 试卷考试",
          startsAt: new Date(Date.now() + 120_000).toISOString(),
          endsAt: new Date(Date.now() + 3_600_000).toISOString(),
          allowedSwitches: 1,
          classroomIds: [classroom.id],
        }),
      },
    );
    assert.equal(configured.status, 200);
    current = await draft();
    const requestId = randomUUID();
    async function publish() {
      return fetch(`${base}/api/teacher/exams/drafts/${draftId}/publish`, {
        method: "POST",
        headers: { cookie: teacherCookie, "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: current.revision, requestId }),
      });
    }
    const published = await publish();
    assert.equal(published.status, 201);
    const result = (await published.json()) as { data: { id: string } };
    assert.equal((await publish()).status, 201);
    assert.equal(
      (
        await prisma.examPaperDraft.findUniqueOrThrow({
          where: { id: draftId },
        })
      ).publishedExamId,
      result.data.id,
    );
    assert.equal(
      await prisma.question.count({
        where: { questionCategoryId: category.id },
      }),
      1,
    );
    console.log("Exam HTTP integration passed");
  } finally {
    server.kill();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
