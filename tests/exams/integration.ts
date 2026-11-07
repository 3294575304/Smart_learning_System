import { getStudentExamTasks } from "@/services/dashboard/student-exam-tasks";
import { getStudentTaskOverview } from "@/services/dashboard/student-task-service";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { Role } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { startOrResumeAttempt } from "@/services/assignments/service";
import { claimBackgroundJobById } from "@/services/background-jobs/repository";
import {
  createPaperDraft,
  cropPaperDraftImage,
  getPaperDraft,
  removePaperDraftQuestion,
  reviewPaperDraftQuestion,
  retryPaperDraft,
  updatePaperDraftConfig,
  updatePaperDraftQuestion,
} from "@/services/exams/paper-drafts";
import { publishPaperDraft } from "@/services/exams/paper-publish";
import { executeClaimedExamPaperJob } from "@/services/exams/paper-worker";
import { EXAM_PAPER_JOB_TYPE } from "@/services/exams/paper-ai";
import { readAssignmentQuestionImage } from "@/services/exams/paper-images";
import { paperDraftQuestionSchema } from "@/services/exams/paper-schemas";
import {
  cancelExamSession,
  createExamSession,
  listEligibleExamQuestions,
  listTeacherExams,
  recordExamSwitch,
} from "@/services/exams/service";
import { examCreateSchema } from "@/services/exams/schemas";

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
    data: { name: "考试集成分类", normalizedName: `exam-${randomUUID()}` },
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
  const content = `不可重复题干 ${randomUUID()}`;
  const question = await prisma.question.create({
    data: {
      creatorId: teacher.id,
      questionCategoryId: category.id,
      title: "考试题",
      content,
      type: "FILL_BLANK",
      difficulty: 1,
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
      difficulty: 1,
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
  assert.equal(exam.assignments.length, 2);
  const beforeExam = await getStudentExamTasks(
    student.id,
    new Date(exam.startsAt.getTime() - 1),
  );
  assert.equal(beforeExam.items.length, 0);
  assert.equal(beforeExam.scheduled.length, 1);
  assert.ok(beforeExam.scheduled[0].href.startsWith("/student/exams#exam-"));
  const duringExam = await getStudentTaskOverview(student.id, exam.startsAt, {
    courseId: course.id,
    classroomId: first.id,
  });
  assert.equal(duringExam.counts.exam, 1);
  assert.equal(duringExam.counts.assignment, 0);
  assert.equal(duringExam.items[0].kind, "exam");
  assert.ok(!JSON.stringify(duringExam).includes(content));
  assert.equal(
    (await getStudentExamTasks(other.id, exam.startsAt)).items.length,
    0,
  );
  assert.equal(
    (await getStudentExamTasks(student.id, exam.endsAt)).items.length,
    0,
  );
  const ownAssignment = exam.assignments.find(
    (a) => a.classroomId === first.id,
  );
  assert.ok(ownAssignment);
  const submittedFixture = await prisma.submission.create({
    data: {
      assignmentId: ownAssignment.id,
      studentId: student.id,
      status: "SUBMITTED",
      idempotencyKey: randomUUID(),
    },
  });
  assert.equal(
    (await getStudentExamTasks(student.id, exam.startsAt)).items.length,
    0,
  );
  await prisma.submission.delete({ where: { id: submittedFixture.id } });
  await prisma.examSession.update({
    where: { id: exam.id },
    data: { cancelledAt: new Date() },
  });
  assert.equal(
    (await getStudentExamTasks(student.id, exam.startsAt)).items.length,
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
    (await getStudentExamTasks(student.id, exam.startsAt)).items.length,
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
    classroomIds: [first.id],
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 3_600_000),
  });
  const attempt = await startOrResumeAttempt(
    student.id,
    live.assignments[0].id,
    randomUUID(),
  );
  const switched = await recordExamSwitch(student.id, attempt.id, randomUUID());
  assert.equal(switched.shouldSubmit, true);
  const saved = await prisma.submission.findUniqueOrThrow({
    where: { id: attempt.id },
  });
  assert.notEqual(saved.status, "IN_PROGRESS");
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
    await reviewPaperDraftQuestion(
      teacher.id,
      draftId,
      row.id,
      {
        expectedRevision: draft.questions[0].revision,
      },
      context,
    );
    draft = await getPaperDraft(teacher.id, draftId);
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
  console.log("Exam integration passed");
}
main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
