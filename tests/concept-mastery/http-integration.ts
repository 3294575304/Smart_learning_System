import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import {
  ConceptEvidenceStatus,
  CourseConceptMasteryLevel,
  CourseStatus,
  GradingStatus,
  KnowledgeGraphNodeType,
  KnowledgeGraphSourceType,
  KnowledgeGraphStatus,
  MembershipStatus,
  PrismaClient,
  QuestionGraphBindingType,
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
  SyllabusParseStatus,
} from "@prisma/client";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";
import {
  completeSubmissionGrading,
  saveManualAnswerGrade,
} from "@/services/assignments/manual-grading";
import {
  createDraftAssignment,
  publishAssignment,
  saveStudentAnswers,
  startOrResumeAttempt,
  submitStudentAssignment,
} from "@/services/assignments/service";
import { synchronizeAnswerConceptEvidence } from "@/services/concept-mastery/evidence";
import { recalculateStudentCourseConceptMastery } from "@/services/concept-mastery/service";
import { assertIsolatedIntegrationEnvironment } from "../integration/database";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface MasteryResponse {
  hasData: boolean;
  currentGraphVersion: { id: string; versionNumber: number } | null;
  currentRevision: {
    revisionNumber: number;
    calculationRuleVersion: string;
  } | null;
  concepts: Array<{
    conceptId: string;
    evidenceCount: number;
    distinctAnswerCount: number;
    earnedPoints: number;
    availablePoints: number;
    masteryScore: number;
    level: CourseConceptMasteryLevel;
    currentResolution: {
      status: string;
      currentNode: { id: string; code: string } | null;
    };
    historicalEvidence: {
      sourceGroups: Array<{
        sourceGraphVersionNumber: number;
        sourceNodeId: string;
      }>;
      latestReferences: Array<{
        evidenceId: string;
        revision: number;
      }>;
    };
  }>;
}

assertIsolatedIntegrationEnvironment("HTTP_INTEGRATION_SCHEMA");
const prisma = new PrismaClient();
const port = 3111;
const baseUrl = `http://127.0.0.1:${port}`;
const serverOutput: string[] = [];
const sessionIds: string[] = [];

