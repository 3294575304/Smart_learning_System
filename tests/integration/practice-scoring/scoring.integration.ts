import { managePracticeSet } from "../../../services/practice-sets/management";
import { getPracticeSet } from "../../../services/practice-sets/service";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Role, QuestionType, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { integrationPrisma } from "../recommendations/database";
import { RecommendationTestFactory } from "../recommendations/factories";
import {
  createOrGetPersonalizedRecommendations,
  startRecommendation,
  getRecommendationDetail,
} from "../../../services/recommendations/service";
import { submitRecommendationPractice } from "../../../services/recommendations/practice";
import { createCourseRecommendations } from "../../../services/course-recommendations/service";
import {
  createRecommendationProgrammingAttempt,
  completeProgrammingJob,
} from "../../../services/programming-attempts/service";
import { claimBackgroundJobById } from "../../../services/background-jobs/repository";

test("frozen actual-count allocation, idempotent retry after progress, and legacy scores", async () => {
  const factory = new RecommendationTestFactory("frozen_scores");
  const teacher = await factory.teacher(),
    student = await factory.student();
  const classroom = await factory.classroom(teacher.id);
  await factory.membership(classroom.id, student.id);
  for (let i = 0; i < 3; i++)
    await factory.question(teacher.id, { type: QuestionType.TRUE_FALSE });
  const actor = factory.actor(student);
  const input = {
    studentId: student.id,
    classroomId: classroom.id,
    limit: 20,
    recommendedDifficulty: 3,
    requestId: randomUUID(),
  };
  const results = await Promise.all([
    createOrGetPersonalizedRecommendations(actor, input),
    createOrGetPersonalizedRecommendations(actor, input),
  ]);
  assert.equal(results[0].items.length, 3);
  assert.equal(results[1].cycleKey, results[0].cycleKey);
  assert.equal(results[0].scoringSummary?.totalPoints, 100);
  const stored = await prisma.personalizedRecommendation.findMany({
    where: { cycleKey: results[0].cycleKey },
    orderBy: { assignedPoints: "desc" },
  });
  assert.deepEqual(
    stored.map((x) => x.assignedPoints?.toNumber()),
    [33.34, 33.33, 33.33],
  );
  const item = stored[0];
  await startRecommendation(actor, item.id);
  const answer = {
    idempotencyKey: randomUUID(),
    answers: [{ questionId: item.questionId, kind: "BOOLEAN", value: true }],
  };
  const result = await submitRecommendationPractice(actor, item.id, answer);
  assert.equal(result.score, 33.34);
  assert.equal(result.maxScore, 33.34);
  assert.deepEqual(
    await submitRecommendationPractice(actor, item.id, answer),
    result,
  );
  await factory.question(teacher.id, { type: QuestionType.TRUE_FALSE });
  const repeated = await createOrGetPersonalizedRecommendations(actor, input);
  assert.equal(repeated.cycleKey, results[0].cycleKey);
  assert.equal(repeated.items.length, 3);
  assert.equal(
    await prisma.personalizedRecommendation.count({
      where: { cycleKey: repeated.cycleKey },
    }),
    3,
  );
  const oldQuestion = await factory.question(teacher.id, {
    type: QuestionType.TRUE_FALSE,
  });
  const old = await prisma.personalizedRecommendation.create({
    data: {
      studentId: student.id,
      questionId: oldQuestion.id,
      cycleKey: randomUUID(),
      source: "RULE",
      reason: "legacy",
      targetDifficulty: 3,
      status: "STARTED",
    },
  });
  const legacy = await submitRecommendationPractice(actor, old.id, {
    idempotencyKey: randomUUID(),
    answers: [{ questionId: oldQuestion.id, kind: "BOOLEAN", value: true }],
  });
  assert.equal(legacy.score, 1);
  assert.equal(legacy.maxScore, 1);
  assert.equal(
    (
      await prisma.personalizedRecommendation.findUniqueOrThrow({
        where: { id: old.id },
      })
    ).assignedPoints,
    null,
  );
});

