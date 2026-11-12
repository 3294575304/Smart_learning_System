import assert from "node:assert/strict";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import {
  getTeacherClassroomDeletionPreview as preview,
  deleteTeacherClassroom as remove,
} from "@/services/classrooms/deletion";
import {
  getTeacherClassroom,
  listTeacherClassrooms,
  listTeacherHistoricalClassrooms,
  completeClassroom,
  joinClassroom,
  updateClassroom,
} from "@/services/classrooms/service";
import { assertIsolatedIntegrationEnvironment } from "../integration/database";

assertIsolatedIntegrationEnvironment("CLASSROOM_DELETION_SCHEMA");
const context = { ipAddress: null, userAgent: "isolated-classroom-delete" };
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
  const course = await prisma.course.findFirstOrThrow({
    where: { teacherId: teacher.id },
  });
  const create = (name: string) =>
    prisma.classroom.create({
      data: {
        teacherId: teacher.id,
        courseId: course.id,
        name,
        joinCode: randomUUID().slice(0, 8),
      },
    });
  const input = async (id: string) => {
    const p = await preview(teacher.id, id);
    return {
      action: "DELETE_CLASSROOM" as const,
      confirmed: true as const,
      confirmedName: p.name,
      token: p.token,
      reason: "",
    };
  };

  const empty = await create("误建空班级");
  assert.equal((await preview(teacher.id, empty.id)).blockedReason, null);
  await assert.rejects(preview(other.id, empty.id), /班级不存在/);
  await assert.rejects(preview(student.id, empty.id), /班级不存在/);
  const token = await input(empty.id);
  await assert.rejects(
    remove(other.id, empty.id, token, context),
    /班级不存在/,
  );
  await assert.rejects(
    remove(teacher.id, empty.id, { ...token, confirmed: false }, context),
  );
  await assert.rejects(
    remove(teacher.id, empty.id, token, context, {
      writeAuditLog: async () => {
        throw new Error("audit-test-failure");
      },
    }),
    /audit-test-failure/,
  );
  assert.equal(
    (await prisma.classroom.findUniqueOrThrow({ where: { id: empty.id } }))
      .status,
    "ACTIVE",
  );
  await updateClassroom(teacher.id, empty.id, {
    name: "更名后的空班",
    description: null,
    allowStudentLeave: false,
  });
  await assert.rejects(remove(teacher.id, empty.id, token, context), /已变化/);
  const fresh = await input(empty.id);
  await Promise.all([
    remove(teacher.id, empty.id, fresh, context),
    remove(teacher.id, empty.id, fresh, context),
  ]);
  assert.equal(
    await prisma.auditLog.count({
      where: { targetId: empty.id, action: "CLASSROOM_DISSOLVED" },
    }),
    1,
  );
  await assert.rejects(getTeacherClassroom(teacher.id, empty.id), /班级不存在/);
  await assert.rejects(
    updateClassroom(teacher.id, empty.id, {
      name: "禁止修改已删除班",
      description: null,
      allowStudentLeave: false,
    }),
    /班级不存在/,
  );
  await assert.rejects(joinClassroom(student.id, empty.joinCode));
  assert.ok(
    !(await listTeacherClassrooms(teacher.id)).some((c) => c.id === empty.id),
  );
  const history = await listTeacherHistoricalClassrooms(teacher.id);
  const archived = history.find((c) => c.id === empty.id);
  assert.equal(archived?.name, "更名后的空班");
  assert.equal(archived?.course?.name, course.name);
  assert.ok(archived?.dissolvedAt instanceof Date);
  assert.ok(
    !(await listTeacherHistoricalClassrooms(other.id)).some(
      (c) => c.id === empty.id,
    ),
  );

  const used = await create("保留历史教学数据班");
  const keep = await create("不受影响的其他班级");
  const member = await prisma.classMembership.create({
    data: { classroomId: used.id, studentId: student.id },
  });
  await prisma.classMembership.create({
    data: { classroomId: keep.id, studentId: student.id },
  });
  const identity = await prisma.studentIdentity.create({
    data: {
      studentNo: `DEL${randomBytes(5).toString("hex")}`,
      name: "待认领测试学生",
    },
  });
  const pending = await prisma.studentIdentityClassroomAssignment.create({
    data: { classroomId: used.id, studentIdentityId: identity.id },
  });
  assert.match(
    (await preview(teacher.id, used.id)).blockedReason ?? "",
    /先.*结课/,
  );
  await assert.rejects(
    remove(teacher.id, used.id, await input(used.id), context),
    /结课/,
  );
  await completeClassroom(teacher.id, used.id, context);
  const assignment = await prisma.assignment.create({
    data: {
      teacherId: teacher.id,
      classroomId: used.id,
      title: "历史试卷",
      status: "PUBLISHED",
      publishedAt: new Date(Date.now() - 86400000),
      dueAt: new Date(Date.now() - 1000),
    },
  });
  await prisma.submission.create({
    data: {
      assignmentId: assignment.id,
      studentId: student.id,
      attemptNumber: 1,
      idempotencyKey: randomUUID(),
      status: "PENDING_REVIEW",
      startedAt: new Date(Date.now() - 1000),
      submittedAt: new Date(),
    },
  });
  assert.match(
    (await preview(teacher.id, used.id)).blockedReason ?? "",
    /待批改/,
  );
  const graded = await prisma.submission.create({
    data: {
      assignmentId: assignment.id,
      studentId: student.id,
      attemptNumber: 2,
      idempotencyKey: randomUUID(),
      status: "GRADED",
      startedAt: new Date(Date.now() - 1000),
      score: 8,
      maxScore: 10,
      percentage: 80,
      submittedAt: new Date(),
    },
  });
  assert.match(
    (await preview(teacher.id, used.id)).blockedReason ?? "",
    /未公布/,
  );
  await prisma.submission.update({
    where: { id: graded.id },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  await prisma.submission.create({
    data: {
      assignmentId: assignment.id,
      studentId: student.id,
      attemptNumber: 3,
      idempotencyKey: randomUUID(),
      status: "IN_PROGRESS",
    },
  });
  const before = await prisma.submission.findUniqueOrThrow({
    where: { id: graded.id },
  });
  assert.equal((await preview(teacher.id, used.id)).blockedReason, null);
  const usedInput = await input(used.id);
  await remove(teacher.id, used.id, usedInput, context);
  await remove(teacher.id, used.id, usedInput, context);
  assert.equal(
    (
      await prisma.classMembership.findUniqueOrThrow({
        where: { id: member.id },
      })
    ).status,
    "REMOVED",
  );
  assert.ok(
    (
      await prisma.studentIdentityClassroomAssignment.findUniqueOrThrow({
        where: { id: pending.id },
      })
    ).withdrawnAt,
  );
  assert.equal(
    await prisma.studentIdentity.count({ where: { id: identity.id } }),
    1,
  );
  assert.equal(await prisma.user.count({ where: { id: student.id } }), 1);
  assert.equal(
    await prisma.classMembership.count({
      where: { classroomId: keep.id, studentId: student.id, status: "ACTIVE" },
    }),
    1,
  );
  const after = await prisma.submission.findUniqueOrThrow({
    where: { id: graded.id },
  });
  assert.deepEqual(
    [
      after.status,
      after.score?.toString(),
      after.maxScore?.toString(),
      after.publishedAt,
    ],
    [
      before.status,
      before.score?.toString(),
      before.maxScore?.toString(),
      before.publishedAt,
    ],
  );
  assert.equal(
    await prisma.assignment.count({ where: { id: assignment.id } }),
    1,
  );
  assert.equal(
    await prisma.notification.count({
      where: {
        sourceId: used.id,
        deduplicationKey: `classroom-deleted:${used.id}`,
      },
    }),
    1,
  );

  const closed = await create("管理员关闭班级");
  await prisma.classroom.update({
    where: { id: closed.id },
    data: { status: "CLOSED" },
  });
  const exam = await prisma.examSession.create({
    data: {
      requestId: randomUUID(),
      requestFingerprint: "a".repeat(64),
      teacherId: teacher.id,
      courseId: course.id,
      questionCategoryId: course.questionCategoryId,
      type: "MIDTERM",
      title: "待结束考试",
      startsAt: new Date(Date.now() - 10000),
      endsAt: new Date(Date.now() + 86400000),
    },
  });
  await prisma.assignment.create({
    data: {
      teacherId: teacher.id,
      classroomId: closed.id,
      examSessionId: exam.id,
      title: "考试试卷",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  assert.match(
    (await preview(teacher.id, closed.id)).blockedReason ?? "",
    /未结束考试/,
  );
  await prisma.examSession.update({
    where: { id: exam.id },
    data: { cancelledAt: new Date() },
  });
  assert.equal((await preview(teacher.id, closed.id)).blockedReason, null);
  await remove(teacher.id, closed.id, await input(closed.id), context);

  const race = await create("入班与删除并发班");
  const raceInput = await input(race.id);
  await Promise.allSettled([
    remove(teacher.id, race.id, raceInput, context),
    joinClassroom(student.id, race.joinCode),
  ]);
  const raced = await prisma.classroom.findUniqueOrThrow({
    where: { id: race.id },
  });
  if (raced.status === "ARCHIVED")
    assert.equal(
      await prisma.classMembership.count({
        where: { classroomId: race.id, status: "ACTIVE" },
      }),
      0,
    );
  else {
    assert.equal(raced.status, "ACTIVE");
    assert.equal(
      await prisma.classMembership.count({
        where: { classroomId: race.id, status: "ACTIVE" },
      }),
      1,
    );
  }
  console.log(
    "PASS deletion service: scope, confirmation, stale token, rollback, idempotency, latest submissions, retained records, notification, exam and join concurrency",
  );

  if (process.argv.includes("--http")) {
    const httpClass = await create("HTTP 删除验收空班");
    const server = spawn(
      process.execPath,
      [
        resolve("node_modules/next/dist/bin/next"),
        "start",
        "-H",
        "127.0.0.1",
        "-p",
        "3177",
      ],
      { env: process.env, windowsHide: true, stdio: "pipe" },
    );
    const logs: string[] = [];
    server.stdout?.on("data", (b) => logs.push(String(b)));
    server.stderr?.on("data", (b) => logs.push(String(b)));
    try {
      let ready = false;
      for (let i = 0; i < 80; i++) {
        try {
          if ((await fetch("http://127.0.0.1:3177/login")).ok) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 250));
      }
      assert.ok(ready, logs.join("").slice(-2000));
      async function cookie(id: string) {
        const t = randomBytes(24).toString("hex");
        await prisma.authSession.create({
          data: {
            userId: id,
            tokenHash: createHash("sha256").update(t).digest("hex"),
            expiresAt: new Date(Date.now() + 120000),
          },
        });
        return `smart_learning_session=${t}`;
      }
      const [tc, oc, sc] = await Promise.all([
        cookie(teacher.id),
        cookie(other.id),
        cookie(student.id),
      ]);
      async function req(path: string, c = "", method = "GET", body?: unknown) {
        return fetch(`http://127.0.0.1:3177${path}`, {
          method,
          headers: {
            cookie: c,
            ...(body ? { "content-type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      }
      const base = `/api/teacher/classrooms/${httpClass.id}`;
      assert.equal((await req(`${base}/deletion`)).status, 401);
      assert.equal((await req(`${base}/deletion`, sc)).status, 403);
      assert.equal((await req(`${base}/deletion`, oc)).status, 404);
      assert.equal(
        (await req(`/api/teacher/classrooms/invalid/deletion`, tc)).status,
        400,
      );
      assert.equal(
        (await req(base, tc, "DELETE", { reason: "旧接口" })).status,
        409,
      );
      const pv = await (await req(`${base}/deletion`, tc)).json();
      assert.equal(pv.success, true);
      const body = {
        action: "DELETE_CLASSROOM",
        confirmed: true,
        confirmedName: pv.data.name,
        token: pv.data.token,
      };
      assert.equal((await req(base, oc, "DELETE", body)).status, 404);
      assert.equal((await req(base, sc, "DELETE", body)).status, 403);
      assert.equal(
        (await req(base, tc, "DELETE", { ...body, confirmed: false })).status,
        400,
      );
      assert.equal((await req(base, tc, "DELETE", body)).status, 200);
      assert.equal((await req(base, tc, "DELETE", body)).status, 200);
      assert.equal((await req(base, tc)).status, 404);
      // App Router can already have sent streamed response headers before notFound().
      const removedPage = await req(`/teacher/classrooms/${httpClass.id}`, tc);
      assert.match(await removedPage.text(), /资源不存在/);
      const list = await (
        await req("/teacher/classrooms?deleted=1", tc)
      ).text();
      assert.match(list, /班级已删除，列表已更新/);
      assert.ok(!list.includes(`href="/teacher/classrooms/${httpClass.id}"`));
      const historyPage = "/teacher/classrooms?view=history";
      const ownerHistory = await (await req(historyPage, tc)).text();
      assert.match(ownerHistory, /HTTP 删除验收空班/);
      assert.doesNotMatch(ownerHistory, /创建新班级|邀请码|批量导入名单/);
      assert.ok(
        !ownerHistory.includes(`href="/teacher/classrooms/${httpClass.id}"`),
      );
      assert.doesNotMatch(
        await (await req(historyPage, oc)).text(),
        /HTTP 删除验收空班/,
      );
      assert.doesNotMatch(
        await (await req(historyPage, sc)).text(),
        /HTTP 删除验收空班/,
      );

      const closedClass = await create("关闭详情验收班");
      await prisma.classroom.update({
        where: { id: closedClass.id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closureReason: "测试关闭原因",
        },
      });
      const closedPage = `/teacher/classrooms/${closedClass.id}`;
      const closed = await (await req(closedPage, tc)).text();
      assert.match(closed, /由管理员关闭/);
      assert.match(closed, /测试关闭原因/);
      assert.doesNotMatch(
        await (await req(closedPage, oc)).text(),
        /测试关闭原因/,
      );
      const personalClass = await create("个人作答跳转验收班");
      const secondStudent = await prisma.user.findUniqueOrThrow({
        where: { email: "student2@example.com" },
      });
      await prisma.classMembership.createMany({
        data: [student.id, secondStudent.id].map((studentId) => ({
          classroomId: personalClass.id,
          studentId,
        })),
      });
      const personalAssignment = await prisma.assignment.create({
        data: {
          teacherId: teacher.id,
          classroomId: personalClass.id,
          title: "固定学生个人入口验收作业",
          status: "PUBLISHED",
          publishedAt: new Date(Date.now() - 60000),
          dueAt: new Date(Date.now() + 86400000),
        },
      });
      const source = await prisma.question.findFirstOrThrow();
      await prisma.assignmentQuestion.create({
        data: {
          assignmentId: personalAssignment.id,
          questionId: source.id,
          sortOrder: 1,
          points: 10,
          titleSnapshot: "个人入口验收题",
          contentSnapshot: "个人作答页面权限测试",
          typeSnapshot: "SHORT_ANSWER",
          difficultySnapshot: 1,
          explanationSnapshot: "教师解析",
          referenceAnswerSnapshot: "教师参考答案",
        },
      });
      const ownSubmission = await prisma.submission.create({
        data: {
          assignmentId: personalAssignment.id,
          studentId: secondStudent.id,
          attemptNumber: 1,
          idempotencyKey: randomUUID(),
          status: "PUBLISHED",
          score: 8,
          maxScore: 10,
          percentage: 80,
          startedAt: new Date(Date.now() - 3000),
          submittedAt: new Date(Date.now() - 2000),
          publishedAt: new Date(),
        },
      });
      const detailQuery = new URLSearchParams({
        classroomId: personalClass.id,
        section: "ALL",
      });
      const missingDetail = await (
        await req(
          `/teacher/assignments/students/${student.id}?${detailQuery}`,
          tc,
        )
      ).text();
      assert.ok(
        missingDetail.includes(
          `/teacher/assignments/${personalAssignment.id}/results?studentId=${student.id}`,
        ),
      );
      assert.ok(
        !missingDetail.includes(
          `href="/teacher/assignments/${personalAssignment.id}"`,
        ),
      );
      const ownDetail = await (
        await req(
          `/teacher/assignments/students/${secondStudent.id}?${detailQuery}`,
          tc,
        )
      ).text();
      assert.ok(
        ownDetail.includes(
          `/teacher/assignments/${personalAssignment.id}/submissions/${ownSubmission.id}`,
        ),
      );
      const emptyPersonal = await req(
        `/teacher/assignments/${personalAssignment.id}/results?studentId=${student.id}`,
        tc,
      );
      assert.equal(emptyPersonal.status, 200);
      const emptyHtml = await emptyPersonal.text();
      assert.match(emptyHtml, /个人作答详情/);
      assert.match(emptyHtml, /尚未提交该作业/);
      const mismatchedPersonal = await req(
        `/teacher/assignments/${personalAssignment.id}/results?studentId=${student.id}&submissionId=${ownSubmission.id}`,
        tc,
      );
      assert.match(await mismatchedPersonal.text(), /资源不存在/);
      const selectedPersonal = await req(
        `/teacher/assignments/${personalAssignment.id}/results?studentId=${secondStudent.id}`,
        tc,
      );
      assert.equal(selectedPersonal.status, 200);
      const selectedHtml = await selectedPersonal.text();
      assert.ok(
        selectedPersonal.url.includes(`/submissions/${ownSubmission.id}`) ||
          selectedHtml.includes(`/submissions/${ownSubmission.id}`),
      );
      const canonicalPersonal = await req(
        `/teacher/assignments/${personalAssignment.id}/submissions/${ownSubmission.id}?filter=ALL`,
        tc,
      );
      assert.equal(canonicalPersonal.status, 200);
      assert.match(await canonicalPersonal.text(), /个人作答详情/);
      console.log(
        "PASS personal navigation HTTP: submitted target, unsubmitted fixed identity, no class-wide fallback, mismatched submission rejection",
      );
      console.log(
        "PASS deletion HTTP: auth, roles, ownership, malformed input, old contract, replay, removed page, refreshed list feedback",
      );
    } finally {
      server.kill();
      await new Promise<void>((r) => {
        if (server.exitCode !== null) r();
        else {
          server.once("exit", () => r());
          setTimeout(r, 3000);
        }
      });
    }
  }
}
main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
