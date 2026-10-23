import "dotenv/config";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { PrismaClient, QuestionType } from "@prisma/client";
import { defaultAnswerDraft } from "@/services/questions/form-draft";
import { questionUpsertSchema } from "@/services/questions/schemas";

async function main() {
  const original = process.env.DATABASE_URL;
  if (!original) throw new Error("Local DATABASE_URL required");
  const url = new URL(original);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Only local isolated schemas supported");
  const schema = `question_create_test_${Date.now()}`;
  const admin = new PrismaClient({ datasourceUrl: original });
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  process.env.TEST_DATABASE_URL = url.toString();
  let disconnect = async () => {};
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { env: process.env, stdio: "pipe" },
    );
    const { prisma } = await import("@/lib/prisma");
    disconnect = () => prisma.$disconnect();
    const { createQuestion, getTeacherQuestion, updateQuestion } =
      await import("@/services/questions/service");
    const teacher = await prisma.user.create({
      data: { role: "TEACHER", passwordHash: "isolated-test-no-login" },
    });
    const other = await prisma.user.create({
      data: { role: "TEACHER", passwordHash: "isolated-test-no-login" },
    });
    const category = await prisma.questionCourseCategory.create({
      data: { name: "题型创建测试", normalizedName: "question-create-test" },
    });
    for (const type of Object.values(QuestionType)) {
      const draft = defaultAnswerDraft(type);
      draft.options.forEach((option) => {
        option.content = `内容 ${option.label}`;
      });
      if (draft.answer.kind === "CHOICE")
        draft.answer.correctOptionLabels =
          type === "SINGLE_CHOICE" ? ["B"] : ["A", "C"];
      if (draft.answer.kind === "TEXT")
        draft.answer.acceptableAnswers = ["0", "零"];
      if (draft.answer.kind === "REFERENCE")
        draft.answer.value = "参考答案与评分要点";
      const input = questionUpsertSchema.parse({
        title: `创建验收 ${type}`,
        content: "测试题干",
        type,
        questionCategoryId: category.id,
        difficulty: 3,
        ...draft,
        explanation: "解析",
        tags: ["验收知识点"],
        knowledgePointIds: [],
      });
      const created = await createQuestion(teacher.id, input);
      assert.equal(created.type, type);
      assert.deepEqual(created.answer, input.answer);
      assert.equal(created.options.length, input.options.length);
      assert.equal(
        (await getTeacherQuestion(other.id, created.id)).id,
        created.id,
      );
      const updated = await updateQuestion(
        teacher.id,
        created.id,
        {
          ...input,
          title: `更新验收 ${type}`,
          revision: created.revision,
        },
        { ipAddress: null, userAgent: "question-create-test" },
      );
      assert.equal(updated.title, `更新验收 ${type}`);
      assert.deepEqual(updated.answer, input.answer);
      await assert.rejects(
        updateQuestion(
          teacher.id,
          created.id,
          {
            ...input,
            title: `过期验收 ${type}`,
            revision: created.revision,
          },
          { ipAddress: null, userAgent: "question-create-test" },
        ),
        /题目已被其他教师修改/u,
      );
    }
    assert.equal(await prisma.question.count(), 6);
    console.log(
      "PASS: six shared question types create/read/update, optimistic edit conflicts, isolated migrations",
    );
  } finally {
    await disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Integration failed");
  process.exitCode = 1;
});
