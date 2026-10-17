import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getStudentHomeTasks } from "@/services/dashboard/student-home-tasks";
import {
  getStudentCourseSurvey,
  listStudentCourseSurveys,
  publishCourseSurvey,
  submitCourseSurveyResponse,
} from "@/services/course-surveys/service";
import { submitCourseSurveySchema } from "@/services/course-surveys/schemas";

async function main() {
  assert.match(
    new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema") ?? "",
    /^teaching_it_[a-z0-9_]+$/,
  );
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
  });
  const otherTeacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher2@example.com" },
  });
  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student@example.com" },
  });
  const outsider = await prisma.user.findUniqueOrThrow({
    where: { email: "student3@example.com" },
  });
  const template = await prisma.courseTemplate.findFirstOrThrow();
  const course = await prisma.course.create({
    data: {
      teacherId: teacher.id,
      templateId: template.id,
      name: "问卷开放测试",
      courseNo: "SURVEY-WINDOW-TEST",
      term: "2026",
      status: "ACTIVE",
    },
  });
  const classroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "问卷开放测试班",
      joinCode: randomUUID(),
      memberships: { create: { studentId: student.id } },
    },
  });
  const context = { ipAddress: null, userAgent: "survey-window-integration" };
  const create = (title: string, opensAt: Date, dueAt: Date) =>
    prisma.courseSurvey.create({
      data: {
        courseId: course.id,
        classroomId: classroom.id,
        teacherId: teacher.id,
        title,
        instructions: "不计入成绩",
        opensAt,
        dueAt,
        questions: {
          create: {
            type: "LIKERT_5",
            dimension: "CONTENT",
            prompt: "教学内容清晰",
            required: true,
            sortOrder: 1,
          },
        },
      },
      include: { questions: true },
    });
  const scheduled = await create(
    "预约开放测试",
    new Date(Date.now() + 3000),
    new Date(Date.now() + 3600000),
  );
  await assert.rejects(() =>
    publishCourseSurvey(
      otherTeacher.id,
      course.id,
      scheduled.id,
      scheduled.version,
      context,
      true,
    ),
  );
  await publishCourseSurvey(
    teacher.id,
    course.id,
    scheduled.id,
    scheduled.version,
    context,
  );
  const pending = await getStudentCourseSurvey(student.id, scheduled.id);
  assert.equal(pending.availability, "SCHEDULED");
  assert.equal(pending.questions.length, 0);
  assert.equal(pending.questionCount, 1);
  const tasks = await getStudentHomeTasks(student.id);
  assert.ok(tasks.scheduledSurveys.some((s) => s.id === scheduled.id));
  assert.ok(!tasks.surveys.some((s) => s.id === scheduled.id));
  const answer = (questionId: string) =>
    submitCourseSurveySchema.parse({
      idempotencyKey: randomUUID(),
      answers: [{ questionId, kind: "SCALE", value: 4 }],
    });
  await assert.rejects(() =>
    submitCourseSurveyResponse(
      student.id,
      scheduled.id,
      answer(scheduled.questions[0].id),
      context,
    ),
  );
  await assert.rejects(() => getStudentCourseSurvey(outsider.id, scheduled.id));
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Math.max(0, scheduled.opensAt.getTime() - Date.now() + 20),
    ),
  );
  assert.equal(
    (await getStudentCourseSurvey(student.id, scheduled.id)).availability,
    "OPEN",
  );
  assert.ok(
    (await getStudentHomeTasks(student.id)).surveys.some(
      (s) => s.id === scheduled.id,
    ),
  );

  const immediate = await create(
    "发布即开放测试",
    new Date(Date.now() + 3600000),
    new Date(Date.now() + 7200000),
  );
  const published = await publishCourseSurvey(
    teacher.id,
    course.id,
    immediate.id,
    immediate.version,
    context,
    true,
  );
  assert.equal(published.opensAt.getTime(), published.publishedAt?.getTime());
  assert.equal(
    (await getStudentCourseSurvey(student.id, immediate.id)).questions.length,
    1,
  );
  assert.ok(
    (await getStudentHomeTasks(student.id)).surveys.some(
      (s) => s.id === immediate.id,
    ),
  );
  const notification = await prisma.notification.findFirstOrThrow({
    where: { recipientId: student.id, sourceId: immediate.id },
  });
  assert.equal(notification.actionUrl, `/student/surveys/${immediate.id}`);
  await assert.rejects(() =>
    publishCourseSurvey(
      teacher.id,
      course.id,
      immediate.id,
      immediate.version,
      context,
      true,
    ),
  );
  const input = answer(immediate.questions[0].id);
  assert.equal(
    (await submitCourseSurveyResponse(student.id, immediate.id, input, context))
      .reused,
    false,
  );
  assert.equal(
    (await submitCourseSurveyResponse(student.id, immediate.id, input, context))
      .reused,
    true,
  );
  assert.equal(
    (await getStudentCourseSurvey(student.id, immediate.id)).availability,
    "SUBMITTED",
  );
  assert.ok(
    !(await getStudentHomeTasks(student.id)).surveys.some(
      (s) => s.id === immediate.id,
    ),
  );
  assert.equal(
    (
      await prisma.courseSurveyResponse.findFirstOrThrow({
        where: { surveyId: immediate.id },
      })
    ).studentId,
    null,
  );

  const expired = await create(
    "已截止状态测试",
    new Date(Date.now() - 2000),
    new Date(Date.now() - 1000),
  );
  await prisma.courseSurvey.update({
    where: { id: expired.id },
    data: { status: "PUBLISHED" },
  });
  assert.equal(
    (await getStudentCourseSurvey(student.id, expired.id)).availability,
    "EXPIRED",
  );
  assert.ok(
    (await listStudentCourseSurveys(student.id, course.id, classroom.id)).some(
      (s) => s.id === expired.id && s.availability === "EXPIRED",
    ),
  );
  await assert.rejects(() =>
    submitCourseSurveyResponse(
      student.id,
      expired.id,
      answer(expired.questions[0].id),
      context,
    ),
  );
  console.log(
    "PASS scheduled detail, exact opening transition and task counts, explicit immediate publication, private questions, ownership, closed window, duplicate submit and anonymity",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
