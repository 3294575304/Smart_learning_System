import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getTeacherDashboard } from "@/services/dashboard/teacher-dashboard";
import { publishAssignmentResults } from "@/services/assignments/manual-grading";
import { listTeacherAssignments } from "@/services/assignments/service";
import { assignmentListQuerySchema } from "@/services/assignments/schemas";
import { createPublishedGraphFixture } from "../helpers/teaching-graph-fixture";

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? "");
  assert.match(
    target.searchParams.get("schema") ?? "",
    /^dashboard_it_[a-z0-9_]+$/,
  );
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
  });
  const other = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher2@example.com" },
  });
  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student@example.com" },
  });
  const student2 = await prisma.user.findUniqueOrThrow({
    where: { email: "student3@example.com" },
  });
  const template = await prisma.courseTemplate.findFirstOrThrow();
  const createCourse = (teacherId: string, name: string) =>
    prisma.course.create({
      data: {
        questionCategory: {
          connectOrCreate: {
            where: { normalizedName: "automated-test-category" },
            create: {
              name: "自动化测试课程分类",
              normalizedName: "automated-test-category",
            },
          },
        },
        teacher: { connect: { id: teacherId } },
        name,
        template: { connect: { id: template.id } },
        courseNo: randomUUID(),
        term: "2026",
        status: "ACTIVE",
      },
    });
  const course = await createCourse(teacher.id, "工作台Python课程");
  const another = await createCourse(teacher.id, "另一门课程");
  const foreign = await createCourse(other.id, "其他教师课程");
  const makeClass = (courseId: string, member: string) =>
    prisma.classroom.create({
      data: {
        courseId,
        teacherId: teacher.id,
        name: randomUUID(),
        joinCode: randomUUID(),
        memberships: { create: { studentId: member } },
      },
    });
  const class1 = await makeClass(course.id, student.id);
  const class2 = await makeClass(course.id, student2.id);
  const otherClass = await makeClass(another.id, student.id);
  const fixture = await createPublishedGraphFixture(course.id, teacher.id);
  const concept = await prisma.knowledgeGraphConcept.create({
    data: { courseId: course.id, stableKey: "DASHBOARD_CONCEPT" },
  });
  await fixture.publishVersion(1, [concept.id]);
  await prisma.studentCourseConceptMasteryState.create({
    data: {
      courseId: course.id,
      studentId: student.id,
      revisions: {
        create: {
          revisionNumber: 1,
          inputFingerprint: "a".repeat(64),
          calculationRuleVersion: "concept-mastery-v1",
          entries: {
            create: {
              conceptId: concept.id,
              evidenceCount: 3,
              distinctAnswerCount: 3,
              earnedPoints: 90,
              availablePoints: 100,
              masteryScore: 90,
              level: "MASTERED",
              firstEvidenceAt: new Date(),
              lastEvidenceAt: new Date(),
            },
          },
        },
      },
    },
  });
  const makeAssignment = (classroomId: string, title: string) =>
    prisma.assignment.create({
      data: {
        classroomId,
        teacherId: teacher.id,
        title,
        status: "PUBLISHED",
        totalPoints: 100,
        dueAt: new Date(Date.now() + 86400000),
      },
    });
  const assignment = await makeAssignment(class1.id, "待公布作业");
  await makeAssignment(otherClass.id, "其他课程作业");
  const future = await makeAssignment(class2.id, "未截止无提交作业");
  const submission = await prisma.submission.create({
    data: {
      assignmentId: assignment.id,
      studentId: student.id,
      idempotencyKey: randomUUID(),
      status: "GRADED",
      score: 80,
      maxScore: 100,
      percentage: 80,
      startedAt: new Date(Date.now() - 1000),
      submittedAt: new Date(),
      gradedAt: new Date(),
    },
  });
  const before = await getTeacherDashboard(teacher.id, { courseId: course.id });
  assert.ok(before.workspace);
  assert.equal(before.workspace.metrics.publishedAssignmentCount, 2);
  assert.equal(before.workspace.metrics.studentCount, 2);
  assert.equal(
    before.workspace.classroomMetrics.find(
      (item) => item.classroomId === class1.id,
    )?.publishableCount,
    1,
  );
  assert.equal(
    before.workspace.classroomMetrics.find(
      (item) => item.classroomId === class2.id,
    )?.publishableCount,
    0,
  );
  assert.equal(
    before.workspace.todo.find(
      (item) => item.key === `publish:${assignment.id}`,
    )?.classroomId,
    class1.id,
  );
  assert.ok(
    before.workspace.recentAssignments.some(
      (item) => item.classroomId === class2.id,
    ),
  );
  assert.ok(
    before.workspace.todo.some(
      (item) => item.key === `publish:${assignment.id}`,
    ),
  );
  assert.ok(
    !before.workspace.todo.some((item) => item.key.includes(future.id)),
  );
  assert.equal(
    before.workspace.mastery.find((row) => row.classroomId === class1.id)
      ?.score,
    90,
  );
  assert.equal(
    before.workspace.mastery.find((row) => row.classroomId === class2.id)
      ?.score,
    null,
  );
  assert.ok(!before.courses.some((item) => item.id === foreign.id));
  const scoped = await getTeacherDashboard(teacher.id, {
    courseId: course.id,
    classroomId: class2.id,
  });
  assert.equal(scoped.workspace?.metrics.publishedAssignmentCount, 1);
  assert.equal(scoped.workspace?.metrics.studentCount, 1);
  assert.equal(
    scoped.workspace?.todo.filter((item) => item.kind === "publish").length,
    0,
  );
  await assert.rejects(
    getTeacherDashboard(teacher.id, { courseId: foreign.id }),
    ResourceNotFoundError,
  );
  await assert.rejects(
    getTeacherDashboard(teacher.id, {
      courseId: course.id,
      classroomId: otherClass.id,
    }),
    ResourceNotFoundError,
  );
  await assert.rejects(getTeacherDashboard(teacher.id, { courseId: "bad" }));
  const list = await listTeacherAssignments(
    teacher.id,
    assignmentListQuerySchema.parse({ courseId: course.id }),
  );
  assert.equal(list.pagination.total, 2);
  await assert.rejects(
    listTeacherAssignments(
      teacher.id,
      assignmentListQuerySchema.parse({
        courseId: course.id,
        classroomId: otherClass.id,
      }),
    ),
    ResourceNotFoundError,
  );
  await publishAssignmentResults(teacher.id, assignment.id, {
    ipAddress: null,
    userAgent: "dashboard-test",
  });
  assert.equal(
    (
      await prisma.submission.findUniqueOrThrow({
        where: { id: submission.id },
      })
    ).status,
    "PUBLISHED",
  );
  const after = await getTeacherDashboard(teacher.id, { courseId: course.id });
  assert.ok(
    !after.workspace?.todo.some(
      (item) => item.key === `publish:${assignment.id}`,
    ),
  );
  assert.equal(after.workspace?.metrics.publishableCount, 0);
  await publishAssignmentResults(teacher.id, assignment.id, {
    ipAddress: null,
    userAgent: "dashboard-test",
  });
  const emptyTeacher = await prisma.user.create({
    data: {
      email: `${randomUUID()}@example.com`,
      passwordHash: "isolated-test",
      role: "TEACHER",
    },
  });
  assert.equal((await getTeacherDashboard(emptyTeacher.id)).workspace, null);
  console.log(
    "Teacher dashboard integration passed: course/class isolation, missing evidence, scoped links, publication removal and idempotency.",
  );
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
