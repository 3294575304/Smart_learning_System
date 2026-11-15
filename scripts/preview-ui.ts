import "dotenv/config";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { once } from "node:events";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { seedUIReviewFixture } from "../tests/helpers/ui-review-fixture";
import {
  dropIsolatedSchema,
  isolatedDatabaseUrl,
  validateTestDatabaseUrl,
} from "../tests/integration/database";

// A separate, disposable database schema is mandatory, even for visual review.
async function main() {
  const base = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const schema = `ui_it_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const root = resolve(".data/ui-stage-1-3", schema);
  mkdirSync(root, { recursive: true });
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string")
    throw new Error("No preview port");
  const port = address.port;
  await new Promise<void>((done) => listener.close(() => done()));
  const password = `Ui-${randomBytes(18).toString("hex")}-Aa1!`;
  const environment = {
    ...process.env,
    DATABASE_URL: isolatedDatabaseUrl(base, schema),
    NEXT_DIST_DIR: `.data/ui-stage-1-3/${schema}/next`,
    LOCAL_UPLOAD_ROOT: resolve(root, "uploads"),
    AI_PROVIDER: "mock",
    TEACHER_EVALUATION_ASSISTANT_DISABLED: "true",
    SEED_ADMIN_EMAIL: "ui-admin@example.test",
    SEED_ADMIN_PASSWORD: password,
    SEED_TEACHER_EMAIL: "ui-teacher@example.test",
    SEED_TEACHER_PASSWORD: password,
    SEED_STUDENT_EMAIL: "ui-student@example.test",
    SEED_STUDENT_PASSWORD: password,
    SEED_SUPER_ADMIN_PASSWORD: password,
  };
  const prisma = new PrismaClient({ datasourceUrl: environment.DATABASE_URL });
  const originalConfigs = new Map(
    ["next-env.d.ts", "tsconfig.json"].map((path) => [
      path,
      readFileSync(path, "utf8"),
    ]),
  );
  const generatedConfigs = new Map<string, string>();
  let server: ReturnType<typeof spawn> | undefined;
  let stopWatcher: ReturnType<typeof setInterval> | undefined;
  let finishing = false;
  const stop = async () => {
    if (finishing) return;
    finishing = true;
    if (stopWatcher) clearInterval(stopWatcher);
    if (server && server.exitCode === null) {
      const exited = once(server, "exit");
      if (process.platform === "win32" && server.pid) {
        spawnSync("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      } else server.kill();
      const timer = setTimeout(() => server?.kill("SIGKILL"), 5000);
      try {
        await exited;
      } finally {
        clearTimeout(timer);
      }
    }
    await prisma.$disconnect();
    await dropIsolatedSchema(base, schema);
  };
  try {
    for (const args of [
      ["migrate", "deploy"],
      ["db", "seed"],
    ]) {
      const result = spawnSync(
        process.execPath,
        [resolve("node_modules/prisma/build/index.js"), ...args],
        { env: environment, stdio: "inherit", windowsHide: true },
      );
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(`Preview preparation failed: ${args[0]}`);
    }
    const teacher = await prisma.user.findUniqueOrThrow({
      where: { email: environment.SEED_TEACHER_EMAIL },
    });
    const course = await prisma.course.findFirstOrThrow({
      where: { teacherId: teacher.id },
    });
    await prisma.course.update({
      where: { id: course.id },
      data: { name: "Python 程序设计 · 界面验收课程" },
    });
    await prisma.classroom.updateMany({
      where: { teacherId: teacher.id },
      data: { courseId: course.id },
    });
    const classrooms = await seedUIReviewFixture(prisma, course.id, teacher.id);
    const schools = await prisma.school.findMany({ select: { id: true } });
    for (const [index, school] of schools.entries()) {
      await prisma.school.update({
        where: { id: school.id },
        data: { name: `界面验收学校 ${index + 1}` },
      });
    }
    const details = {
      schema,
      root,
      url: `http://127.0.0.1:${port}`,
      password,
      teacherEmail: environment.SEED_TEACHER_EMAIL,
      studentEmail: environment.SEED_STUDENT_EMAIL,
      schoolId: teacher.schoolId,
      courseId: course.id,
      classrooms,
    };
    writeFileSync(
      resolve(root, "fixture.json"),
      JSON.stringify(details, null, 2),
    );
    writeFileSync(
      resolve(".data/ui-stage-1-3/active.json"),
      JSON.stringify(details, null, 2),
    );
    const production = process.argv.includes("--production");
    if (production) {
      const built = spawnSync(
        process.execPath,
        [resolve("node_modules/next/dist/bin/next"), "build"],
        {
          env: { ...environment, NODE_ENV: "production" },
          stdio: "inherit",
          windowsHide: true,
        },
      );
      for (const path of originalConfigs.keys())
        generatedConfigs.set(path, readFileSync(path, "utf8"));
      if (built.error) throw built.error;
      if (built.status !== 0)
        throw new Error("Isolated UI production build failed");
    }
    server = spawn(
      process.execPath,
      [
        resolve("node_modules/next/dist/bin/next"),
        production ? "start" : "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        env: {
          ...environment,
          NODE_ENV: production ? "production" : "development",
        },
        stdio: "inherit",
        windowsHide: true,
      },
    );
    process.once("SIGINT", () => {
      void stop();
    });
    process.once("SIGTERM", () => {
      void stop();
    });
    stopWatcher = setInterval(() => {
      if (existsSync(resolve(root, "stop"))) void stop();
    }, 500);
    await once(server, "exit");
  } finally {
    try {
      await stop();
    } finally {
      // Next writes these files for its temporary distDir. Restore only the
      // exact generated contents, preserving changes from concurrent editors.
      for (const [path, original] of originalConfigs) {
        const generated = generatedConfigs.get(path);
        if (generated === undefined || generated === original) continue;
        if (readFileSync(path, "utf8") === generated)
          writeFileSync(path, original);
        else
          console.warn(`Preview left concurrently modified ${path} untouched.`);
      }
    }
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Preview failed");
  process.exitCode = 1;
});
