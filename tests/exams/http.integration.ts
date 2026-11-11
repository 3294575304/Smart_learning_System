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
import { finalizeExpiredExams } from "@/services/exams/expiry";
import { publishDueExamResults } from "@/services/exams/result-management";
import { assertIsolatedIntegrationEnvironment } from "../integration/database";
import { publishExamTestSyllabus } from "./syllabus-fixture";

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
        id: `qc_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
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
    const publishedSyllabus = await publishExamTestSyllabus(
      prisma,
      course.id,
      teacher.id,
    );
    const classroom = await prisma.classroom.create({
      data: {
        teacherId: teacher.id,
        courseId: course.id,
        name: "考试 HTTP 班",
        joinCode: randomUUID(),
        memberships: { create: { studentId: student.id } },
      },
    });
    const archivedCourse = await prisma.course.create({
      data: {
        teacherId: teacher.id,
        templateId: template.id,
        questionCategoryId: category.id,
        name: "已归档考试测试课程",
        courseNo: `EH-ARCHIVED-${randomUUID().slice(0, 6)}`,
        term: course.term,
        status: "ARCHIVED",
      },
    });
    const archivedClassroom = await prisma.classroom.create({
      data: {
        teacherId: teacher.id,
        courseId: course.id,
        name: "已归档考试测试班",
        joinCode: randomUUID(),
        status: "ARCHIVED",
      },
    });
    const emptyList = await fetch(`${base}/teacher/exams`, {
      headers: { cookie: teacherCookie },
    });
    assert.equal(emptyList.status, 200);
    const emptyHtml = await emptyList.text();
    assert.match(emptyHtml, /暂无考试场次/);
    assert.match(emptyHtml, /筛选考试/);
    assert.match(emptyHtml, /考试 HTTP 课程/);
    assert.match(emptyHtml, /考试 HTTP 班/);
    assert.ok(!emptyHtml.includes(archivedCourse.id));
    assert.ok(!emptyHtml.includes(archivedClassroom.id));
    async function assertExamBackLink(path: string, title: string) {
      const page = await fetch(`${base}${path}`, {
        headers: { cookie: teacherCookie },
      });
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.ok(html.includes(title));
      assert.match(html, /<a href="\/teacher\/exams"[^>]*aria-busy="false"/);
      assert.match(html, /返回考试管理/);
    }
    await assertExamBackLink("/teacher/exams/import", "上传试卷");
    await assertExamBackLink("/teacher/exams/new", "新建考试");
    for (const name of ["keyword", "courseId", "classroomId", "status", "type"])
      assert.ok(emptyHtml.includes(`name="${name}"`));
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
    await assertExamBackLink(
      `/teacher/exams/drafts/${draftId}`,
      "审核试卷草稿",
    );
    const managementWithDraft = await fetch(`${base}/teacher/exams`, {
      headers: { cookie: teacherCookie },
    });
    const managementHtml = await managementWithDraft.text();
    assert.equal(managementWithDraft.status, 200);
    assert.match(managementHtml, /id="exam-paper-drafts"/);
    assert.ok(managementHtml.includes(`/teacher/exams/drafts/${draftId}`));
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
    const reviewAllUrl = `${base}/api/teacher/exams/drafts/${draftId}/review-all`;
    assert.equal(
      (
        await fetch(reviewAllUrl, {
          method: "POST",
          headers: { cookie: otherCookie, "content-type": "application/json" },
          body: JSON.stringify({ expectedRevision: current.revision }),
        })
      ).status,
      404,
    );
    const reviewed = await fetch(reviewAllUrl, {
      method: "POST",
      headers: { cookie: teacherCookie, "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: current.revision }),
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
    assert.equal(
      (
        await prisma.examQuestionUse.findFirstOrThrow({
          where: { examSessionId: result.data.id },
        })
      ).syllabusStructureId,
      publishedSyllabus.id,
    );
    const examId = result.data.id;
    const assignment = await prisma.assignment.findFirstOrThrow({
      where: { examSessionId: examId, classroomId: classroom.id },
    });
    const list = await fetch(
      `${base}/teacher/exams?courseId=${course.id}&classroomId=${classroom.id}`,
      { headers: { cookie: teacherCookie } },
    );
    assert.equal(list.status, 200);
    assert.ok((await list.text()).includes(`/teacher/exams/${examId}?`));
    const workspace = await fetch(`${base}/teacher/exams/${examId}`, {
      headers: { cookie: teacherCookie },
      redirect: "manual",
    });
    assert.equal(workspace.status, 200);
    assert.ok(
      (await workspace.text()).includes(
        `/teacher/assignments/${assignment.id}?source=exam`,
      ),
    );
    const startedAt = new Date(Date.now() - 1000);
    await prisma.examSession.update({
      where: { id: examId },
      data: { startsAt: startedAt },
    });
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { publishedAt: startedAt },
    });
    const attempt = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentId: student.id,
        idempotencyKey: randomUUID(),
      },
    });
    const statusUrl = `${base}/api/student/exams/status?submissionId=${attempt.id}`;
    assert.equal((await fetch(statusUrl)).status, 401);
    assert.equal(
      (await fetch(statusUrl, { headers: { cookie: teacherCookie } })).status,
      403,
    );
    const status = await fetch(statusUrl, {
      headers: { cookie: studentCookie },
    });
    assert.equal(status.status, 200);
    assert.match(status.headers.get("cache-control") ?? "", /no-store/);
    assert.equal((await status.json()).data.state, "WORKING");
    const answer = await fetch(
      `${base}/student/submissions/${attempt.id}/answer`,
      {
        headers: { cookie: studentCookie },
      },
    );
    assert.equal(answer.status, 200);
    assert.match(await answer.text(), /考试倒计时/);

    const query = `classroomId=${classroom.id}`;
    const monitorUrl = `${base}/api/teacher/exams/${examId}/monitor?${query}`;
    assert.equal((await fetch(monitorUrl)).status, 401);
    assert.equal(
      (await fetch(monitorUrl, { headers: { cookie: studentCookie } })).status,
      403,
    );
    assert.equal(
      (await fetch(monitorUrl, { headers: { cookie: otherCookie } })).status,
      404,
    );
    assert.equal(
      (
        await fetch(monitorUrl.replace(classroom.id, archivedClassroom.id), {
          headers: { cookie: teacherCookie },
        })
      ).status,
      404,
    );
    const activeMonitor = await fetch(monitorUrl, {
      headers: { cookie: teacherCookie },
    });
    assert.equal(activeMonitor.status, 200);
    assert.equal(
      (await activeMonitor.json()).data.rows[0].state,
      "IN_PROGRESS",
    );
    const monitorPage = await fetch(
      `${base}/teacher/exams/${examId}/monitor?${query}`,
      { headers: { cookie: teacherCookie } },
    );
    assert.equal(monitorPage.status, 200);
    assert.match(await monitorPage.text(), /成绩公布与复核/);

    const write = (
      url: string,
      cookie: string,
      body: object,
      method = "POST",
    ) =>
      fetch(url, {
        method,
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const reviewUrl = `${base}/api/student/exams/reviews`;
    const reviewRequest = {
      submissionId: attempt.id,
      reason: "请核对第 1 题的得分。",
    };
    assert.equal(
      (await write(reviewUrl, studentCookie, reviewRequest)).status,
      404,
    );
    const manualPublish = () =>
      write(
        `${base}/api/teacher/assignments/${assignment.id}/results/publish`,
        teacherCookie,
        {},
      );
    assert.equal((await manualPublish()).status, 409);
    const schedule = (cookie: string, scheduledAt: Date) =>
      write(
        monitorUrl,
        cookie,
        {
          action: "POLICY",
          policy: { mode: "SCHEDULED", scheduledAt: scheduledAt.toISOString() },
        },
        "PATCH",
      );
    assert.equal(
      (await schedule(teacherCookie, new Date(Date.now() + 5_000))).status,
      400,
    );
    assert.equal(
      (await schedule(otherCookie, new Date(Date.now() + 7_200_000))).status,
      404,
    );
    assert.equal(
      (await schedule(teacherCookie, new Date(Date.now() + 7_200_000))).status,
      200,
    );
    const cutoff = new Date(Date.now() - 1);
    await prisma.examSession.update({
      where: { id: examId },
      data: { endsAt: cutoff },
    });
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { dueAt: cutoff },
    });
    const collecting = await fetch(monitorUrl, {
      headers: { cookie: teacherCookie },
    });
    assert.equal((await collecting.json()).data.rows[0].state, "COLLECTING");
    await finalizeExpiredExams();
    const collected = await fetch(monitorUrl, {
      headers: { cookie: teacherCookie },
    });
    assert.equal((await collected.json()).data.rows[0].state, "AUTO_SUBMITTED");
    assert.equal((await manualPublish()).status, 409);
    const studentResult = () =>
      fetch(`${base}/student/submissions/${attempt.id}/result`, {
        headers: { cookie: studentCookie },
      });
    assert.doesNotMatch(
      await (await studentResult()).text(),
      /id="exam-score-review"/,
    );
    assert.equal(await publishDueExamResults(), 0);
    await prisma.examResultPublication.update({
      where: { assignmentId: assignment.id },
      data: { scheduledAt: cutoff },
    });
    assert.equal(await publishDueExamResults(), 1);
    assert.equal(await publishDueExamResults(), 0);
    assert.match(
      await (await studentResult()).text(),
      /id="exam-score-review"/,
    );
    const created = await write(reviewUrl, studentCookie, reviewRequest);
    assert.equal(created.status, 200);
    const reviewId = (await created.json()).data.id;
    const duplicate = await write(reviewUrl, studentCookie, {
      ...reviewRequest,
      reason: "重复提交测试",
    });
    assert.equal((await duplicate.json()).data.id, reviewId);
    const reply = {
      action: "RESOLVE_REVIEW",
      reviewId,
      response: "已核对题目和作答，评分结果一致。",
    };
    assert.equal(
      (await write(monitorUrl, otherCookie, reply, "PATCH")).status,
      404,
    );
    assert.equal(
      (await write(monitorUrl, teacherCookie, reply, "PATCH")).status,
      200,
    );
    const resolvedReview = await prisma.examScoreReview.findUniqueOrThrow({
      where: { id: reviewId },
    });
    assert.equal(resolvedReview.reason, reviewRequest.reason);
    assert.equal(resolvedReview.response, reply.response);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "EXAM_SCORE_REVIEW_RESOLVED", targetId: attempt.id },
      select: { afterData: true },
    });
    assert.deepEqual(audit?.afterData, { status: "RESOLVED" });
    assert.match(await (await studentResult()).text(), /已核对题目和作答/);
    console.log(
      "Exam monitor, timed publication, score visibility and review passed",
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
