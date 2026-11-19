import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";
import { AI_QUESTION_JOB_TYPE } from "@/services/ai-question-generation/schemas";
import { executeClaimedAIQuestionGenerationJob } from "@/services/ai-question-generation/worker";
import { claimBackgroundJobById } from "@/services/background-jobs/repository";
import { EXAM_PAPER_JOB_TYPE } from "@/services/exams/paper-ai";
import { executeClaimedExamPaperJob } from "@/services/exams/paper-worker";
import { finalizeExpiredExams } from "@/services/exams/expiry";
import { publishDueExamResults } from "@/services/exams/result-management";
import { getCourseObjectiveMap } from "@/services/learner-profiles/concept-objectives";
import { createPublishedGraphFixture } from "../helpers/teaching-graph-fixture";
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
        schoolId: teacher.schoolId,
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
      4,
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
    assert.doesNotMatch(emptyHtml, /<span>返回课程<\/span>/);
    const courseExamList = await fetch(
      `${base}/teacher/exams?courseId=${course.id}&classroomId=${classroom.id}&fromCourseId=${course.id}`,
      { headers: { cookie: teacherCookie } },
    );
    assert.equal(courseExamList.status, 200);
    const courseExamHtml = await courseExamList.text();
    assert.match(courseExamHtml, /<span>返回课程<\/span>/);
    assert.ok(courseExamHtml.includes(`href="/teacher/courses/${course.id}"`));
    assert.ok(
      courseExamHtml.includes(`name="fromCourseId" value="${course.id}"`),
    );
    const globalFiltered = await fetch(
      `${base}/teacher/exams?courseId=${course.id}`,
      { headers: { cookie: teacherCookie } },
    );
    assert.equal(globalFiltered.status, 200);
    assert.doesNotMatch(await globalFiltered.text(), /<span>返回课程<\/span>/);
    for (const path of [
      `/teacher/courses/${course.id}/profiles?classroomId=${classroom.id}`,
      `/teacher/courses/${course.id}/students?classroomId=${classroom.id}`,
      `/teacher/assignments/new?classroomId=${classroom.id}`,
    ]) {
      const page = await fetch(`${base}${path}`, {
        headers: { cookie: teacherCookie },
      });
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.ok(html.includes(`href="/teacher/courses/${course.id}"`));
      assert.match(html, /<span>返回课程<\/span>/);
      if (path.includes("/students?")) {
        assert.ok(html.indexOf("批量导入名单") < html.indexOf("添加学生"));
      }
      if (path.includes("/assignments/new")) {
        assert.ok(
          html.indexOf("草稿管理") < html.indexOf("<span>返回课程</span>"),
        );
      }
    }
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
          type: "REGULAR",
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
    assert.equal(
      (
        await prisma.examSession.findUniqueOrThrow({
          where: { id: result.data.id },
        })
      ).type,
      "REGULAR",
    );
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
    const classroomPath = `/teacher/exams/${examId}/classes/${assignment.id}`;
    assert.ok((await workspace.text()).includes(classroomPath));
    const teacherPage = (path: string, cookie = teacherCookie) =>
      fetch(`${base}${path}`, { headers: { cookie } });
    const monitorPath = `/teacher/exams/${examId}/monitor?classroomId=${classroom.id}`;
    const scopeQuery = `fromCourseId=${course.id}&courseId=${course.id}&status=UPCOMING`;
    const scoped = (path: string) =>
      `${path}${path.includes("?") ? "&" : "?"}examList=${encodeURIComponent(scopeQuery)}`;
    const scopedWorkspace = await (
      await teacherPage(`/teacher/exams/${examId}?${scopeQuery}`)
    ).text();
    for (const path of [
      classroomPath,
      `${classroomPath}/submissions`,
      `${classroomPath}/results`,
      monitorPath,
    ]) {
      assert.ok(
        scopedWorkspace.includes(
          scoped(path).replace("&examList", "&amp;examList"),
        ),
      );
      const destination = await teacherPage(scoped(path));
      assert.equal(destination.status, 200);
      const destinationHtml = await destination.text();
      assert.ok(destinationHtml.includes(scoped(`/teacher/exams/${examId}`)));
      assert.match(destinationHtml, /当前考试导航/);
    }
    const paper = await (await teacherPage(classroomPath)).text();
    assert.ok(paper.includes(`${classroomPath}/submissions`));
    assert.ok(paper.includes(`${classroomPath}/results`));
    assert.match(paper, /班级试卷|查看试卷/);
    assert.doesNotMatch(paper, /返回作业管理|作业内容/);
    assert.match(paper, /<h3[^>]*>可接受答案/);
    assert.match(paper, /<h3[^>]*>答案解析/);
    assert.doesNotMatch(paper, /参考答案与解析（仅教师可见）/);
    const homework = await prisma.assignment.findFirstOrThrow({
      where: {
        teacherId: teacher.id,
        examSessionId: null,
        deletedAt: null,
        questions: {
          some: { optionSnapshots: { some: { isCorrectSnapshot: true } } },
        },
      },
      select: { id: true },
    });
    const homeworkPaper = await teacherPage(
      `/teacher/assignments/${homework.id}`,
    );
    assert.equal(homeworkPaper.status, 200);
    const homeworkHtml = await homeworkPaper.text();
    assert.match(homeworkHtml, /bg-green-50[^>]*>.*?正确答案/);
    assert.match(homeworkHtml, /<h3[^>]*>答案解析/);
    const legacy = await teacherPage(
      `/teacher/assignments/${assignment.id}/submissions?pageSize=10`,
    );
    const legacyUrl = new URL(legacy.url);
    if (legacyUrl.pathname === `${classroomPath}/submissions`) {
      assert.equal(legacyUrl.searchParams.get("pageSize"), "10");
    } else {
      assert.ok(
        (await legacy.text()).includes(
          `${classroomPath}/submissions?pageSize=10`,
        ),
      );
    }
    for (const path of [
      classroomPath,
      classroomPath.replace(examId, assignment.id),
    ]) {
      const denied = await teacherPage(
        path,
        path === classroomPath ? otherCookie : teacherCookie,
      );
      assert.match(await denied.text(), /资源不存在|找不到此考试页面/);
    }
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
    const studentExamScope = new URLSearchParams({
      courseId: course.id,
      classroomId: classroom.id,
    });
    const reportPath = `/student/exams/${examId}/report?${studentExamScope}`;
    const studentPage = (path: string) =>
      fetch(`${base}${path}`, {
        headers: { cookie: studentCookie },
      });
    const beforeReport = await studentPage(reportPath);
    assert.equal(beforeReport.status, 200);
    assert.match(await beforeReport.text(), /成绩待公布/);
    const examListPath = `/student/exams?${studentExamScope}&status=SUBMITTED`;
    const listBeforePublish = await (
      await studentPage(examListPath.replace("SUBMITTED", "AWAITING"))
    ).text();
    assert.doesNotMatch(listBeforePublish, /查看考试报告|查看成绩与答卷/);
    const recordHref = listBeforePublish
      .match(/href="([^"]+)">查看考试记录<\/a>/)?.[1]
      ?.replaceAll("&amp;", "&");
    assert.ok(recordHref);
    const recordUrl = new URL(recordHref, base);
    assert.equal(recordUrl.pathname, `/student/exams/${examId}/record`);
    assert.equal(recordUrl.searchParams.get("courseId"), course.id);
    assert.equal(recordUrl.searchParams.get("classroomId"), classroom.id);
    assert.match(
      recordUrl.searchParams.get("returnTo") ?? "",
      /status=AWAITING/,
    );
    const recordBeforePublish = await (await studentPage(recordHref)).text();
    assert.match(recordBeforePublish, /查看交卷回执/);
    assert.doesNotMatch(recordBeforePublish, /查看成绩与答卷/);
    const singleQuestionPath = `/student/submissions/${attempt.id}/result?question=1&${studentExamScope}`;
    const hiddenQuestion = await studentPage(singleQuestionPath);
    assert.doesNotMatch(await hiddenQuestion.text(), /<h2[^>]*>答案解析<\/h2>/);
    const receiptBeforePublication = await (await studentResult()).text();
    assert.match(receiptBeforePublication, /答题卡/);
    assert.match(receiptBeforePublication, /id="exam-question-1"/);
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
    const reportPage = await studentPage(reportPath);
    assert.equal(reportPage.status, 200);
    assert.match(await reportPage.text(), /我的成绩/);
    const singleQuestion = await studentPage(singleQuestionPath);
    assert.equal(singleQuestion.status, 200);
    const singleQuestionHtml = await singleQuestion.text();
    assert.match(singleQuestionHtml, /<h2[^>]*>答案解析<\/h2>/);
    assert.doesNotMatch(
      singleQuestionHtml,
      /id="submitted-answers"|id="exam-question-1"/,
    );
    const listAfterPublish = await (await studentPage(examListPath)).text();
    assert.match(listAfterPublish, /查看考试记录/);
    assert.doesNotMatch(listAfterPublish, /查看考试报告|查看成绩与答卷/);
    const recordAfterPublish = await (await studentPage(recordHref)).text();
    assert.doesNotMatch(recordAfterPublish, /查看答卷与反馈|查看考试报告/);
    const unifiedHref = recordAfterPublish
      .match(/href="([^"]+)"[^>]*>查看成绩与答卷<\/a>/)?.[1]
      ?.replaceAll("&amp;", "&");
    assert.ok(unifiedHref);
    const unifiedUrl = new URL(unifiedHref, base);
    assert.equal(unifiedUrl.pathname, `/student/exams/${examId}/report`);
    assert.equal(unifiedUrl.searchParams.get("classroomId"), classroom.id);
    const unifiedHtml = await (await studentPage(unifiedHref)).text();
    assert.match(unifiedHtml, /查看完整答卷与反馈/);
    assert.match(unifiedHtml, /返回考试记录/);
    const answerHref = recordAfterPublish
      .match(/href="([^"]+)"[^>]*>查看答卷<\/a>/)?.[1]
      ?.replaceAll("&amp;", "&");
    assert.ok(answerHref);
    assert.match(await (await studentPage(answerHref)).text(), /返回考试记录/);
    const gradeNotice = await prisma.notification.findFirstOrThrow({
      where: {
        recipientId: student.id,
        sourceId: attempt.id,
        type: "ASSIGNMENT_GRADED",
      },
    });
    const noticePage = await studentPage(`/notifications/${gradeNotice.id}`);
    assert.equal(noticePage.status, 200);
    const noticeHtml = await noticePage.text();
    assert.match(noticeHtml, /考试成绩已公布/);
    assert.match(noticeHtml, /查看考试报告/);
    assert.ok(noticeHtml.includes(`/student/exams/${examId}/report?`));
    const otherClassReport = await studentPage(
      reportPath.replace(classroom.id, archivedClassroom.id),
    );
    const otherClassHtml = await otherClassReport.text();
    assert.match(otherClassHtml, /资源不存在|"robots" content="noindex"/);
    assert.doesNotMatch(otherClassHtml, /我的成绩/);
    const progressPage = await teacherPage(`/teacher/exams/${examId}`);
    assert.equal(progressPage.status, 200);
    const progressHtml = (await progressPage.text()).replace(/<[^>]+>/g, "");
    assert.match(progressHtml, /实考1 人待批改0 人已公布1 人/);
    const submissions = await (
      await teacherPage(`${classroomPath}/submissions`)
    ).text();
    const personalPath = `${classroomPath}/submissions/${attempt.id}`;
    assert.ok(submissions.includes(personalPath));
    const results = await (
      await teacherPage(`${classroomPath}/results`)
    ).text();
    assert.ok(results.includes(personalPath));
    const personal = await (
      await teacherPage(
        `${personalPath}?returnTo=${encodeURIComponent(`${classroomPath}/results?page=1&pageSize=10`)}`,
      )
    ).text();
    assert.match(personal, /个人答卷详情/);
    assert.ok(personal.includes(`${classroomPath}/results?page=1`));
    const monitorReturn = scoped(monitorPath) + `#monitor-${attempt.id}`;
    const fromMonitor = await (
      await teacherPage(
        `${personalPath}?returnTo=${encodeURIComponent(monitorReturn)}`,
      )
    ).text();
    assert.match(fromMonitor, /返回监考与公布/);
    assert.ok(
      fromMonitor.includes(monitorReturn.replace("&examList", "&amp;examList")),
    );
    const wrongClass = monitorReturn.replace(classroom.id, assignment.id);
    const forged = await (
      await teacherPage(
        `${personalPath}?returnTo=${encodeURIComponent(wrongClass)}`,
      )
    ).text();
    assert.doesNotMatch(forged, /返回监考与公布/);
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
    const exitQuestion = await prisma.question.create({
      data: {
        creatorId: teacher.id,
        questionCategoryId: category.id,
        title: "退出自动交卷测试",
        content: `判断题 ${randomUUID()}`,
        type: "TRUE_FALSE",
        explanation: "测试解析",
        correctBoolean: true,
        status: "ACTIVE",
      },
    });
    const exitExamResponse = await write(
      `${base}/api/teacher/exams`,
      teacherCookie,
      {
        requestId: randomUUID(),
        courseId: course.id,
        classroomIds: [classroom.id],
        type: "REGULAR",
        title: "Python 阶段考核 · 分支与循环",
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 3_600_000),
        autoSubmitOnExit: true,
        allowedAttempts: 2,
        allowedSwitches: 2,
        questions: [{ questionId: exitQuestion.id, points: 100 }],
      },
    );
    const exitExamBody = await exitExamResponse.json();
    assert.equal(exitExamResponse.status, 201, JSON.stringify(exitExamBody));
    assert.equal(exitExamBody.data.allowedAttempts, 2);
    assert.equal(exitExamBody.data.type, "REGULAR");
    const regularList = await fetch(`${base}/teacher/exams?type=REGULAR`, {
      headers: { cookie: teacherCookie },
    });
    const regularHtml = await regularList.text();
    assert.match(regularHtml, /Python 阶段考核 · 分支与循环/);
    assert.match(regularHtml, /HTTP 试卷考试/);
    const studentExamList = await fetch(`${base}/student/exams`, {
      headers: { cookie: studentCookie },
    });
    assert.match(await studentExamList.text(), /平时考试/);
    const exitAssignmentId = exitExamBody.data.assignments[0].id;
    const startExitAttempt = () =>
      write(
        `${base}/api/student/assignments/${exitAssignmentId}/attempts`,
        studentCookie,
        { idempotencyKey: randomUUID() },
      );
    const exitAutoUrl = `${base}/api/student/exams/auto-submit`;
    const exitAttemptResponse = await startExitAttempt();
    assert.equal(exitAttemptResponse.status, 201);
    const firstExitAttempt = (await exitAttemptResponse.json()).data;
    const exitSnapshot = {
      trigger: "EXIT",
      submissionId: firstExitAttempt.id,
      answers: {
        version: firstExitAttempt.version,
        answers: [
          {
            assignmentQuestionId: firstExitAttempt.questions[0].id,
            kind: "BOOLEAN",
            value: true,
          },
        ],
      },
    };
    assert.equal(
      (await write(exitAutoUrl, teacherCookie, exitSnapshot)).status,
      403,
    );
    const exitCollection = await write(
      exitAutoUrl,
      studentCookie,
      exitSnapshot,
    );
    assert.equal(exitCollection.status, 200);
    assert.equal(
      (await exitCollection.json()).data.examReceipt.reason,
      "PAGE_EXIT",
    );
    for (const path of [
      "/student/tasks?kind=exam",
      "/student/exams",
      `/student/assignments/${exitAssignmentId}`,
    ]) {
      const page = await fetch(`${base}${path}`, {
        headers: { cookie: studentCookie },
      });
      assert.equal(page.status, 200);
      assert.match(
        await page.text(),
        path === "/student/exams"
          ? /再次作答（第 2 次）/
          : /剩余\s*(?:<!-- -->)?1(?:<!-- -->)?\s*次/,
        path,
      );
    }
    const nextExitAttempt = (await (await startExitAttempt()).json()).data;
    assert.equal(
      (
        await write(exitAutoUrl, studentCookie, {
          trigger: "EXIT",
          submissionId: nextExitAttempt.id,
        })
      ).status,
      200,
    );
    assert.equal((await startExitAttempt()).status, 409);
    console.log(
      "Exam exit endpoint, role checks, badges and exhausted limit passed",
    );
    const importUrl = `${base}/api/teacher/questions/import/commit`;
    const importItem = {
      rowKey: "objective-import-1",
      title: "双目标导入测试",
      content: "本题同时检查知识与能力。",
      type: "TRUE_FALSE",
      options: [],
      answer: { kind: "BOOLEAN", value: true },
      explanation: "用于验证导入范围。",
      tags: ["回归测试"],
    };
    const importData = {
      source: { fileName: "objective-import.json", checksum: "a".repeat(64) },
      categoryId: category.id,
      objectiveScope: {
        courseId: course.id,
        syllabusStructureId: publishedSyllabus.id,
      },
      questions: [{ ...importItem, objectiveCodes: ["O1", "O2"] }],
    };
    assert.notEqual(
      (await write(importUrl, otherCookie, importData)).status,
      201,
    );
    assert.equal(
      (
        await write(importUrl, teacherCookie, {
          ...importData,
          questions: [{ ...importItem, objectiveCodes: ["INVALID"] }],
        })
      ).status,
      400,
    );
    assert.equal(
      await prisma.question.count({ where: { title: importItem.title } }),
      0,
    );
    const imported = await write(importUrl, teacherCookie, importData);
    assert.equal(imported.status, 201);
    const importedId = (await imported.json()).data.questionIds[0];
    const mappings = await prisma.questionCourseObjective.findMany({
      where: { questionId: importedId },
      select: { objectiveCode: true, source: true },
      orderBy: { objectiveCode: "asc" },
    });
    assert.deepEqual(mappings, [
      { objectiveCode: "O1", source: "TEACHER" },
      { objectiveCode: "O2", source: "TEACHER" },
    ]);
    await prisma.questionCourseObjective.create({
      data: {
        questionId: exitQuestion.id,
        ...importData.objectiveScope,
        objectiveCode: "O1",
        source: "AI",
      },
    });
    const batchUrl = `${base}/api/teacher/questions/classify-objective/batch`;
    const batchData = {
      courseId: course.id,
      requestId: randomUUID(),
      questionIds: [exitQuestion.id, importedId],
    };
    for (const cookie of [teacherCookie, teacherCookie]) {
      const batch = await write(batchUrl, cookie, batchData);
      assert.equal(batch.status, 200);
      assert.deepEqual((await batch.json()).data, {
        queued: 1,
        skipped: 1,
        failed: 0,
      });
    }
    assert.equal(
      await prisma.backgroundJob.count({
        where: {
          courseId: course.id,
          idempotencyKey: { endsWith: batchData.requestId },
        },
      }),
      1,
    );
    const scope = importData.objectiveScope;
    const appendUrl = `${base}/api/teacher/questions/course-objective/batch`;
    const appendData = {
      ...scope,
      questionIds: [exitQuestion.id, importedId],
      objectiveCode: "O3",
    };
    assert.equal((await write(appendUrl, otherCookie, appendData)).status, 404);
    assert.equal(
      (
        await write(appendUrl, teacherCookie, {
          ...appendData,
          objectiveCode: "INVALID",
        })
      ).status,
      400,
    );
    for (const replay of [false, true]) {
      const response = await write(appendUrl, teacherCookie, appendData);
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).data, {
        added: replay ? 0 : 2,
        unchanged: replay ? 2 : 0,
        limitReached: 0,
      });
    }
    const addFourth = await write(appendUrl, teacherCookie, {
      ...appendData,
      objectiveCode: "O4",
    });
    assert.equal(addFourth.status, 200);
    assert.deepEqual((await addFourth.json()).data, {
      added: 1,
      unchanged: 0,
      limitReached: 1,
    });
    const editResponse = await fetch(
      `${base}/api/teacher/questions/${importedId}/course-objective`,
      {
        method: "PUT",
        headers: { cookie: teacherCookie, "content-type": "application/json" },
        body: JSON.stringify({
          ...scope,
          objectiveCodes: ["O1", "O2", "O3", "O4"],
          expectedObjectiveCodes: ["O1", "O2", "O3"],
        }),
      },
    );
    assert.equal(editResponse.status, 400);
    for (const [questionId, expected] of [
      [
        importedId,
        [
          { objectiveCode: "O1", source: "TEACHER" },
          { objectiveCode: "O2", source: "TEACHER" },
          { objectiveCode: "O3", source: "TEACHER" },
        ],
      ],
      [
        exitQuestion.id,
        [
          { objectiveCode: "O1", source: "AI" },
          { objectiveCode: "O3", source: "TEACHER" },
          { objectiveCode: "O4", source: "TEACHER" },
        ],
      ],
    ] as const) {
      assert.deepEqual(
        await prisma.questionCourseObjective.findMany({
          where: { ...scope, questionId },
          select: { objectiveCode: true, source: true },
          orderBy: { objectiveCode: "asc" },
        }),
        expected,
      );
    }
    const questionLibrary = await fetch(
      `${base}/teacher/questions?courseId=${course.id}&objectiveCode=O3`,
      {
        headers: { cookie: teacherCookie },
      },
    );
    assert.equal(questionLibrary.status, 200);
    const questionLibraryHtml = await questionLibrary.text();
    assert.match(questionLibraryHtml, /批量追加课程目标/);
    assert.match(questionLibraryHtml, /双目标导入测试/);
    const { publishVersion } = await createPublishedGraphFixture(
      course.id,
      teacher.id,
      publishedSyllabus.id,
    );
    const concepts = await prisma.knowledgeGraphConcept.createManyAndReturn({
      data: Array.from({ length: 500 }, (_, index) => ({
        courseId: course.id,
        stableKey: `objective-sample-${index}`,
      })),
    });
    const graph = await publishVersion(
      1,
      concepts.map(({ id }) => id),
    );
    const firstNode = graph.nodes[0];
    const unlabeled = await prisma.question.create({
      data: {
        creatorId: teacher.id,
        questionCategoryId: category.id,
        title: "未标注的派生分母测试题",
        content: "课程目标派生应把这道题计入分母。",
        explanation: "用于验证未标注题仍计入支持比例的分母。",
        type: "TRUE_FALSE",
        status: "ACTIVE",
        correctBoolean: true,
      },
    });
    const editUrl = `${base}/api/teacher/questions/${unlabeled.id}/course-objective`;
    const legacyEdit = await write(
      editUrl,
      teacherCookie,
      {
        ...scope,
        objectiveCode: "O2",
        expectedObjectiveCode: null,
      },
      "PUT",
    );
    assert.equal(legacyEdit.status, 200);
    assert.deepEqual((await legacyEdit.json()).data, {
      objectiveCodes: ["O2"],
      objectiveCode: "O2",
    });
    const arrayEdit = await write(
      editUrl,
      teacherCookie,
      {
        ...scope,
        objectiveCodes: [],
        expectedObjectiveCodes: ["O2"],
      },
      "PUT",
    );
    assert.equal(arrayEdit.status, 200);
    assert.deepEqual((await arrayEdit.json()).data, { objectiveCodes: [] });
    for (const questionId of [exitQuestion.id, importedId, unlabeled.id]) {
      const set = await prisma.questionKnowledgeGraphBindingSet.create({
        data: { questionId, courseId: course.id },
      });
      await prisma.questionKnowledgeGraphBinding.create({
        data: {
          bindingSetId: set.id,
          questionId,
          courseId: course.id,
          conceptId: firstNode.conceptId,
          sourceGraphVersionId: graph.id,
          sourceNodeId: firstNode.id,
          bindingType: "PRIMARY",
          createdById: teacher.id,
        },
      });
    }
    const benchmarkQuestions = await prisma.question.createManyAndReturn({
      data: Array.from(
        { length: (graph.nodes.length - 1) * 2 },
        (_, index) => ({
          creatorId: teacher.id,
          questionCategoryId: category.id,
          title: `派生规模测试题 ${index + 1}`,
          content: `知识点关联规模样本 ${index + 1}`,
          explanation: "合成的规模测试题。",
          type: "TRUE_FALSE",
          status: "ACTIVE",
          correctBoolean: true,
        }),
      ),
      select: { id: true },
    });
    const benchmarkSets =
      await prisma.questionKnowledgeGraphBindingSet.createManyAndReturn({
        data: benchmarkQuestions.map(({ id }) => ({
          questionId: id,
          courseId: course.id,
        })),
        select: { id: true, questionId: true },
      });
    await prisma.questionKnowledgeGraphBinding.createMany({
      data: benchmarkSets.map(({ id, questionId }, index) => {
        const node = graph.nodes[Math.floor(index / 2) + 1];
        return {
          bindingSetId: id,
          questionId,
          courseId: course.id,
          conceptId: node.conceptId,
          sourceGraphVersionId: graph.id,
          sourceNodeId: node.id,
          bindingType: "PRIMARY",
          createdById: teacher.id,
        };
      }),
    });
    await prisma.questionCourseObjective.createMany({
      data: benchmarkQuestions.map(({ id }) => ({
        ...scope,
        questionId: id,
        objectiveCode: "O1",
        source: "TEACHER",
      })),
    });
    const startedPreview = performance.now();
    const objectiveMap = await getCourseObjectiveMap(teacher.id, course.id);
    console.log(
      `500-concept, 1001-question objective preview: ${Math.round(performance.now() - startedPreview)} ms`,
    );
    assert.equal(objectiveMap.multiTargetQuestionCount, 2);
    assert.ok(
      objectiveMap.preview?.additions.some(
        (item) =>
          item.conceptId === firstNode.conceptId &&
          item.objectiveCode === "O3" &&
          item.share === 2 / 3,
      ),
    );
    const assemblyUrl = `${base}/api/teacher/exams/auto-assemble`;
    const assemblyInput = {
      courseId: course.id,
      startsAt: new Date(Date.now() + 3_600_000).toISOString(),
      conceptIds: [firstNode.conceptId],
      counts: { TRUE_FALSE: 1 },
      excludeQuestionIds: [exitQuestion.id, unlabeled.id],
    };
    const assembly = await write(assemblyUrl, teacherCookie, assemblyInput);
    assert.equal(assembly.status, 200);
    const assemblyQuestions = (await assembly.json()).data.questions;
    assert.deepEqual(
      assemblyQuestions.map(
        ({ id, objectiveCodes }: { id: string; objectiveCodes: string[] }) => ({
          id,
          objectiveCodes,
        }),
      ),
      [{ id: importedId, objectiveCodes: ["O1", "O2", "O3"] }],
    );
    const broadAssembly = await write(assemblyUrl, teacherCookie, {
      ...assemblyInput,
      conceptIds: concepts.slice(0, 83).map(({ id }) => id),
    });
    assert.equal(broadAssembly.status, 200);
    assert.equal(
      Object.keys((await broadAssembly.json()).data.coverage).length,
      83,
    );
    assert.equal(
      (
        await write(assemblyUrl, teacherCookie, {
          ...assemblyInput,
          conceptIds: concepts.slice(0, 201).map(({ id }) => id),
        })
      ).status,
      400,
    );
    const aiRequest = new FormData();
    aiRequest.set(
      "request",
      JSON.stringify({
        courseId: course.id,
        mode: "RANGE",
        conceptIds: graph.nodes.slice(0, 83).map(({ conceptId }) => conceptId),
        balancedConcepts: true,
        bloomLevel: "APPLY",
        counts: { SINGLE_CHOICE: 2 },
        singleChoiceOptions: 4,
        multipleChoiceOptions: 4,
        idempotencyKey: randomUUID(),
      }),
    );
    const aiResponse = await fetch(`${base}/api/teacher/ai-question-batches`, {
      method: "POST",
      headers: { cookie: teacherCookie },
      body: aiRequest,
    });
    const aiBody = await aiResponse.json();
    assert.equal(aiResponse.status, 202, JSON.stringify(aiBody));
    const aiBatch = await prisma.aIQuestionGenerationBatch.findUniqueOrThrow({
      where: { id: aiBody.data.id },
    });
    assert.ok(aiBatch.jobId);
    const aiJob = await claimBackgroundJobById(aiBatch.jobId, {
      workerId: "exam-range-http",
      executorVersion: "test-v1",
      acceptedTypes: [AI_QUESTION_JOB_TYPE],
      leaseDurationMs: 180_000,
    });
    assert.ok(aiJob?.currentLeaseId);
    await executeClaimedAIQuestionGenerationJob(
      aiJob.id,
      aiJob.currentLeaseId,
      aiBatch.id,
      aiBatch.generationRevision,
    );
    const aiCandidates = await prisma.aIQuestionGenerationCandidate.findMany({
      where: { batchId: aiBatch.id },
      orderBy: { ordinal: "asc" },
    });
    assert.deepEqual(
      aiCandidates.map(({ primaryConceptId }) => primaryConceptId),
      [graph.nodes[20].conceptId, graph.nodes[62].conceptId],
    );
    assert.match(
      JSON.stringify(aiCandidates[1].sourceRefs),
      new RegExp(graph.nodes[62].id),
    );
    console.log(
      "Objective import, permissions, batch protections and replay passed",
    );
    const reviewQuestion = await prisma.question.create({
      data: {
        creatorId: teacher.id,
        questionCategoryId: category.id,
        title: "试卷解析快照验收",
        content: "请选择发布时的正确答案。",
        type: "SINGLE_CHOICE",
        status: "ACTIVE",
        explanation: "发布时保存的解析。",
        options: {
          create: [
            {
              label: "A",
              content: "发布时的正确选项",
              isCorrect: true,
              sortOrder: 1,
            },
            { label: "B", content: "题库后来设为正确的选项", sortOrder: 2 },
          ],
        },
      },
    });
    const reviewExamResponse = await write(
      `${base}/api/teacher/exams`,
      teacherCookie,
      {
        requestId: randomUUID(),
        courseId: course.id,
        classroomIds: [classroom.id],
        type: "MIDTERM",
        title: "试卷解析样式验收",
        startsAt: new Date(Date.now() + 3_600_000).toISOString(),
        endsAt: new Date(Date.now() + 7_200_000).toISOString(),
        allowedSwitches: 1,
        questions: [{ questionId: reviewQuestion.id, points: 100 }],
      },
    );
    assert.equal(reviewExamResponse.status, 201);
    const reviewExam = (await reviewExamResponse.json()).data;
    const reviewAssignment = await prisma.assignment.findFirstOrThrow({
      where: { examSessionId: reviewExam.id, classroomId: classroom.id },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.questionOption.updateMany({
        where: { questionId: reviewQuestion.id, label: "A" },
        data: { isCorrect: false },
      }),
      prisma.questionOption.updateMany({
        where: { questionId: reviewQuestion.id, label: "B" },
        data: { isCorrect: true },
      }),
      prisma.question.update({
        where: { id: reviewQuestion.id },
        data: { explanation: "题库更新后的解析。" },
      }),
    ]);
    const reviewPaperPath = `/teacher/exams/${reviewExam.id}/classes/${reviewAssignment.id}`;
    const reviewPaperPage = await teacherPage(reviewPaperPath);
    assert.equal(reviewPaperPage.status, 200);
    const reviewPaperHtml = await reviewPaperPage.text();
    const highlighted = [
      ...reviewPaperHtml.matchAll(/<li[^>]*bg-green-50[^>]*>[\s\S]*?<\/li>/g),
    ].map(([raw]) => raw);
    assert.equal(highlighted.length, 1);
    assert.match(highlighted[0], /发布时的正确选项/);
    assert.match(reviewPaperHtml, /发布时保存的解析。/);
    assert.doesNotMatch(reviewPaperHtml, /题库更新后的解析。/);
    console.log("Exam HTTP integration passed");
  } catch (error) {
    console.error(output.join("").slice(-8000));
    throw error;
  } finally {
    server.kill();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
