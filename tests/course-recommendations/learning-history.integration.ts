import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl)
  throw new Error(
    "DATABASE_URL is required to provision an isolated local test schema",
  );
const parsed = new URL(developmentUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))
  throw new Error("This check provisions only localhost isolated test schemas");
const schema = `learning_history_test_${Date.now()}`;
if (!/^learning_history_test_\d+$/.test(schema))
  throw new Error("Invalid isolated schema name");
const admin = new PrismaClient({ datasourceUrl: developmentUrl });
parsed.searchParams.set("schema", schema);
process.env.DATABASE_URL = parsed.toString();
process.env.TEST_DATABASE_URL = parsed.toString();

async function main() {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const { prisma } = await import("../../lib/prisma");
  const {
    listLearningConversations,
    getLearningConversation,
    deleteLearningConversation,
    loadConversationForQuestion,
    saveConversationTurn,
  } = await import("../../services/learning-assistant/history");
  try {
    for (const sql of [
      `CREATE TYPE "ClassroomStatus" AS ENUM ('ACTIVE')`,
      `CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE')`,
      'CREATE TABLE "User" ("id" TEXT PRIMARY KEY)',
      'CREATE TABLE "Course" ("id" TEXT PRIMARY KEY)',
      'CREATE TABLE "Classroom" ("id" TEXT PRIMARY KEY, "courseId" TEXT, "status" "ClassroomStatus")',
      'CREATE TABLE "ClassMembership" ("id" TEXT PRIMARY KEY,"classroomId" TEXT,"studentId" TEXT,"status" "MembershipStatus")',
    ])
      await prisma.$executeRawUnsafe(sql);
    const migration = await readFile(
      "prisma/migrations/20261006170000_add_student_learning_conversations/migration.sql",
      "utf8",
    );
    for (const sql of migration
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean))
      await prisma.$executeRawUnsafe(sql);
    const courseTopicMigration = await readFile(
      "prisma/migrations/20261008190000_allow_course_learning_conversations/migration.sql",
      "utf8",
    );
    for (const sql of courseTopicMigration
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean))
      await prisma.$executeRawUnsafe(sql);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" VALUES ('student-a'),('student-b'),('student-c')`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Course" VALUES ('course-a'),('course-b')`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Classroom" VALUES ('class-a','course-a','ACTIVE')`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ClassMembership" VALUES ('member-a','class-a','student-a','ACTIVE'),('member-b','class-a','student-b','ACTIVE')`,
    );
    const request = {
      topic: { kind: "KNOWLEDGE_POINT" as const, id: "loop" },
      text: "range 为什么不包含结束值",
      phase: "QUESTION" as const,
      history: [],
    };
    const reply = {
      status: "ANSWER" as const,
      answer: "左闭右开",
      learningObservation: "练习验证",
      advice: [],
      objectiveSummary: "暂未评估",
      canOfferAdvice: true,
      practiceUrl: null,
      testUrl: null,
      fallbackUsed: false,
      graphVersion: 1,
      profileRevision: null,
      promptVersion: "test-v1",
      provider: "test",
      model: "test",
    };
    const requestId = randomUUID();
    const input = {
      studentId: "student-a",
      courseId: "course-a",
      topicName: "循环结构",
      request,
      requestId,
      question: request.text,
      reply,
      record: null,
    };
    const first = await saveConversationTurn(input);
    const duplicate = await saveConversationTurn({
      ...input,
      reply: { ...reply, answer: "不应覆盖第一次回答" },
    });
    assert.equal(duplicate.id, first.id);
    assert.equal(duplicate.reply.answer, "左闭右开");
    assert.equal(await prisma.studentLearningConversation.count(), 1);
    const detail = await getLearningConversation(
      "student-a",
      "course-a",
      first.id,
    );
    assert.equal(detail.turns.length, 1);
    assert.equal(detail.turns[0].reply.promptVersion, "test-v1");
    const list = await listLearningConversations("student-a", "course-a", 1);
    assert.equal(list.items[0].turnCount, 1);
    assert.equal("turns" in list.items[0], false);
    assert.equal(
      (await listLearningConversations("student-b", "course-a", 1)).items
        .length,
      0,
    );
    await assert.rejects(
      getLearningConversation("student-b", "course-a", first.id),
      /对话不存在/,
    );
    await assert.rejects(
      getLearningConversation("student-a", "course-b", first.id),
      /课程不存在/,
    );
    await assert.rejects(
      getLearningConversation("student-c", "course-a", first.id),
      /课程不存在/,
    );
    const resume = { ...request, conversationId: first.id };
    const loaded = await loadConversationForQuestion(
      "student-a",
      "course-a",
      resume,
      randomUUID(),
    );
    await assert.rejects(
      loadConversationForQuestion(
        "student-a",
        "course-a",
        { ...resume, topic: { ...request.topic, id: "other" } },
        randomUUID(),
      ),
      /主题不一致/,
    );
    const secondId = randomUUID();
    await saveConversationTurn({
      ...input,
      request: resume,
      requestId: secondId,
      record: loaded.record,
    });
    assert.equal(
      (await getLearningConversation("student-a", "course-a", first.id)).turns
        .length,
      2,
    );
    await assert.rejects(
      saveConversationTurn({
        ...input,
        request: resume,
        requestId: randomUUID(),
        record: loaded.record,
      }),
      /对话已变更/,
    );
    const repeat = await loadConversationForQuestion(
      "student-a",
      "course-a",
      resume,
      secondId,
    );
    assert.ok(repeat.repeated);
    const latest = await prisma.studentLearningConversation.findUniqueOrThrow({
      where: { id: first.id },
    });
    await assert.rejects(
      deleteLearningConversation("student-b", "course-a", first.id),
      /对话不存在/,
    );
    await deleteLearningConversation("student-a", "course-a", first.id);
    await deleteLearningConversation("student-a", "course-a", first.id);
    assert.equal(
      (await listLearningConversations("student-a", "course-a", 1)).items
        .length,
      0,
    );
    assert.deepEqual(
      (
        await prisma.studentLearningConversation.findUniqueOrThrow({
          where: { id: first.id },
        })
      ).turns,
      [],
    );
    await assert.rejects(
      saveConversationTurn({
        ...input,
        request: resume,
        requestId: randomUUID(),
        record: latest,
      }),
      /对话不存在/,
    );
    const directInput = {
      ...input,
      request: {
        ...request,
        topic: { kind: "COURSE" as const, id: "course-a" },
      },
      requestId: randomUUID(),
      topicName: "Python 程序设计",
    };
    const direct = await saveConversationTurn(directInput);
    const restoredDirect = await getLearningConversation(
      "student-a",
      "course-a",
      direct.id,
    );
    assert.equal(restoredDirect.topic.kind, "COURSE");
    const directResume = { ...directInput.request, conversationId: direct.id };
    const directLoaded = await loadConversationForQuestion(
      "student-a",
      "course-a",
      directResume,
      randomUUID(),
    );
    await saveConversationTurn({
      ...directInput,
      request: directResume,
      requestId: randomUUID(),
      record: directLoaded.record,
    });
    assert.equal(
      (await getLearningConversation("student-a", "course-a", direct.id)).turns
        .length,
      2,
    );
    await assert.rejects(
      loadConversationForQuestion(
        "student-a",
        "course-a",
        { ...directResume, topic: { kind: "CHAPTER", id: "loop" } },
        randomUUID(),
      ),
      /主题不一致/,
    );
    await assert.rejects(
      getLearningConversation("student-b", "course-a", direct.id),
      /对话不存在/,
    );
    await deleteLearningConversation("student-a", "course-a", direct.id);
    console.log(
      "PASS: course-wide direct conversation migration, persistence, restore, continuation and ownership",
    );
    console.log(
      "PASS: isolated PostgreSQL history persistence, replay, restore, list, ownership, membership, topic, concurrent revision, delete and deletion race checks",
    );
  } finally {
    await prisma.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "History integration failed",
  );
  process.exitCode = 1;
});
