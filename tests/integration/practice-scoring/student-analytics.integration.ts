import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../../lib/prisma";
import { assertIsolatedIntegrationEnvironment } from "../database";
import { getStudentClassAnalytics } from "../../../services/dashboard/student-class-analytics";
assertIsolatedIntegrationEnvironment("RECOMMENDATION_INTEGRATION_SCHEMA");
test("class analytics isolate same-course classes and courses, preserve score visibility and latest effective work", async () => {
  const teacher = await prisma.user.create({
    data: { role: "TEACHER", passwordHash: "synthetic" },
  });
  const student = await prisma.user.create({
    data: { role: "STUDENT", passwordHash: "synthetic" },
  });
  const outsider = await prisma.user.create({
    data: { role: "STUDENT", passwordHash: "synthetic" },
  });
  const template = await prisma.courseTemplate.create({
    data: { code: randomUUID(), name: "analytics" },
  });
  const category = await prisma.questionCourseCategory.create({
    data: { name: "analytics", normalizedName: randomUUID() },
  });
  const makeCourse = (name: string) =>
    prisma.course.create({
      data: {
        name,
        term: "2026",
        courseNo: randomUUID(),
        teacherId: teacher.id,
        templateId: template.id,
        questionCategoryId: category.id,
      },
    });
  const course = await makeCourse("Python"),
    otherCourse = await makeCourse("Other");
  const makeClass = (courseId: string, name: string, studentId = student.id) =>
    prisma.classroom.create({
      data: {
        name,
        courseId,
        teacherId: teacher.id,
        joinCode: randomUUID(),
        memberships: { create: { studentId } },
      },
    });
  const a = await makeClass(course.id, "A"),
    b = await makeClass(course.id, "B"),
    c = await makeClass(otherCourse.id, "C"),
    foreign = await makeClass(course.id, "foreign", outsider.id);
  const now = new Date();
  const makeWork = (
    classroomId: string,
    title: string,
    publishedAt = new Date(now.getTime() - 10000),
  ) =>
    prisma.assignment.create({
      data: {
        classroomId,
        teacherId: teacher.id,
        title,
        status: "PUBLISHED",
        publishedAt,
        dueAt: new Date(
          Math.max(now.getTime() - 1000, publishedAt.getTime() + 1000),
        ),
      },
    });
  const wa = await makeWork(a.id, "A one"),
    wb = await makeWork(b.id, "B one"),
    wc = await makeWork(c.id, "C zero"),
    unpublished = await makeWork(a.id, "A hidden"),
    missing = await makeWork(a.id, "A missing");
  await makeWork(a.id, "future", new Date(now.getTime() + 100000));
  await prisma.assignment.create({
    data: {
      classroomId: a.id,
      teacherId: teacher.id,
      title: "draft",
      status: "DRAFT",
    },
  });
  const submit = (
    assignmentId: string,
    status: "PUBLISHED" | "GRADED" | "IN_PROGRESS" | "WITHDRAWN",
    score: number,
    attemptNumber = 1,
  ) =>
    prisma.submission.create({
      data: {
        assignmentId,
        studentId: student.id,
        status,
        score,
        maxScore: 20,
        percentage: score * 5,
        attemptNumber,
        startedAt: new Date(now.getTime() - 10000),
        submittedAt: now,
        idempotencyKey: randomUUID(),
      },
    });
  await submit(wa.id, "PUBLISHED", 18);
  await submit(wa.id, "IN_PROGRESS", 0, 2);
  await submit(wa.id, "WITHDRAWN", 0, 3);
  await submit(wb.id, "PUBLISHED", 4);
  await submit(wc.id, "PUBLISHED", 0);
  await submit(unpublished.id, "GRADED", 20);
  await prisma.attendanceSession.create({
    data: {
      courseId: course.id,
      classroomId: a.id,
      teacherId: teacher.id,
      title: "session",
      status: "CLOSED",
      startsAt: now,
      signInOpensAt: now,
      lateAfter: now,
      signInClosesAt: now,
      records: { create: { studentId: student.id, currentStatus: "LATE" } },
    },
  });
  const all = await getStudentClassAnalytics(student.id, {}, now);
  assert.equal(all.classes.length, 3);
  const first = all.classes.find((x) => x.classroom.id === a.id);
  assert.ok(first);
  assert.equal(first.total, 3);
  assert.equal(first.submitted, 2);
  assert.equal(first.unsubmitted, 1);
  assert.equal(first.overdue, 1);
  assert.equal(first.average, 90);
  assert.equal(first.awaitingRelease, 1);
  assert.equal(first.publishedCount, 1);
  assert.equal(first.scoreHistory.length, 1);
  assert.equal(first.scoreHistory[0].percentage, 90);
  assert.equal(
    first.publishedCount + first.awaitingRelease + first.unsubmitted,
    first.total,
  );
  assert.equal(first.attendance.late, 1);
  assert.equal(
    first.recent.find((x) => x.title === "A hidden")?.percentage,
    null,
  );
  assert.equal(all.classes.find((x) => x.classroom.id === b.id)?.average, 20);
  assert.equal(all.classes.find((x) => x.classroom.id === c.id)?.average, 0);
  assert.equal(
    all.classes.find((x) => x.classroom.id === b.id)?.attendance.total,
    0,
  );
  const scoped = await getStudentClassAnalytics(
    student.id,
    { courseId: course.id, classroomId: b.id },
    now,
  );
  assert.equal(scoped.classes.length, 1);
  assert.equal(scoped.classes[0].average, 20);
  await assert.rejects(
    () => getStudentClassAnalytics(student.id, { classroomId: foreign.id }),
    /教学班不存在/,
  );
  await assert.rejects(
    () =>
      getStudentClassAnalytics(student.id, {
        courseId: otherCourse.id,
        classroomId: a.id,
      }),
    /教学班不存在/,
  );
  await assert.rejects(() =>
    getStudentClassAnalytics(student.id, { courseId: "invalid" }),
  );
  assert.equal(
    await getStudentClassAnalytics(outsider.id, {
      courseId: otherCourse.id,
    }).catch(() => null),
    null,
  );
  assert.equal(
    (await getStudentClassAnalytics(teacher.id, {})).classes.length,
    0,
  );
  // Many newer unpublished results must not push an older published grade out of its own history.
  for (let i = 0; i < 10; i++) {
    const work = await makeWork(a.id, `new hidden ${i}`);
    const newer = await submit(work.id, "GRADED", 16);
    await prisma.submission.update({
      where: { id: newer.id },
      data: { submittedAt: new Date(now.getTime() + 1000 + i) },
    });
  }
  const history = (
    await getStudentClassAnalytics(
      student.id,
      { classroomId: a.id },
      new Date(now.getTime() + 20000),
    )
  ).classes[0];
  assert.equal(history.recent.length, 8);
  assert.ok(!history.recent.some((x) => x.title === "A one"));
  assert.equal(history.scoreHistory.length, 1);
  assert.equal(history.scoreHistory[0].percentage, 90);
  assert.ok(
    history.scoreHistory.every(
      (x) => x.title !== "A hidden" && !x.title.startsWith("new hidden"),
    ),
  );
  assert.ok(missing.id);
});
test.after(() => prisma.$disconnect());
