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
    // Actual production HTTP rendering, separate from interactive browser acceptance.
    for (const page of [
      "/student/recommendations?section=ACTIVE",
      "/student/analytics",
      "/student/analytics?classroomId=",
      "/student/recommendations?section=HISTORY&keyword=missing",
      "/student/wrong-questions",
      "/student/wrong-questions?view=favorites&page=1",
    ]) {
      const response = await request(page, studentCookie);
      assert.equal(response.status, 200, page);
      const html = await response.text();
      assert.ok(
        html.includes(
          page.includes("analytics")
            ? "学习分析"
            : page.includes("wrong-questions")
              ? "复习中心"
              : "练习中心",
        ),
      );
      assert.ok(!html.includes("Internal Server Error"));
    }
    const invalidAnalytics = await request(
      `/student/analytics?classroomId=${first.id}`,
      studentCookie,
    );
    // Streamed App Router pages may commit HTTP 200 before notFound renders.
    assert.ok([200, 404].includes(invalidAnalytics.status));
    const invalidHtml = await invalidAnalytics.text();
    assert.match(invalidHtml, /资源不存在/);
    assert.doesNotMatch(invalidHtml, /暂无可查看的教学班/);
    assert.equal(
      new URL((await request("/student/analytics", "")).url).pathname,
      "/login",
    );
    const teacherAnalytics = await request("/student/analytics", teacherCookie);
    const teacherHtml = await teacherAnalytics.text();
    assert.ok(
      new URL(teacherAnalytics.url).pathname === "/403" ||
        teacherHtml.includes("NEXT_REDIRECT;replace;/403"),
    );
    assert.doesNotMatch(teacherHtml, /暂无可查看的教学班/);
    const invalidReview = await request(
      "/student/wrong-questions?courseId=invalid",
      studentCookie,
    );
    assert.equal(invalidReview.status, 200);
    assert.match(await invalidReview.text(), /筛选参数无效/);
    const forbiddenFavorites = await request(
      "/api/student/question-favorites?courseId=not-a-course",
      studentCookie,
    );
    assert.equal(forbiddenFavorites.status, 404);
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
    // Full partial-completion lifecycle through authenticated HTTP, not a browser result.
    const lifecycleStudent = await factory.student();
    const classroom = await factory.classroom(teacher.id);
    await factory.membership(classroom.id, lifecycleStudent.id);
    const cookie = await factory.sessionCookie(lifecycleStudent.id);
    for (let i = 0; i < 3; i++)
      await factory.question(teacher.id, { type: "TRUE_FALSE" });
    const generationInput = {
      studentId: lifecycleStudent.id,
      classroomId: classroom.id,
      requestId: randomUUID(),
      limit: 3,
      recommendedDifficulty: 3,
    };
    const generation = await request(
      "/api/recommendations",
      cookie,
      "POST",
      generationInput,
    );
    assert.equal(generation.status, 200);
    const group = (await generation.json()).data;
    assert.equal(group.items.length, 3);
    assert.equal(group.scoringSummary.totalPoints, 100);
    const repeated = (
      await (
        await request("/api/recommendations", cookie, "POST", generationInput)
      ).json()
    ).data;
    assert.equal(repeated.cycleKey, group.cycleKey);
    const entry = group.items[0];
    assert.equal(
      (
        await request(
          `/api/recommendations/${entry.id}/start`,
          cookie,
          "POST",
          {},
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          `/api/recommendations/${entry.id}/submit`,
          cookie,
          "POST",
          {
            idempotencyKey: randomUUID(),
            answers: [
              { questionId: entry.questionId, kind: "BOOLEAN", value: true },
            ],
          },
        )
      ).status,
      200,
    );
    const savedBefore =
      await prisma.recommendationPracticeAnswer.findUniqueOrThrow({
        where: { recommendationId: entry.id },
      });
    const evidenceBefore = await prisma.learningEvent.count();
    const managementPath = `/api/student/practice-sets/${entry.id}`;
    const end = await request(managementPath, cookie, "PATCH", {
      action: "END",
      expectedRevision: 0,
    });
    assert.equal(end.status, 200);
    const ended = (await end.json()).data;
    assert.ok(ended.endedAt);
    const unsubmitted = group.items[1];
    assert.equal(
      (
        await request(
          `/api/recommendations/${unsubmitted.id}/start`,
          cookie,
          "POST",
          {},
        )
      ).status,
      409,
    );
    const deleted = await request(managementPath, cookie, "PATCH", {
      action: "TRASH",
      expectedRevision: ended.revision,
    });
    assert.equal(deleted.status, 200);
    const trashed = (await deleted.json()).data;
    const trashList = (
      await (
        await request("/api/student/practice-sets?section=TRASH", cookie)
      ).json()
    ).data;
    assert.equal(trashList.total, 1);
    const restore = await request(managementPath, cookie, "PATCH", {
      action: "RESTORE",
      expectedRevision: trashed.revision,
    });
    assert.equal(restore.status, 200);
    const restored = (await restore.json()).data;
    assert.ok(restored.endedAt);
    assert.equal(restored.trashedAt, null);
    const historyList = (
      await (
        await request("/api/student/practice-sets?section=HISTORY", cookie)
      ).json()
    ).data;
    assert.equal(historyList.total, 1);
    assert.equal(historyList.items[0].completed, 1);
    const historicalDetail = (
      await (await request(`/api/recommendations/${entry.id}`, cookie)).json()
    ).data;
    assert.equal(historicalDetail.readOnly, true);
    assert.ok(historicalDetail.content);
    assert.equal(
      (
        await request(
          `/api/recommendations/${unsubmitted.id}/submit`,
          cookie,
          "POST",
          {
            idempotencyKey: randomUUID(),
            answers: [
              {
                questionId: unsubmitted.questionId,
                kind: "BOOLEAN",
                value: true,
              },
            ],
          },
        )
      ).status,
      409,
    );
    const savedAfter =
      await prisma.recommendationPracticeAnswer.findUniqueOrThrow({
        where: { recommendationId: entry.id },
      });
    assert.equal(savedAfter.score.toString(), savedBefore.score.toString());
    assert.equal(
      savedAfter.maxScore.toString(),
      savedBefore.maxScore.toString(),
    );
    assert.equal(await prisma.learningEvent.count(), evidenceBefore);
    const historyPage = await request(
      `/student/recommendations/${entry.id}/practice`,
      cookie,
    );
    assert.equal(historyPage.status, 200);
    const html = await historyPage.text();
    assert.match(html, /只读回看/);
    assert.match(html, /返回练习中心/);
    assert.doesNotMatch(html, />提交全部练习</);
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
