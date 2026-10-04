import "dotenv/config";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient, Role } from "@prisma/client";
const original = process.env.DATABASE_URL;
if (!original) throw new Error("Local DATABASE_URL required");
const url = new URL(original);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  throw new Error("Only local isolated schemas are supported");
const schema = `favorites_test_${Date.now()}`;
if (!/^favorites_test_\d+$/.test(schema))
  throw new Error("Invalid test schema");
const admin = new PrismaClient({ datasourceUrl: original });
url.searchParams.set("schema", schema);
process.env.DATABASE_URL = url.toString();
process.env.TEST_DATABASE_URL = url.toString();
async function main() {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  let disconnect: () => Promise<void> = async () => {};
  try {
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { env: process.env, stdio: "pipe" },
    );
    const { prisma } = await import("../../lib/prisma");
    disconnect = () => prisma.$disconnect();
    const {
      saveFavorite,
      getFavoriteState,
      listFavorites,
      updateFavoriteNote,
      removeFavorite,
      practiceFavorite,
      getFavoriteDetail,
    } = await import("../../services/question-favorites/service");
    const { createCourseRecommendations } =
      await import("../../services/course-recommendations/service");
    const { startRecommendation } =
      await import("../../services/recommendations/service");
    const { submitRecommendationPractice } =
      await import("../../services/recommendations/practice");
    const teacher = await prisma.user.create({
      data: { role: Role.TEACHER, passwordHash: "synthetic-no-login" },
    });
    const student = await prisma.user.create({
      data: { role: Role.STUDENT, passwordHash: "synthetic-no-login" },
    });
    const other = await prisma.user.create({
      data: { role: Role.STUDENT, passwordHash: "synthetic-no-login" },
    });
    const actor = {
      id: student.id,
      role: Role.STUDENT,
      email: null,
      displayName: null,
      mustChangePassword: false,
    };
    const outsider = { ...actor, id: other.id };
    const classroom = await prisma.classroom.create({
      data: {
        teacherId: teacher.id,
        name: "收藏测试班",
        joinCode: randomUUID(),
        memberships: {
          create: [{ studentId: student.id }, { studentId: other.id }],
        },
      },
    });
    const point = await prisma.knowledgePoint.create({
      data: { createdById: teacher.id, code: randomUUID(), name: "循环结构" },
    });
    const question = await prisma.question.create({
      data: {
        creatorId: teacher.id,
        title: "Python 判断练习",
        content: "range(5) 包含 5",
        type: "TRUE_FALSE",
        difficulty: 2,
        status: "ACTIVE",
        visibility: "PRIVATE",
        explanation: "左闭右开",
        correctBoolean: false,
        knowledgePointLinks: { create: { knowledgePointId: point.id } },
      },
    });
    const recommendation = await prisma.personalizedRecommendation.create({
      data: {
        studentId: student.id,
        questionId: question.id,
        cycleKey: randomUUID(),
        status: "COMPLETED",
        source: "RULE",
        reason: "测试推荐",
        targetDifficulty: 2,
      },
    });
    const input = {
      source: { kind: "RECOMMENDATION" as const, id: recommendation.id },
    };
    const first = await saveFavorite(actor, question.id, input);
    const again = await saveFavorite(actor, question.id, input);
    assert.equal(first.id, again.id);
    assert.equal(await prisma.studentQuestionFavorite.count(), 1);
    const assignment = await prisma.assignment.create({
      data: {
        classroomId: classroom.id,
        teacherId: teacher.id,
        title: "收藏作业来源",
        status: "PUBLISHED",
        publishedAt: new Date(),
        totalPoints: 10,
        questions: {
          create: {
            questionId: question.id,
            sortOrder: 0,
            points: 10,
            titleSnapshot: question.title,
            contentSnapshot: question.content,
            typeSnapshot: question.type,
            difficultySnapshot: 2,
            explanationSnapshot: question.explanation,
            correctBooleanSnapshot: false,
            knowledgePointSnapshots: {
              create: {
                knowledgePointId: point.id,
                nameSnapshot: point.name,
                codeSnapshot: point.code,
                weightSnapshot: 1,
              },
            },
          },
        },
      },
      include: { questions: true },
    });
    const assignmentInput = {
      source: { kind: "ASSIGNMENT" as const, id: assignment.questions[0].id },
    };
    assert.equal(
      (await saveFavorite(actor, question.id, assignmentInput)).id,
      first.id,
    );
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { status: "DRAFT", publishedAt: null },
    });
    await assert.rejects(
      saveFavorite(actor, question.id, assignmentInput),
      /题目不存在/,
    );

    assert.equal(await prisma.wrongQuestion.count(), 0);
    assert.equal(await prisma.learningEvent.count(), 0);
    await assert.rejects(
      saveFavorite(outsider, question.id, input),
      /题目不存在/,
    );
    await assert.rejects(
      saveFavorite({ ...actor, role: Role.ADMIN }, question.id, input),
      /无权|权限|角色|访问/,
    );
    await assert.rejects(
      saveFavorite(actor, "foreign-question", input),
      /题目不存在/,
    );
    const note = await updateFavoriteNote(actor, question.id, {
      note: "列表切片还需练习",
      expectedRevision: 0,
    });
    assert.equal(note.revision, 1);
    await saveFavorite(actor, question.id, input);
    assert.equal(
      (await getFavoriteState(actor, question.id)).note,
      "列表切片还需练习",
    );
    await assert.rejects(
      updateFavoriteNote(actor, question.id, {
        note: "覆盖他人修改",
        expectedRevision: 0,
      }),
      /其他页面/,
    );
    await assert.rejects(
      updateFavoriteNote(outsider, question.id, {
        note: "越权",
        expectedRevision: 0,
      }),
      /收藏不存在/,
    );
    const list = await listFavorites(actor, {
      courseId: "GENERAL",
      knowledgePointId: point.id,
      search: "切片",
      type: "TRUE_FALSE",
    });
    assert.equal(list.total, 1);
    assert.equal(list.items[0].available, true);
    assert.equal("correctBoolean" in list.items[0], false);
    assert.equal((await listFavorites(outsider, {})).total, 0);
    const detail = await getFavoriteDetail(actor, question.id);
    assert.equal("correctBoolean" in (detail.question ?? {}), false);
    assert.equal("explanation" in (detail.question ?? {}), false);
    const practice = await practiceFavorite(actor, question.id, {
      requestId: randomUUID(),
    });
    const newId = practice.practiceUrl.split("/").at(-2);
    assert.notEqual(newId, recommendation.id);
    assert.equal(
      (
        await prisma.personalizedRecommendation.findUniqueOrThrow({
          where: { id: recommendation.id },
        })
      ).status,
      "COMPLETED",
    );
    assert.equal(
      (await practiceFavorite(actor, question.id, { requestId: randomUUID() }))
        .practiceUrl,
      practice.practiceUrl,
    );
    await prisma.question.update({
      where: { id: question.id },
      data: { status: "DRAFT" },
    });
    assert.equal((await listFavorites(actor, {})).items[0].available, false);
    assert.equal((await getFavoriteDetail(actor, question.id)).question, null);
    await assert.rejects(
      practiceFavorite(actor, question.id, { requestId: randomUUID() }),
      /下架/,
    );
    await prisma.question.update({
      where: { id: question.id },
      data: { status: "ACTIVE" },
    });
    await prisma.classMembership.updateMany({
      where: { studentId: student.id },
      data: { status: "LEFT", endedAt: new Date() },
    });
    assert.equal((await listFavorites(actor, {})).items[0].available, false);
    await assert.rejects(saveFavorite(actor, question.id, input), /题目不存在/);
    await removeFavorite(outsider, question.id);
    assert.equal((await getFavoriteState(actor, question.id)).favorited, true);
    await removeFavorite(actor, question.id);
    await removeFavorite(actor, question.id);
    assert.equal((await getFavoriteState(actor, question.id)).favorited, false);
    assert.equal(await prisma.wrongQuestion.count(), 0);
    assert.equal(await prisma.learningEvent.count(), 0);
    await prisma.classMembership.updateMany({
      where: { studentId: student.id },
      data: { status: "ACTIVE", endedAt: null },
    });
    await prisma.personalizedRecommendation.updateMany({
      where: { studentId: student.id, status: { in: ["PENDING", "STARTED"] } },
      data: { status: "EXPIRED" },
    });
    const template = await prisma.courseTemplate.create({
      data: { code: randomUUID(), name: "Python" },
    });
    const course = await prisma.course.create({
      data: {
        templateId: template.id,
        teacherId: teacher.id,
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
    const originalCycle = await createCourseRecommendations(actor, course.id, {
      classroomId: classroom.id,
      conceptIds: [concept.id],
      questionTypes: ["TRUE_FALSE"],
      mode: "PRACTICE",
      template: "TRUE_FALSE10",
      practiceCount: 1,
      count: 1,
      difficulty: 2,
    });
    assert.equal(originalCycle.items.length, 1);
    const originalItem = originalCycle.items[0];
    if (!originalItem) throw new Error("Missing original practice");
    await startRecommendation(actor, originalItem.id);
    await submitRecommendationPractice(actor, originalItem.id, {
      idempotencyKey: randomUUID(),
      answers: [{ questionId: question.id, kind: "BOOLEAN", value: false }],
    });
    const originalSnapshot =
      await prisma.courseRecommendationConceptSnapshot.findMany({
        where: { recommendationId: originalItem.id },
      });
    assert.equal(originalSnapshot.length, 1);
    await saveFavorite(actor, question.id, {
      source: { kind: "RECOMMENDATION", id: originalItem.id },
    });
    // 自主收藏复习只要求正式课程绑定，不依赖教师已授课范围。
    await prisma.course.update({
      where: { id: course.id },
      data: { currentTeachingProgressRevisionId: null },
    });
    const courseFavorites = await listFavorites(actor, {
      courseId: course.id,
      knowledgePointId: concept.id,
    });
    assert.equal(courseFavorites.total, 1);
    assert.equal(courseFavorites.items[0].available, true);
    const newCoursePractice = await practiceFavorite(actor, question.id, {
      requestId: randomUUID(),
    });
    assert.ok(newCoursePractice.practiceUrl.startsWith("/student/practice/"));
    const cycleId = newCoursePractice.practiceUrl.split("/").at(-1);
    assert.notEqual(cycleId, originalCycle.cycle.id);
    const newRecord = await prisma.personalizedRecommendation.findFirstOrThrow({
      where: { courseCycleId: cycleId },
    });
    assert.equal(newRecord.questionId, question.id);
    assert.equal(
      (
        await prisma.courseRecommendationConceptSnapshot.findMany({
          where: { recommendationId: newRecord.id },
        })
      ).length,
      1,
    );
    assert.deepEqual(
      await prisma.courseRecommendationConceptSnapshot.findMany({
        where: { recommendationId: originalItem.id },
      }),
      originalSnapshot,
    );
    // 空白文字按零分完成；已完成重试不追加第二条答案。
    for (const type of [
      "FILL_BLANK",
      "SHORT_ANSWER",
      "PYTHON_PROGRAMMING",
    ] as const) {
      const blankQuestion = await prisma.question.create({
        data: {
          creatorId: teacher.id,
          title: "空答规则验收",
          content: "验收样本",
          type,
          difficulty: 2,
          status: "ACTIVE",
          visibility: "PUBLIC",
          explanation: "空答为零分",
          acceptableAnswers: type === "FILL_BLANK" ? ["expected"] : [],
          referenceAnswer: type === "SHORT_ANSWER" ? "参考答案" : null,
        },
      });
      const blankRecommendation =
        await prisma.personalizedRecommendation.create({
          data: {
            studentId: student.id,
            questionId: blankQuestion.id,
            cycleKey: randomUUID(),
            status: "PENDING",
            source: "RULE",
            reason: "空答测试",
            targetDifficulty: 2,
          },
        });
      await startRecommendation(actor, blankRecommendation.id);
      await assert.rejects(
        submitRecommendationPractice(outsider, blankRecommendation.id, {
          idempotencyKey: randomUUID(),
          answers: [{ questionId: blankQuestion.id, kind: "TEXT", value: "" }],
        }),
      );
      if (type === "SHORT_ANSWER")
        await assert.rejects(
          submitRecommendationPractice(actor, blankRecommendation.id, {
            idempotencyKey: randomUUID(),
            answers: [
              {
                questionId: blankQuestion.id,
                kind: "TEXT",
                value: "非空简答不能自动判零",
              },
            ],
          }),
          /自动判分/,
        );
      const blankInput = {
        idempotencyKey: randomUUID(),
        answers: [{ questionId: blankQuestion.id, kind: "TEXT", value: "  " }],
      };
      const blankResult = await submitRecommendationPractice(
        actor,
        blankRecommendation.id,
        blankInput,
      );
      assert.equal(blankResult.score, 0);
      assert.equal(blankResult.answers[0].studentAnswer, "未作答");
      await submitRecommendationPractice(
        actor,
        blankRecommendation.id,
        blankInput,
      );
      assert.equal(
        await prisma.recommendationPracticeAnswer.count({
          where: { recommendationId: blankRecommendation.id },
        }),
        1,
      );
    }
    const { summarizeWrongCourses, listWrongQuestions } =
      await import("../../services/wrong-questions/service");
    const courseAnswer =
      await prisma.recommendationPracticeAnswer.findFirstOrThrow({
        where: { recommendationId: originalItem.id },
      });
    await prisma.wrongQuestion.upsert({
      where: {
        studentId_questionId: {
          studentId: student.id,
          questionId: question.id,
        },
      },
      create: {
        studentId: student.id,
        questionId: question.id,
        recommendationAnswerId: courseAnswer.id,
      },
      update: { recommendationAnswerId: courseAnswer.id, isResolved: false },
    });
    const chapterConcept = await prisma.knowledgeGraphConcept.create({
      data: { courseId: course.id, stableKey: "chapter-loop" },
    });
    const chapterNode = await prisma.publishedKnowledgeGraphNode.create({
      data: {
        graphVersionId: graph.id,
        conceptId: chapterConcept.id,
        nodeType: "CHAPTER",
        code: "CH-1",
        name: "第一章循环",
        sourceType: "TEACHER",
        sourceRefs: [],
        sortOrder: 1,
      },
    });
    await prisma.publishedKnowledgeGraphEdge.create({
      data: {
        graphVersionId: graph.id,
        fromNodeId: chapterNode.id,
        toNodeId: node.id,
        relationType: "CONTAINS",
        sourceType: "TEACHER",
        sourceRefs: [],
      },
    });
    const filtered = await listWrongQuestions(student.id, {
      courseId: course.id,
      chapterId: chapterNode.id,
      isMastered: false,
    });
    assert.equal(filtered.pagination.total, 1);
    assert.equal(
      (
        await listWrongQuestions(student.id, {
          courseId: course.id,
          isMastered: true,
        })
      ).pagination.total,
      0,
    );
    assert.equal(
      (
        await listWrongQuestions(student.id, {
          courseId: course.id,
          keyword: "no-matching-question-987",
        })
      ).pagination.total,
      0,
    );
    const summaries = await summarizeWrongCourses(student.id, course.id);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].total, 1);
    assert.equal(summaries[0].pending, 1);
    assert.equal(summaries[0].topics[0].id, chapterNode.id);
    assert.equal(summaries[0].topics[0].count, 1);
    assert.equal(summaries[0].unmapped, 0);
    assert.equal((await summarizeWrongCourses("missing-student")).length, 0);
    assert.equal(
      (await summarizeWrongCourses(student.id, "missing-course")).length,
      0,
    );
    await prisma.classMembership.updateMany({
      where: { studentId: student.id },
      data: { status: "LEFT", endedAt: new Date() },
    });
    await assert.rejects(
      practiceFavorite(actor, question.id, { requestId: randomUUID() }),
      /访问权限/,
    );
    console.log(
      "PASS: isolated database migrations; unique/idempotent favorites; own notes and conflict; filters; hidden-answer isolation; invalid/revoked access; cancellation independent of wrong questions; repeat practice uses fresh records and formal course snapshots without rewriting history",
    );
  } finally {
    await disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Favorites integration failed",
  );
  process.exitCode = 1;
});
