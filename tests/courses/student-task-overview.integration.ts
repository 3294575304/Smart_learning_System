import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getStudentTaskOverview } from "@/services/dashboard/student-task-service";
import { getStudentHomeTasks } from "@/services/dashboard/student-home-tasks";

async function main() {
  assert.match(
    new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema") ?? "",
    /^student_tasks_it_[a-z0-9_]+$/u,
  );
  const passwordHash = await hash(randomUUID(), 4);
  const teacher = await prisma.user.create({
    data: { role: "TEACHER", passwordHash },
  });
  const student = await prisma.user.create({
    data: { role: "STUDENT", passwordHash },
  });
  const outsider = await prisma.user.create({
    data: { role: "STUDENT", passwordHash },
  });
  const template = await prisma.courseTemplate.create({
    data: { code: "student-tasks", name: "测试模板" },
  });
  const category = await prisma.questionCourseCategory.create({
    data: { name: "测试分类", normalizedName: "student-tasks" },
  });
  const course = await prisma.course.create({
    data: {
      templateId: template.id,
      teacherId: teacher.id,
      questionCategoryId: category.id,
      name: "Python",
      courseNo: "TASKS",
      term: "2026",
      status: "ACTIVE",
    },
  });
  const classroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "一班",
      joinCode: randomUUID(),
      memberships: { create: { studentId: student.id } },
    },
  });
  const otherClass = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "无权访问班级",
      joinCode: randomUUID(),
      memberships: { create: { studentId: outsider.id } },
    },
  });
  const now = Date.now();
  const date = (minutes: number) => new Date(now + minutes * 60_000);
  const createAssignment = (
    title: string,
    room = classroom.id,
    dueAt = date(60),
  ) =>
    prisma.assignment.create({
      data: {
        classroomId: room,
        teacherId: teacher.id,
        title,
        status: "PUBLISHED",
        publishedAt: date(-60),
        dueAt,
      },
    });
  const pending = await createAssignment("待完成");
  const draftTask = await createAssignment("进行中");
  const draft = await prisma.submission.create({
    data: {
      assignmentId: draftTask.id,
      studentId: student.id,
      idempotencyKey: randomUUID(),
    },
  });
  await createAssignment("过期作业", classroom.id, date(-1));
  await createAssignment("他班作业", otherClass.id);
  const session = await prisma.attendanceSession.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      classroomId: classroom.id,
      title: "签到",
      status: "OPEN",
      startsAt: date(-5),
      signInOpensAt: date(-5),
      lateAfter: date(5),
      signInClosesAt: date(20),
      records: { create: { studentId: student.id } },
    },
  });
  const createSurvey = (title: string, opensAt: Date) =>
    prisma.courseSurvey.create({
      data: {
        teacherId: teacher.id,
        courseId: course.id,
        classroomId: classroom.id,
        title,
        instructions: "不计入成绩",
        status: "PUBLISHED",
        publishedAt: date(-5),
        opensAt,
        dueAt: date(40),
      },
    });
  const survey = await createSurvey("开放问卷", date(-1));
  const scheduled = await createSurvey("预约问卷", date(10));
  const boundary = await getStudentHomeTasks(student.id, scheduled.opensAt);
  const opened = boundary.surveys.find((item) => item.id === scheduled.id);
  assert.ok(opened);
  assert.equal(opened.availability, "OPEN");
  assert.equal(opened.isOpen, true);
  let overview = await getStudentTaskOverview(student.id);
  assert.deepEqual(overview.counts, {
    assignment: 2,
    attendance: 1,
    survey: 1,
  });
  assert.equal(overview.total, 4);
  assert.equal(overview.items[0].kind, "attendance");
  assert.equal(overview.scheduledSurveys.length, 1);
  assert.equal(
    overview.items.find((item) => item.id === `assignment:${draftTask.id}`)
      ?.action,
    "继续作答",
  );
  for (const item of overview.items) {
    const url = new URL(item.href, "https://test.local");
    assert.equal(url.searchParams.get("courseId"), course.id);
    assert.equal(url.searchParams.get("classroomId"), classroom.id);
  }
  assert.equal(
    (await getStudentTaskOverview(outsider.id)).counts.assignment,
    1,
  );
  assert.equal((await getStudentTaskOverview("missing-student")).total, 0);
  await prisma.submission.update({
    where: { id: draft.id },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  await prisma.attendanceRecord.update({
    where: {
      sessionId_studentId: { sessionId: session.id, studentId: student.id },
    },
    data: { currentStatus: "PRESENT", signedAt: new Date() },
  });
  await prisma.courseSurveyParticipation.create({
    data: {
      surveyId: survey.id,
      studentId: student.id,
      submittedAt: new Date(),
    },
  });
  overview = await getStudentTaskOverview(student.id);
  assert.deepEqual(overview.counts, {
    assignment: 1,
    attendance: 0,
    survey: 0,
  });
  assert.equal(overview.items[0].id, `assignment:${pending.id}`);
  await prisma.classroom.update({
    where: { id: classroom.id },
    data: { status: "COMPLETED" },
  });
  overview = await getStudentTaskOverview(student.id);
  assert.equal(overview.counts.assignment, 0);
  console.log(
    "Student tasks: membership isolation, counts, ordering, draft links, completion refresh, scheduled surveys and completed-class checks passed.",
  );
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
