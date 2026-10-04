import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  getStudentAssignment,
  getStudentSubmissionResult,
  listStudentAssignments,
  listTeacherAssignments,
} from "@/services/assignments/service";
import { listStudentResults } from "@/services/dashboard/student-dashboard";
import {
  assignmentListQuerySchema,
  studentResultsQuerySchema,
} from "@/services/assignments/schemas";
import { listStudentCourseEvaluationContexts } from "@/services/gradebook/service";
import { groupStudentCourseContexts } from "@/services/courses/student-course-groups";
async function main() {
  const enrolled = await prisma.classMembership.findFirst({
    where: { status: "ACTIVE" },
    include: { classroom: true },
  });
  assert.ok(enrolled);
  const fixtureCourse = await prisma.course.findFirstOrThrow();
  await prisma.classroom.update({
    where: { id: enrolled.classroomId },
    data: { courseId: fixtureCourse.id },
  });
  const secondClass = await prisma.classroom.create({
    data: {
      name: "第二教学班",
      joinCode: "SCOPE-SECOND",
      teacherId: enrolled.classroom.teacherId,
      courseId: fixtureCourse.id,
    },
  });
  await prisma.classMembership.create({
    data: { studentId: enrolled.studentId, classroomId: secondClass.id },
  });
  const evaluations = await listStudentCourseEvaluationContexts(
    enrolled.studentId,
  );
  assert.ok(
    evaluations.some((row) => row.classroom.id === enrolled.classroomId),
  );
  assert.equal(
    groupStudentCourseContexts(evaluations).filter(
      (item) => item.course.id === fixtureCourse.id,
    ).length,
    1,
  );
  assert.equal(
    groupStudentCourseContexts(evaluations).find(
      (item) => item.course.id === fixtureCourse.id,
    )?.classrooms.length,
    2,
  );
  assert.deepEqual(
    await listStudentAssignments(
      enrolled.studentId,
      fixtureCourse.id,
      secondClass.id,
    ),
    [],
  );
  assert.equal(
    (
      await listStudentResults(
        enrolled.studentId,
        studentResultsQuerySchema.parse({}),
        fixtureCourse.id,
        secondClass.id,
      )
    ).pagination.total,
    0,
  );
  assert.ok(
    evaluations.every((row) => !("score" in row) && !("result" in row)),
  );
  assert.deepEqual(
    await listStudentCourseEvaluationContexts("not-a-student"),
    [],
  );

  const submission = await prisma.submission.findFirstOrThrow({
    where: { status: "PUBLISHED" },
    include: { assignment: true },
  });
  const { studentId, assignment } = submission;
  await prisma.classMembership.updateMany({
    where: { studentId, classroomId: assignment.classroomId },
    data: { status: "REMOVED", endedAt: new Date() },
  });
  await prisma.classroom.update({
    where: { id: assignment.classroomId },
    data: { status: "ARCHIVED", closedAt: new Date() },
  });
  const listed = (await listStudentAssignments(studentId)).find(
    (row) => row.id === assignment.id,
  );
  assert.ok(listed);
  assert.equal(listed.historyOnly, true);
  assert.equal(listed.inProgressSubmissionId, null);
  const results = await listStudentResults(
    studentId,
    studentResultsQuerySchema.parse({}),
  );
  assert.ok(
    results.items.some((row) => row.id === submission.id && row.isHistorical),
  );
  const detail = await getStudentSubmissionResult(studentId, submission.id);
  assert.equal(detail.isPublished, true);
  assert.equal(detail.score, submission.score?.toNumber() ?? null);
  await assert.rejects(getStudentAssignment(studentId, assignment.id));
  const other = await prisma.user.findFirstOrThrow({
    where: { role: "STUDENT", id: { not: studentId } },
  });
  await assert.rejects(getStudentSubmissionResult(other.id, submission.id));
  await prisma.assignment.update({
    where: { id: assignment.id },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  assert.ok(
    (await listStudentAssignments(studentId)).some(
      (row) => row.id === assignment.id && row.historyOnly,
    ),
  );
  await prisma.submission.update({
    where: { id: submission.id },
    data: { status: "GRADED", publishedAt: null },
  });
  const hidden = await getStudentSubmissionResult(studentId, submission.id);
  assert.equal(hidden.score, null);
  assert.equal(hidden.maxScore, null);
  assert.equal(hidden.answers.length, 0);
  const otherSubmissions = await prisma.submission.findMany({
    where: { studentId: other.id },
    select: { assignmentId: true },
  });
  const visible = await listStudentAssignments(other.id);
  assert.ok(
    visible
      .filter((row) => row.historyOnly)
      .every((row) => otherSubmissions.some((s) => s.assignmentId === row.id)),
  );
  await prisma.assignment.update({
    where: { id: assignment.id },
    data: { status: "ARCHIVED" },
  });
  assert.ok(
    !(await listStudentAssignments(studentId)).some(
      (row) => row.id === assignment.id,
    ),
  );
  assert.ok(
    !(
      await listStudentResults(studentId, studentResultsQuerySchema.parse({}))
    ).items.some((row) => row.id === submission.id),
  );
  assert.ok(
    !(
      await listTeacherAssignments(
        assignment.teacherId,
        assignmentListQuerySchema.parse({}),
      )
    ).items.some((row) => row.id === assignment.id),
  );
  assert.ok(
    (
      await listTeacherAssignments(
        assignment.teacherId,
        assignmentListQuerySchema.parse({ status: "ARCHIVED" }),
      )
    ).items.some((row) => row.id === assignment.id),
  );
  assert.equal(
    await prisma.submission.count({ where: { id: submission.id } }),
    1,
  );
  console.log(
    "PASS archived/removed own history, closed assignment, score publication isolation, no resumed access and cross-student rejection",
  );
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
