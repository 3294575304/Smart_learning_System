import { revokeAssignment } from "@/services/assignments/revocation";
import {
  listTeacherAssignments,
  publishAssignment,
} from "@/services/assignments/service";
import { assignmentListQuerySchema } from "@/services/assignments/schemas";
import {
  startOrResumeAttempt,
  saveStudentAnswers,
  submitStudentAssignment,
} from "@/services/assignments/service";
import {
  getTeacherSubmissionForGrading,
  completeSubmissionGrading,
  saveManualAnswerGrade,
} from "@/services/assignments/manual-grading";
import { listTeacherAssignmentSubmissions } from "@/services/assignments/manual-grading";
import { assertIsolatedIntegrationEnvironment } from "@/tests/integration/database";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  createTeacherCourse,
  listTeacherCourseTemplates,
} from "@/services/courses/service";
import { ensureTestQuestionCategory } from "@/tests/helpers/question-course-category";
import {
  assignmentUpsertSchema,
  assignmentBatchSchema,
} from "@/services/assignments/schemas";
import {
  createDraftAssignment,
  updateDraftAssignment,
  createAssignmentBatch,
} from "@/services/assignments/service";
import { correctLegacyCategory } from "@/services/assignments/category-correction";
import { syncTeacherPlatformAssignmentGrades } from "@/services/gradebook/service";
assertIsolatedIntegrationEnvironment("ASSIGNMENT_CATEGORY_TEST_SCHEMA");
const context = { ipAddress: null, userAgent: "category-integration" };
async function main() {
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
  });
  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student@example.com" },
  });
  const template = (await listTeacherCourseTemplates(teacher.id))[0];
  const course = await createTeacherCourse(
    teacher.id,
    {
      templateId: template.id,
      questionCategoryId: (await ensureTestQuestionCategory(prisma, teacher.id))
        .id,
      courseNo: "CAT-" + randomUUID().slice(0, 8),
      term: "2026-2027-1",
      name: "分类测试课程",
      description: null,
    },
    context,
  );
  const room = await prisma.classroom.create({
    data: {
      name: "分类测试班",
      teacherId: teacher.id,
      courseId: course.id,
      joinCode: randomUUID().slice(0, 8),
    },
  });
  await prisma.classMembership.create({
    data: { classroomId: room.id, studentId: student.id },
  });
  const input = (
    category: "PRACTICE" | "COURSE_ASSIGNMENT" | "COURSE_EXPERIMENT",
    points = 20,
  ) =>
    assignmentUpsertSchema.parse({
      category,
      title: "分类验收作业",
      classroomId: room.id,
      description: "",
      publishedAt: new Date(Date.now() - 3600000),
      dueAt: new Date(Date.now() + 86400000),
      questions: [],
      submissionTask: {
        prompt: "请完成分类测试任务",
        referenceAnswer: "评分参考",
        points,
      },
    });
  const practice = await createDraftAssignment(teacher.id, input("PRACTICE"));
  assert.equal(practice.category, "PRACTICE");
  const homework = await createDraftAssignment(
    teacher.id,
    input("COURSE_ASSIGNMENT"),
  );
  assert.equal(homework.category, "COURSE_ASSIGNMENT");
  const lab = await createDraftAssignment(
    teacher.id,
    input("COURSE_EXPERIMENT"),
  );
  assert.equal(lab.category, "COURSE_EXPERIMENT");
  assert.equal(
    (await updateDraftAssignment(teacher.id, lab.id, input("PRACTICE")))
      .category,
    "PRACTICE",
  );
  const batchInput = assignmentBatchSchema.parse({
    requestId: randomUUID(),
    classroomIds: [room.id],
    publish: true,
    assignment: input("COURSE_EXPERIMENT"),
  });
  await createAssignmentBatch(teacher.id, batchInput);
  await createAssignmentBatch(teacher.id, batchInput);
  const labs = await prisma.assignment.findMany({
    where: { classroomId: room.id, status: "PUBLISHED" },
  });
  assert.equal(labs.length, 1);
  assert.equal(labs[0].category, "COURSE_EXPERIMENT");
  for (const category of [
    "PRACTICE",
    "COURSE_ASSIGNMENT",
    "COURSE_EXPERIMENT",
  ] as const) {
    const found = await listTeacherAssignments(
      teacher.id,
      assignmentListQuerySchema.parse({
        courseId: course.id,
        category,
        pageSize: 1,
      }),
    );
    assert.equal(found.items.length, 1);
    assert.ok(found.items.every((item) => item.category === category));
    assert.equal(
      found.pagination.total,
      await prisma.assignment.count({
        where: { classroomId: room.id, category },
      }),
    );
  }
  assert.equal(
    assignmentListQuerySchema.safeParse({ category: "INVALID" }).success,
    false,
  );
  await assert.rejects(
    updateDraftAssignment(teacher.id, labs[0].id, input("PRACTICE")),
    /草稿|编辑|修改/,
  );
  await prisma.assignment.update({
    where: { id: practice.id },
    data: { categoryNeedsReview: true },
  });
  await assert.rejects(
    correctLegacyCategory(
      student.id,
      practice.id,
      {
        category: "COURSE_ASSIGNMENT",
        expectedCategory: "PRACTICE",
        reason: "核对类别",
      },
      context,
    ),
    /不存在/,
  );
  await correctLegacyCategory(
    teacher.id,
    practice.id,
    {
      category: "PRACTICE",
      expectedCategory: "PRACTICE",
      reason: "核对旧练习",
    },
    context,
  );
  await correctLegacyCategory(
    teacher.id,
    practice.id,
    { category: "PRACTICE", expectedCategory: "PRACTICE", reason: "重复请求" },
    context,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { action: "ASSIGNMENT_CATEGORY_CORRECTED", targetId: practice.id },
    }),
    1,
  );
  await assert.rejects(
    correctLegacyCategory(
      teacher.id,
      practice.id,
      {
        category: "COURSE_EXPERIMENT",
        expectedCategory: "PRACTICE",
        reason: "再次修改",
      },
      context,
    ),
    /冻结|确认/,
  );
  const syllabus = await prisma.courseSyllabus.create({
    data: {
      courseId: course.id,
      uploadedById: teacher.id,
      versionNumber: 1,
      originalName: "test.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      checksumSha256: "a".repeat(64),
      storageKey: "test/syllabus",
    },
  });
  const parse = await prisma.syllabusParseDraft.create({
    data: {
      courseId: course.id,
      syllabusId: syllabus.id,
      requestedById: teacher.id,
      status: "SUCCEEDED",
      parserVersion: "test",
      promptVersion: "test",
      ruleVersion: "test",
      structuredResult: {},
      extractedTextMetadata: {},
    },
  });
  const sr = await prisma.syllabusReviewRevision.create({
    data: {
      courseId: course.id,
      syllabusId: syllabus.id,
      parseDraftId: parse.id,
      editedById: teacher.id,
      revisionNumber: 1,
      structureJson: {},
    },
  });
  const ps = await prisma.publishedSyllabusStructure.create({
    data: {
      courseId: course.id,
      syllabusId: syllabus.id,
      parseDraftId: parse.id,
      reviewRevisionId: sr.id,
      publishedById: teacher.id,
      versionNumber: 1,
      structureJson: {},
    },
  });
  const draft = await prisma.assessmentSchemeDraft.create({
    data: {
      courseId: course.id,
      createdById: teacher.id,
      structureJson: {},
      sourceFingerprint: "a".repeat(64),
    },
  });
  const review = await prisma.assessmentSchemeReviewRevision.create({
    data: {
      draftId: draft.id,
      courseId: course.id,
      editedById: teacher.id,
      revisionNumber: 1,
      structureJson: {},
      sourceFingerprint: "a".repeat(64),
    },
  });
  const scheme = await prisma.publishedAssessmentScheme.create({
    data: {
      courseId: course.id,
      reviewRevisionId: review.id,
      publishedById: teacher.id,
      versionNumber: 1,
      structureJson: {},
      sourceFingerprint: "a".repeat(64),
      calculationRuleVersion: "test",
    },
  });
  const comp = await prisma.publishedAssessmentComponent.create({
    data: {
      schemeId: scheme.id,
      code: "P",
      name: "平时表现",
      type: "REGULAR_PERFORMANCE",
      fullScore: 100,
      weight: 10,
      sourceType: "PLATFORM_ASSIGNMENT",
      sortOrder: 1,
      sourceJson: [],
      rubricJson: [],
    },
  });
  const book = await prisma.courseGradebook.create({
    data: {
      courseId: course.id,
      classroomId: room.id,
      schemeId: scheme.id,
      createdById: teacher.id,
    },
  });
  await assert.rejects(
    syncTeacherPlatformAssignmentGrades(
      teacher.id,
      book.id,
      comp.id,
      practice.id,
      context,
    ),
    /正式教学大纲/,
  );
  await prisma.publishedAssessmentScheme.update({
    where: { id: scheme.id },
    data: { sourcePublishedSyllabusStructureId: ps.id },
  });
  await prisma.assignment.update({
    where: { id: practice.id },
    data: { status: "PUBLISHED" },
  });
  await assert.rejects(
    syncTeacherPlatformAssignmentGrades(
      teacher.id,
      book.id,
      comp.id,
      practice.id,
      context,
    ),
    /确认/,
  );
  await prisma.publishedAssessmentComponent.update({
    where: { id: comp.id },
    data: { assignmentAggregationConfirmed: true },
  });
  await assert.rejects(
    syncTeacherPlatformAssignmentGrades(
      teacher.id,
      book.id,
      comp.id,
      labs[0].id,
      context,
    ),
    /不匹配/,
  );
  await prisma.submission.create({
    data: {
      assignmentId: practice.id,
      studentId: student.id,
      idempotencyKey: randomUUID(),
      status: "PUBLISHED",
      startedAt: new Date(Date.now() - 1000),
      attemptNumber: 1,
      score: 10,
      maxScore: 20,
      percentage: 50,
      gradedAt: new Date(),
      submittedAt: new Date(),
      publishedAt: new Date(),
    },
  });
  await syncTeacherPlatformAssignmentGrades(
    teacher.id,
    book.id,
    comp.id,
    practice.id,
    context,
  );
  await syncTeacherPlatformAssignmentGrades(
    teacher.id,
    book.id,
    comp.id,
    practice.id,
    context,
  );
  assert.equal(
    await prisma.gradeItem.count({ where: { gradebookId: book.id } }),
    1,
  );
  const item = await prisma.gradeItem.findFirstOrThrow({
    where: { gradebookId: book.id },
  });
  assert.equal(item.itemWeight.toNumber(), 1);
  assert.equal(item.maxScore.toNumber(), 20);
  await prisma.submission.create({
    data: {
      assignmentId: practice.id,
      studentId: student.id,
      idempotencyKey: randomUUID(),
      status: "IN_PROGRESS",
      attemptNumber: 2,
    },
  });
  const withDraft = await syncTeacherPlatformAssignmentGrades(
    teacher.id,
    book.id,
    comp.id,
    practice.id,
    context,
  );
  assert.equal(withDraft.publishedSubmissionCount, 1);
  await prisma.submission.create({
    data: {
      assignmentId: practice.id,
      studentId: student.id,
      idempotencyKey: randomUUID(),
      status: "PENDING_REVIEW",
      attemptNumber: 3,
      startedAt: new Date(Date.now() - 1000),
      submittedAt: new Date(),
    },
  });
  const pending = await syncTeacherPlatformAssignmentGrades(
    teacher.id,
    book.id,
    comp.id,
    practice.id,
    context,
  );
  assert.equal(pending.publishedSubmissionCount, 0);
  assert.equal(pending.syncedCount, 0);
  await prisma.gradeItem.create({
    data: {
      gradebookId: book.id,
      componentId: comp.id,
      sourceKey: "manual",
      name: "旧人工成绩",
      maxScore: 100,
      sourceType: "MANUAL",
      sortOrder: 2,
    },
  });
  await assert.rejects(
    syncTeacherPlatformAssignmentGrades(
      teacher.id,
      book.id,
      comp.id,
      practice.id,
      context,
    ),
    /不会覆盖|已有其他/,
  );
  // Stage two: published and graded share one filter; use frozen points.
  const sourceQuestions = await prisma.question.findMany({ take: 2 });
  assert.equal(sourceQuestions.length, 2);
  const displayTask = await prisma.assignment.create({
    data: {
      teacherId: teacher.id,
      classroomId: room.id,
      title: "展示边界测试",
      status: "PUBLISHED",
      publishedAt: new Date(Date.now() - 10000),
      totalPoints: 12,
      questions: {
        create: [2, 10].map((points, i) => ({
          questionId: sourceQuestions[i].id,
          sortOrder: i + 1,
          points,
          titleSnapshot: `完整题目${i}`,
          contentSnapshot: "冻结题干",
          typeSnapshot: "TRUE_FALSE",
          difficultySnapshot: 1,
          explanationSnapshot: "解析",
          correctBooleanSnapshot: true,
        })),
      },
    },
    include: { questions: { orderBy: { sortOrder: "asc" } } },
  });
  for (const [i, status] of (["GRADED", "PUBLISHED"] as const).entries()) {
    await prisma.submission.create({
      data: {
        assignmentId: displayTask.id,
        studentId: student.id,
        attemptNumber: i + 1,
        idempotencyKey: randomUUID(),
        status,
        startedAt: new Date(Date.now() - 2000),
        submittedAt: new Date(Date.now() - 1000),
        gradedAt: new Date(),
        publishedAt: status === "PUBLISHED" ? new Date() : null,
        score: 2,
        maxScore: 12,
        percentage: 16.67,
        answers: {
          create: displayTask.questions.map((q, index) => ({
            assignmentQuestionId: q.id,
            score: index === 0 ? 2 : 0,
            maxScore: q.points,
            isCorrect: index === 0,
            gradingStatus: "AUTO_GRADED",
          })),
        },
      },
    });
  }
  const displayResult = await listTeacherAssignmentSubmissions(
    teacher.id,
    displayTask.id,
    { page: 1, pageSize: 1, status: "GRADED" },
  );
  assert.equal(displayResult.pagination.total, 2);
  assert.equal(displayResult.items.length, 1);
  assert.equal(displayResult.items[0].objectiveMaxScore, 12);
  assert.equal(displayResult.items[0].objectivePercentage, (2 / 12) * 100);
  assert.equal(displayResult.items[0].objectiveCorrectCount, 1);
  assert.equal(displayResult.items[0].displayStatus, "已批改");
  assert.equal(
    (
      await listTeacherAssignmentSubmissions(teacher.id, displayTask.id, {
        page: 1,
        pageSize: 20,
        status: "PUBLISHED",
      })
    ).pagination.total,
    2,
  );
  await assert.rejects(
    listTeacherAssignmentSubmissions(student.id, displayTask.id, {
      page: 1,
      pageSize: 20,
    }),
    /不存在/,
  );
  const attempts = await prisma.submission.findMany({
    where: { assignmentId: displayTask.id },
    orderBy: { attemptNumber: "asc" },
  });
  const historyList = await listTeacherAssignmentSubmissions(
    teacher.id,
    displayTask.id,
    { page: 1, pageSize: 20 },
  );
  assert.match(
    historyList.items.find((item) => item.id === attempts[0].id)
      ?.gradingBlockedReason ?? "",
    /历史提交只读/,
  );
  const history = await getTeacherSubmissionForGrading(
    teacher.id,
    displayTask.id,
    attempts[0].id,
  );
  assert.equal(history.isLatestEffective, false);
  assert.equal(history.canManageGrading, false);
  assert.equal(history.questions.length, 2);
  await assert.rejects(
    completeSubmissionGrading(
      teacher.id,
      displayTask.id,
      attempts[0].id,
      context,
    ),
    /历史提交只读/,
  );
  await assert.rejects(
    saveManualAnswerGrade(
      teacher.id,
      displayTask.id,
      attempts[0].id,
      history.answers[0].id,
      { score: 1, feedback: "历史修改应拒绝" },
      context,
    ),
    /历史提交只读/,
  );
  const next = await prisma.submission.create({
    data: {
      assignmentId: displayTask.id,
      studentId: student.id,
      attemptNumber: 3,
      idempotencyKey: randomUUID(),
      status: "PENDING_REVIEW",
      startedAt: new Date(Date.now() - 2000),
      submittedAt: new Date(),
      answers: {
        create: {
          assignmentQuestionId: displayTask.questions[0].id,
          maxScore: 2,
          score: 2,
          isCorrect: true,
          gradingStatus: "AUTO_GRADED",
        },
      },
    },
  });
  await prisma.submission.create({
    data: {
      assignmentId: displayTask.id,
      studentId: student.id,
      attemptNumber: 4,
      idempotencyKey: randomUUID(),
      status: "IN_PROGRESS",
    },
  });
  const personal = await getTeacherSubmissionForGrading(
    teacher.id,
    displayTask.id,
    next.id,
  );
  assert.equal(personal.isLatestEffective, true);
  assert.equal(personal.questions.length, 2);
  assert.equal(personal.questions.filter((q) => q.answer === null).length, 1);
  await assert.rejects(
    getTeacherSubmissionForGrading(student.id, displayTask.id, next.id),
    /不存在/,
  );
  await prisma.classMembership.update({
    where: {
      classroomId_studentId: { classroomId: room.id, studentId: student.id },
    },
    data: { status: "LEFT", endedAt: new Date() },
  });
  assert.equal(
    (await getTeacherSubmissionForGrading(teacher.id, displayTask.id, next.id))
      .canManageGrading,
    false,
  );
  await assert.rejects(
    completeSubmissionGrading(teacher.id, displayTask.id, next.id, context),
    /历史成员/,
  );
  await prisma.classMembership.update({
    where: {
      classroomId_studentId: { classroomId: room.id, studentId: student.id },
    },
    data: { status: "ACTIVE", endedAt: null },
  });
  await prisma.assignment.update({
    where: { id: displayTask.id },
    data: { status: "ARCHIVED" },
  });
  await assert.rejects(
    completeSubmissionGrading(teacher.id, displayTask.id, next.id, context),
    /归档/,
  );
  const raceBatch = await createAssignmentBatch(
    teacher.id,
    assignmentBatchSchema.parse({
      requestId: randomUUID(),
      classroomIds: [room.id],
      publish: true,
      assignment: {
        ...input("PRACTICE"),
        title: "并发批改提交验收",
        allowResubmission: true,
      },
    }),
  );
  const raceId = raceBatch.assignments[0].id;
  const firstRace = await startOrResumeAttempt(
    student.id,
    raceId,
    randomUUID(),
  );
  await saveStudentAnswers(student.id, firstRace.id, {
    version: firstRace.version,
    answers: [
      {
        assignmentQuestionId: firstRace.questions[0].id,
        kind: "TEXT",
        value: "第一份答案",
      },
    ],
  });
  await submitStudentAssignment(student.id, firstRace.id);
  const firstRaceDetail = await getTeacherSubmissionForGrading(
    teacher.id,
    raceId,
    firstRace.id,
  );
  const secondRace = await startOrResumeAttempt(
    student.id,
    raceId,
    randomUUID(),
  );
  await saveStudentAnswers(student.id, secondRace.id, {
    version: secondRace.version,
    answers: [
      {
        assignmentQuestionId: secondRace.questions[0].id,
        kind: "TEXT",
        value: "第二份答案",
      },
    ],
  });
  const competing = await Promise.allSettled([
    saveManualAnswerGrade(
      teacher.id,
      raceId,
      firstRace.id,
      firstRaceDetail.answers[0].id,
      { score: 5, feedback: "并发核对" },
      context,
    ),
    submitStudentAssignment(student.id, secondRace.id),
  ]);
  assert.equal(competing[1].status, "fulfilled");
  if (competing[0].status === "rejected")
    assert.match(String(competing[0].reason), /历史提交|冲突|重试/);
  assert.equal(
    (await getTeacherSubmissionForGrading(teacher.id, raceId, secondRace.id))
      .answers[0].finalScore,
    null,
  );
  await assert.rejects(
    saveManualAnswerGrade(
      teacher.id,
      raceId,
      firstRace.id,
      firstRaceDetail.answers[0].id,
      { score: 6, feedback: "新提交后再改旧记录" },
      context,
    ),
    /历史提交只读/,
  );
  const historicalCategoryTask = await prisma.assignment.create({
    data: {
      teacherId: teacher.id,
      classroomId: room.id,
      title: "历史类别筛选验收",
      category: "COURSE_EXPERIMENT",
      status: "ARCHIVED",
      publishedAt: new Date(Date.now() - 20000),
      dueAt: new Date(Date.now() - 10000),
    },
  });
  const historicalCategoryResult = await listTeacherAssignments(
    teacher.id,
    assignmentListQuerySchema.parse({
      courseId: course.id,
      category: "COURSE_EXPERIMENT",
      section: "HISTORY",
    }),
  );
  assert.ok(
    historicalCategoryResult.items.some(
      (item) => item.id === historicalCategoryTask.id,
    ),
  );
  assert.ok(
    historicalCategoryResult.items.every(
      (item) => item.category === "COURSE_EXPERIMENT",
    ),
  );
  console.log(
    "Category filtering integration passed: three categories, filtered pagination counts and historical assignments.",
  );
  console.log(
    "Concurrent grading integration passed: new submission and old grading serialize; current score is not overwritten.",
  );
  console.log(
    "Personal work integration passed: frozen questions, missing answers, draft exclusion, historical submissions/members read-only and direct write guards.",
  );
  console.log(
    "Stage two integration passed: merged filter, pagination, frozen objective denominator and ownership.",
  );
  console.log(
    "Category integration passed: three categories, draft update, published freeze, batch replay, legacy correction/ownership/audit, formal-source and rule guards, mismatched category, equal weight and no mixed overwrite.",
  );
  const linked = await createDraftAssignment(teacher.id, input("PRACTICE"));
  const linkedPublished = await publishAssignment(teacher.id, linked.id);
  await prisma.gradeItem.create({
    data: {
      gradebookId: book.id,
      componentId: comp.id,
      assignmentId: linked.id,
      sourceKey: `assignment:${linked.id}`,
      name: "已关联台账",
      maxScore: 20,
      sourceType: "PLATFORM_ASSIGNMENT",
      sortOrder: 30,
    },
  });
  await assert.rejects(
    () =>
      revokeAssignment(
        teacher.id,
        linked.id,
        {
          action: "REVOKE",
          expectedUpdatedAt: linkedPublished.updatedAt.toISOString(),
          reason: "测试撤销",
        },
        context,
      ),
    /台账/,
  );
  const revocable = await createDraftAssignment(teacher.id, input("PRACTICE"));
  const live = await publishAssignment(teacher.id, revocable.id);
  await revokeAssignment(
    teacher.id,
    revocable.id,
    {
      action: "REVOKE",
      expectedUpdatedAt: live.updatedAt.toISOString(),
      reason: "测试撤销",
    },
    context,
  );
  await assert.rejects(
    () =>
      syncTeacherPlatformAssignmentGrades(
        teacher.id,
        book.id,
        comp.id,
        revocable.id,
        context,
      ),
    /作业不存在/,
  );
  console.log(
    "PASS linked gradebook prevents revocation; revoked work cannot be synced",
  );
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