test("course shortage freezes actual three questions, Python partial credit and evidence retain original weight", async () => {
  const teacher = await prisma.user.create({
    data: { role: Role.TEACHER, passwordHash: "synthetic" },
  });
  const student = await prisma.user.create({
    data: { role: Role.STUDENT, passwordHash: "synthetic" },
  });
  const actor = {
    id: student.id,
    role: Role.STUDENT,
    email: null,
    displayName: null,
    mustChangePassword: false,
  };
  const classroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      name: "Scoring test",
      joinCode: randomUUID(),
      memberships: { create: { studentId: student.id } },
    },
  });
  const question = await prisma.question.create({
    data: {
      creatorId: teacher.id,
      title: "Boolean one",
      content: "test",
      type: "TRUE_FALSE",
      difficulty: 2,
      status: "ACTIVE",
      explanation: "test",
      correctBoolean: false,
    },
  });
  const template = await prisma.courseTemplate.create({
    data: { code: randomUUID(), name: "Python" },
  });
  const course = await prisma.course.create({
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
      template: { connect: { id: template.id } },
      teacher: { connect: { id: teacher.id } },
      courseNo: randomUUID(),
      term: "test",
      name: "Python 程序设计",
    },
  });
  await prisma.classroom.update({
    where: { id: classroom.id },
    data: { courseId: course.id },
  });
  const syllabus = await prisma.courseSyllabus.create({
    data: {
      courseId: course.id,
      uploadedById: teacher.id,
      versionNumber: 1,
      originalName: "test.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      storageKey: randomUUID(),
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
    },
  });
  const syllabusReview = await prisma.syllabusReviewRevision.create({
    data: {
      courseId: course.id,
      syllabusId: syllabus.id,
      parseDraftId: parse.id,
      editedById: teacher.id,
      revisionNumber: 1,
      structureJson: {},
    },
  });
  const published = await prisma.publishedSyllabusStructure.create({
    data: {
      courseId: course.id,
      syllabusId: syllabus.id,
      parseDraftId: parse.id,
      reviewRevisionId: syllabusReview.id,
      publishedById: teacher.id,
      versionNumber: 1,
      structureJson: {},
    },
  });
  const draft = await prisma.knowledgeGraphDraft.create({
    data: {
      courseId: course.id,
      sourceSyllabusStructureId: published.id,
      requestedById: teacher.id,
      status: "SUCCEEDED",
      generatorVersion: "test",
      promptVersion: "test",
      ruleVersion: "test",
      deterministicStructureJson: {},
      generatedStructureJson: {},
    },
  });
  const review = await prisma.knowledgeGraphReviewRevision.create({
    data: {
      courseId: course.id,
      graphDraftId: draft.id,
      sourceSyllabusStructureId: published.id,
      editedById: teacher.id,
      revisionNumber: 1,
      structureJson: {},
    },
  });
  const concept = await prisma.knowledgeGraphConcept.create({
    data: { courseId: course.id, stableKey: "loop" },
  });
  const graph = await prisma.publishedKnowledgeGraphVersion.create({
    data: {
      courseId: course.id,
      sourceSyllabusStructureId: published.id,
      graphDraftId: draft.id,
      reviewRevisionId: review.id,
      publishedById: teacher.id,
      versionNumber: 1,
      structureJson: {},
      nodes: {
        create: {
          conceptId: concept.id,
          nodeType: "KNOWLEDGE_POINT",
          code: "loop",
          name: "循环结构",
          sourceType: "TEACHER",
          sourceRefs: [],
          sortOrder: 1,
        },
      },
    },
    include: { nodes: true },
  });
  const node = graph.nodes[0];
  if (!node) throw new Error("Missing test node");
  const progress = await prisma.courseTeachingProgressRevision.create({
    data: {
      courseId: course.id,
      graphVersionId: graph.id,
      createdById: teacher.id,
      revisionNumber: 1,
      inputFingerprint: "a".repeat(64),
      concepts: {
        create: { conceptId: concept.id, publishedNodeId: node.id },
      },
    },
  });
  await prisma.course.update({
    where: { id: course.id },
    data: {
      currentPublishedKnowledgeGraphVersionId: graph.id,
      currentTeachingProgressRevisionId: progress.id,
    },
  });
  await prisma.question.update({
    where: { id: question.id },
    data: { questionCategoryId: course.questionCategoryId },
  });
  await prisma.questionKnowledgeGraphBindingSet.create({
    data: {
      questionId: question.id,
      courseId: course.id,
      bindings: {
        create: {
          questionId: question.id,
          courseId: course.id,
          conceptId: concept.id,
          sourceGraphVersionId: graph.id,
          sourceNodeId: node.id,
          bindingType: "PRIMARY",
          createdById: teacher.id,
        },
      },
    },
  });

  const second = await prisma.question.create({
    data: {
      creatorId: teacher.id,
      questionCategoryId: course.questionCategoryId,
      title: "Boolean two",
      content: "test",
      type: "TRUE_FALSE",
      difficulty: 2,
      status: "ACTIVE",
      explanation: "test",
      correctBoolean: true,
    },
  });
  const python = await prisma.question.create({
    data: {
      creatorId: teacher.id,
      questionCategoryId: course.questionCategoryId,
      title: "Python partial",
      content: "test",
      type: "PYTHON_PROGRAMMING",
      difficulty: 2,
      status: "ACTIVE",
      explanation: "test",
    },
  });
  for (const q of [second, python])
    await prisma.questionKnowledgeGraphBindingSet.create({
      data: {
        questionId: q.id,
        courseId: course.id,
        bindings: {
          create: {
            questionId: q.id,
            courseId: course.id,
            conceptId: concept.id,
            sourceGraphVersionId: graph.id,
            sourceNodeId: node.id,
            bindingType: "PRIMARY",
            createdById: teacher.id,
          },
        },
      },
    });
  const config = await prisma.programmingQuestionConfigRevision.create({
    data: {
      questionId: python.id,
      revisionNumber: 1,
      standardCode: "print(1)",
      starterCode: "",
      totalPoints: 10,
      cpuTimeMs: 1000,
      wallTimeMs: 2000,
      memoryBytes: 67108864,
      outputBytes: 16384,
      processCount: 4,
      testCasesHash: "a".repeat(64),
      configurationHash: "b".repeat(64),
      executorRuleVersion: "test",
      createdById: teacher.id,
      testCases: {
        create: [
          {
            visibility: "PUBLIC",
            name: "one",
            stdin: "",
            expectedOutput: "1",
            points: 4,
            sortOrder: 1,
          },
          {
            visibility: "HIDDEN",
            name: "two",
            stdin: "",
            expectedOutput: "2",
            points: 6,
            sortOrder: 2,
          },
        ],
      },
    },
    include: { testCases: { orderBy: { sortOrder: "asc" } } },
  });
  const input = {
    classroomId: classroom.id,
    conceptIds: [concept.id],
    questionTypes: [QuestionType.TRUE_FALSE, QuestionType.PYTHON_PROGRAMMING],
    count: 10,
    difficulty: 2,
    requestId: randomUUID(),
  };
  const [generated, concurrent] = await Promise.all([
    createCourseRecommendations(actor, course.id, input),
    createCourseRecommendations(actor, course.id, input),
  ]);
  assert.equal(generated.cycle.id, concurrent.cycle.id);
  assert.equal(generated.items.length, 3);
  assert.equal(generated.scoringSummary.totalPoints, 100);
  assert.equal(
    generated.items.reduce(
      (sum, item) => sum + Math.round((item.assignedPoints ?? 0) * 100),
      0,
    ),
    10000,
  );
  const bool = generated.items.find((item) => item.questionId === question.id);
  assert.ok(bool);
  await startRecommendation(actor, bool.id);
  const boolResult = await submitRecommendationPractice(actor, bool.id, {
    idempotencyKey: randomUUID(),
    answers: [{ questionId: question.id, kind: "BOOLEAN", value: false }],
  });
  assert.equal(boolResult.score, bool.assignedPoints);
  const evidence = await prisma.recommendationConceptEvidence.findFirstOrThrow({
    where: { recommendationId: bool.id },
    orderBy: { revision: "desc" },
  });
  assert.equal(evidence.score?.toNumber(), 1);
  assert.equal(evidence.maxScore?.toNumber(), 1);
  const retried = await createCourseRecommendations(actor, course.id, input);
  assert.equal(retried.cycle.id, generated.cycle.id);
  const pythonItem = generated.items.find(
    (item) => item.questionId === python.id,
  );
  assert.ok(pythonItem);
  const request = { sourceCode: "print(1)", idempotencyKey: randomUUID() };
  const attempt = await createRecommendationProgrammingAttempt(
    student.id,
    pythonItem.id,
    request,
  );
  assert.equal(
    (
      await createRecommendationProgrammingAttempt(
        student.id,
        pythonItem.id,
        request,
      )
    ).attemptId,
    attempt.attemptId,
  );
  const before = await prisma.personalizedRecommendation.findUniqueOrThrow({
    where: { id: pythonItem.id },
  });
  assert.equal(before.score, null);
  assert.equal(before.maxScore, null);
  const programmingAttempt = await prisma.programmingAttempt.findUniqueOrThrow({
    where: { id: attempt.attemptId },
  });
  assert.ok(programmingAttempt.backgroundJobId);
  const job = await claimBackgroundJobById(programmingAttempt.backgroundJobId, {
    workerId: "scoring-test",
    executorVersion: "test",
    acceptedTypes: ["PYTHON_JUDGE"],
    leaseDurationMs: 30000,
  });
  assert.ok(job?.currentLeaseId);
  const complete = {
    leaseId: job.currentLeaseId,
    result: {
      attemptId: attempt.attemptId,
      cases: config.testCases.map((c, index) => ({
        testCaseId: c.id,
        passed: index === 0,
        errorType: "NONE",
        stdout: index === 0 ? "1" : "wrong",
        stderr: "",
        resourceUsage: null,
      })),
    },
  };
  const trashed = await managePracticeSet(actor, pythonItem.id, {
    action: "TRASH",
    expectedRevision: 0,
  });
  assert.ok(trashed.trashedAt);
  await completeProgrammingJob(job.id, complete);
  assert.ok((await getPracticeSet(actor, pythonItem.id)).management?.trashedAt);
  assert.notEqual(
    (await getPracticeSet(actor, pythonItem.id)).status,
    "ACTIVE",
  );
  await assert.rejects(
    createRecommendationProgrammingAttempt(student.id, pythonItem.id, request),
    /只读|回看|回收站/,
  );
  await assert.rejects(
    createRecommendationProgrammingAttempt(student.id, pythonItem.id, {
      ...request,
      sourceCode: "print(2)",
    }),
    /只读|回看|回收站/,
  );
  await assert.rejects(
    createRecommendationProgrammingAttempt(student.id, pythonItem.id, {
      ...request,
      idempotencyKey: randomUUID(),
    }),
  );
  const graded = await prisma.personalizedRecommendation.findUniqueOrThrow({
    where: { id: pythonItem.id },
  });
  assert.equal(graded.maxScore?.toNumber(), pythonItem.assignedPoints);
  assert.equal(
    graded.score?.toNumber(),
    new Prisma.Decimal(4)
      .div(10)
      .mul(pythonItem.assignedPoints ?? 0)
      .toDecimalPlaces(2)
      .toNumber(),
  );
  const pyEvidence =
    await prisma.recommendationConceptEvidence.findFirstOrThrow({
      where: { recommendationId: pythonItem.id },
      orderBy: { revision: "desc" },
    });
  assert.equal(pyEvidence.score?.toNumber(), 4);
  assert.equal(pyEvidence.maxScore?.toNumber(), 10);
  assert.equal(pyEvidence.normalizedScore?.toNumber(), 40);
  assert.equal(
    (
      await prisma.programmingAttempt.findUniqueOrThrow({
        where: { id: attempt.attemptId },
      })
    ).maxScore.toNumber(),
    10,
  );
  await assert.rejects(
    createCourseRecommendations({ ...actor, id: teacher.id }, course.id, input),
  );
  const testInput = {
    ...input,
    requestId: randomUUID(),
    mode: "TEST" as const,
    template: "MIXED_TEST50" as const,
    count: 50,
  };
  await assert.rejects(
    createCourseRecommendations(actor, course.id, testInput),
    (error: unknown) =>
      error instanceof Error && "status" in error && error.status === 422,
  );
});

