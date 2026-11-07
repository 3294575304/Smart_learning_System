import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Classroom, SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  listStudentAssignments,
  listStudentAssignmentPage,
  listStudentPendingAssignments,
} from "@/services/assignments/student-list";
import { studentAssignmentState } from "@/services/student-experience/task-policy";
import { withStudentNotificationActions } from "@/services/notifications/student-actions";
import type { NotificationListItem } from "@/services/notifications/types";

export async function verifyStudentWorkFlows() {
  assert.match(
    new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema") ?? "",
    /^student_tasks_it_[a-z0-9_]+$/u,
  );
  const now = new Date();
  const date = (minutes: number) => new Date(now.getTime() + minutes * 60000);
  const teacher = await prisma.user.create({
    data: { role: "TEACHER", passwordHash: "fixture" },
  });
  const student = await prisma.user.create({
    data: {
      role: "STUDENT",
      passwordHash: "fixture",
      profile: { create: { displayName: "林书瑶" } },
    },
  });
  const outsider = await prisma.user.create({
    data: { role: "STUDENT", passwordHash: "fixture" },
  });
  const template = await prisma.courseTemplate.create({
    data: { code: randomUUID(), name: "Python 程序设计" },
  });
  const category = await prisma.questionCourseCategory.create({
    data: { name: "Python", normalizedName: randomUUID() },
  });
  const course = await prisma.course.create({
    data: {
      teacherId: teacher.id,
      templateId: template.id,
      questionCategoryId: category.id,
      name: "Python 程序设计",
      courseNo: "PY01",
      term: "2026-2027-1",
      status: "ACTIVE",
    },
  });
  const classrooms: Classroom[] = [];
  for (const [name, status, membership] of [
    ["Python 一班", "ACTIVE", "ACTIVE"],
    ["Python 二班", "ACTIVE", "ACTIVE"],
    ["Python 春季班", "COMPLETED", "ACTIVE"],
    ["Python 已关闭班", "CLOSED", "ACTIVE"],
    ["Python 归档班", "ARCHIVED", "ACTIVE"],
    ["Python 退课班", "ACTIVE", "LEFT"],
  ] as const) {
    classrooms.push(
      await prisma.classroom.create({
        data: {
          teacherId: teacher.id,
          courseId: course.id,
          name,
          status,
          joinCode: randomUUID(),
          memberships: {
            create: {
              studentId: student.id,
              status: membership,
              endedAt: membership === "LEFT" ? now : null,
            },
          },
        },
      }),
    );
  }
  const foreign = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "Python 专题班",
      joinCode: randomUUID(),
      memberships: { create: { studentId: outsider.id } },
    },
  });
  const createAssignment = (title: string, classroomId = classrooms[0].id) =>
    prisma.assignment.create({
      data: {
        teacherId: teacher.id,
        classroomId,
        title,
        status: "PUBLISHED",
        publishedAt: date(-60),
        dueAt: date(60),
        totalPoints: 100,
      },
    });
  const states: (SubmissionStatus | null)[] = [
    null,
    "IN_PROGRESS",
    "SUBMITTED",
    "PENDING_REVIEW",
    "GRADED",
    "PUBLISHED",
    "WITHDRAWN",
    "IN_PROGRESS",
  ];
  // Deterministic combinations include exact deadline boundaries, valid/expired
  // grants, old published-result markers and drafts after earlier submissions.
  for (let i = 0; i < 600; i++) {
    const room = classrooms[Math.floor(i / 100)];
    const state = states[i % states.length];
    const assignment = await createAssignment(
      ["校园借阅数据整理", "食堂订单统计", "气象记录分析"][i % 3] +
        ` · ${i + 1}`,
      room.id,
    );
    const offset = [-60, 0, 60][Math.floor(i / 8) % 3];
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        dueAt: date(offset),
        publishedAt: date(-120 - Math.floor(i / 4)),
        ...(i % 29 === 0 ? { status: "CLOSED" } : {}),
        ...(i % 61 === 0 ? { status: "REVOKED" } : {}),
        ...(i % 67 === 0 ? { dueAt: null } : {}),
        ...(i % 71 === 0 ? { publishedAt: date(30), dueAt: date(60) } : {}),
      },
    });
    if (i % 8 === 7)
      await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: student.id,
          status: "GRADED",
          attemptNumber: 1,
          idempotencyKey: randomUUID(),
        },
      });
    if (state)
      await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: student.id,
          status: state,
          attemptNumber: 2,
          idempotencyKey: randomUUID(),
          score: state === "PUBLISHED" ? 0 : null,
          maxScore: state === "PUBLISHED" ? 100 : null,
          percentage: state === "PUBLISHED" ? 0 : null,
        },
      });
    if (i % 11 === 0)
      await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: outsider.id,
          status: "WITHDRAWN",
          publishedAt: date(-30),
          idempotencyKey: randomUUID(),
        },
      });
    if (i % 3 !== 0)
      await prisma.assignmentMakeupGrant.create({
        data: {
          assignmentId: assignment.id,
          studentId: student.id,
          createdById: teacher.id,
          requestId: randomUUID(),
          kind: i % 2 ? "MAKEUP" : "REDO",
          reason: "课程学习安排调整",
          requestedExpiresAt: date(i % 3 === 1 ? 120 : 0),
          originalDueAt: date(Math.min(offset, -60)),
          expiresAt: date(i % 3 === 1 ? 120 : 0),
        },
      });
  }
  const open = await createAssignment("校园图书借阅数据汇总");
  const inaccessible = await createAssignment("社团活动经费整理", foreign.id);
  const legacyClass = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      name: "Python 基础班",
      joinCode: randomUUID(),
      memberships: { create: { studentId: student.id } },
    },
  });
  const legacyAssignment = await createAssignment(
    "课程基础巩固",
    legacyClass.id,
  );
  const legacyPage = await listStudentAssignmentPage(
    student.id,
    { status: "ALL", page: 1 },
    undefined,
    legacyClass.id,
    now,
  );
  assert.equal(legacyPage.items[0].id, legacyAssignment.id);
  await assert.rejects(() =>
    listStudentAssignmentPage(
      outsider.id,
      { status: "ALL", page: 1 },
      undefined,
      legacyClass.id,
      now,
    ),
  );
  const full = await listStudentAssignments(
    student.id,
    undefined,
    undefined,
    now,
  );
  let checks = 0;
  for (const status of ["ALL", "TODO", "SUBMITTED", "EXPIRED"] as const) {
    const expected = full.filter((item) => {
      const state = studentAssignmentState(item, now);
      return status === "ALL"
        ? true
        : status === "TODO"
          ? item.canWrite !== false &&
            ["PENDING", "IN_PROGRESS"].includes(state)
          : state === status;
    });
    const received = [];
    for (
      let page = 1;
      page <= Math.max(1, Math.ceil(expected.length / 8));
      page++
    ) {
      const result = await listStudentAssignmentPage(
        student.id,
        { status, page },
        undefined,
        undefined,
        now,
      );
      assert.equal(result.pagination.total, expected.length, status);
      assert.deepEqual(result.items, expected.slice((page - 1) * 8, page * 8));
      received.push(...result.items.map((item) => item.id));
      checks++;
    }
    assert.deepEqual(
      received,
      expected.map((item) => item.id),
    );
    const last = await listStudentAssignmentPage(
      student.id,
      { status, page: 999 },
      undefined,
      undefined,
      now,
    );
    assert.equal(
      last.pagination.page,
      Math.max(1, Math.ceil(expected.length / 8)),
    );
  }
  assert.deepEqual(
    await listStudentPendingAssignments(student.id, now),
    full.filter(
      (item) =>
        item.canWrite !== false &&
        ["PENDING", "IN_PROGRESS"].includes(studentAssignmentState(item, now)),
    ),
  );
  assert.ok(!full.some((item) => item.id === inaccessible.id));
  await assert.rejects(() =>
    listStudentAssignmentPage(
      student.id,
      { status: "ALL", page: 1 },
      course.id,
      foreign.id,
    ),
  );
  const scoped = await listStudentAssignmentPage(
    student.id,
    { status: "ALL", page: 1 },
    course.id,
    classrooms[0].id,
    now,
  );
  assert.ok(scoped.items.every((item) => item.classroomName === "Python 一班"));
  const samples = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    await listStudentAssignmentPage(student.id, { status: "ALL", page: 1 });
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      assignments: 603,
      pageChecks: checks,
      pageSize: 8,
      p95ms: Math.round(samples[18]),
    }),
  );

  const notification = (
    id: string,
    type = "ASSIGNMENT_PUBLISHED",
  ): NotificationListItem => ({
    id: randomUUID(),
    type: type as NotificationListItem["type"],
    title: "校园图书借阅数据汇总",
    content: "请完成课程作业。",
    priority: "NORMAL",
    sourceType: "ASSIGNMENT",
    sourceId: id,
    actionUrl: "/student/assignments",
    readAt: null,
    createdAt: now,
    expiresAt: null,
  });
  const resolve = async (item: NotificationListItem) =>
    (await withStudentNotificationActions(student.id, [item], now))[0];
  assert.equal(
    (await resolve(notification(open.id))).action?.kind,
    "START_ASSIGNMENT",
  );
  const draft = await prisma.submission.create({
    data: {
      assignmentId: open.id,
      studentId: student.id,
      idempotencyKey: randomUUID(),
    },
  });
  const continued = await resolve(notification(open.id));
  assert.equal(continued.action?.label, "继续作答");
  assert.ok(
    continued.action?.kind === "LINK" &&
      continued.action.href.includes(`/submissions/${draft.id}/answer?`),
  );
  await prisma.submission.update({
    where: { id: draft.id },
    data: { status: "SUBMITTED" },
  });
  assert.equal(
    (await resolve(notification(open.id))).action?.label,
    "查看提交记录",
  );
  await prisma.submission.update({
    where: { id: draft.id },
    data: {
      status: "PUBLISHED",
      score: 0,
      maxScore: 100,
      percentage: 0,
      publishedAt: now,
    },
  });
  const resultNotice = {
    ...notification(draft.id, "ASSIGNMENT_GRADED"),
    sourceType: "SUBMISSION" as const,
  };
  assert.equal((await resolve(resultNotice)).action?.label, "查看成绩");
  assert.equal((await resolve(notification(inaccessible.id))).action, null);
  assert.equal(
    (await resolve({ ...resultNotice, sourceId: "invalid-id" })).action,
    null,
  );
  const otherSubmission = await prisma.submission.create({
    data: {
      assignmentId: inaccessible.id,
      studentId: outsider.id,
      status: "SUBMITTED",
      idempotencyKey: randomUUID(),
    },
  });
  assert.equal(
    (await resolve({ ...resultNotice, sourceId: otherSubmission.id })).action,
    null,
  );
  assert.equal(
    (await resolve({ ...notification(open.id), expiresAt: date(0) })).action,
    null,
  );
  await prisma.assignment.update({
    where: { id: open.id },
    data: { status: "REVOKED" },
  });
  assert.equal((await resolve(notification(open.id))).action, null);
  const survey = await prisma.courseSurvey.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      classroomId: classrooms[0].id,
      title: "Python 学习体验反馈",
      instructions: "请按学习体验填写。",
      status: "PUBLISHED",
      opensAt: date(-60),
      dueAt: date(60),
    },
  });
  const surveyNotice = {
    ...notification(survey.id, "COURSE_SURVEY_PUBLISHED"),
    sourceType: "COURSE_SURVEY" as const,
  };
  assert.equal((await resolve(surveyNotice)).action?.label, "填写问卷");
  await prisma.courseSurvey.update({
    where: { id: survey.id },
    data: { opensAt: date(30) },
  });
  assert.equal((await resolve(surveyNotice)).action?.label, "查看问卷安排");
  await prisma.courseSurveyParticipation.create({
    data: { surveyId: survey.id, studentId: student.id, submittedAt: now },
  });
  assert.equal((await resolve(surveyNotice)).action?.label, "查看填写状态");
  await prisma.courseSurvey.update({
    where: { id: survey.id },
    data: { status: "CLOSED" },
  });
  assert.equal((await resolve(surveyNotice)).action?.label, "查看填写状态");
  const [foreignSurvey] = await withStudentNotificationActions(
    outsider.id,
    [surveyNotice],
    now,
  );
  assert.equal(foreignSurvey.action, null);
  assert.equal(
    (
      await resolve({
        ...notification(open.id, "SYSTEM_ANNOUNCEMENT"),
        actionUrl: "https://example.com",
      })
    ).action,
    null,
  );
  const teacherNotice = notification(open.id);
  assert.deepEqual(
    await withStudentNotificationActions(teacher.id, [teacherNotice], now),
    [teacherNotice],
  );
  return {
    student,
    teacher,
    course,
    classroom: classrooms[0],
    createAssignment,
    now,
    checks,
  };
}

if (process.argv[1]?.endsWith("student-work-pagination.integration.ts")) {
  verifyStudentWorkFlows()
    .then(() =>
      console.log("Student pagination and notification actions passed"),
    )
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
