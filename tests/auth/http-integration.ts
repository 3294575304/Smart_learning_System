import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { PrismaClient, UserStatus } from "@prisma/client";
import { compare } from "bcryptjs";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";

const prisma = new PrismaClient();
const port = 3100;
const baseUrl = `http://127.0.0.1:${port}`;
const serverOutput: string[] = [];

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
      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  throw new Error(`Test server did not start:\n${serverOutput.join("")}`);
}

async function sessionCookie(
  userId: string,
): Promise<{ id: string; cookie: string }> {
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  return {
    id: session.id,
    cookie: `${SESSION_COOKIE_NAME}=${token}`,
  };
}

async function assertPageRedirect(
  response: Response,
  expectedPath: string,
): Promise<void> {
  if (response.status === 307) {
    assert.equal(
      new URL(response.headers.get("location") ?? baseUrl).pathname,
      expectedPath,
    );
    return;
  }

  // App Router redirects discovered during streaming are encoded in a 200 response.
  assert.equal(response.status, 200);
  assert.match(
    await response.text(),
    new RegExp(expectedPath.replace("/", "\\/")),
  );
}

async function main(): Promise<void> {
  const createdSessionIds: string[] = [];
  let deactivatedStudentId: string | null = null;

  try {
    await waitForServer();

    const [admin, teacher, teacherTwo, student] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } }),
      prisma.user.findUniqueOrThrow({
        where: { email: "teacher@example.com" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "teacher2@example.com" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "student@example.com" },
      }),
    ]);
    assert.equal(await compare("Student123!", student.passwordHash), true);

    const [adminSession, teacherSession, studentSession] = await Promise.all([
      sessionCookie(admin.id),
      sessionCookie(teacher.id),
      sessionCookie(student.id),
    ]);
    createdSessionIds.push(
      adminSession.id,
      teacherSession.id,
      studentSession.id,
    );

    const [ownedClassroom, otherClassroom] = await Promise.all([
      prisma.classroom.findFirstOrThrow({ where: { teacherId: teacher.id } }),
      prisma.classroom.findFirstOrThrow({
        where: { teacherId: teacherTwo.id },
      }),
    ]);

    const anonymousSession = await fetch(`${baseUrl}/api/auth/session`);
    assert.equal(anonymousSession.status, 401);
    assert.deepEqual(await anonymousSession.json(), {
      success: false,
      error: "请先登录",
    });

    const anonymousPage = await fetch(`${baseUrl}/teacher`, {
      redirect: "manual",
    });
    assert.equal(anonymousPage.status, 307);
    assert.match(anonymousPage.headers.get("location") ?? "", /\/login/);

    const studentTeacherApi = await fetch(
      `${baseUrl}/api/teacher/classrooms/${ownedClassroom.id}`,
      { headers: { cookie: studentSession.cookie } },
    );
    assert.equal(studentTeacherApi.status, 403);

    const invalidClassroomId = await fetch(
      `${baseUrl}/api/teacher/classrooms/not-a-cuid`,
      { headers: { cookie: teacherSession.cookie } },
    );
    assert.equal(invalidClassroomId.status, 400);

    const ownedClassroomResponse = await fetch(
      `${baseUrl}/api/teacher/classrooms/${ownedClassroom.id}`,
      { headers: { cookie: teacherSession.cookie } },
    );
    assert.equal(ownedClassroomResponse.status, 200);

    const crossTeacherResponse = await fetch(
      `${baseUrl}/api/teacher/classrooms/${otherClassroom.id}`,
      { headers: { cookie: teacherSession.cookie } },
    );
    assert.equal(crossTeacherResponse.status, 404);

    const roleRedirects = [
      [adminSession.cookie, "/admin"],
      [teacherSession.cookie, "/teacher"],
      [studentSession.cookie, "/student"],
    ] as const;
    for (const [cookie, expectedPath] of roleRedirects) {
      const response = await fetch(`${baseUrl}/dashboard`, {
        headers: { cookie },
        redirect: "manual",
      });
      await assertPageRedirect(response, expectedPath);
    }

    const studentOnTeacherPage = await fetch(`${baseUrl}/teacher`, {
      headers: { cookie: studentSession.cookie },
      redirect: "manual",
    });
    await assertPageRedirect(studentOnTeacherPage, "/403");

    deactivatedStudentId = student.id;
    await prisma.user.update({
      where: { id: student.id },
      data: { status: UserStatus.INACTIVE },
    });
    const inactiveUserResponse = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { cookie: studentSession.cookie },
    });
    assert.equal(inactiveUserResponse.status, 401);

    console.info(
      "HTTP integration checks passed: 400, 401, 403, inactive user, role redirects, and ownership isolation.",
    );
  } finally {
    if (deactivatedStudentId) {
      await prisma.user.update({
        where: { id: deactivatedStudentId },
        data: { status: UserStatus.ACTIVE },
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