test("ended practice retains own content and saved answers but rejects writes and cross-student access", async () => {
  const factory = new RecommendationTestFactory("readonly_history");
  const teacher = await factory.teacher(),
    student = await factory.student(),
    other = await factory.student();
  const question = await factory.question(teacher.id, {
    type: QuestionType.TRUE_FALSE,
  });
  const record = await prisma.personalizedRecommendation.create({
    data: {
      studentId: student.id,
      questionId: question.id,
      cycleKey: randomUUID(),
      source: "RULE",
      reason: "history",
      targetDifficulty: 3,
      status: "EXPIRED",
      practiceAnswer: {
        create: {
          questionId: question.id,
          idempotencyKey: randomUUID(),
          booleanAnswer: true,
          score: 1,
          maxScore: 1,
          isCorrect: true,
        },
      },
    },
  });
  const actor = factory.actor(student);
  const own = await getRecommendationDetail(actor, record.id);
  assert.equal(own.readOnly, true);
  assert.equal(own.content, question.content);
  assert.equal(own.savedAnswer, "正确");
  assert.equal(own.practiceResult, null);
  assert.equal(own.historyFeedback?.score, 1);
  await assert.rejects(
    getRecommendationDetail(factory.actor(other), record.id),
  );
  await assert.rejects(startRecommendation(actor, record.id));
  await assert.rejects(
    submitRecommendationPractice(actor, record.id, {
      idempotencyKey: randomUUID(),
      answers: [{ questionId: question.id, kind: "BOOLEAN", value: false }],
    }),
  );
  assert.equal(
    await prisma.personalizedRecommendation.count({ where: { id: record.id } }),
    1,
  );
  assert.equal(
    (await getRecommendationDetail(actor, record.id)).savedAnswer,
    "正确",
  );
});

test.after(async () => {
  await Promise.all([prisma.$disconnect(), integrationPrisma.$disconnect()]);
});
