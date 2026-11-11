import { getStudentExamTasks } from "@/services/dashboard/student-exam-tasks";
import { getStudentClassAnalytics } from "@/services/dashboard/student-class-analytics";
import { getStudentExamClassAverage } from "@/services/exams/student-score-context";
import { getStudentTaskOverview } from "@/services/dashboard/student-task-service";
import { listPublishedExamScores } from "@/services/course-analytics/exam-scores";
import {
  correctTeacherGradeEntry,
  createTeacherCourseGradebook,
  publishTeacherGradebook,
} from "@/services/gradebook/service";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { Prisma, Role } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import {
  getStudentSubmissionResult,
  saveStudentAnswers,
  startOrResumeAttempt,
  submitStudentAssignment,
} from "@/services/assignments/service";
import { claimBackgroundJobById } from "@/services/background-jobs/repository";
import { createBackgroundJob } from "@/services/background-jobs/repository";
import {
  createPaperDraft,
  cropPaperDraftImage,
  getPaperDraft,
  removePaperDraftQuestion,
  reviewPaperDraftQuestion,
  reviewAllPaperDraftQuestions,
  retryPaperDraft,
  updatePaperDraftConfig,
  updatePaperDraftQuestion,
} from "@/services/exams/paper-drafts";
import { publishPaperDraft } from "@/services/exams/paper-publish";
import { executeClaimedExamPaperJob } from "@/services/exams/paper-worker";
import { EXAM_PAPER_JOB_TYPE } from "@/services/exams/paper-ai";
import { readAssignmentQuestionImage } from "@/services/exams/paper-images";
import { getTeacherExamDetails } from "@/services/exams/analysis";
import {
  publishDueExamResults,
  setExamResultPublication,
} from "@/services/exams/result-management";
import { getStudentExamReport } from "@/services/exams/student-report";
import { paperDraftQuestionSchema } from "@/services/exams/paper-schemas";
import {
  cancelExamSession,
  createExamSession,
  getStudentExamAttemptStatus,
  listEligibleExamQuestions,
  listTeacherExams,
  recordExamSwitch,
} from "@/services/exams/service";
import { examCreateSchema } from "@/services/exams/schemas";
import { QUESTION_OBJECTIVE_JOB_TYPE } from "@/services/question-objectives/schemas";
import { executeClaimedQuestionObjectiveJob } from "@/services/question-objectives/worker";
import {
  saveQuestionCourseObjective,
  listQuestionObjectiveCourses,
} from "@/services/question-objectives/editing";
import { publishExamTestSyllabus } from "./syllabus-fixture";

