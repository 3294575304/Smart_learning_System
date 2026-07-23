import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";
import { assertIsolatedIntegrationEnvironment } from "../integration/database";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ClassroomResponse {
  id: string;
  joinCode: string;
  students: Array<{ membershipId: string; studentId: string }>;
}

assertIsolatedIntegrationEnvironment("HTTP_INTEGRATION_SCHEMA");
const prisma = new PrismaClient();
const port = 3101;
const baseUrl = `http://127.0.0.1:${port}`;
const serverOutput: string[] = [];
const createdClassroomIds: string[] = [];
const createdSessionIds: string[] = [];

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
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
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
  createdSessionIds.push(session.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

async function requestJson(
  path: string,
  cookie: string,
  method = "GET",
  body?: unknown,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      cookie,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function createClassroom(
  teacherCookie: string,
  name: string,
  allowStudentLeave: boolean,
): Promise<ClassroomResponse> {
  const response = await requestJson(
    "/api/teacher/classrooms",
    teacherCookie,
    "POST",
    { name, description: "集成测试班级", allowStudentLeave },
  );
  assert.equal(response.status, 201);
  const body = (await response.json()) as ApiSuccess<ClassroomResponse>;
  createdClassroomIds.push(body.data.id);
  return body.data;
}

async function main(): Promise<void> {
  try {
    await waitForServer();
    const [teacher, teacherTwo, student, studentTwo, studentThree] =
      await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { email: "teacher@example.com" },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: "teacher2@example.com" },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: "student@example.com" },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: "student2@example.com" },
        }),
        prisma.user.findUniqueOrThrow({
          where: { email: "student3@example.com" },
        }),
      ]);
    const [
      teacherCookie,
      teacherTwoCookie,
      studentCookie,
      studentTwoCookie,
      studentThreeCookie,
    ] = await Promise.all([
      sessionCookie(teacher.id),
      sessionCookie(teacherTwo.id),
      sessionCookie(student.id),
      sessionCookie(studentTwo.id),
      sessionCookie(studentThree.id),
    ]);

    const invalidCreate = await requestJson(
      "/api/teacher/classrooms",
      teacherCookie,
      "POST",
      { name: "A", description: "", allowStudentLeave: true },
    );
    assert.equal(invalidCreate.status, 400);

    const studentOnTeacherApi = await requestJson(
      "/api/teacher/classrooms",
      studentCookie,
      "POST",
      { name: "越权班级", description: "", allowStudentLeave: true },
    );
    assert.equal(studentOnTeacherApi.status, 403);

    const classroom = await createClassroom(
      teacherCookie,
      "完整流程测试班",
      true,
    );
    const crossTeacherEdit = await requestJson(
      `/api/teacher/classrooms/${classroom.id}`,
      teacherTwoCookie,
      "PATCH",
      { name: "越权修改", description: "", allowStudentLeave: true },
    );
    assert.equal(crossTeacherEdit.status, 404);

    const anonymousJoin = await fetch(
      `${baseUrl}/api/student/classrooms/join`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ joinCode: classroom.joinCode }),
      },
    );
    assert.equal(anonymousJoin.status, 401);

    const join = await requestJson(
      "/api/student/classrooms/join",
      studentCookie,
      "POST",
      { joinCode: classroom.joinCode.toLowerCase() },
    );
    assert.equal(join.status, 201);
    const duplicateJoin = await requestJson(
      "/api/student/classrooms/join",
      studentCookie,
      "POST",
      { joinCode: classroom.joinCode },
    );
    assert.equal(duplicateJoin.status, 409);

    const leave = await requestJson(
      `/api/student/classrooms/${classroom.id}/leave`,
      studentCookie,
      "POST",
    );
    assert.equal(leave.status, 200);
    const rejoin = await requestJson(
      "/api/student/classrooms/join",
      studentCookie,
      "POST",
      { joinCode: classroom.joinCode },
    );
    assert.equal(rejoin.status, 201);

    const regenerate = await requestJson(
      `/api/teacher/classrooms/${classroom.id}/join-code`,
      teacherCookie,
      "POST",
    );
    assert.equal(regenerate.status, 200);
    const regeneratedBody = (await regenerate.json()) as ApiSuccess<{
      joinCode: string;
    }>;
    assert.notEqual(regeneratedBody.data.joinCode, classroom.joinCode);
    const oldCodeJoin = await requestJson(
      "/api/student/classrooms/join",
      studentTwoCookie,
      "POST",
      { joinCode: classroom.joinCode },
    );
    assert.equal(oldCodeJoin.status, 404);
    const newCodeJoin = await requestJson(
      "/api/student/classrooms/join",
      studentTwoCookie,
      "POST",
      { joinCode: regeneratedBody.data.joinCode },
    );
    assert.equal(newCodeJoin.status, 201);

    const assignment = await prisma.assignment.create({
      data: {
        classroomId: classroom.id,
        teacherId: teacher.id,
        title: "历史记录保留测试",
      },
    });
    const submission = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentId: student.id,
        idempotencyKey: `classroom-test-${randomBytes(8).toString("hex")}`,
      },
    });
    const detailResponse = await requestJson(
      `/api/teacher/classrooms/${classroom.id}`,
      teacherCookie,
    );
    const detail =
      (await detailResponse.json()) as ApiSuccess<ClassroomResponse>;
    const studentMembership = detail.data.students.find(
      (item) => item.studentId === student.id,
    );
    assert.ok(studentMembership);
    const remove = await requestJson(
      `/api/teacher/classrooms/${classroom.id}/members/${studentMembership.membershipId}`,
      teacherCookie,
      "DELETE",
    );
    assert.equal(remove.status, 200);
    assert.equal(
      await prisma.submission.count({ where: { id: submission.id } }),
      1,
    );
    const studentClassroomsAfterRemoval = await requestJson(
      "/api/student/classrooms",
      studentCookie,
    );
    const studentClassroomsBody =
      (await studentClassroomsAfterRemoval.json()) as ApiSuccess<
        Array<{ id: string }>
      >;
    assert.equal(
      studentClassroomsBody.data.some((item) => item.id === classroom.id),
      false,
    );
    const removedStudentRejoin = await requestJson(
      "/api/student/classrooms/join",
      studentCookie,
      "POST",
      { joinCode: regeneratedBody.data.joinCode },
    );
    assert.equal(removedStudentRejoin.status, 409);

    const close = await requestJson(
      `/api/teacher/classrooms/${classroom.id}/close`,
      teacherCookie,
      "POST",
    );
    assert.equal(close.status, 200);
    const closedJoin = await requestJson(
      "/api/student/classrooms/join",
      studentThreeCookie,
      "POST",
      { joinCode: regeneratedBody.data.joinCode },
    );
    assert.equal(closedJoin.status, 409);

    const lockedClassroom = await createClassroom(
      teacherCookie,
      "禁止退出测试班",
      false,
    );
    assert.equal(
      (
        await requestJson(
          "/api/student/classrooms/join",
          studentThreeCookie,
          "POST",
          { joinCode: lockedClassroom.joinCode },
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await requestJson(
          `/api/student/classrooms/${lockedClassroom.id}/leave`,
          studentThreeCookie,
          "POST",
        )
      ).status,
      409,
    );

    console.info(
      "Classroom HTTP integration checks passed: validation, RBAC, ownership, invite rotation, join/leave, removal history, and closure.",
    );
  } finally {
    if (createdClassroomIds.length > 0) {
      const assignments = await prisma.assignment.findMany({
        where: { classroomId: { in: createdClassroomIds } },
        select: { id: true },
      });
      const assignmentIds = assignments.map((item) => item.id);
      if (assignmentIds.length > 0) {
        await prisma.submission.deleteMany({
          where: { assignmentId: { in: assignmentIds } },
        });
        await prisma.assignment.deleteMany({
          where: { id: { in: assignmentIds } },
        });
      }
      await prisma.classMembership.deleteMany({
        where: { classroomId: { in: createdClassroomIds } },
      });
      await prisma.classroom.deleteMany({
        where: { id: { in: createdClassroomIds } },
      });
    }
    if (createdSessionIds.length > 0) {
      await prisma.authSession.deleteMany({
        where: { id: { in: createdSessionIds } },
      });
    }
    await prisma.$disconnect();
    server.kill();
    await Promise.race([
      once(server, "exit"),
      new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000)),
    ]);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
