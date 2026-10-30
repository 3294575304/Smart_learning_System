import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import {
  dropIsolatedSchema,
  isolatedDatabaseUrl,
  validateTestDatabaseUrl,
} from "../database";
const temp = "D:/OpenAIData/tmp/practice-centers-stage3-20261028";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function worker() {
  const { prisma } = await import("../../../lib/prisma");
  const { integrationPrisma } = await import("../recommendations/database");
  const { RecommendationTestFactory } =
    await import("../recommendations/factories");
  const { hash } = await import("bcryptjs");
  const factory = new RecommendationTestFactory("browser_stage3");
  const teacher = await factory.teacher(),
    student = await factory.student();
  await prisma.user.update({
    where: { id: student.id },
    data: {
      email: "practice-stage3@example.test",
      passwordHash: await hash("PracticeStage3!2026", 10),
      profile: { update: { displayName: "练习验收学生" } },
    },
  });
  const classroom = await factory.classroom(teacher.id);
  await prisma.classroom.update({
    where: { id: classroom.id },
    data: { name: "第三阶段验收班" },
  });
  await factory.membership(classroom.id, student.id);
  const questions = [];
  for (let i = 0; i < 3; i++) {
    const q = await factory.question(teacher.id, { type: "TRUE_FALSE" });
    await prisma.question.update({
      where: { id: q.id },
      data: {
        title: `Python 判断题 ${i + 1}`,
        content: "Python 中列表可以存放多个元素。",
        explanation: "列表是一种可变的序列，可以存放多个元素。",
      },
    });
    questions.push(q);
  }
  const old = await prisma.personalizedRecommendation.create({
    data: {
      studentId: student.id,
      questionId: questions[0].id,
      cycleKey: randomUUID(),
      source: "RULE",
      reason: "历史兼容验收",
      targetDifficulty: 3,
      status: "EXPIRED",
    },
  });
  await prisma.practiceSetManagement.create({
    data: {
      studentId: student.id,
      cycleKey: old.cycleKey,
      title:
        "历史练习：用于验证手机窄屏下较长名称换行以及题目只读回看的布局表现",
    },
  });
  const portProbe = createServer();
  portProbe.listen(3218, "127.0.0.1");
  await once(portProbe, "listening");
  portProbe.close();
  await once(portProbe, "close");
  const server = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      "3218",
    ],
    {
      env: { ...process.env, NODE_ENV: "production" },
      windowsHide: true,
      stdio: "ignore",
    },
  );
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch("http://127.0.0.1:3218/login")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await pause(250);
    }
    if (!ready) throw new Error("Isolated browser server did not start");
    writeFileSync(
      `${temp}/browser-ready.json`,
      JSON.stringify({
        port: 3218,
        studentId: student.id,
        historyId: old.id,
        classroomId: classroom.id,
      }),
    );
    console.log("Isolated browser test ready on port 3218");
    for (let i = 0; i < 2400 && !existsSync(`${temp}/browser-stop`); i++)
      await pause(500);
    const generated = await prisma.personalizedRecommendation.findMany({
      where: { studentId: student.id, NOT: { id: old.id } },
      select: {
        cycleKey: true,
        status: true,
        assignedPoints: true,
        practiceAnswer: { select: { score: true, maxScore: true } },
      },
    });
    const managed = await prisma.practiceSetManagement.findMany({
      where: { studentId: student.id, NOT: { cycleKey: old.cycleKey } },
      select: { title: true, endedAt: true, trashedAt: true, revision: true },
    });
    writeFileSync(
      `${temp}/browser-db-result.json`,
      JSON.stringify({ generated, managed }, null, 2),
    );
  } finally {
    server.kill();
    if (server.exitCode === null)
      await Promise.race([once(server, "exit"), pause(5000)]);
    await Promise.all([prisma.$disconnect(), integrationPrisma.$disconnect()]);
  }
}
async function main() {
  if (process.argv[2] === "worker") return worker();
  mkdirSync(temp, { recursive: true });
  rmSync(`${temp}/browser-stop`, { force: true });
  rmSync(`${temp}/browser-ready.json`, { force: true });
  const base = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const schema = `practice_browser_it_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const env = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(base, schema),
    RECOMMENDATION_INTEGRATION_SCHEMA: schema,
    AI_PROVIDER: "mock",
    NEXT_DIST_DIR: ".data/next-practice-centers-stage3-20261028",
  };
  try {
    const migration = spawnSync(
      process.execPath,
      [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
      { env, stdio: "pipe", windowsHide: true },
    );
    if (migration.status !== 0)
      throw new Error("Isolated browser migration failed");
    const child = spawn(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        resolve("tests/integration/practice-scoring/browser-run.ts"),
        "worker",
      ],
      { env, stdio: "inherit", windowsHide: true },
    );
    await once(child, "exit");
    if (child.exitCode !== 0) throw new Error("Browser worker failed");
  } finally {
    await dropIsolatedSchema(base, schema);
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Browser integration failed",
  );
  process.exitCode = 1;
});
