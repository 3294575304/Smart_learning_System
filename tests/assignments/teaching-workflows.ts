import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assignmentUpsertSchema } from "@/services/assignments/schemas";
import {
  createDraftAssignment,
  updateDraftAssignment,
  publishAssignment,
  startOrResumeAttempt,
  submitStudentAssignment,
  getTeacherAssignmentEditorOptions,
} from "@/services/assignments/service";
import {
  listSubmissionAttachments,
  uploadSubmissionAttachment,
  readSubmissionAttachment,
  deleteSubmissionAttachment,
} from "@/services/assignments/attachments";
import {
  getTeacherSubmissionForGrading,
  saveManualAnswerGrade,
  completeSubmissionGrading,
  publishAssignmentResults,
} from "@/services/assignments/manual-grading";
import {
  getTeachingProgress,
  updateTeachingProgress,
  listStudentPracticeCourses,
} from "@/services/course-recommendations/service";
import { listTeacherCourseLearnerProfiles } from "@/services/learner-profiles/service";
import { createPublishedGraphFixture } from "../helpers/teaching-graph-fixture";
import { listTeacherResultsOverview } from "@/services/assignment-results/service";
import { teacherResultsOverviewQuerySchema } from "@/services/assignment-results/schemas";
import {
  createTeacherAttendanceSession,
  getTeacherCourseAttendance,
} from "@/services/attendance/service";
import {
  listTeacherQuestionCourseOptions,
  listTeacherQuestions,
} from "@/services/questions/service";
import { questionListQuerySchema } from "@/services/questions/schemas";

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? "");
  assert.match(
    target.searchParams.get("schema") ?? "",
    /^teaching_it_[a-z0-9_]+$/,
  );
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
  });
  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student@example.com" },
  });
  const outsider = await prisma.user.findUniqueOrThrow({
    where: { email: "student3@example.com" },
  });
  const otherTeacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher2@example.com" },
  });
  const template = await prisma.courseTemplate.findFirstOrThrow();
  const course = await prisma.course.create({
    data: {
      teacherId: teacher.id,
      templateId: template.id,
      courseNo: "TEACHING-TEST",
      name: "教学闭环测试",
      term: "2026",
      status: "ACTIVE",
    },
  });
  const makeClass = (name: string) =>
    prisma.classroom.create({
      data: {
        teacherId: teacher.id,
        courseId: course.id,
        name,
        joinCode: randomUUID(),
        memberships: { create: { studentId: student.id } },
      },
    });
  const first = await makeClass("一班");
  const second = await makeClass("二班");
  const context = { ipAddress: null, userAgent: "teaching-test" };
  assert.ok(
    (await listTeacherQuestionCourseOptions(teacher.id)).some(
      (item) => item.id === course.id,
    ),
  );
  assert.equal(
    (
      await listTeacherQuestions(
        teacher.id,
        questionListQuerySchema.parse({ courseId: course.id }),
      )
    ).pagination.total,
    0,
  );
  await assert.rejects(() =>
    listTeacherQuestions(
      otherTeacher.id,
      questionListQuerySchema.parse({ courseId: course.id }),
    ),
  );
  for (const classroom of [first, second]) {
    await createTeacherAttendanceSession(
      teacher.id,
      course.id,
      {
        classroomId: classroom.id,
        title: "班级出勤隔离测试",
        startsAt: new Date(Date.now() + 3600000),
        signInOpensAt: new Date(Date.now() + 3000000),
        lateAfter: new Date(Date.now() + 4200000),
        signInClosesAt: new Date(Date.now() + 4800000),
      },
      context,
    );
  }
  const firstAttendance = await getTeacherCourseAttendance(
    teacher.id,
    course.id,
    first.id,
  );
  assert.equal(firstAttendance.sessions.length, 1);
  assert.equal(firstAttendance.sessions[0].classroomId, first.id);
  await assert.rejects(() =>
    getTeacherCourseAttendance(otherTeacher.id, course.id, first.id),
  );
  console.log(
    "PASS unpublished course filter, course-only question scope and class attendance isolation",
  );
  const actor = (user: typeof student) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: null,
    mustChangePassword: false,
  });
  const draftInput = assignmentUpsertSchema.parse({
    title: "独立实验任务",
    classroomId: first.id,
    publishedAt: new Date(Date.now() - 1000),
    dueAt: new Date(Date.now() + 3600000),
    allowAttachments: true,
    submissionTask: {
      prompt: "提交实验结果截图并说明",
      referenceAnswer: "结果清晰，过程完整",
      points: 100,
    },
    questions: [],
  });
  const draft = await createDraftAssignment(teacher.id, draftInput);
  assert.equal(draft.questions.length, 1);
  const sourceId = draft.questions[0].questionId;
  await updateDraftAssignment(teacher.id, draft.id, draftInput);
  assert.equal(
    (await getTeacherAssignmentEditorOptions(teacher.id)).questions.some(
      (q) => q.id === sourceId,
    ),
    false,
  );
  await assert.rejects(() =>
    createDraftAssignment(teacher.id, {
      ...draftInput,
      submissionTask: undefined,
      questions: [{ questionId: sourceId, points: 10, sortOrder: 1 }],
    }),
  );
  await publishAssignment(teacher.id, draft.id);
  await publishAssignment(teacher.id, draft.id);
  const attempt = await startOrResumeAttempt(
    student.id,
    draft.id,
    randomUUID(),
  );
  const questionId = attempt.questions[0].id;
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const screenshot = () =>
    new File([new Uint8Array(png)], "截图.png", { type: "image/png" });
  const file = await uploadSubmissionAttachment(
    actor(student),
    attempt.id,
    questionId,
    screenshot(),
    context,
  );
  assert.equal(
    (
      await uploadSubmissionAttachment(
        actor(student),
        attempt.id,
        questionId,
        screenshot(),
        context,
      )
    ).id,
    file.id,
  );
  assert.deepEqual(
    (
      await readSubmissionAttachment(
        actor(teacher),
        attempt.id,
        file.id,
        context,
      )
    ).data,
    png,
  );
  await assert.rejects(() =>
    readSubmissionAttachment(actor(outsider), attempt.id, file.id, context),
  );
  await assert.rejects(() =>
    readSubmissionAttachment(actor(otherTeacher), attempt.id, file.id, context),
  );
  await assert.rejects(() =>
    uploadSubmissionAttachment(
      actor(student),
      attempt.id,
      questionId,
      new File(["html"], "fake.png", { type: "image/png" }),
      context,
    ),
  );
  await deleteSubmissionAttachment(
    actor(student),
    attempt.id,
    file.id,
    context,
  );
  assert.equal(
    (await listSubmissionAttachments(actor(student), attempt.id)).length,
    0,
  );
  const retained = await uploadSubmissionAttachment(
    actor(student),
    attempt.id,
    questionId,
    screenshot(),
    context,
  );
  await submitStudentAssignment(student.id, attempt.id);
  await assert.rejects(() =>
    deleteSubmissionAttachment(
      actor(student),
      attempt.id,
      retained.id,
      context,
    ),
  );
  await assert.rejects(() =>
    uploadSubmissionAttachment(
      actor(student),
      attempt.id,
      questionId,
      screenshot(),
      context,
    ),
  );
  const grading = await getTeacherSubmissionForGrading(
    teacher.id,
    draft.id,
    attempt.id,
  );
  assert.equal(grading.status, "PENDING_REVIEW");
  await saveManualAnswerGrade(
    teacher.id,
    draft.id,
    attempt.id,
    grading.answers[0].id,
    { score: 87, feedback: "截图清晰" },
  );
  await completeSubmissionGrading(teacher.id, draft.id, attempt.id, context);
  await publishAssignmentResults(teacher.id, draft.id, context);
  assert.equal(
    (await getTeacherSubmissionForGrading(teacher.id, draft.id, attempt.id))
      .score,
    87,
  );
  console.log(
    "PASS standalone task, repeat publication, hidden bank source, attachment-only submission, file validation, private download, deletion, freeze, manual grading and results publication",
  );

  const resultsQuery = teacherResultsOverviewQuerySchema.parse({
    classroomId: first.id,
  });
  const beforeRemoval = (
    await listTeacherResultsOverview(teacher.id, resultsQuery)
  ).items.find((item) => item.id === draft.id);
  assert.equal(beforeRemoval?.submittedCount, 1);
  assert.equal(beforeRemoval?.averageScore, 87);
  await prisma.classMembership.update({
    where: {
      classroomId_studentId: { classroomId: first.id, studentId: student.id },
    },
    data: { status: "REMOVED", endedAt: new Date() },
  });
  const afterRemoval = (
    await listTeacherResultsOverview(teacher.id, resultsQuery)
  ).items.find((item) => item.id === draft.id);
  assert.equal(afterRemoval?.studentCount, 0);
  assert.equal(afterRemoval?.submittedCount, 0);
  assert.equal(afterRemoval?.historicalSubmittedCount, 1);
  assert.equal(afterRemoval?.averageScore, null);
  assert.equal(
    (await listTeacherResultsOverview(otherTeacher.id, resultsQuery)).items
      .length,
    0,
  );
  await prisma.classMembership.update({
    where: {
      classroomId_studentId: { classroomId: first.id, studentId: student.id },
    },
    data: { status: "ACTIVE", endedAt: null },
  });
  console.log(
    "PASS teacher results current membership scope, retained history and cross-teacher isolation",
  );

  const concepts = await Promise.all(
    ["one", "two"].map((key) =>
      prisma.knowledgeGraphConcept.create({
        data: { courseId: course.id, stableKey: key },
      }),
    ),
  );
  const fixture = await createPublishedGraphFixture(course.id, teacher.id);
  const graph = await fixture.publishVersion(
    1,
    concepts.map((item) => item.id),
  );
  await updateTeachingProgress(
    teacher.id,
    course.id,
    {
      graphVersionId: graph.id,
      expectedRevision: 0,
      conceptIds: [concepts[0].id],
    },
    context,
  );
  const inherited = await getTeachingProgress(teacher.id, course.id, first.id);
  assert.equal(inherited.inherited, true);
  const saved = await updateTeachingProgress(
    teacher.id,
    course.id,
    {
      classroomId: first.id,
      graphVersionId: graph.id,
      expectedRevision: inherited.revision?.revisionNumber ?? 0,
      conceptIds: [concepts[1].id],
    },
    context,
  );
  assert.deepEqual(
    (
      await getTeachingProgress(teacher.id, course.id, second.id)
    ).revision?.concepts.map((item) => item.conceptId),
    [concepts[0].id],
  );
  assert.equal(
    (await listStudentPracticeCourses(student.id)).find(
      (item) => item.classroomId === first.id,
    )?.progressRevisionNumber,
    saved.revision?.revisionNumber,
  );
  assert.deepEqual(
    (
      await getTeachingProgress(teacher.id, course.id, first.id)
    ).revision?.concepts.map((item) => item.conceptId),
    [concepts[1].id],
  );
  assert.equal(
    (await listStudentPracticeCourses(student.id)).find(
      (item) => item.classroomId === second.id,
    )?.progressRevisionNumber,
    inherited.revision?.revisionNumber,
  );
  await assert.rejects(() =>
    updateTeachingProgress(
      otherTeacher.id,
      course.id,
      {
        classroomId: first.id,
        graphVersionId: graph.id,
        expectedRevision: 0,
        conceptIds: [],
      },
      context,
    ),
  );
  await assert.rejects(() =>
    updateTeachingProgress(
      teacher.id,
      course.id,
      {
        classroomId: first.id,
        graphVersionId: graph.id,
        expectedRevision: 0,
        conceptIds: [],
      },
      context,
    ),
  );
  await updateTeachingProgress(
    teacher.id,
    course.id,
    {
      classroomId: first.id,
      graphVersionId: graph.id,
      expectedRevision: saved.revision?.revisionNumber ?? 0,
      conceptIds: [],
    },
    context,
  );
  assert.equal(
    (await getTeachingProgress(teacher.id, course.id, first.id)).revision
      ?.concepts.length,
    0,
  );
  const profiles = await listTeacherCourseLearnerProfiles(
    teacher.id,
    course.id,
    { classroomId: first.id },
  );
  assert.equal(profiles.items.length, 1);
  await assert.rejects(() =>
    listTeacherCourseLearnerProfiles(otherTeacher.id, course.id, {
      classroomId: first.id,
    }),
  );
  console.log(
    "PASS independent class progress, inherited baseline compatibility, practice scope, concurrency conflict, ownership checks, empty progress and class profiles",
  );
  assert.equal(actor(student).role, Role.STUDENT);
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
