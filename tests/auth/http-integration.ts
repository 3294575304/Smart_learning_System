import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { PrismaClient, Role, UserStatus } from "@prisma/client";
import { compare } from "bcryptjs";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";
import { claimStudentAccount } from "@/services/auth/registration";
import { registerSchema } from "@/services/auth/schemas";
import { assertIsolatedIntegrationEnvironment } from "../integration/database";

assertIsolatedIntegrationEnvironment("HTTP_INTEGRATION_SCHEMA");
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
  const createdUserIds: string[] = [];
  const createdIdentityNos: string[] = [];
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

    const forcedStudentNo = `HTTPFORCED${randomBytes(4).toString("hex")}`;
    const forcedStudent = await prisma.user.create({
      data: {
        email: null,
        passwordHash: student.passwordHash,
        role: Role.STUDENT,
        mustChangePassword: true,
        profile: {
          create: {
            displayName: "HTTP 首次改密学生",
            studentNo: forcedStudentNo,
          },
        },
      },
      select: { id: true },
    });
    createdUserIds.push(forcedStudent.id);
    const forcedSession = await sessionCookie(forcedStudent.id);
    createdSessionIds.push(forcedSession.id);

    const [ownedClassroom, otherClassroom] = await Promise.all([
      prisma.classroom.findFirstOrThrow({ where: { teacherId: teacher.id } }),
      prisma.classroom.findFirstOrThrow({
        where: { teacherId: teacherTwo.id },
      }),
    ]);

    const claimToken = randomBytes(5).toString("hex").toUpperCase();
    const createClaimIdentity = async (
      suffix: string,
      options: { name?: string; assign?: boolean } = {},
    ) => {
      const studentNo = `HTTPCLAIM${claimToken}${suffix}`;
      createdIdentityNos.push(studentNo);
      await prisma.studentIdentity.create({
        data: {
          studentNo,
          name: options.name ?? "HTTP 认领学生",
          assignments:
            options.assign === false
              ? undefined
              : { create: { classroomId: ownedClassroom.id } },
        },
      });
      return studentNo;
    };
    const register = (body: Record<string, unknown>) =>
      fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const registrationBody = (
      studentNo: string,
      email: string,
      overrides: Record<string, unknown> = {},
    ) => ({
      studentNo,
      displayName: "HTTP 认领学生",
      email,
      password: "ClaimPass123",
      confirmPassword: "ClaimPass123",
      ...overrides,
    });

    const validNo = await createClaimIdentity("A");
    const validEmail = `claim-${claimToken.toLowerCase()}-a@example.test`;
    const validClaim = await register(registrationBody(validNo, validEmail));
    assert.equal(validClaim.status, 201);
    const validUser = await prisma.user.findUniqueOrThrow({
      where: { email: validEmail },
    });
    createdUserIds.push(validUser.id);
    assert.equal(validUser.role, Role.STUDENT);
    assert.equal(
      await prisma.classMembership.count({
        where: { classroomId: ownedClassroom.id, studentId: validUser.id },
      }),
      1,
    );

    const missingClaim = await register(
      registrationBody(
        `MISSING${claimToken}`,
        `claim-${claimToken.toLowerCase()}-missing@example.test`,
      ),
    );
    assert.equal(missingClaim.status, 400);
    assert.equal((await missingClaim.json()).error, "学号或姓名信息不正确");

    const mismatchNo = await createClaimIdentity("B");
    const mismatchClaim = await register(
      registrationBody(
        mismatchNo,
        `claim-${claimToken.toLowerCase()}-mismatch@example.test`,
        { displayName: "错误姓名" },
      ),
    );
    assert.equal(mismatchClaim.status, 400);
    assert.equal((await mismatchClaim.json()).error, "学号或姓名信息不正确");

    const boundClaim = await register(
      registrationBody(
        validNo,
        `claim-${claimToken.toLowerCase()}-bound@example.test`,
      ),
    );
    assert.equal(boundClaim.status, 409);
    assert.equal(
      (await boundClaim.json()).error,
      "该学生信息已绑定账号，请直接登录或联系教师",
    );

    const duplicateEmailNo = await createClaimIdentity("C");
    const duplicateEmailClaim = await register(
      registrationBody(duplicateEmailNo, validEmail),
    );
    assert.equal(duplicateEmailClaim.status, 409);
    assert.equal((await duplicateEmailClaim.json()).error, "该邮箱已被注册");

    const roleNo = await createClaimIdentity("D");
    const roleClaim = await register(
      registrationBody(
        roleNo,
        `claim-${claimToken.toLowerCase()}-role@example.test`,
        { role: "ADMIN" },
      ),
    );
    assert.equal(roleClaim.status, 400);

    const disabledNo = await createClaimIdentity("E");
    await prisma.systemConfig.update({
      where: { singletonKey: "default" },
      data: { allowSelfRegistration: false },
    });
    const disabledClaim = await register(
      registrationBody(
        disabledNo,
        `claim-${claimToken.toLowerCase()}-disabled@example.test`,
      ),
    );
    assert.equal(disabledClaim.status, 403);
    await prisma.systemConfig.update({
      where: { singletonKey: "default" },
      data: { allowSelfRegistration: true },
    });

    const concurrentNo = await createClaimIdentity("F");
    const [concurrentLeft, concurrentRight] = await Promise.all([
      register(
        registrationBody(
          concurrentNo,
          `claim-${claimToken.toLowerCase()}-left@example.test`,
        ),
      ),
      register(
        registrationBody(
          concurrentNo,
          `claim-${claimToken.toLowerCase()}-right@example.test`,
        ),
      ),
    ]);
    assert.deepEqual(
      [concurrentLeft.status, concurrentRight.status].sort(),
      [201, 409],
    );
    const concurrentIdentity = await prisma.studentIdentity.findUniqueOrThrow({
      where: { studentNo: concurrentNo },
    });
    assert.notEqual(concurrentIdentity.userId, null);
    createdUserIds.push(concurrentIdentity.userId!);

    const rollbackNo = await createClaimIdentity("G");
    const rollbackEmail = `claim-${claimToken.toLowerCase()}-rollback@example.test`;
    await assert.rejects(
      () =>
        claimStudentAccount(
          registerSchema.parse(registrationBody(rollbackNo, rollbackEmail)),
          {
            beforeCommit: async () => {
              throw new Error("forced registration rollback");
            },
          },
        ),
      /forced registration rollback/u,
    );
    const rollbackIdentity = await prisma.studentIdentity.findUniqueOrThrow({
      where: { studentNo: rollbackNo },
    });
    assert.equal(rollbackIdentity.userId, null);
    assert.equal(
      await prisma.user.count({ where: { email: rollbackEmail } }),
      0,
    );

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

    const forcedStudentPage = await fetch(`${baseUrl}/student`, {
      headers: { cookie: forcedSession.cookie },
      redirect: "manual",
    });
    await assertPageRedirect(forcedStudentPage, "/change-initial-password");

    const forcedBusinessApi = await fetch(`${baseUrl}/api/student/classrooms`, {
      headers: { cookie: forcedSession.cookie },
    });
    assert.equal(forcedBusinessApi.status, 403);
    assert.match(await forcedBusinessApi.text(), /请先修改初始密码/u);

    const forcedAuthSession = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { cookie: forcedSession.cookie },
    });
    assert.equal(forcedAuthSession.status, 200);
    assert.equal(
      (
        (await forcedAuthSession.json()) as {
          data: { user: { mustChangePassword: boolean } };
        }
      ).data.user.mustChangePassword,
      true,
    );

    const weakChange = await fetch(`${baseUrl}/api/auth/initial-password`, {
      method: "POST",
      headers: {
        cookie: forcedSession.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "Student123!",
        password: "weak",
        confirmPassword: "weak",
      }),
    });
    assert.equal(weakChange.status, 400);

    const wrongCurrent = await fetch(`${baseUrl}/api/auth/initial-password`, {
      method: "POST",
      headers: {
        cookie: forcedSession.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "Wrong123A",
        password: "ChangedPass123",
        confirmPassword: "ChangedPass123",
      }),
    });
    assert.equal(wrongCurrent.status, 400);

    const changeResponse = await fetch(`${baseUrl}/api/auth/initial-password`, {
      method: "POST",
      headers: {
        cookie: forcedSession.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "Student123!",
        password: "ChangedPass123",
        confirmPassword: "ChangedPass123",
      }),
    });
    assert.equal(changeResponse.status, 200);
    const changed = await changeResponse.json();
    assert.equal(changed.data.redirectTo, "/student");
    const setCookie = changeResponse.headers.get("set-cookie") ?? "";
    assert.match(setCookie, new RegExp(`${SESSION_COOKIE_NAME}=`));
    const rotatedCookie = setCookie.split(";")[0] ?? "";

    const forcedAfter = await prisma.user.findUniqueOrThrow({
      where: { id: forcedStudent.id },
      select: {
        passwordHash: true,
        mustChangePassword: true,
        passwordChangedAt: true,
      },
    });
    assert.equal(forcedAfter.mustChangePassword, false);
    assert.notEqual(forcedAfter.passwordChangedAt, null);
    assert.equal(
      await compare("ChangedPass123", forcedAfter.passwordHash),
      true,
    );

    const oldSessionAfterChange = await fetch(
      `${baseUrl}/api/student/classrooms`,
      { headers: { cookie: forcedSession.cookie } },
    );
    assert.equal(oldSessionAfterChange.status, 401);
    const newSessionAfterChange = await fetch(
      `${baseUrl}/api/student/classrooms`,
      { headers: { cookie: rotatedCookie } },
    );
    assert.equal(newSessionAfterChange.status, 200);

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
    if (createdUserIds.length > 0) {
      await prisma.authSession.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.studentIdentityClassroomAssignment.deleteMany({
        where: { studentIdentity: { studentNo: { in: createdIdentityNos } } },
      });
      await prisma.studentIdentity.deleteMany({
        where: { studentNo: { in: createdIdentityNos } },
      });
      await prisma.classMembership.deleteMany({
        where: { studentId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
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
