import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME } from "@/services/auth/constants";
import { getStudentTaskOverview } from "@/services/dashboard/student-task-service";

const base = "http://127.0.0.1:3117";
const scratch = "D:/OpenAIData/tmp/zhixue-9300";
const schema =
  new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema") ?? "";
assert.match(schema, /^student_tasks_it_[a-z0-9_]+$/u);
let checks = 0;
function check(value: unknown, message: string) {
  assert.ok(value, message);
  checks++;
}
async function cookie(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  return `${SESSION_COOKIE_NAME}=${token}`;
}
async function main() {
  const password = `Acceptance-${randomUUID()}!`;
  const passwordHash = await hash(password, 4);
  const teacher = await prisma.user.create({
    data: {
      role: "TEACHER",
      passwordHash,
      profile: { create: { displayName: "验收教师" } },
    },
  });
  const otherTeacher = await prisma.user.create({
    data: { role: "TEACHER", passwordHash },
  });
  const admin = await prisma.user.create({
    data: { role: "ADMIN", passwordHash },
  });
  const student = await prisma.user.create({
    data: {
      role: "STUDENT",
      email: "student@acceptance.invalid",
      passwordHash,
      profile: { create: { displayName: "验收学生" } },
    },
  });
  const emptyStudent = await prisma.user.create({
    data: {
      role: "STUDENT",
      email: "empty@acceptance.invalid",
      passwordHash,
      profile: { create: { displayName: "空状态验收" } },
    },
  });
  const template = await prisma.courseTemplate.create({
    data: { code: "student-pages", name: "页面验收模板" },
  });
  const category = await prisma.questionCourseCategory.create({
    data: { name: "页面验收", normalizedName: "student-pages" },
  });
  const makeCourse = (name: string, teacherId = teacher.id) =>
    prisma.course.create({
      data: {
        templateId: template.id,
        questionCategoryId: category.id,
        teacherId,
        name,
        courseNo: randomUUID(),
        term: "2026",
        status: "ACTIVE",
      },
    });
  const course = await makeCourse("Python 页面验收");
  const secondCourse = await makeCourse("第二课程验收");
  const foreignCourse = await makeCourse("隔离课程", otherTeacher.id);
  const makeClass = (
    name: string,
    courseId = course.id,
    teacherId = teacher.id,
  ) =>
    prisma.classroom.create({
      data: {
        name,
        courseId,
        teacherId,
        joinCode: randomUUID(),
        memberships: { create: { studentId: student.id } },
      },
    });
  const room = await makeClass("验收甲班");
  const secondRoom = await makeClass("验收乙班");
  const thirdRoom = await makeClass("第二课程班", secondCourse.id);
  const emptyRoom = await makeClass("空教学班");
  const foreignRoom = await prisma.classroom.create({
    data: {
      name: "外部教学班",
      teacherId: otherTeacher.id,
      courseId: foreignCourse.id,
      joinCode: randomUUID(),
    },
  });
  const date = (minutes: number) => new Date(Date.now() + minutes * 60_000);
  const question = await prisma.question.create({
    data: {
      creatorId: teacher.id,
      questionCategoryId: category.id,
      title: "验收判断题",
      content: "Python 是编程语言。",
      type: "TRUE_FALSE",
      difficulty: 1,
      status: "ACTIVE",
      correctBoolean: true,
      explanation: "验收解析",
    },
  });
  const makeAssignment = (
    title: string,
    classroomId = room.id,
    dueAt = date(45),
  ) =>
    prisma.assignment.create({
      data: {
        classroomId,
        teacherId: teacher.id,
        title,
        status: "PUBLISHED",
        publishedAt: date(-60),
        dueAt,
        totalPoints: 10,
        questions: {
          create: {
            questionId: question.id,
            sortOrder: 1,
            points: 10,
            titleSnapshot: question.title,
            contentSnapshot: question.content,
            typeSnapshot: "TRUE_FALSE",
            difficultySnapshot: 1,
            explanationSnapshot: question.explanation,
            correctBooleanSnapshot: true,
          },
        },
      },
      include: { questions: true },
    });
  const longTitle =
    "长标题排版验收：" +
    "循环与函数综合应用练习".repeat(8) +
    " LongUnbrokenAssignmentTitleForResponsiveLayoutTesting";
  const first = await makeAssignment(longTitle, room.id, date(25));
  for (let i = 0; i < 9; i++) await makeAssignment(`甲班作业 ${i + 1}`);
  await makeAssignment("乙班专属作业", secondRoom.id);
  await makeAssignment("第二课程专属作业", thirdRoom.id);
  const submitted = await makeAssignment("甲班已提交记录");
  const result = await prisma.submission.create({
    data: {
      assignmentId: submitted.id,
      studentId: student.id,
      idempotencyKey: randomUUID(),
      status: "SUBMITTED",
      startedAt: date(-1),
      submittedAt: new Date(),
    },
  });
  const expired = await makeAssignment("个人补交验收", room.id, date(-5));
  const draft = await prisma.submission.create({
    data: {
      assignmentId: first.id,
      studentId: student.id,
      idempotencyKey: randomUUID(),
    },
  });
  const attendance = await prisma.attendanceSession.create({
    data: {
      courseId: course.id,
      classroomId: room.id,
      teacherId: teacher.id,
      title: "甲班开放签到",
      status: "OPEN",
      startsAt: date(-1),
      signInOpensAt: date(-1),
      lateAfter: date(10),
      signInClosesAt: date(20),
      records: { create: { studentId: student.id } },
    },
  });
  const makeSurvey = (title: string, opensAt: Date, classroomId = room.id) =>
    prisma.courseSurvey.create({
      data: {
        courseId: course.id,
        classroomId,
        teacherId: teacher.id,
        title,
        instructions: "验收问卷，不计入成绩",
        status: "PUBLISHED",
        publishedAt: date(-2),
        opensAt,
        dueAt: date(30),
        questions: {
          create: {
            type: "LIKERT_5",
            dimension: "CONTENT",
            prompt: "内容清晰",
            required: true,
            sortOrder: 1,
          },
        },
      },
    });
  const survey = await makeSurvey("甲班问卷", date(-1));
  const scheduled = await makeSurvey("甲班预约问卷", date(15));
  await makeSurvey("乙班专属问卷", date(-1), secondRoom.id);
  const sessions = {
    student: await cookie(student.id),
    teacher: await cookie(teacher.id),
    admin: await cookie(admin.id),
    otherTeacher: await cookie(otherTeacher.id),
  };
  const output: string[] = [];
  const server = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      "3117",
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  server.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  const request = (
    path: string,
    session = sessions.student,
    init: RequestInit = {},
  ) =>
    fetch(base + path, {
      ...init,
      redirect: "manual",
      headers: { Cookie: session, ...init.headers },
    });
  const page = async (path: string) => {
    const response = await request(path);
    check(response.status === 200, `page status: ${path}`);
    return (await response.text()).replaceAll("&amp;", "&");
  };
  const missing = async (path: string) => {
    const response = await request(path);
    const html = await response.text();
    check(
      response.status === 404 || html.includes("NEXT_HTTP_ERROR_FALLBACK;404"),
      `not found: ${path}`,
    );
  };
  const scope = `courseId=${course.id}&classroomId=${room.id}`;
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        if ((await fetch(base + "/login")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    check(ready, "isolated server started");
    for (const path of [
      "/student",
      "/student/tasks",
      "/student/assignments",
      "/student/attendance",
      "/student/surveys",
    ]) {
      const response = await request(path, "");
      check(
        response.status === 307 &&
          (response.headers.get("location") ?? "").includes("/login"),
        "unauthenticated page redirects",
      );
      for (const role of [sessions.teacher, sessions.admin]) {
        const forbidden = await request(path, role);
        const html = await forbidden.text();
        check(
          forbidden.status === 307
            ? (forbidden.headers.get("location") ?? "").includes("/403")
            : html.includes("NEXT_REDIRECT") && html.includes("/403"),
          "wrong-role page rejects",
        );
      }
    }
    for (const path of [
      "/api/student/assignments",
      "/api/student/attendance",
      "/api/student/surveys",
    ]) {
      check(
        (await request(path, "")).status === 401,
        "unauthenticated API rejects",
      );
      check(
        (await request(path, sessions.teacher)).status === 403,
        "teacher API rejects",
      );
      const foreign = await request(
        `${path}?courseId=${foreignCourse.id}&classroomId=${foreignRoom.id}`,
      );
      if (path === "/api/student/attendance") {
        check(
          foreign.status === 404,
          "scoped attendance API rejects foreign resources",
        );
      } else {
        // These legacy list APIs have no scope-query contract. They remain global,
        // but must only return the authenticated student's resources.
        check(foreign.status === 200, "legacy global list contract retained");
        check(
          !(await foreign.text()).includes(foreignRoom.id),
          "global API does not expose foreign class",
        );
      }
    }
    const list = await page(`/student/assignments?${scope}`);
    check(
      !list.includes("<select") && !list.includes("全部教学班"),
      "fixed assignment scope",
    );
    check(
      !list.includes("乙班专属作业") && !list.includes("第二课程专属作业"),
      "no cross-class/course assignments",
    );
    check(
      list.includes(`page=2&courseId=${course.id}&classroomId=${room.id}`),
      "pagination preserves scope",
    );
    await page(`/student/assignments?page=2&${scope}`);
    await page(`/student/assignments?status=PENDING&${scope}`);
    const records = await page(`/student/assignments?view=records&${scope}`);
    check(
      records.includes("甲班已提交记录") &&
        records.includes(
          `/student/submissions/${result.id}/result?courseId=${course.id}&classroomId=${room.id}`,
        ),
      "records preserve scope",
    );
    const detail = await page(`/student/assignments/${first.id}?${scope}`);
    check(
      detail.includes(`/student/assignments?${scope}`) &&
        detail.includes(`/student/submissions/${draft.id}/answer?${scope}`),
      "detail and continue preserve scope",
    );
    const resultHtml = await page(
      `/student/submissions/${result.id}/result?${scope}`,
    );
    check(
      resultHtml.includes(`/student/assignments?view=records&${scope}`),
      "result return preserves scope",
    );
    for (const area of ["assignments", "attendance", "surveys"]) {
      const scoped = await page(`/student/${area}?${scope}`);
      check(!scoped.includes("<select"), `no switcher: ${area}`);
      const global = await page(`/student/${area}`);
      check(
        global.includes("<select") && global.includes("全部教学班"),
        `global switcher: ${area}`,
      );
      await missing(`/student/${area}?courseId=invalid&classroomId=${room.id}`);
      await missing(
        `/student/${area}?courseId=${course.id}&courseId=${secondCourse.id}&classroomId=${room.id}`,
      );
      await missing(
        `/student/${area}?courseId=${secondCourse.id}&classroomId=${room.id}`,
      );
      await missing(
        `/student/${area}?courseId=${foreignCourse.id}&classroomId=${foreignRoom.id}`,
      );
      const empty = await page(
        `/student/${area}?courseId=${course.id}&classroomId=${emptyRoom.id}`,
      );
      check(
        empty.includes(
          area === "assignments"
            ? "本班暂无作业"
            : area === "surveys"
              ? "本班暂无问卷"
              : "本班暂无签到记录",
        ),
        `empty scope: ${area}`,
      );
    }
    await missing(
      `/student/assignments/${first.id}?courseId=${course.id}&classroomId=${secondRoom.id}`,
    );
    await missing(
      `/student/submissions/${draft.id}/answer?courseId=${course.id}&classroomId=${secondRoom.id}`,
    );
    await missing(
      `/student/submissions/${result.id}/result?courseId=${secondCourse.id}&classroomId=${thirdRoom.id}`,
    );
    await missing(
      `/student/surveys/${survey.id}?courseId=${course.id}&classroomId=${secondRoom.id}`,
    );
    const surveyDetail = await page(`/student/surveys/${survey.id}?${scope}`);
    check(
      surveyDetail.includes(`/student/surveys?${scope}`),
      "survey return preserves scope",
    );
    let overview = await getStudentTaskOverview(student.id);
    check(overview.items[0].kind === "attendance", "open attendance first");
    check(
      overview.items.length > 5 &&
        overview.total ===
          Object.values(overview.counts).reduce((a, b) => a + b, 0),
      "counts before preview cutoff",
    );
    check(overview.scheduledSurveys.length === 1, "scheduled separately");
    for (const path of ["/student", "/student/tasks"]) {
      const html = await page(path);
      check(
        html.includes("我的待办") || html.includes("项待处理任务"),
        "shared overview renders",
      );
    }
    const grantResponse = await request(
      `/api/teacher/assignments/${expired.id}/makeup-grants`,
      sessions.teacher,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: randomUUID(),
          studentIds: [student.id],
          expiresAt: date(45),
          reason: "验收补交授权",
        }),
      },
    );
    check(grantResponse.ok, "makeup grant created");
    const grantBody = (await grantResponse.json()) as {
      data: { grants: Array<{ id: string }> };
    };
    check(
      (await getStudentTaskOverview(student.id)).items.some(
        (item) => item.id === `assignment:${expired.id}`,
      ),
      "makeup appears in overview",
    );
    const revoke = await request(
      `/api/teacher/assignments/${expired.id}/makeup-grants/${grantBody.data.grants[0].id}`,
      sessions.teacher,
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "验收撤回授权" }),
      },
    );
    check(revoke.ok, "makeup revoked");
    check(
      !(await getStudentTaskOverview(student.id)).items.some(
        (item) => item.id === `assignment:${expired.id}`,
      ),
      "revoked makeup disappears",
    );
    await prisma.assignment.update({
      where: { id: submitted.id },
      data: { dueAt: date(-5) },
    });
    const redoResponse = await request(
      `/api/teacher/assignments/${submitted.id}/makeup-grants`,
      sessions.teacher,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: randomUUID(),
          studentIds: [student.id],
          expiresAt: date(45),
          reason: "验收个人重做",
        }),
      },
    );
    check(redoResponse.ok, "redo grant created");
    const redo = (await redoResponse.json()) as {
      data: { grants: Array<{ id: string; kind: string }> };
    };
    check(
      redo.data.grants[0].kind === "REDO",
      "submitted assignment receives redo grant",
    );
    check(
      (await getStudentTaskOverview(student.id)).items.some(
        (item) => item.id === `assignment:${submitted.id}`,
      ),
      "redo appears in overview despite original submission",
    );
    check(
      (
        await request(
          `/api/teacher/assignments/${submitted.id}/makeup-grants/${redo.data.grants[0].id}`,
          sessions.teacher,
          {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason: "验收撤回重做" }),
          },
        )
      ).ok,
      "redo revoked",
    );
    check(
      !(await getStudentTaskOverview(student.id)).items.some(
        (item) => item.id === `assignment:${submitted.id}`,
      ),
      "revoked redo disappears",
    );
    check(
      Boolean(await prisma.submission.findUnique({ where: { id: result.id } })),
      "original submitted history retained",
    );
    const answerSave = await request(
      `/api/student/submissions/${draft.id}/answers`,
      sessions.student,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: 0,
          answers: [
            {
              assignmentQuestionId: first.questions[0].id,
              kind: "BOOLEAN",
              value: true,
            },
          ],
        }),
      },
    );
    check(answerSave.ok, "real answer saved");
    check(
      (
        await request(
          `/api/student/submissions/${draft.id}/submit`,
          sessions.student,
          { method: "POST" },
        )
      ).ok,
      "real submission succeeded",
    );
    check(
      (
        await request(
          `/api/student/submissions/${draft.id}/submit`,
          sessions.student,
          { method: "POST" },
        )
      ).ok,
      "duplicate submit remains idempotent",
    );
    check(
      !(await getStudentTaskOverview(student.id)).items.some(
        (item) => item.id === `assignment:${first.id}`,
      ),
      "submitted task disappears",
    );
    // Keep a fresh draft for browser-only navigation checks.
    const browserAssignment = await makeAssignment(
      longTitle,
      room.id,
      date(25),
    );
    const browserDraft = await prisma.submission.create({
      data: {
        assignmentId: browserAssignment.id,
        studentId: student.id,
        idempotencyKey: randomUUID(),
      },
    });
    const completionRoom = await makeClass("结课验收班");
    const completionAssignment = await makeAssignment(
      "结课待办",
      completionRoom.id,
    );
    check(
      (await getStudentTaskOverview(student.id)).items.some(
        (item) => item.id === `assignment:${completionAssignment.id}`,
      ),
      "active class task visible",
    );
    await prisma.classroom.update({
      where: { id: completionRoom.id },
      data: { status: "COMPLETED" },
    });
    check(
      !(await getStudentTaskOverview(student.id)).items.some(
        (item) => item.id === `assignment:${completionAssignment.id}`,
      ),
      "completed class task disappears",
    );
    overview = await getStudentTaskOverview(student.id);
    console.log(
      `Student page HTTP checks passed: ${checks}; real server, isolated database, role/resource checks, navigation, makeup grant/revocation and submission refresh.`,
    );
    if (process.env.STUDENT_TASK_BROWSER_HOLD === "1") {
      await mkdir(scratch, { recursive: true });
      const stopFile = `${scratch}/stage3-stop-${schema}`;
      await writeFile(
        `${scratch}/stage3-browser-context.json`,
        JSON.stringify({
          base,
          schema,
          email: student.email,
          emptyEmail: emptyStudent.email,
          password,
          scope,
          courseId: course.id,
          classroomId: room.id,
          secondRoomId: secondRoom.id,
          emptyRoomId: emptyRoom.id,
          surveyId: survey.id,
          scheduledId: scheduled.id,
          attendanceId: attendance.id,
          assignmentId: browserAssignment.id,
          draftId: browserDraft.id,
          total: overview.total,
          counts: overview.counts,
          stopFile,
        }),
      );
      console.log("BROWSER_ACCEPTANCE_READY");
      const until = Date.now() + 20 * 60_000;
      while (Date.now() < until) {
        try {
          await access(stopFile);
          break;
        } catch {}
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  } finally {
    if (server.exitCode === null) {
      const exited = once(server, "exit");
      server.kill();
      await exited;
    }
  }
}
main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Student page integration failed",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