async function main() {
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
  });
  const other = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher2@example.com" },
  });
  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student@example.com" },
  });
  const template = await prisma.courseTemplate.findFirstOrThrow();
  const category = await prisma.questionCourseCategory.create({
    data: {
      id: `qc_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
      name: "考试集成分类",
      normalizedName: `exam-${randomUUID()}`,
    },
  });
  const course = await prisma.course.create({
    data: {
      teacherId: teacher.id,
      templateId: template.id,
      questionCategoryId: category.id,
      name: "考试集成课程",
      courseNo: `EX-${randomUUID().slice(0, 6)}`,
      term: "2026",
      status: "ACTIVE",
    },
  });
  await assert.rejects(
    createPaperDraft(
      teacher.id,
      course.id,
      new File(["test"], "test.txt", { type: "text/plain" }),
      { ipAddress: null, userAgent: null },
    ),
  );
  const publishedSyllabus = await publishExamTestSyllabus(
    prisma,
    course.id,
    teacher.id,
  );
  const first = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "考试一班",
      joinCode: randomUUID(),
      memberships: { create: { studentId: student.id } },
    },
  });
  const second = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "考试二班",
      joinCode: randomUUID(),
    },
  });
  const examScope = { courseId: course.id, classroomId: first.id };
  const audit = { ipAddress: null, userAgent: null };
  const draftScheme = await prisma.assessmentSchemeDraft.create({
    data: {
      courseId: course.id,
      createdById: teacher.id,
      structureJson: {},
      sourceFingerprint: "a".repeat(64),
    },
  });
  const review = await prisma.assessmentSchemeReviewRevision.create({
    data: {
      draftId: draftScheme.id,
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
      sourcePublishedSyllabusStructureId: publishedSyllabus.id,
      publishedById: teacher.id,
      versionNumber: 1,
      structureJson: {},
      sourceFingerprint: "a".repeat(64),
      calculationRuleVersion: "test",
      components: {
        create: {
          code: "FINAL",
          name: "期末成绩录入",
          type: "FINAL_EXAM",
          fullScore: 100,
          weight: 100,
          sourceType: "MANUAL",
          sortOrder: 1,
          sourceJson: [],
          rubricJson: [],
        },
      },
    },
  });
  await prisma.course.update({
    where: { id: course.id },
    data: { currentPublishedAssessmentSchemeId: scheme.id },
  });
  const book = await createTeacherCourseGradebook(
    teacher.id,
    course.id,
    first.id,
    audit,
  );
  const gradeItem = await prisma.gradeItem.findFirstOrThrow({
    where: { gradebookId: book.id },
  });
  await correctTeacherGradeEntry(
    teacher.id,
    book.id,
    gradeItem.id,
    student.id,
    {
      status: "SCORED",
      score: 46.2,
      reason: "录入线下考核成绩",
      idempotencyKey: randomUUID(),
      expectedRevisionNumber: 0,
    },
    audit,
  );
  await publishTeacherGradebook(teacher.id, book.id, audit);
  const ledger = await listPublishedExamScores([first.id], student.id);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].score, 46.2);
  assert.equal(ledger[0].assignmentId, null);
  const noOnlineExam = await getStudentClassAnalytics(student.id, examScope);
  assert.deepEqual(noOnlineExam.exams, {
    recent: null,
    missed: 0,
    scoredCount: 0,
    average: null,
  });
  assert.equal(noOnlineExam.classes[0].total, 0);
  assert.equal(noOnlineExam.classes[0].average, 46.2);
  const content = `不可重复题干 ${randomUUID()}`;
  const question = await prisma.question.create({
    data: {
      creatorId: teacher.id,
      questionCategoryId: category.id,
      title: "考试题",
      content,
      type: "FILL_BLANK",
      status: "ACTIVE",
      explanation: "解析",
      acceptableAnswers: ["答案"],
    },
  });
  const duplicate = await prisma.question.create({
    data: {
      creatorId: teacher.id,
      questionCategoryId: category.id,
      title: "重复导入的题",
      content: ` ${content} `,
      type: "FILL_BLANK",
      status: "ACTIVE",
      explanation: "解析",
      acceptableAnswers: ["答案"],
    },
  });
  const future = new Date(Date.now() + 60_000);
  const input = examCreateSchema.parse({
    requestId: randomUUID(),
    courseId: course.id,
    classroomIds: [first.id, second.id],
    type: "MIDTERM",
    title: "期中考试",
    startsAt: future,
    endsAt: new Date(Date.now() + 3_600_000),
    allowedSwitches: 0,
    questions: [{ questionId: question.id, points: 100 }],
  });
  await assert.rejects(createExamSession(other.id, input));
  const exam = await createExamSession(teacher.id, input);
  const upcomingDetails = await getTeacherExamDetails(teacher.id, exam.id);
  assert.equal(upcomingDetails.analysis, null);
  assert.equal(upcomingDetails.exam.assignments.length, 2);
  assert.equal(exam.assignments.length, 2);
  const pendingObjectiveUse = await prisma.examQuestionUse.findFirstOrThrow({
    where: { examSessionId: exam.id, questionId: question.id },
  });
  assert.equal(pendingObjectiveUse.objectiveCode, null);
  assert.equal(pendingObjectiveUse.syllabusStructureId, publishedSyllabus.id);
  const beforeExam = await getStudentExamTasks(
    student.id,
    new Date(exam.startsAt.getTime() - 1),
  );
  assert.equal(beforeExam.filter((item) => item.status === "TODO").length, 0);
  assert.equal(beforeExam.length, 1);
  assert.equal(beforeExam[0].status, "UPCOMING");
  assert.match(beforeExam[0].href, /^\/student\/exams\?.*focus=.+#exam-/u);
  const duringExam = await getStudentTaskOverview(student.id, exam.startsAt, {
    courseId: course.id,
    classroomId: first.id,
  });
  assert.equal(duringExam.counts.exam, 1);
  assert.equal(duringExam.counts.assignment, 0);
  assert.equal(duringExam.items[0].kind, "exam");
  assert.ok(!JSON.stringify(duringExam).includes(content));
  assert.equal((await getStudentExamTasks(other.id, exam.startsAt)).length, 0);
  assert.equal((await getStudentExamTasks(student.id, exam.endsAt)).length, 0);
  const ownAssignment = exam.assignments.find(
    (a) => a.classroomId === first.id,
  );
  assert.ok(ownAssignment);
  const missed = await getStudentClassAnalytics(
    student.id,
    examScope,
    exam.endsAt,
  );
  assert.equal(missed.exams.missed, 1);
  assert.equal(missed.exams.recent?.resultState, "MISSED");
  assert.equal(missed.classes[0].total, 1);
  assert.equal(missed.classes[0].assignmentProgress.total, 0);
  const submittedFixture = await prisma.submission.create({
    data: {
      assignmentId: ownAssignment.id,
      studentId: student.id,
      status: "SUBMITTED",
      idempotencyKey: randomUUID(),
    },
  });
  assert.equal(
    (await getStudentExamTasks(student.id, exam.startsAt)).length,
    0,
  );
  await prisma.submission.update({
    where: { id: submittedFixture.id },
    data: { status: "GRADED", score: 0, maxScore: 100, percentage: 0 },
  });
  const awaiting = await getStudentClassAnalytics(
    student.id,
    examScope,
    exam.endsAt,
  );
  assert.equal(awaiting.exams.recent?.resultState, "AWAITING");
  assert.equal(awaiting.exams.average, null);
  await prisma.submission.update({
    where: { id: submittedFixture.id },
    data: { status: "PUBLISHED", publishedAt: exam.endsAt },
  });
  const publishedHome = await getStudentClassAnalytics(
    student.id,
    examScope,
    exam.endsAt,
  );
  assert.equal(publishedHome.exams.average, 0);
  assert.equal(publishedHome.exams.scoredCount, 1);
  assert.equal(
    publishedHome.exams.recent?.publishedSubmissionId,
    submittedFixture.id,
  );
  assert.equal(
    await getStudentExamClassAverage(
      student.id,
      ownAssignment.id,
      first.id,
      exam.endsAt,
    ),
    null,
  );
  await prisma.submission.delete({ where: { id: submittedFixture.id } });
  await prisma.examSession.update({
    where: { id: exam.id },
    data: { cancelledAt: new Date() },
  });
  assert.equal(
    (await getStudentExamTasks(student.id, exam.startsAt)).length,
    0,
  );
  await prisma.examSession.update({
    where: { id: exam.id },
    data: { cancelledAt: null },
  });
  await prisma.classroom.update({
    where: { id: first.id },
    data: { status: "COMPLETED" },
  });
  assert.equal(
    (await getStudentExamTasks(student.id, exam.startsAt)).length,
    0,
  );
  await prisma.classroom.update({
    where: { id: first.id },
    data: { status: "ACTIVE" },
  });
  console.log(
    "Exam task boundaries, ownership, submission, cancellation and classroom state passed",
  );

  const scopedExams = await listTeacherExams(teacher.id, {
    courseId: course.id,
    classroomId: first.id,
  });
  assert.equal(scopedExams.length, 1);
  assert.equal(scopedExams[0].id, exam.id);
  assert.equal(scopedExams[0].assignments.length, 1);
  assert.equal(scopedExams[0].assignments[0].classroom.name, first.name);
  const statusIds = async (
    status: "UPCOMING" | "IN_PROGRESS" | "ENDED",
    now: Date,
  ) =>
    (
      await listTeacherExams(teacher.id, { courseId: course.id, status }, now)
    ).map(({ id }) => id);
  assert.deepEqual(
    await statusIds("UPCOMING", new Date(exam.startsAt.getTime() - 1)),
    [exam.id],
  );
  assert.deepEqual(await statusIds("IN_PROGRESS", exam.startsAt), [exam.id]);
  assert.deepEqual(await statusIds("ENDED", exam.endsAt), [exam.id]);
  assert.deepEqual(
    (
      await listTeacherExams(teacher.id, {
        courseId: course.id,
        keyword: "期中",
        type: "MIDTERM",
      })
    ).map(({ id }) => id),
    [exam.id],
  );
  assert.equal(
    (
      await listTeacherExams(teacher.id, {
        courseId: course.id,
        keyword: "期中",
        type: "FINAL",
      })
    ).length,
    0,
  );
  await assert.rejects(listTeacherExams(other.id, { courseId: course.id }));
  await assert.rejects(listTeacherExams(other.id, { classroomId: first.id }));
  await assert.rejects(listTeacherExams(teacher.id, { courseId: "invalid" }));
  const emptyCourse = await prisma.course.create({
    data: {
      teacherId: teacher.id,
      templateId: template.id,
      name: "无考试课程",
      questionCategoryId: category.id,
      courseNo: `EMPTY-${randomUUID().slice(0, 6)}`,
      term: "2026",
      status: "ACTIVE",
    },
  });
  assert.equal(
    (await listTeacherExams(teacher.id, { courseId: emptyCourse.id })).length,
    0,
  );
  await assert.rejects(
    listTeacherExams(teacher.id, {
      courseId: emptyCourse.id,
      classroomId: first.id,
    }),
  );
  assert.equal((await createExamSession(teacher.id, input)).id, exam.id);
  await assert.rejects(
    createExamSession(teacher.id, { ...input, title: "其他试卷" }),
  );
  const eligible = await listEligibleExamQuestions(teacher.id, {
    courseId: course.id,
    startsAt: future,
  });
  assert.equal(eligible.find((item) => item.id === question.id)?.blocked, true);
  assert.equal(
    eligible.find((item) => item.id === duplicate.id)?.blocked,
    true,
  );
  await assert.rejects(
    createExamSession(teacher.id, {
      ...input,
      requestId: randomUUID(),
      questions: [{ questionId: duplicate.id, points: 100 }],
    }),
  );
  await cancelExamSession(teacher.id, exam.id);
  assert.deepEqual(
    (
      await listTeacherExams(teacher.id, {
        courseId: course.id,
        status: "CANCELLED",
      })
    ).map(({ id }) => id),
    [exam.id],
  );
  assert.equal(
    (await getTeacherExamDetails(teacher.id, exam.id)).analysis,
    null,
  );
  assert.equal(
    (
      await listEligibleExamQuestions(teacher.id, {
        courseId: course.id,
        startsAt: future,
      })
    ).find((item) => item.id === question.id)?.blocked,
    false,
  );
  const live = await createExamSession(teacher.id, {
    ...input,
    requestId: randomUUID(),
    classroomIds: [first.id, second.id],
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 3_600_000),
  });
  const firstLive = live.assignments.find(
    (item) => item.classroomId === first.id,
  );
  const secondLive = live.assignments.find(
    (item) => item.classroomId === second.id,
  );
  assert.ok(firstLive && secondLive);
  const attempt = await startOrResumeAttempt(
    student.id,
    firstLive.id,
    randomUUID(),
  );
  assert.equal(
    (await getStudentExamAttemptStatus(student.id, attempt.id)).state,
    "WORKING",
  );
  await assert.rejects(getStudentExamAttemptStatus(other.id, attempt.id));
  await assert.rejects(
    submitStudentAssignment(student.id, attempt.id, "EXAM_AUTO"),
  );
  const switched = await recordExamSwitch(student.id, attempt.id, randomUUID());
  assert.equal(switched.shouldSubmit, true);
  const saved = await prisma.submission.findUniqueOrThrow({
    where: { id: attempt.id },
  });
  assert.notEqual(saved.status, "IN_PROGRESS");
  assert.equal(saved.examSubmissionReason, "SWITCH_LIMIT");
  const collected = await getStudentExamAttemptStatus(student.id, attempt.id);
  assert.equal(collected.state, "COLLECTED");
  assert.equal(collected.switches, 1);
  assert.equal(
    (await submitStudentAssignment(student.id, attempt.id, "EXAM_AUTO"))
      .examReceipt?.reason,
    "SWITCH_LIMIT",
  );
  const [manualStudent, timedStudent] = await Promise.all(
    ["student2@example.com", "student3@example.com"].map((email) =>
      prisma.user.findUniqueOrThrow({ where: { email } }),
    ),
  );
  await prisma.classMembership.createMany({
    data: [manualStudent, timedStudent].map(({ id }) => ({
      classroomId: second.id,
      studentId: id,
    })),
  });
  const manual = await startOrResumeAttempt(
    manualStudent.id,
    secondLive.id,
    randomUUID(),
  );
  const timed = await startOrResumeAttempt(
    timedStudent.id,
    secondLive.id,
    randomUUID(),
  );
  const liveQuestion = await prisma.assignmentQuestion.findFirstOrThrow({
    where: { assignmentId: secondLive.id },
  });
  const savedAnswers = await saveStudentAnswers(manualStudent.id, manual.id, {
    version: 0,
    answers: [
      { assignmentQuestionId: liveQuestion.id, kind: "TEXT", value: "答案" },
    ],
  });
  const manualResult = await submitStudentAssignment(
    manualStudent.id,
    manual.id,
  );
  assert.deepEqual(manualResult.examReceipt, {
    reason: "MANUAL",
    lastSavedAt: savedAnswers.lastSavedAt,
    answeredCount: 1,
  });
  const cutoff = new Date(Date.now() - 1000);
  await prisma.examSession.update({
    where: { id: live.id },
    data: { endsAt: cutoff },
  });
  await prisma.assignment.update({
    where: { id: secondLive.id },
    data: { dueAt: cutoff },
  });
  await assert.rejects(
    saveStudentAnswers(timedStudent.id, timed.id, { version: 0, answers: [] }),
  );
  const timedResult = await submitStudentAssignment(
    timedStudent.id,
    timed.id,
    "EXAM_AUTO",
  );
  assert.equal(timedResult.examReceipt?.reason, "TIME_UP");
  assert.equal(timedResult.examReceipt?.answeredCount, 0);
  assert.equal(
    (await getStudentSubmissionResult(timedStudent.id, timed.id)).isPublished,
    false,
  );
  await setExamResultPublication(
    teacher.id,
    secondLive.id,
    { mode: "WHEN_READY" },
    { ipAddress: null, userAgent: "exam-integration" },
  );
  assert.equal(await publishDueExamResults(), 2);
  assert.equal(await publishDueExamResults(), 0);
  console.log(
    "Exam receipt reasons, accepted answer count and status ownership passed",
  );
  const paperText = `题号：1\n填空题 独立试卷题干 ${randomUUID()} ____\n答案：exam-answer\n解析：用于考试草稿集成测试。`;
  const context = { ipAddress: null, userAgent: "exam-integration" };
  async function parseDraft() {
    const uploaded = await createPaperDraft(
      teacher.id,
      course.id,
      new File([paperText], "exam.txt", { type: "text/plain" }),
      context,
    );
    await assert.rejects(getPaperDraft(other.id, uploaded.id));
    const claimed = await claimBackgroundJobById(uploaded.jobId, {
      workerId: "exam-integration",
      executorVersion: "test-v1",
      acceptedTypes: [EXAM_PAPER_JOB_TYPE],
      leaseDurationMs: 180_000,
    });
    assert.ok(claimed?.currentLeaseId);
    await executeClaimedExamPaperJob(uploaded.jobId, claimed.currentLeaseId, {
      draftId: uploaded.id,
      revision: 1,
    });
    const draft = await getPaperDraft(teacher.id, uploaded.id);
    assert.equal(draft.status, "READY");
    assert.equal(draft.questions.length, 1);
    assert.equal(draft.questions[0].reviewedRevision, null);
    return draft;
  }
  async function prepareDraft(draftId: string) {
    let draft = await getPaperDraft(teacher.id, draftId);
    const row = draft.questions[0];
    await assert.rejects(
      reviewPaperDraftQuestion(
        teacher.id,
        draftId,
        row.id,
        {
          expectedRevision: row.revision,
        },
        context,
      ),
    );
    await updatePaperDraftQuestion(
      teacher.id,
      draftId,
      row.id,
      {
        expectedRevision: row.revision,
        question: row.questionJson,
        points: 100,
      },
      context,
    );
    draft = await getPaperDraft(teacher.id, draftId);
    const invalid = await prisma.examPaperDraftQuestion.create({
      data: {
        draftId,
        ordinal: 2,
        sourceLocator: "测试缺失分值",
        questionJson: draft.questions[0].questionJson as Prisma.InputJsonObject,
        points: 10,
        pointsInferred: true,
      },
    });
    await assert.rejects(
      reviewAllPaperDraftQuestions(
        teacher.id,
        draftId,
        { expectedRevision: draft.revision },
        context,
      ),
      /第 2 题/u,
    );
    assert.equal(
      (await getPaperDraft(teacher.id, draftId)).questions[0].reviewedRevision,
      null,
    );
    await prisma.examPaperDraftQuestion.delete({ where: { id: invalid.id } });
    await reviewAllPaperDraftQuestions(
      teacher.id,
      draftId,
      { expectedRevision: draft.revision },
      context,
    );
    draft = await getPaperDraft(teacher.id, draftId);
    assert.equal(
      draft.questions[0].reviewedRevision,
      draft.questions[0].revision,
    );
    await updatePaperDraftConfig(teacher.id, draftId, {
      expectedRevision: draft.revision,
      type: "MIDTERM",
      title: "AI 试卷草稿发布",
      startsAt: new Date(Date.now() + 120_000),
      endsAt: new Date(Date.now() + 3_600_000),
      allowedSwitches: 1,
      classroomIds: [first.id, second.id],
    });
    return getPaperDraft(teacher.id, draftId);
  }
  const firstDraft = await prepareDraft((await parseDraft()).id);
  const draftRequestId = randomUUID();
  const published = await publishPaperDraft(
    teacher.id,
    firstDraft.id,
    {
      expectedRevision: firstDraft.revision,
      requestId: draftRequestId,
    },
    context,
  );
  assert.equal(published.assignments.length, 2);
  const frozenObjective = await prisma.examQuestionUse.findFirstOrThrow({
    where: { examSessionId: published.id },
  });
  assert.equal(frozenObjective.objectiveCode, "O1");
  assert.equal(frozenObjective.syllabusStructureId, publishedSyllabus.id);
  const genericJob = await createBackgroundJob({
    type: QUESTION_OBJECTIVE_JOB_TYPE,
    maxAttempts: 3,
    idempotencyKey: `${question.id}:base:${question.revision}`,
    input: {
      questionId: question.id,
      revision: question.revision,
      courseId: null,
      syllabusStructureId: null,
    },
  });
  const genericClaim = await claimBackgroundJobById(genericJob.id, {
    workerId: "exam-integration",
    executorVersion: "test-v1",
    acceptedTypes: [QUESTION_OBJECTIVE_JOB_TYPE],
    leaseDurationMs: 180_000,
  });
  assert.ok(genericClaim?.currentLeaseId);
  await executeClaimedQuestionObjectiveJob(
    genericJob.id,
    genericClaim.currentLeaseId,
    genericJob.input,
  );
  assert.equal(
    (await prisma.question.findUniqueOrThrow({ where: { id: question.id } }))
      .defaultObjectiveKind,
    "KNOWLEDGE",
  );
  const courseJob = await createBackgroundJob({
    type: QUESTION_OBJECTIVE_JOB_TYPE,
    maxAttempts: 3,
    courseId: course.id,
    idempotencyKey: `${question.id}:course:${course.id}:${publishedSyllabus.id}:${question.revision}`,
    input: {
      questionId: question.id,
      revision: question.revision,
      courseId: course.id,
      syllabusStructureId: publishedSyllabus.id,
    },
  });
  const courseClaim = await claimBackgroundJobById(courseJob.id, {
    workerId: "exam-integration",
    executorVersion: "test-v1",
    acceptedTypes: [QUESTION_OBJECTIVE_JOB_TYPE],
    leaseDurationMs: 180_000,
  });
  assert.ok(courseClaim?.currentLeaseId);
  await executeClaimedQuestionObjectiveJob(
    courseJob.id,
    courseClaim.currentLeaseId,
    courseJob.input,
  );
  assert.equal(
    (
      await prisma.questionCourseObjective.findUniqueOrThrow({
        where: {
          questionId_courseId_syllabusStructureId: {
            questionId: question.id,
            courseId: course.id,
            syllabusStructureId: publishedSyllabus.id,
          },
        },
      })
    ).objectiveCode,
    "O1",
  );
  await assert.rejects(
    saveQuestionCourseObjective(
      other.id,
      question.id,
      {
        courseId: course.id,
        syllabusStructureId: publishedSyllabus.id,
        objectiveCode: "O2",
        expectedObjectiveCode: "O1",
      },
      context,
    ),
  );
  await assert.rejects(
    saveQuestionCourseObjective(
      teacher.id,
      question.id,
      {
        courseId: course.id,
        syllabusStructureId: publishedSyllabus.id,
        objectiveCode: "OUTSIDE",
        expectedObjectiveCode: "O1",
      },
      context,
    ),
  );
  await saveQuestionCourseObjective(
    teacher.id,
    question.id,
    {
      courseId: course.id,
      syllabusStructureId: publishedSyllabus.id,
      objectiveCode: "O2",
      expectedObjectiveCode: "O1",
    },
    context,
  );
  await assert.rejects(
    saveQuestionCourseObjective(
      teacher.id,
      question.id,
      {
        courseId: course.id,
        syllabusStructureId: publishedSyllabus.id,
        objectiveCode: "O1",
        expectedObjectiveCode: "O1",
      },
      context,
    ),
  );
  assert.equal(
    (await listQuestionObjectiveCourses(teacher.id, question.id)).find(
      (item) => item.courseId === course.id,
    )?.objectiveCode,
    "O2",
  );
  const siblingCourse = await prisma.course.create({
    data: {
      teacherId: teacher.id,
      templateId: template.id,
      questionCategoryId: category.id,
      name: "同分类另一课程",
      courseNo: `EX-${randomUUID().slice(0, 6)}`,
      term: "2026",
      status: "ACTIVE",
    },
  });
  const siblingSyllabus = await publishExamTestSyllabus(
    prisma,
    siblingCourse.id,
    teacher.id,
  );
  await saveQuestionCourseObjective(
    teacher.id,
    question.id,
    {
      courseId: siblingCourse.id,
      syllabusStructureId: siblingSyllabus.id,
      objectiveCode: "O1",
      expectedObjectiveCode: null,
    },
    context,
  );
  const perCourseObjectives = await listQuestionObjectiveCourses(
    teacher.id,
    question.id,
  );
  assert.equal(
    perCourseObjectives.find((item) => item.courseId === course.id)
      ?.objectiveCode,
    "O2",
  );
  assert.equal(
    perCourseObjectives.find((item) => item.courseId === siblingCourse.id)
      ?.objectiveCode,
    "O1",
  );
  await assert.rejects(
    updatePaperDraftQuestion(
      teacher.id,
      firstDraft.id,
      firstDraft.questions[0].id,
      {
        expectedRevision: firstDraft.questions[0].revision,
        question: firstDraft.questions[0].questionJson,
        points: 100,
      },
      context,
    ),
  );
  assert.equal(
    (
      await publishPaperDraft(
        teacher.id,
        firstDraft.id,
        {
          expectedRevision: firstDraft.revision,
          requestId: draftRequestId,
        },
        context,
      )
    ).id,
    published.id,
  );
  const bankQuestionId = (
    await prisma.examQuestionUse.findFirstOrThrow({
      where: { examSessionId: published.id },
    })
  ).questionId;
  const sharedCourse = await prisma.course.create({
    data: {
      teacherId: other.id,
      templateId: template.id,
      questionCategoryId: category.id,
      name: "同分类跨教师课程",
      courseNo: `SH-${randomUUID().slice(0, 6)}`,
      term: "2026",
      status: "ACTIVE",
    },
  });
  const sharedClass = await prisma.classroom.create({
    data: {
      teacherId: other.id,
      courseId: sharedCourse.id,
      name: "同分类考试班",
      joinCode: randomUUID(),
    },
  });
  await assert.rejects(
    createExamSession(
      other.id,
      examCreateSchema.parse({
        requestId: randomUUID(),
        courseId: sharedCourse.id,
        classroomIds: [sharedClass.id],
        type: "MIDTERM",
        title: "跨课程禁重测试",
        startsAt: firstDraft.startsAt,
        endsAt: firstDraft.endsAt,
        allowedSwitches: 1,
        questions: [{ questionId: bankQuestionId, points: 100 }],
      }),
    ),
  );
  const secondDraft = await prepareDraft((await parseDraft()).id);
  await assert.rejects(
    publishPaperDraft(
      teacher.id,
      secondDraft.id,
      {
        expectedRevision: secondDraft.revision,
        requestId: randomUUID(),
      },
      context,
    ),
  );
  await cancelExamSession(teacher.id, published.id);
  const concurrency = await Promise.allSettled(
    [randomUUID(), randomUUID()].map((requestId) =>
      publishPaperDraft(
        teacher.id,
        secondDraft.id,
        {
          expectedRevision: secondDraft.revision,
          requestId,
        },
        context,
      ),
    ),
  );
  assert.equal(
    concurrency.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const republished = concurrency.find(
    (result) => result.status === "fulfilled",
  );
  assert.equal(republished?.status, "fulfilled");
  if (republished?.status === "fulfilled") {
    const reused = await prisma.examQuestionUse.findFirstOrThrow({
      where: { examSessionId: republished.value.id },
    });
    assert.equal(reused.questionId, bankQuestionId);
  }
  const canvas = createCanvas(400, 300);
  const drawing = canvas.getContext("2d");
  drawing.fillStyle = "white";
  drawing.fillRect(0, 0, 400, 300);
  drawing.fillStyle = "black";
  drawing.font = "24px sans-serif";
  drawing.fillText("1. What is 2 + 2?", 20, 80);
  drawing.fillText("Answer: 4", 20, 260);
  const scanPdf = await PDFDocument.create();
  const scanPage = scanPdf.addPage([400, 300]);
  scanPage.drawImage(await scanPdf.embedPng(canvas.toBuffer("image/png")), {
    x: 0,
    y: 0,
    width: 400,
    height: 300,
  });
  const scanUpload = await createPaperDraft(
    teacher.id,
    course.id,
    new File([Uint8Array.from(await scanPdf.save())], "scan.pdf", {
      type: "application/pdf",
    }),
    context,
  );
  const scanClaim = await claimBackgroundJobById(scanUpload.jobId, {
    workerId: "exam-integration",
    executorVersion: "test-v1",
    acceptedTypes: [EXAM_PAPER_JOB_TYPE],
    leaseDurationMs: 180_000,
  });
  assert.ok(scanClaim?.currentLeaseId);
  await executeClaimedExamPaperJob(scanUpload.jobId, scanClaim.currentLeaseId, {
    draftId: scanUpload.id,
    revision: 1,
  });
  let scan = await getPaperDraft(teacher.id, scanUpload.id);
  assert.equal(scan.status, "READY");
  assert.equal(scan.questions[0].answerSource, "MISSING");
  assert.equal(scan.assets.length, 1);
  await assert.rejects(
    reviewPaperDraftQuestion(
      teacher.id,
      scan.id,
      scan.questions[0].id,
      {
        expectedRevision: scan.questions[0].revision,
      },
      context,
    ),
  );
  await cropPaperDraftImage(teacher.id, scan.id, scan.questions[0].id, {
    expectedRevision: scan.questions[0].revision,
    sourceAssetId: scan.assets[0].id,
    x: 0,
    y: 0,
    width: 1,
    height: 0.5,
  });
  scan = await getPaperDraft(teacher.id, scan.id);
  const scanQuestion = paperDraftQuestionSchema.parse(
    scan.questions[0].questionJson,
  );
  await updatePaperDraftQuestion(
    teacher.id,
    scan.id,
    scan.questions[0].id,
    {
      expectedRevision: scan.questions[0].revision,
      points: 100,
      question: {
        ...scanQuestion,
        title: "扫描图题",
        content: `看图回答 ${randomUUID()}`,
        answer: { kind: "REFERENCE", value: "4" },
        explanation: "2 + 2 = 4",
      },
    },
    context,
  );
  scan = await getPaperDraft(teacher.id, scan.id);
  await reviewPaperDraftQuestion(
    teacher.id,
    scan.id,
    scan.questions[0].id,
    {
      expectedRevision: scan.questions[0].revision,
    },
    context,
  );
  scan = await getPaperDraft(teacher.id, scan.id);
  await updatePaperDraftConfig(teacher.id, scan.id, {
    expectedRevision: scan.revision,
    type: "FINAL",
    title: "扫描图题考试",
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 3_600_000),
    allowedSwitches: 0,
    classroomIds: [first.id],
  });
  scan = await getPaperDraft(teacher.id, scan.id);
  const scanExam = await publishPaperDraft(
    teacher.id,
    scan.id,
    {
      expectedRevision: scan.revision,
      requestId: randomUUID(),
    },
    context,
  );
  const snapshotImage = await prisma.assignmentQuestionImage.findFirstOrThrow({
    where: { assignmentQuestion: { assignmentId: scanExam.assignments[0].id } },
  });
  await assert.rejects(
    readAssignmentQuestionImage(
      { id: other.id, role: Role.TEACHER },
      snapshotImage.id,
    ),
  );
  const outsider = await prisma.user.findUniqueOrThrow({
    where: { email: "student3@example.com" },
  });
  await assert.rejects(
    readAssignmentQuestionImage(
      { id: outsider.id, role: Role.STUDENT },
      snapshotImage.id,
    ),
  );
  const visible = await readAssignmentQuestionImage(
    { id: student.id, role: Role.STUDENT },
    snapshotImage.id,
  );
  const imageSize = await sharp(visible.bytes).metadata();
  assert.ok((imageSize.height ?? 0) < (scan.assets[0].height ?? 0));
  const broken = await createPaperDraft(
    teacher.id,
    course.id,
    new File(["PKinvalid-docx"], "broken.docx"),
    context,
  );
  const brokenClaim = await claimBackgroundJobById(broken.jobId, {
    workerId: "exam-integration",
    executorVersion: "test-v1",
    acceptedTypes: [EXAM_PAPER_JOB_TYPE],
    leaseDurationMs: 180_000,
  });
  assert.ok(brokenClaim?.currentLeaseId);
  await executeClaimedExamPaperJob(broken.jobId, brokenClaim.currentLeaseId, {
    draftId: broken.id,
    revision: 1,
  });
  const failed = await getPaperDraft(teacher.id, broken.id);
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.errorCode, "SOURCE_PARSE_FAILED");
  const retry = await retryPaperDraft(teacher.id, broken.id);
  assert.equal(retry.status, "PENDING");
  assert.notEqual(retry.jobId, broken.jobId);
  const removable = await parseDraft();
  await assert.rejects(
    removePaperDraftQuestion(
      other.id,
      removable.id,
      removable.questions[0].id,
      {
        expectedRevision: removable.questions[0].revision,
      },
      context,
    ),
  );
  await removePaperDraftQuestion(
    teacher.id,
    removable.id,
    removable.questions[0].id,
    {
      expectedRevision: removable.questions[0].revision,
    },
    context,
  );
  assert.equal(
    (await getPaperDraft(teacher.id, removable.id)).questions.length,
    0,
  );
  await prisma.examSession.update({
    where: { id: scanExam.id },
    data: { endsAt: new Date(Date.now() - 1000) },
  });
  assert.equal(
    (await getTeacherExamDetails(teacher.id, scanExam.id)).analysis,
    null,
  );
  const analysisQuestion = await prisma.assignmentQuestion.findFirstOrThrow({
    where: { assignmentId: scanExam.assignments[0].id },
  });
  const analysisSubmission = await prisma.submission.create({
    data: {
      assignmentId: scanExam.assignments[0].id,
      studentId: student.id,
      idempotencyKey: randomUUID(),
      status: "PUBLISHED",
      startedAt: new Date(Date.now() - 60_000),
      submittedAt: new Date(),
      gradedAt: new Date(),
      publishedAt: new Date(),
      score: 80,
      maxScore: 100,
      percentage: 80,
      answers: {
        create: {
          assignmentQuestionId: analysisQuestion.id,
          score: 80,
          maxScore: 100,
          isCorrect: false,
          gradingStatus: "GRADED",
          responseTimeMs: 12000,
        },
      },
    },
  });
  await assert.rejects(getTeacherExamDetails(other.id, scanExam.id));
  const preview = await getTeacherExamDetails(teacher.id, scanExam.id);
  assert.equal(preview.analysis?.overview.expected, 1);
  assert.equal(preview.analysis?.overview.participated, 1);
  assert.equal(preview.analysis?.questions[0].averageTimeMs, 12000);
  const report = await getStudentExamReport(student.id, scanExam.id, first.id);
  assert.equal(report.percentage, 80);
  assert.equal(report.classAverage, null);
  assert.equal(report.rankBand, null);
  await assert.rejects(
    getStudentExamReport(outsider.id, scanExam.id, first.id),
  );
  await prisma.submission.update({
    where: { id: analysisSubmission.id },
    data: { score: 90, percentage: 90 },
  });
  assert.equal(
    (await getTeacherExamDetails(teacher.id, scanExam.id)).analysis?.overview
      .average,
    90,
  );
  if (republished?.status === "fulfilled") {
    await prisma.examSession.update({
      where: { id: republished.value.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    const classAssignment = republished.value.assignments.find(
      (item) => item.classroomId === first.id,
    );
    assert.ok(classAssignment);
    await prisma.submission.create({
      data: {
        assignmentId: classAssignment.id,
        studentId: student.id,
        idempotencyKey: randomUUID(),
        status: "PUBLISHED",
        startedAt: new Date(Date.now() - 60_000),
        submittedAt: new Date(),
        gradedAt: new Date(),
        publishedAt: new Date(),
        score: 75,
        maxScore: 100,
        percentage: 75,
      },
    });
    const partial = await getTeacherExamDetails(
      teacher.id,
      republished.value.id,
    );
    assert.equal(partial.analysis?.overview.totalClassrooms, 2);
    assert.equal(partial.analysis?.overview.publishedClassrooms, 1);
    assert.equal(partial.analysis?.overview.average, 75);
  }
  console.log("Exam integration passed");
}
main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
