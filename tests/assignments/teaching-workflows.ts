import { uploadAssignmentResource } from "@/services/assignments/resources";
import { getStorageService } from "@/services/storage";
import {
  assembleAssignmentReview,
  previewAssignmentPublication,
} from "@/services/assignments/editor-assistance";
import { getAssignmentCreationContext } from "@/services/assignments/creation-context";
import {
  revokeAssignment,
  revokeAssignmentSchema,
} from "@/services/assignments/revocation";
import { notifyAssignmentsDueSoon } from "@/services/notifications/events/assignment";
import { manageAssignmentDraft } from "@/services/assignments/draft-management";
import {
  extendAssignmentDeadline,
  issueAssignmentMakeup,
} from "@/services/assignments/makeup-service";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assignmentUpsertSchema,
  assignmentListQuerySchema,
} from "@/services/assignments/schemas";
import {
  createDraftAssignment,
  copyRevokedAssignment,
  copyHistoricalAssignment,
  getStudentAssignment,
  getStudentSubmissionResult,
  listStudentAssignments,
  createAssignmentBatch,
  getTeacherAssignment,
  listTeacherAssignments,
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
      questionCategory: {
        connectOrCreate: {
          where: {
            id: "test-category-automated-test-category",
          },
          create: {
            id: "test-category-automated-test-category",
            name: "自动化测试课程分类",
            normalizedName: "automated-test-category",
          },
        },
      },
      teacher: { connect: { id: teacher.id } },
      template: { connect: { id: template.id } },
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
  await assert.rejects(
    publishAssignmentResults(teacher.id, draft.id, context),
    /尚未截止/,
  );
  await prisma.assignment.update({
    where: { id: draft.id },
    data: { dueAt: new Date(Date.now() - 1) },
  });
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
  await assert.rejects(
    listTeacherResultsOverview(otherTeacher.id, resultsQuery),
    /无权访问/,
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
  const scheduledAt = new Date(Date.now() + 1800_000);
  const batchInput = {
    requestId: randomUUID(),
    classroomIds: [first.id, second.id],
    publish: true,
    assignment: {
      ...draftInput,
      title: "误发处理测试",
      publishedAt: scheduledAt,
    },
  };
  const batch = await createAssignmentBatch(teacher.id, batchInput);
  const scheduled = batch.assignments.find(
    (row) => row.classroom.id === first.id,
  );
  const otherClass = batch.assignments.find(
    (row) => row.classroom.id === second.id,
  );
  assert.ok(scheduled && otherClass);
  const cancel = {
    action: "CANCEL_SCHEDULE" as const,
    expectedUpdatedAt: scheduled.updatedAt.toISOString(),
  };
  await assert.rejects(
    () => manageAssignmentDraft(otherTeacher.id, scheduled.id, cancel, context),
    /作业不存在/,
  );
  await manageAssignmentDraft(teacher.id, scheduled.id, cancel, context);
  await assert.rejects(
    () => manageAssignmentDraft(teacher.id, scheduled.id, cancel, context),
    /状态已变化/,
  );
  await assert.rejects(
    () => createAssignmentBatch(teacher.id, batchInput),
    /已删除或取消预约/,
  );
  const canceled = await getTeacherAssignment(teacher.id, scheduled.id);
  assert.equal(canceled.status, "DRAFT");
  assert.equal(canceled.publishedAt, null);
  assert.deepEqual(canceled.questions, scheduled.questions);
  assert.equal(canceled.totalPoints, scheduled.totalPoints);
  assert.equal(
    (await getTeacherAssignment(teacher.id, otherClass.id)).status,
    "PUBLISHED",
  );
  await assert.rejects(
    () => publishAssignment(teacher.id, canceled.id),
    /发布时间/,
  );
  const notifyWhere = {
    sourceId: scheduled.id,
    type: "ASSIGNMENT_PUBLISHED" as const,
  };
  assert.equal(
    await prisma.notification.count({
      where: { ...notifyWhere, expiresAt: null },
    }),
    0,
  );
  await updateDraftAssignment(teacher.id, canceled.id, {
    ...draftInput,
    publishedAt: scheduledAt,
  });
  await publishAssignment(teacher.id, canceled.id);
  await publishAssignment(teacher.id, canceled.id);
  assert.equal(
    await prisma.notification.count({
      where: { ...notifyWhere, expiresAt: null },
    }),
    1,
  );
  assert.equal(await prisma.notification.count({ where: notifyWhere }), 2);
  const draftBatchInput = {
    ...batchInput,
    requestId: randomUUID(),
    publish: false,
  };
  const draftBatch = await createAssignmentBatch(teacher.id, draftBatchInput);
  const deleteTarget = draftBatch.assignments.find(
    (row) => row.classroom.id === first.id,
  );
  assert.ok(deleteTarget);
  const deleteRequest = {
    action: "DELETE_DRAFT" as const,
    expectedUpdatedAt: deleteTarget.updatedAt.toISOString(),
  };
  await manageAssignmentDraft(
    teacher.id,
    deleteTarget.id,
    deleteRequest,
    context,
  );
  await assert.rejects(
    () =>
      manageAssignmentDraft(
        teacher.id,
        deleteTarget.id,
        deleteRequest,
        context,
      ),
    /作业不存在/,
  );
  assert.ok(
    (
      await prisma.assignment.findUniqueOrThrow({
        where: { id: deleteTarget.id },
      })
    ).deletedAt,
  );
  await assert.rejects(
    () => createAssignmentBatch(teacher.id, draftBatchInput),
    /已删除或取消预约/,
  );
  await assert.rejects(
    () => getTeacherAssignment(teacher.id, deleteTarget.id),
    /作业不存在/,
  );
  await assert.rejects(
    () => updateDraftAssignment(teacher.id, deleteTarget.id, draftInput),
    /作业不存在/,
  );
  await assert.rejects(
    () => publishAssignment(teacher.id, deleteTarget.id),
    /作业不存在/,
  );
  assert.ok(
    !(
      await listTeacherAssignments(
        teacher.id,
        assignmentListQuerySchema.parse({ classroomId: first.id }),
      )
    ).items.some((item) => item.id === deleteTarget.id),
  );
  const expired = await createDraftAssignment(teacher.id, draftInput);
  await publishAssignment(teacher.id, expired.id);
  const open = await prisma.assignment.update({
    where: { id: expired.id },
    data: {
      dueAt: new Date(Date.now() - 1000),
      publishedAt: new Date(Date.now() - 120_000),
    },
  });
  await assert.rejects(
    () =>
      manageAssignmentDraft(
        teacher.id,
        open.id,
        {
          ...cancel,
          expectedUpdatedAt: open.updatedAt.toISOString(),
        },
        context,
      ),
    /已开放/,
  );
  const makeup = await issueAssignmentMakeup(
    teacher.id,
    open.id,
    {
      requestId: randomUUID(),
      studentIds: [student.id],
      expiresAt: new Date(Date.now() + 120_000),
    },
    context,
  );
  assert.equal(makeup.grants[0]?.reason, "");
  await extendAssignmentDeadline(
    teacher.id,
    open.id,
    {
      requestId: randomUUID(),
      dueAt: new Date(Date.now() + 240_000),
    },
    context,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: {
        targetId: scheduled.id,
        action: "ASSIGNMENT_SCHEDULE_CANCELLED",
      },
    }),
    1,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { targetId: deleteTarget.id, action: "ASSIGNMENT_DRAFT_DELETED" },
    }),
    1,
  );
  console.log(
    "PASS draft deletion, schedule cancellation, notification renewal, batch retry, and optional makeup/deadline reasons",
  );
  async function revoke(id: string, owner = teacher.id) {
    const current = await getTeacherAssignment(teacher.id, id);
    return revokeAssignment(
      owner,
      id,
      {
        action: "REVOKE",
        expectedUpdatedAt: current.updatedAt.toISOString(),
        reason: "发错作业",
      },
      context,
    );
  }
  const sourceInput = {
    ...draftInput,
    classroomId: second.id,
    title: "撤销误发验证",
  };
  const work = await createDraftAssignment(teacher.id, sourceInput);
  await publishAssignment(teacher.id, work.id);
  const submitted = await startOrResumeAttempt(
    student.id,
    work.id,
    randomUUID(),
  );
  await uploadSubmissionAttachment(
    actor(student),
    submitted.id,
    submitted.questions[0].id,
    screenshot(),
    context,
  );
  await submitStudentAssignment(student.id, submitted.id);
  const submittedQuestion = (await getTeacherAssignment(teacher.id, work.id))
    .questions[0];
  const concept = concepts[0];
  const node = await prisma.publishedKnowledgeGraphNode.findFirstOrThrow({
    where: { graphVersionId: graph.id, conceptId: concept.id },
  });
  await prisma.assignmentQuestionConceptSnapshot.create({
    data: {
      assignmentId: work.id,
      assignmentQuestionId: submittedQuestion.id,
      questionId: submittedQuestion.questionId,
      courseId: course.id,
      conceptId: concept.id,
      bindingType: "PRIMARY",
      bindingSetRevision: 1,
      sourceGraphVersionId: graph.id,
      sourceNodeId: node.id,
      publishedGraphVersionId: graph.id,
      resolvedNodeId: node.id,
      resolutionStatus: "RESOLVED",
    },
  });
  const workDetail = await getTeacherSubmissionForGrading(
    teacher.id,
    work.id,
    submitted.id,
  );
  await saveManualAnswerGrade(
    teacher.id,
    work.id,
    submitted.id,
    workDetail.answers[0].id,
    { score: 70, feedback: "" },
  );
  const masteryWhere = {
    studentId_courseId: { studentId: student.id, courseId: course.id },
  };
  const beforeMastery =
    await prisma.studentCourseConceptMasteryState.findUniqueOrThrow({
      where: masteryWhere,
      include: {
        revisions: {
          orderBy: { revisionNumber: "desc" },
          take: 1,
          include: { entries: true },
        },
      },
    });
  assert.ok(
    beforeMastery.revisions[0].entries.some(
      (entry) => entry.conceptId === concept.id,
    ),
  );
  const job = await prisma.backgroundJob.create({
    data: {
      type: "PROGRAMMING_JUDGE",
      idempotencyKey: randomUUID(),
      inputFingerprint: "a".repeat(64),
      input: {},
    },
  });
  const limits = {
    cpuTimeMs: 1000,
    wallTimeMs: 2000,
    memoryBytes: 67108864,
    outputBytes: 16384,
    processCount: 4,
  };
  const config = await prisma.programmingQuestionConfigRevision.create({
    data: {
      ...limits,
      questionId: submittedQuestion.questionId,
      revisionNumber: 1,
      standardCode: "print(1)",
      starterCode: "",
      totalPoints: 100,
      testCasesHash: "a".repeat(64),
      configurationHash: "b".repeat(64),
      executorRuleVersion: "test",
      createdById: teacher.id,
    },
  });
  const configSnapshot =
    await prisma.assignmentProgrammingConfigSnapshot.create({
      data: {
        ...limits,
        assignmentQuestionId: submittedQuestion.id,
        configRevisionId: config.id,
        configRevisionNumber: config.revisionNumber,
        configurationHash: config.configurationHash,
        testCasesHash: config.testCasesHash,
        executorRuleVersion: config.executorRuleVersion,
      },
    });
  const queued = await prisma.programmingAttempt.create({
    data: {
      studentAnswerId: workDetail.answers[0].id,
      configSnapshotId: configSnapshot.id,
      assignmentQuestionId: submittedQuestion.id,
      studentId: student.id,
      createdById: student.id,
      kind: "FORMAL_JUDGE",
      revisionNumber: 1,
      sourceCode: "pass",
      inputFingerprint: "b".repeat(64),
      ruleVersion: "revoke-test",
      maxScore: 100,
      backgroundJobId: job.id,
    },
  });
  const missing = await createDraftAssignment(teacher.id, sourceInput);
  await publishAssignment(teacher.id, missing.id);
  await prisma.assignment.updateMany({
    where: { id: { in: [work.id, missing.id] } },
    data: { dueAt: new Date(Date.now() - 1) },
  });
  const grant = await issueAssignmentMakeup(
    teacher.id,
    work.id,
    {
      requestId: randomUUID(),
      studentIds: [student.id],
      expiresAt: new Date(Date.now() + 60_000),
    },
    context,
  );
  const secondResults = teacherResultsOverviewQuerySchema.parse({
    classroomId: second.id,
  });
  const beforeRevoke = (
    await listTeacherResultsOverview(teacher.id, secondResults)
  ).items;
  assert.equal(
    beforeRevoke.find((item) => item.id === work.id)?.submittedCount,
    1,
  );
  assert.equal(
    beforeRevoke.find((item) => item.id === missing.id)?.studentCount,
    1,
  );
  await assert.rejects(() => revoke(work.id, otherTeacher.id), /作业不存在/);
  await assert.rejects(() => revoke(draft.id), /成绩公布或台账/);
  await assert.rejects(() => revoke(otherClass.id), /仅可撤销/);
  await revoke(work.id);
  await revoke(work.id);
  assert.equal(
    (await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } }))
      .status,
    "CANCELLED",
  );
  assert.equal(
    (
      await prisma.programmingAttempt.findUniqueOrThrow({
        where: { id: queued.id },
      })
    ).status,
    "CANCELLED",
  );
  assert.equal(
    await prisma.studentAnswerConceptEvidence.count({
      where: { assignmentId: work.id },
    }),
    1,
  );
  const afterMastery =
    await prisma.studentCourseConceptMasteryState.findUniqueOrThrow({
      where: masteryWhere,
      include: {
        revisions: {
          orderBy: { revisionNumber: "desc" },
          take: 1,
          include: { entries: true },
        },
      },
    });
  assert.ok(
    !afterMastery.revisions[0].entries.some(
      (entry) => entry.conceptId === concept.id,
    ),
  );
  assert.ok(
    afterMastery.revisions[0].revisionNumber >
      beforeMastery.revisions[0].revisionNumber,
  );

  const missingVersion = (
    await getTeacherAssignment(teacher.id, missing.id)
  ).updatedAt.toISOString();
  const requestWithoutReason = {
    action: "REVOKE",
    expectedUpdatedAt: missingVersion,
  };
  assert.equal(
    revokeAssignmentSchema.parse({ ...requestWithoutReason, reason: "  " })
      .reason,
    "",
  );
  assert.equal(
    revokeAssignmentSchema.parse({ ...requestWithoutReason, reason: "误" })
      .reason,
    "误",
  );
  assert.equal(
    revokeAssignmentSchema.safeParse({
      ...requestWithoutReason,
      reason: "误".repeat(501),
    }).success,
    false,
  );
  await revokeAssignment(
    teacher.id,
    missing.id,
    revokeAssignmentSchema.parse(requestWithoutReason),
    context,
  );
  const auditWithoutReason = await prisma.auditLog.findFirstOrThrow({
    where: { targetId: missing.id, action: "ASSIGNMENT_REVOKED" },
  });
  const auditData = auditWithoutReason.afterData;
  assert.ok(
    auditData && typeof auditData === "object" && !Array.isArray(auditData),
  );
  assert.equal(auditData.status, "REVOKED");
  assert.equal(auditData.reason, "");
  assert.equal(
    (
      await prisma.assignmentMakeupGrant.findUniqueOrThrow({
        where: { id: grant.grants[0].id },
      })
    ).status,
    "REVOKED",
  );
  const afterRevoke = (
    await listTeacherResultsOverview(teacher.id, secondResults)
  ).items;
  assert.ok(
    !afterRevoke.some((item) => item.id === work.id || item.id === missing.id),
  );
  assert.ok(
    !(await listStudentAssignments(student.id, course.id, second.id)).some(
      (item) => item.id === work.id || item.id === missing.id,
    ),
  );
  await assert.rejects(
    () => getStudentAssignment(student.id, work.id),
    /已撤销/,
  );
  await assert.rejects(
    () => getStudentSubmissionResult(student.id, submitted.id),
    /已撤销/,
  );
  await assert.rejects(
    () => listSubmissionAttachments(actor(student), submitted.id),
    /已撤销/,
  );
  const detail = await getTeacherSubmissionForGrading(
    teacher.id,
    work.id,
    submitted.id,
  );
  assert.equal(detail.status, "PENDING_REVIEW");
  await assert.rejects(
    () =>
      saveManualAnswerGrade(
        teacher.id,
        work.id,
        submitted.id,
        detail.answers[0].id,
        { score: 50, feedback: "" },
      ),
    /已撤销/,
  );
  await assert.rejects(() =>
    publishAssignmentResults(teacher.id, work.id, context),
  );
  const history = await listTeacherAssignments(
    teacher.id,
    assignmentListQuerySchema.parse({
      classroomId: second.id,
      status: "REVOKED",
    }),
  );
  assert.equal(
    history.items.filter((item) => [work.id, missing.id].includes(item.id))
      .length,
    2,
  );
  const copyRequestId = randomUUID();
  const copy = await copyRevokedAssignment(teacher.id, work.id, copyRequestId);
  assert.equal(
    (await copyRevokedAssignment(teacher.id, work.id, copyRequestId))
      .assignmentId,
    copy.assignmentId,
  );
  assert.equal(
    (await getTeacherAssignment(teacher.id, copy.assignmentId)).status,
    "DRAFT",
  );
  assert.equal(
    await prisma.submission.count({
      where: { assignmentId: copy.assignmentId },
    }),
    0,
  );
  assert.equal(
    await prisma.notification.count({
      where: {
        sourceId: work.id,
        type: "ASSIGNMENT_REVOKED",
        recipientId: student.id,
      },
    }),
    1,
  );
  assert.equal(
    (
      await notifyAssignmentsDueSoon([
        {
          assignmentId: work.id,
          assignmentTitle: "撤销误发验证",
          recipientId: student.id,
          dueAt: new Date(Date.now() + 60_000),
        },
      ])
    ).createdCount,
    0,
  );
  const racing = await createDraftAssignment(teacher.id, sourceInput);
  await publishAssignment(teacher.id, racing.id);
  const raceAttempt = await startOrResumeAttempt(
    student.id,
    racing.id,
    randomUUID(),
  );
  await uploadSubmissionAttachment(
    actor(student),
    raceAttempt.id,
    raceAttempt.questions[0].id,
    screenshot(),
    context,
  );
  const version = (
    await getTeacherAssignment(teacher.id, racing.id)
  ).updatedAt.toISOString();
  const race = await Promise.allSettled([
    revokeAssignment(
      teacher.id,
      racing.id,
      { action: "REVOKE", expectedUpdatedAt: version, reason: "发错作业" },
      context,
    ),
    submitStudentAssignment(student.id, raceAttempt.id),
  ]);
  assert.equal(
    race.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const publicationRace = await createDraftAssignment(teacher.id, sourceInput);
  await publishAssignment(teacher.id, publicationRace.id);
  const publicationAttempt = await startOrResumeAttempt(
    student.id,
    publicationRace.id,
    randomUUID(),
  );
  await uploadSubmissionAttachment(
    actor(student),
    publicationAttempt.id,
    publicationAttempt.questions[0].id,
    screenshot(),
    context,
  );
  await submitStudentAssignment(student.id, publicationAttempt.id);
  const publicationDetail = await getTeacherSubmissionForGrading(
    teacher.id,
    publicationRace.id,
    publicationAttempt.id,
  );
  await saveManualAnswerGrade(
    teacher.id,
    publicationRace.id,
    publicationAttempt.id,
    publicationDetail.answers[0].id,
    { score: 80, feedback: "" },
  );
  await completeSubmissionGrading(
    teacher.id,
    publicationRace.id,
    publicationAttempt.id,
    context,
  );
  const publishReady = await prisma.assignment.update({
    where: { id: publicationRace.id },
    data: { dueAt: new Date(Date.now() - 1) },
  });
  const publicationResults = await Promise.allSettled([
    revokeAssignment(
      teacher.id,
      publicationRace.id,
      {
        action: "REVOKE",
        expectedUpdatedAt: publishReady.updatedAt.toISOString(),
        reason: "误发撤销",
      },
      context,
    ),
    publishAssignmentResults(teacher.id, publicationRace.id, context),
  ]);
  assert.equal(
    publicationResults.filter((result) => result.status === "fulfilled").length,
    1,
  );
  await prisma.assignment.update({
    where: { id: otherClass.id },
    data: { status: "ARCHIVED", publishedAt: new Date(Date.now() - 1000) },
  });
  await assert.rejects(() => revoke(otherClass.id), /未归档/);

  console.log(
    "PASS revoke with and without submissions, student visibility, counts, read-only access, copy, notices, and submit race",
  );
  const historyNow = new Date(Date.now() + 7_200_000);
  const at = (delta: number) => new Date(historyNow.getTime() + delta);
  const historyRecords = [
    {
      title: "甲班最近已开放",
      classroomId: first.id,
      status: "PUBLISHED",
      publishedAt: at(-1000),
      category: "COURSE_EXPERIMENT",
    },
    {
      title: "乙班最近已开放",
      classroomId: second.id,
      status: "CLOSED",
      publishedAt: at(-1500),
    },
    {
      title: "甲班预约",
      classroomId: first.id,
      status: "PUBLISHED",
      publishedAt: at(1000),
    },
    {
      title: "甲班已撤销",
      classroomId: first.id,
      status: "REVOKED",
      publishedAt: at(-500),
    },
    {
      title: "甲班草稿",
      classroomId: first.id,
      status: "DRAFT",
      publishedAt: at(-300),
    },
    {
      title: "乙班草稿",
      classroomId: second.id,
      status: "DRAFT",
      publishedAt: at(-300),
    },
    {
      title: "甲班已删除草稿",
      classroomId: first.id,
      status: "DRAFT",
      publishedAt: at(-200),
      deletedAt: at(-100),
    },
  ] as const;
  await prisma.assignment.createMany({
    data: historyRecords.map((record) => ({
      ...record,
      teacherId: teacher.id,
      updatedAt: historyNow,
    })),
  });
  const creation = await getAssignmentCreationContext(
    teacher.id,
    first.id,
    historyNow,
  );
  assert.equal(
    creation.lastPublishedByClassroom[first.id]?.title,
    "甲班最近已开放",
  );
  assert.equal(
    creation.lastPublishedByClassroom[first.id]?.category,
    "COURSE_EXPERIMENT",
  );
  assert.equal(
    creation.lastPublishedByClassroom[second.id]?.title,
    "乙班最近已开放",
  );
  assert.equal(creation.recentDrafts[0]?.title, "甲班草稿");
  assert.ok(
    creation.recentDrafts.every(
      (item) =>
        item.classroom.name === first.name && item.title !== "甲班已删除草稿",
    ),
  );
  const allDrafts = await getAssignmentCreationContext(
    teacher.id,
    undefined,
    historyNow,
  );
  assert.ok(allDrafts.recentDrafts.some((item) => item.title === "乙班草稿"));
  const outsiderCreation = await getAssignmentCreationContext(
    otherTeacher.id,
    first.id,
    historyNow,
  );
  assert.equal(outsiderCreation.lastPublishedByClassroom[first.id], undefined);
  assert.deepEqual(outsiderCreation.recentDrafts, []);
  console.log(
    "PASS creation context: latest opened work per class, scheduled/revoked exclusion, editable drafts, and teacher isolation",
  );
  await prisma.course.update({
    where: { id: course.id },
    data: { currentPublishedKnowledgeGraphVersionId: graph.id },
  });
  const bankQuestion = async (
    title: string,
    conceptId: string,
    type: "TRUE_FALSE" | "SHORT_ANSWER",
  ) => {
    const bound = await prisma.publishedKnowledgeGraphNode.findFirstOrThrow({
      where: { graphVersionId: graph.id, conceptId },
    });
    const question = await prisma.question.create({
      data: {
        creatorId: teacher.id,
        questionCategoryId: course.questionCategoryId,
        title,
        content: "这是题干",
        type,
        difficulty: 2,
        status: "ACTIVE",
        explanation: "参考说明",
        ...(type === "TRUE_FALSE"
          ? { correctBoolean: true }
          : { referenceAnswer: "参考答案" }),
      },
    });
    await prisma.questionKnowledgeGraphBindingSet.create({
      data: {
        questionId: question.id,
        courseId: course.id,
        bindings: {
          create: {
            questionId: question.id,
            courseId: course.id,
            conceptId,
            sourceGraphVersionId: graph.id,
            sourceNodeId: bound.id,
            bindingType: "PRIMARY",
            createdById: teacher.id,
          },
        },
      },
    });
    return question;
  };
  const repeated = await bankQuestion(
    "最近用过的判断题",
    concepts[0].id,
    "TRUE_FALSE",
  );
  const fresh = await bankQuestion(
    "未用过的判断题",
    concepts[0].id,
    "TRUE_FALSE",
  );
  const written = await bankQuestion(
    "未用过的简答题",
    concepts[1].id,
    "SHORT_ANSWER",
  );
  const bankInput = assignmentUpsertSchema.parse({
    category: "PRACTICE",
    title: "题型配分验收",
    classroomId: first.id,
    publishedAt: new Date(Date.now() - 60_000),
    dueAt: new Date(Date.now() + 3_600_000),
    questions: [
      { questionId: repeated.id, sortOrder: 1, points: 40 },
      { questionId: written.id, sortOrder: 2, points: 60 },
    ],
    scoreTarget: 100,
  });
  assert.equal(
    assignmentUpsertSchema.safeParse({ ...bankInput, scoreTarget: 99 }).success,
    false,
  );
  const previous = await createDraftAssignment(teacher.id, bankInput);
  await publishAssignment(teacher.id, previous.id);
  await prisma.assignment.update({
    where: { id: previous.id },
    data: { dueAt: new Date(Date.now() - 1000) },
  });
  const proposal = await assembleAssignmentReview(
    teacher.id,
    {
      action: "ASSEMBLE",
      classroomIds: [first.id, second.id],
      conceptIds: concepts.map((c) => c.id),
      types: ["TRUE_FALSE", "SHORT_ANSWER"],
      difficulty: 2,
      count: 2,
      excludedIds: [],
    },
    context,
  );
  assert.deepEqual(
    new Set(proposal.questions.map((q) => q.id)),
    new Set([fresh.id, written.id]),
  );
  assert.ok(
    proposal.alternatives.some(
      (q) => q.id === repeated.id && q.recentClassrooms.includes(first.name),
    ),
  );
  assert.deepEqual(proposal.missingConceptNames, []);
  await assert.rejects(
    () =>
      assembleAssignmentReview(
        otherTeacher.id,
        {
          action: "ASSEMBLE",
          classroomIds: [first.id],
          conceptIds: [concepts[0].id],
          types: [],
          count: 1,
          excludedIds: [],
        },
        context,
      ),
    /课程或班级不存在/,
  );
  const preflight = await previewAssignmentPublication(teacher.id, {
    action: "PREFLIGHT",
    classroomIds: [first.id, second.id],
    assignment: bankInput,
  });
  assert.equal(preflight.totalPoints, 100);
  assert.deepEqual(
    preflight.classrooms.map((room) => [
      room.sameTitleCount,
      room.recentQuestionCount,
    ]),
    [
      [1, 2],
      [0, 0],
    ],
  );
  const teacherResource = await uploadAssignmentResource(
    teacher.id,
    course.id,
    new File(["组卷预检附件"], "附件.txt", { type: "text/plain" }),
    context,
  );
  assert.ok(teacherResource);
  const taskPreview = {
    action: "PREFLIGHT" as const,
    classroomIds: [first.id],
    assignment: assignmentUpsertSchema.parse({
      ...draftInput,
      submissionTask: {
        ...draftInput.submissionTask,
        resourceFileIds: [teacherResource.id],
      },
    }),
  };
  assert.equal(
    (await previewAssignmentPublication(teacher.id, taskPreview)).resourceCount,
    1,
  );
  const storedFile = await prisma.courseFileVersion.findUniqueOrThrow({
    where: { id: teacherResource.id },
    select: { storageKey: true },
  });
  await getStorageService().delete(storedFile.storageKey);
  await assert.rejects(
    () => previewAssignmentPublication(teacher.id, taskPreview),
    /附件无法读取/,
  );
  const copyId = randomUUID();
  const historyCopy = await copyHistoricalAssignment(
    teacher.id,
    previous.id,
    copyId,
    second.id,
  );
  assert.equal(
    (await copyHistoricalAssignment(teacher.id, previous.id, copyId, second.id))
      .assignmentId,
    historyCopy.assignmentId,
  );
  const restored = await getTeacherAssignment(
    teacher.id,
    historyCopy.assignmentId,
  );
  assert.equal(restored.classroom.id, second.id);
  assert.equal(restored.status, "DRAFT");
  assert.equal(restored.publishedAt, null);
  assert.deepEqual(
    restored.questions.map((q) => [q.questionId, q.points]),
    [
      [repeated.id, 40],
      [written.id, 60],
    ],
  );
  assert.equal(
    await prisma.submission.count({ where: { assignmentId: restored.id } }),
    0,
  );
  console.log(
    "PASS assignment assembly scope, history, alternatives, preflight, score target, and history copy",
  );
  assert.equal(actor(student).role, Role.STUDENT);
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