const server = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    "start",
    "-H",
    "127.0.0.1",
    "-p",
    String(port),
  ],
  {
    cwd: process.cwd(),
    env: process.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stdout.on("data", (chunk: Buffer) =>
  serverOutput.push(chunk.toString()),
);
server.stderr.on("data", (chunk: Buffer) =>
  serverOutput.push(chunk.toString()),
);

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Test server did not start:\n${serverOutput.join("")}`);
}

async function sessionCookie(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 120_000),
    },
  });
  sessionIds.push(session.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

async function request(path: string, cookie?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

async function createPublishedGraphFixture(
  courseId: string,
  teacherId: string,
) {
  const suffix = randomBytes(5).toString("hex");
  const syllabus = await prisma.courseSyllabus.create({
    data: {
      courseId,
      uploadedById: teacherId,
      versionNumber: 1,
      originalName: "concept-mastery-test.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      storageKey: `concept-mastery/${suffix}/syllabus.pdf`,
    },
  });
  const parseDraft = await prisma.syllabusParseDraft.create({
    data: {
      courseId,
      syllabusId: syllabus.id,
      requestedById: teacherId,
      status: SyllabusParseStatus.SUCCEEDED,
      parserVersion: `test-parser-${suffix}`,
      promptVersion: "test-prompt-v1",
      ruleVersion: "test-rule-v1",
      structuredResult: {},
    },
  });
  const syllabusReview = await prisma.syllabusReviewRevision.create({
    data: {
      courseId,
      syllabusId: syllabus.id,
      parseDraftId: parseDraft.id,
      editedById: teacherId,
      revisionNumber: 1,
      structureJson: {},
    },
  });
  const publishedSyllabus = await prisma.publishedSyllabusStructure.create({
    data: {
      courseId,
      syllabusId: syllabus.id,
      parseDraftId: parseDraft.id,
      reviewRevisionId: syllabusReview.id,
      publishedById: teacherId,
      versionNumber: 1,
      structureJson: {},
    },
  });
  const graphDraft = await prisma.knowledgeGraphDraft.create({
    data: {
      courseId,
      sourceSyllabusStructureId: publishedSyllabus.id,
      requestedById: teacherId,
      status: KnowledgeGraphStatus.SUCCEEDED,
      generatorVersion: `test-generator-${suffix}`,
      promptVersion: "test-prompt-v1",
      ruleVersion: "test-rule-v1",
      progress: 100,
      successCount: 1,
      deterministicStructureJson: {},
      generatedStructureJson: {},
    },
  });

  async function publishVersion(
    versionNumber: number,
    includedConceptIds: readonly string[],
  ) {
    const review = await prisma.knowledgeGraphReviewRevision.create({
      data: {
        courseId,
        graphDraftId: graphDraft.id,
        sourceSyllabusStructureId: publishedSyllabus.id,
        editedById: teacherId,
        revisionNumber: versionNumber,
        structureJson: {},
      },
    });
    const version = await prisma.publishedKnowledgeGraphVersion.create({
      data: {
        courseId,
        sourceSyllabusStructureId: publishedSyllabus.id,
        graphDraftId: graphDraft.id,
        reviewRevisionId: review.id,
        publishedById: teacherId,
        versionNumber,
        structureJson: {},
        nodes: {
          create: includedConceptIds.map((conceptId, index) => ({
            conceptId,
            nodeType: KnowledgeGraphNodeType.KNOWLEDGE_POINT,
            code: `V${versionNumber}-C${index + 1}`,
            name: `Version ${versionNumber} concept ${index + 1}`,
            sourceType: KnowledgeGraphSourceType.TEACHER,
            sourceRefs: [],
            sortOrder: index + 1,
          })),
        },
      },
      include: { nodes: { orderBy: { sortOrder: "asc" } } },
    });
    await prisma.course.update({
      where: { id: courseId },
      data: { currentPublishedKnowledgeGraphVersionId: version.id },
    });
    return version;
  }

  return { publishVersion };
}

async function main(): Promise<void> {
  try {
    await waitForServer();
    const suffix = randomBytes(5).toString("hex");
    const [
      teacher,
      teacherTwo,
      admin,
      student,
      noDataStudent,
      outsider,
      template,
    ] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { email: "teacher@example.com" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "teacher2@example.com" },
      }),
      prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } }),
      prisma.user.findUniqueOrThrow({
        where: { email: "student2@example.com" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "student@example.com" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "student3@example.com" },
      }),
      prisma.courseTemplate.findFirstOrThrow({ where: { isActive: true } }),
    ]);
    const [
      teacherCookie,
      teacherTwoCookie,
      adminCookie,
      studentCookie,
      noDataCookie,
      outsiderCookie,
    ] = await Promise.all([
      sessionCookie(teacher.id),
      sessionCookie(teacherTwo.id),
      sessionCookie(admin.id),
      sessionCookie(student.id),
      sessionCookie(noDataStudent.id),
      sessionCookie(outsider.id),
    ]);

    const course = await prisma.course.create({
      data: {
        templateId: template.id,
        teacherId: teacher.id,
        courseNo: `CM-${suffix}`,
        term: "2026-test",
        name: "Concept mastery integration course",
        status: CourseStatus.ACTIVE,
        publishedAt: new Date(),
      },
    });
    const classroom = await prisma.classroom.create({
      data: {
        teacherId: teacher.id,
        courseId: course.id,
        name: "Concept mastery integration class",
        joinCode: `CM${suffix}`,
        memberships: {
          create: [
            { studentId: student.id, status: MembershipStatus.ACTIVE },
            { studentId: noDataStudent.id, status: MembershipStatus.ACTIVE },
          ],
        },
      },
    });
    const concepts = await Promise.all(
      ["variables", "expressions"].map((stableKey) =>
        prisma.knowledgeGraphConcept.create({
          data: { courseId: course.id, stableKey },
        }),
      ),
    );
    const graphFixture = await createPublishedGraphFixture(
      course.id,
      teacher.id,
    );
    const graphV1 = await graphFixture.publishVersion(
      1,
      concepts.map((concept) => concept.id),
    );
    const [objectiveQuestion, subjectiveQuestion, unboundQuestion] =
      await Promise.all([
        prisma.question.create({
          data: {
            creatorId: teacher.id,
            title: "Concept objective",
            content: "Python variables can be reassigned.",
            type: QuestionType.TRUE_FALSE,
            difficulty: 2,
            visibility: QuestionVisibility.PRIVATE,
            status: QuestionStatus.ACTIVE,
            explanation: "They can.",
            correctBoolean: true,
          },
        }),
        prisma.question.create({
          data: {
            creatorId: teacher.id,
            title: "Concept subjective",
            content: "Explain assignment.",
            type: QuestionType.SHORT_ANSWER,
            difficulty: 3,
            visibility: QuestionVisibility.PRIVATE,
            status: QuestionStatus.ACTIVE,
            explanation: "Manual grading.",
            referenceAnswer: "A name is bound to a value.",
          },
        }),
        prisma.question.create({
          data: {
            creatorId: teacher.id,
            title: "Unbound objective",
            content: "Python is dynamically typed.",
            type: QuestionType.TRUE_FALSE,
            difficulty: 1,
            visibility: QuestionVisibility.PRIVATE,
            status: QuestionStatus.ACTIVE,
            explanation: "It is.",
            correctBoolean: true,
          },
        }),
      ]);

    const objectiveBindingSet =
      await prisma.questionKnowledgeGraphBindingSet.create({
        data: {
          questionId: objectiveQuestion.id,
          courseId: course.id,
          revision: 1,
          bindings: {
            create: concepts.map((concept, index) => ({
              questionId: objectiveQuestion.id,
              courseId: course.id,
              conceptId: concept.id,
              sourceGraphVersionId: graphV1.id,
              sourceNodeId: graphV1.nodes[index]!.id,
              bindingType:
                index === 0
                  ? QuestionGraphBindingType.PRIMARY
                  : QuestionGraphBindingType.SECONDARY,
              createdById: teacher.id,
            })),
          },
        },
      });
    await prisma.questionKnowledgeGraphBindingSet.create({
      data: {
        questionId: subjectiveQuestion.id,
        courseId: course.id,
        revision: 1,
        bindings: {
          create: {
            questionId: subjectiveQuestion.id,
            courseId: course.id,
            conceptId: concepts[0]!.id,
            sourceGraphVersionId: graphV1.id,
            sourceNodeId: graphV1.nodes[0]!.id,
            bindingType: QuestionGraphBindingType.PRIMARY,
            createdById: teacher.id,
          },
        },
      },
    });

    const draft = await createDraftAssignment(teacher.id, {
      classroomId: classroom.id,
      title: "Concept mastery assignment",
      description: "Frozen graph bindings",
      publishedAt: new Date(Date.now() - 60_000),
      dueAt: new Date(Date.now() + 3_600_000),
      allowResubmission: false,
      questions: [
        { questionId: objectiveQuestion.id, sortOrder: 1, points: 10 },
        { questionId: subjectiveQuestion.id, sortOrder: 2, points: 10 },
        { questionId: unboundQuestion.id, sortOrder: 3, points: 5 },
      ],
    });
    await publishAssignment(teacher.id, draft.id);
    await publishAssignment(teacher.id, draft.id);

    const frozen = await prisma.assignmentQuestionConceptSnapshot.findMany({
      where: { assignmentId: draft.id },
      orderBy: [
        { assignmentQuestion: { sortOrder: "asc" } },
        { conceptId: "asc" },
      ],
    });
    assert.equal(frozen.length, 3);
    assert.equal(
      frozen.every((row) => row.bindingSetRevision === 1),
      true,
    );
    assert.equal(
      frozen.every((row) => row.sourceGraphVersionId === graphV1.id),
      true,
    );
    assert.equal(
      frozen.every((row) => row.publishedGraphVersionId === graphV1.id),
      true,
    );

    await prisma.questionKnowledgeGraphBinding.deleteMany({
      where: { bindingSetId: objectiveBindingSet.id },
    });
    await prisma.questionKnowledgeGraphBindingSet.update({
      where: { id: objectiveBindingSet.id },
      data: {
        revision: 2,
        bindings: {
          create: {
            questionId: objectiveQuestion.id,
            courseId: course.id,
            conceptId: concepts[1]!.id,
            sourceGraphVersionId: graphV1.id,
            sourceNodeId: graphV1.nodes[1]!.id,
            bindingType: QuestionGraphBindingType.PRIMARY,
            createdById: teacher.id,
          },
        },
      },
    });
    const graphV2 = await graphFixture.publishVersion(
      2,
      concepts.map((concept) => concept.id),
    );
    const frozenAfterChanges =
      await prisma.assignmentQuestionConceptSnapshot.findMany({
        where: { assignmentId: draft.id },
        orderBy: { id: "asc" },
      });
    assert.deepEqual(
      frozenAfterChanges.map((row) => ({
        id: row.id,
        bindingRevision: row.bindingSetRevision,
        sourceVersionId: row.sourceGraphVersionId,
        publishedVersionId: row.publishedGraphVersionId,
      })),
      frozen
        .map((row) => ({
          id: row.id,
          bindingRevision: row.bindingSetRevision,
          sourceVersionId: row.sourceGraphVersionId,
          publishedVersionId: row.publishedGraphVersionId,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );

    const attempt = await startOrResumeAttempt(
      student.id,
      draft.id,
      `cm-attempt-${suffix}`,
    );
    const questionBySortOrder = new Map(
      attempt.questions.map((question) => [question.sortOrder, question.id]),
    );
    await saveStudentAnswers(student.id, attempt.id, {
      version: attempt.version,
      answers: [
        {
          assignmentQuestionId: questionBySortOrder.get(1)!,
          kind: "BOOLEAN",
          value: true,
        },
        {
          assignmentQuestionId: questionBySortOrder.get(2)!,
          kind: "TEXT",
          value: "A name refers to a value.",
        },
        {
          assignmentQuestionId: questionBySortOrder.get(3)!,
          kind: "BOOLEAN",
          value: true,
        },
      ],
    });
    await submitStudentAssignment(student.id, attempt.id);

    let evidenceRows = await prisma.studentAnswerConceptEvidence.findMany({
      where: { assignmentId: draft.id },
      orderBy: [
        { studentAnswerId: "asc" },
        { conceptId: "asc" },
        { revision: "asc" },
      ],
    });
    assert.equal(evidenceRows.length, 2);
    assert.equal(
      evidenceRows.every(
        (row) =>
          row.status === ConceptEvidenceStatus.VALID &&
          row.gradingSource === "AUTO_GRADING" &&
          row.normalizedScore?.toNumber() === 100,
      ),
      true,
    );
    assert.equal(
      evidenceRows.every(
        (row) =>
          row.assignmentQuestionConceptSnapshotId ===
          frozen.find(
            (snapshot) =>
              snapshot.assignmentQuestionId === row.assignmentQuestionId &&
              snapshot.conceptId === row.conceptId,
          )?.id,
      ),
      true,
    );

    const subjectiveAnswer = await prisma.studentAnswer.findFirstOrThrow({
      where: {
        submissionId: attempt.id,
        assignmentQuestion: { sortOrder: 2 },
      },
    });
    await saveManualAnswerGrade(
      teacher.id,
      draft.id,
      attempt.id,
      subjectiveAnswer.id,
      { score: 5, feedback: "Partial credit" },
    );
    const partialMasteryRevision =
      await prisma.studentCourseConceptMasteryRevision.findFirstOrThrow({
        where: { state: { studentId: student.id, courseId: course.id } },
        orderBy: { revisionNumber: "desc" },
        include: { entries: true },
      });
    const partialPrimary = partialMasteryRevision.entries.find(
      (entry) => entry.conceptId === concepts[0]!.id,
    );
    assert.equal(partialPrimary?.earnedPoints.toNumber(), 15);
    assert.equal(partialPrimary?.availablePoints.toNumber(), 20);
    assert.equal(partialPrimary?.masteryScore.toNumber(), 75);
    assert.equal(partialPrimary?.level, CourseConceptMasteryLevel.DEVELOPING);
    const revisionCountAfterPartial =
      await prisma.studentCourseConceptMasteryRevision.count({
        where: { state: { studentId: student.id, courseId: course.id } },
      });
    await saveManualAnswerGrade(
      teacher.id,
      draft.id,
      attempt.id,
      subjectiveAnswer.id,
      { score: 5, feedback: "Same score, retry" },
    );
    assert.equal(
      await prisma.studentCourseConceptMasteryRevision.count({
        where: { state: { studentId: student.id, courseId: course.id } },
      }),
      revisionCountAfterPartial,
    );
    await Promise.all([
      saveManualAnswerGrade(
        teacher.id,
        draft.id,
        attempt.id,
        subjectiveAnswer.id,
        { score: 10, feedback: "Regraded" },
      ),
      saveManualAnswerGrade(
        teacher.id,
        draft.id,
        attempt.id,
        subjectiveAnswer.id,
        { score: 10, feedback: "Concurrent retry" },
      ),
    ]);
    await completeSubmissionGrading(teacher.id, draft.id, attempt.id, {
      ipAddress: null,
      userAgent: null,
    });

    evidenceRows = await prisma.studentAnswerConceptEvidence.findMany({
      where: { studentAnswerId: subjectiveAnswer.id },
      orderBy: { revision: "asc" },
    });
    assert.equal(evidenceRows.length, 2);
    assert.deepEqual(
      evidenceRows.map((row) => ({
        revision: row.revision,
        score: row.score?.toNumber(),
        status: row.status,
      })),
      [
        { revision: 1, score: 5, status: ConceptEvidenceStatus.VALID },
        { revision: 2, score: 10, status: ConceptEvidenceStatus.VALID },
      ],
    );

    const studentPath = `/api/student/courses/${course.id}/knowledge-mastery`;
    const teacherPath = `/api/teacher/courses/${course.id}/students/${student.id}/knowledge-mastery`;
    assert.equal((await request(studentPath)).status, 401);
    assert.equal((await request(studentPath, teacherCookie)).status, 403);
    assert.equal(
      (
        await request(
          "/api/student/courses/not-a-cuid/knowledge-mastery",
          studentCookie,
        )
      ).status,
      400,
    );
    assert.equal((await request(studentPath, outsiderCookie)).status, 404);
    assert.equal((await request(teacherPath, adminCookie)).status, 403);
    assert.equal((await request(teacherPath, teacherTwoCookie)).status, 404);
    assert.equal(
      (
        await request(
          `/api/teacher/courses/${course.id}/students/${outsider.id}/knowledge-mastery`,
          teacherCookie,
        )
      ).status,
      404,
    );

    const noDataResponse = await request(studentPath, noDataCookie);
    assert.equal(noDataResponse.status, 200);
    const noData = (await noDataResponse.json()) as ApiSuccess<MasteryResponse>;
    assert.equal(noData.data.hasData, false);
    assert.equal(noData.data.currentRevision, null);

    let masteryResponse = await request(studentPath, studentCookie);
    assert.equal(masteryResponse.status, 200);
    let mastery = (await masteryResponse.json()) as ApiSuccess<MasteryResponse>;
    assert.equal(mastery.data.currentGraphVersion?.id, graphV2.id);
    assert.equal(
      mastery.data.currentRevision?.calculationRuleVersion,
      "concept-mastery-v1",
    );
    const masteryByConcept = new Map(
      mastery.data.concepts.map((item) => [item.conceptId, item]),
    );
    assert.deepEqual(
      {
        evidenceCount: masteryByConcept.get(concepts[0]!.id)?.evidenceCount,
        answers: masteryByConcept.get(concepts[0]!.id)?.distinctAnswerCount,
        score: masteryByConcept.get(concepts[0]!.id)?.masteryScore,
        level: masteryByConcept.get(concepts[0]!.id)?.level,
        resolution: masteryByConcept.get(concepts[0]!.id)?.currentResolution
          .status,
      },
      {
        evidenceCount: 2,
        answers: 2,
        score: 100,
        level: CourseConceptMasteryLevel.MASTERED,
        resolution: "RESOLVED_TO_CURRENT_VERSION",
      },
    );
    assert.deepEqual(
      {
        evidenceCount: masteryByConcept.get(concepts[1]!.id)?.evidenceCount,
        answers: masteryByConcept.get(concepts[1]!.id)?.distinctAnswerCount,
        score: masteryByConcept.get(concepts[1]!.id)?.masteryScore,
        level: masteryByConcept.get(concepts[1]!.id)?.level,
        resolution: masteryByConcept.get(concepts[1]!.id)?.currentResolution
          .status,
      },
      {
        evidenceCount: 1,
        answers: 1,
        score: 100,
        level: CourseConceptMasteryLevel.MASTERED,
        resolution: "RESOLVED_TO_CURRENT_VERSION",
      },
    );
    assert.equal(
      mastery.data.concepts.every((item) =>
        item.historicalEvidence.sourceGroups.every(
          (source) => source.sourceGraphVersionNumber === 1,
        ),
      ),
      true,
    );

    const historicalDraft = await createDraftAssignment(teacher.id, {
      classroomId: classroom.id,
      title: "Pre-iteration-D published assignment",
      description: "Must not be backfilled",
      publishedAt: new Date(Date.now() - 120_000),
      dueAt: new Date(Date.now() + 3_600_000),
      allowResubmission: false,
      questions: [
        { questionId: objectiveQuestion.id, sortOrder: 1, points: 10 },
      ],
    });
    await prisma.assignment.update({
      where: { id: historicalDraft.id },
      data: { status: "PUBLISHED" },
    });
    await publishAssignment(teacher.id, historicalDraft.id);
    assert.equal(
      await prisma.assignmentQuestionConceptSnapshot.count({
        where: { assignmentId: historicalDraft.id },
      }),
      0,
    );

    const graphV3 = await graphFixture.publishVersion(3, [concepts[0]!.id]);
    masteryResponse = await request(teacherPath, teacherCookie);
    assert.equal(masteryResponse.status, 200);
    mastery = (await masteryResponse.json()) as ApiSuccess<MasteryResponse>;
    assert.equal(mastery.data.currentGraphVersion?.id, graphV3.id);
    assert.equal(
      mastery.data.concepts.find((item) => item.conceptId === concepts[1]!.id)
        ?.currentResolution.status,
      "MISSING_FROM_CURRENT_VERSION",
    );
    assert.equal(
      mastery.data.concepts.find((item) => item.conceptId === concepts[1]!.id)
        ?.historicalEvidence.sourceGroups[0]?.sourceGraphVersionNumber,
      1,
    );

    await prisma.course.update({
      where: { id: course.id },
      data: { currentPublishedKnowledgeGraphVersionId: null },
    });
    const unresolvedDraft = await createDraftAssignment(teacher.id, {
      classroomId: classroom.id,
      title: "No current graph assignment",
      description: "Must remain publishable",
      publishedAt: new Date(Date.now() - 60_000),
      dueAt: new Date(Date.now() + 3_600_000),
      allowResubmission: false,
      questions: [
        { questionId: objectiveQuestion.id, sortOrder: 1, points: 10 },
      ],
    });
    await publishAssignment(teacher.id, unresolvedDraft.id);
    const unresolvedSnapshots =
      await prisma.assignmentQuestionConceptSnapshot.findMany({
        where: { assignmentId: unresolvedDraft.id },
      });
    assert.equal(unresolvedSnapshots.length, 1);
    assert.equal(
      unresolvedSnapshots[0]?.resolutionStatus,
      "NO_CURRENT_PUBLISHED_GRAPH",
    );
    const unresolvedAttempt = await startOrResumeAttempt(
      student.id,
      unresolvedDraft.id,
      `cm-unresolved-${suffix}`,
    );
    await saveStudentAnswers(student.id, unresolvedAttempt.id, {
      version: unresolvedAttempt.version,
      answers: [
        {
          assignmentQuestionId: unresolvedAttempt.questions[0]!.id,
          kind: "BOOLEAN",
          value: true,
        },
      ],
    });
    await submitStudentAssignment(student.id, unresolvedAttempt.id);
    assert.equal(
      await prisma.studentAnswerConceptEvidence.count({
        where: { assignmentId: unresolvedDraft.id },
      }),
      0,
    );

    const revisionBeforeRevocation =
      await prisma.studentCourseConceptMasteryRevision.findFirstOrThrow({
        where: { state: { studentId: student.id, courseId: course.id } },
        orderBy: { revisionNumber: "desc" },
      });
    await prisma.$transaction(async (transaction) => {
      await transaction.studentAnswer.update({
        where: { id: subjectiveAnswer.id },
        data: {
          gradingStatus: GradingStatus.MANUAL_REVIEW_REQUIRED,
          score: null,
          isCorrect: null,
          gradedAt: null,
        },
      });
      const result = await synchronizeAnswerConceptEvidence(
        transaction,
        subjectiveAnswer.id,
      );
      assert.equal(result.status, ConceptEvidenceStatus.REVOKED);
      await recalculateStudentCourseConceptMastery(
        transaction,
        student.id,
        course.id,
      );
    });
    const revisionAfterRevocation =
      await prisma.studentCourseConceptMasteryRevision.findFirstOrThrow({
        where: { state: { studentId: student.id, courseId: course.id } },
        orderBy: { revisionNumber: "desc" },
        include: { entries: true },
      });
    assert.equal(
      revisionAfterRevocation.revisionNumber,
      revisionBeforeRevocation.revisionNumber + 1,
    );
    const primaryAfterRevocation = revisionAfterRevocation.entries.find(
      (entry) => entry.conceptId === concepts[0]!.id,
    );
    assert.equal(primaryAfterRevocation?.evidenceCount, 1);
    assert.equal(primaryAfterRevocation?.availablePoints.toNumber(), 10);
    assert.equal(
      await prisma.studentAnswerConceptEvidence.count({
        where: {
          studentAnswerId: subjectiveAnswer.id,
          status: ConceptEvidenceStatus.REVOKED,
        },
      }),
      1,
    );

    console.log(
      "Concept mastery HTTP integration passed: immutable snapshots, auto/manual evidence, regrading, revocation, version resolution, and authorization.",
    );
  } finally {
    if (sessionIds.length > 0) {
      await prisma.authSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
    }
    await prisma.$disconnect();
    server.kill();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`Concept mastery HTTP integration failed: ${message}`);
  console.error(serverOutput.join(""));
  process.exitCode = 1;
});
