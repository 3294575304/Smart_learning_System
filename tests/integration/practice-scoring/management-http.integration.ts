import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { prisma } from "../../../lib/prisma";
import { integrationPrisma } from "../recommendations/database";
import { RecommendationTestFactory } from "../recommendations/factories";

test("real HTTP verifies management authentication, atomic batches, private responses and old-link write denial", async () => {
  assert.ok(process.env.PRACTICE_HTTP_DIST);
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  listener.close();
  await once(listener, "close");
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
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_DIST_DIR: process.env.PRACTICE_HTTP_DIST,
      },
      windowsHide: true,
      stdio: "ignore",
    },
  );
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/login`)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, "isolated HTTP server ready");
    const factory = new RecommendationTestFactory("management_http");
    const teacher = await factory.teacher(),
      student = await factory.student(),
      other = await factory.student();
    const firstQ = await factory.question(teacher.id, { type: "TRUE_FALSE" }),
      secondQ = await factory.question(teacher.id, { type: "TRUE_FALSE" });
    const create = (studentId: string, questionId: string) =>
      prisma.personalizedRecommendation.create({
        data: {
          studentId,
          questionId,
          cycleKey: randomUUID(),
          source: "RULE",
          reason: "http",
          targetDifficulty: 3,
        },
      });
    const first = await create(student.id, firstQ.id),
      foreign = await create(other.id, secondQ.id);
    const studentCookie = await factory.sessionCookie(student.id),
      teacherCookie = await factory.sessionCookie(teacher.id);
    const path = `/api/student/practice-sets/${first.id}`;
    const request = (
      path: string,
      cookie: string,
      method = "GET",
      body?: unknown,
    ) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    const trash = { action: "TRASH", expectedRevision: 0 };
    assert.equal((await request(path, "", "PATCH", trash)).status, 401);
    assert.equal(
      (await request(path, teacherCookie, "PATCH", trash)).status,
      403,
    );
    assert.equal(
      (
        await request(
          `/api/student/practice-sets/${foreign.id}`,
          studentCookie,
          "PATCH",
          trash,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(path, studentCookie, "PATCH", {
          action: "RENAME",
          title: "",
          expectedRevision: 0,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/api/student/practice-sets/batch",
          studentCookie,
          "POST",
          {
            action: "TRASH",
            items: [
              { id: first.id, expectedRevision: 0 },
              { id: foreign.id, expectedRevision: 0 },
            ],
          },
        )
      ).status,
      404,
    );
    assert.equal(
      await prisma.practiceSetManagement.count({
        where: { studentId: student.id, trashedAt: { not: null } },
      }),
      0,
    );
    const renamed = await request(path, studentCookie, "PATCH", {
      action: "RENAME",
      title: "HTTP专属练习",
      expectedRevision: 0,
    });
    assert.equal(renamed.status, 200);
    assert.match(renamed.headers.get("cache-control") ?? "", /private/);
    assert.equal(
      (
        await request(path, studentCookie, "PATCH", {
          ...trash,
          expectedRevision: 0,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(path, studentCookie, "PATCH", {
          ...trash,
          expectedRevision: 1,
        })
      ).status,
      200,
    );
    const listed = await request(
      "/api/student/practice-sets?section=TRASH",
      studentCookie,
    );
    assert.equal(listed.status, 200);
    const list = await listed.json();
    assert.equal(list.data.items.length, 1);
    assert.equal(list.data.items[0].title, "HTTP专属练习");
    const detail = await request(
      `/api/recommendations/${first.id}`,
      studentCookie,
    );
    assert.equal(detail.status, 200);
    const dto = await detail.json();
    assert.equal(dto.data.readOnly, true);
    assert.equal(dto.data.content, firstQ.content);
    assert.equal(
      (
        await request(
          `/api/recommendations/${first.id}/start`,
          studentCookie,
          "POST",
          {},
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await request(path, studentCookie, "PATCH", {
          action: "RESTORE",
          expectedRevision: 2,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          `/api/recommendations/${first.id}/submit`,
          studentCookie,
          "POST",
          {
            idempotencyKey: randomUUID(),
            answers: [{ questionId: firstQ.id, kind: "BOOLEAN", value: true }],
          },
        )
      ).status,
      409,
    );
    const history = await request(
      "/api/student/practice-sets?section=HISTORY",
      studentCookie,
    );
    assert.equal((await history.json()).data.items.length, 1);
    assert.equal(
      await prisma.recommendationPracticeAnswer.count({
        where: { recommendationId: first.id },
      }),
      0,
    );
  } finally {
    server.kill();
    if (server.exitCode === null)
      await Promise.race([
        once(server, "exit"),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    await Promise.all([prisma.$disconnect(), integrationPrisma.$disconnect()]);
  }
});
