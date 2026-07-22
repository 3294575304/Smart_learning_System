import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { AuditAction, PrismaClient, Role, UserStatus } from "@prisma/client";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface UserView {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  status: UserStatus;
}

interface UserListResult {
  items: UserView[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface AuditListResult {
  items: Array<{
    id: string;
    action: AuditAction;
    targetId: string;
    summary: string;
    beforeData: unknown;
    afterData: unknown;
    createdAt: string;
  }>;
  pagination: { total: number };
}

const prisma = new PrismaClient();
const port = 3107;
const baseUrl = `http://127.0.0.1:${port}`;
const serverOutput: string[] = [];
const sessionIds: string[] = [];
const createdUserIds: string[] = [];
const testSuffix = randomBytes(5).toString("hex");
const createdEmail = `admin-user-it-${testSuffix}@example.com`;

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
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch {
      // Production server is still starting.
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
      expiresAt: new Date(Date.now() + 180_000),
    },
  });
  sessionIds.push(session.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

async function requestJson(
  path: string,
  cookie?: string,
  method = "GET",
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function main(): Promise<void> {
  try {
    await waitForServer();
    const [admin, teacher, student] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } }),
      prisma.user.findUniqueOrThrow({
        where: { email: "teacher@example.com" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "student@example.com" },
      }),
    ]);
    const [adminCookie, teacherCookie, studentCookie] = await Promise.all([
      sessionCookie(admin.id),
      sessionCookie(teacher.id),
      sessionCookie(student.id),
    ]);

    assert.equal((await requestJson("/api/admin/users")).status, 401);
    assert.equal(
      (await requestJson("/api/admin/users", teacherCookie)).status,
      403,
    );
    assert.equal(
      (await requestJson("/api/admin/users", studentCookie)).status,
      403,
    );
    assert.equal(
      (await requestJson("/api/admin/audit-logs", teacherCookie)).status,
      403,
    );
    assert.equal(
      (await requestJson("/api/admin/users?page=0", adminCookie)).status,
      400,
    );

    const initialListResponse = await requestJson(
      "/api/admin/users?page=1&pageSize=1",
      adminCookie,
    );
    assert.equal(initialListResponse.status, 200);
    const initialList =
      (await initialListResponse.json()) as ApiSuccess<UserListResult>;
    assert.equal(initialList.data.items.length, 1);
    assert.equal(initialList.data.pagination.pageSize, 1);
    assert.equal(JSON.stringify(initialList).includes("passwordHash"), false);

    assert.equal(
      (
        await requestJson("/api/admin/users", adminCookie, "POST", {
          displayName: "非法角色",
          email: `invalid-role-${testSuffix}@example.com`,
          password: "Student123!",
          role: "OWNER",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await requestJson("/api/admin/users", adminCookie, "POST", {
          displayName: "额外字段",
          email: `extra-field-${testSuffix}@example.com`,
          password: "Student123!",
          role: Role.STUDENT,
          status: UserStatus.INACTIVE,
        })
      ).status,
      400,
    );

    const createResponse = await requestJson(
      "/api/admin/users",
      adminCookie,
      "POST",
      {
        displayName: "管理员集成测试用户",
        email: createdEmail.toUpperCase(),
        password: "Student123!",
        role: Role.STUDENT,
      },
      {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
        "user-agent": "AdminIntegration/1.0",
      },
    );
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as ApiSuccess<UserView>;
    createdUserIds.push(created.data.id);
    assert.equal(created.data.email, createdEmail);
    assert.equal(created.data.status, UserStatus.ACTIVE);
    assert.equal(JSON.stringify(created).includes("password"), false);

    const duplicateResponse = await requestJson(
      "/api/admin/users",
      adminCookie,
      "POST",
      {
        displayName: "重复邮箱",
        email: createdEmail,
        password: "Student123!",
        role: Role.STUDENT,
      },
    );
    assert.equal(duplicateResponse.status, 409);

    const keywordListResponse = await requestJson(
      `/api/admin/users?keyword=${encodeURIComponent("管理员集成测试")}&role=STUDENT&status=ACTIVE`,
      adminCookie,
    );
    const keywordList =
      (await keywordListResponse.json()) as ApiSuccess<UserListResult>;
    assert.equal(
      keywordList.data.items.some((item) => item.id === created.data.id),
      true,
    );

    const detailResponse = await requestJson(
      `/api/admin/users/${created.data.id}`,
      adminCookie,
    );
    assert.equal(detailResponse.status, 200);
    assert.equal(
      JSON.stringify(await detailResponse.json()).includes("passwordHash"),
      false,
    );

    const updateResponse = await requestJson(
      `/api/admin/users/${created.data.id}`,
      adminCookie,
      "PATCH",
      { displayName: "已更新测试用户", role: Role.TEACHER },
    );
    assert.equal(updateResponse.status, 200);
    const updated = (await updateResponse.json()) as ApiSuccess<UserView>;
    assert.equal(updated.data.role, Role.TEACHER);
    assert.equal(updated.data.displayName, "已更新测试用户");

    const auditCountBeforeConflict = await prisma.auditLog.count({
      where: { targetId: created.data.id },
    });
    const conflictResponse = await requestJson(
      `/api/admin/users/${created.data.id}`,
      adminCookie,
      "PATCH",
      { displayName: "不应保存", email: teacher.email },
    );
    assert.equal(conflictResponse.status, 409);
    const afterConflict = await prisma.user.findUniqueOrThrow({
      where: { id: created.data.id },
      include: { profile: true },
    });
    assert.equal(afterConflict.profile?.displayName, "已更新测试用户");
    assert.equal(
      await prisma.auditLog.count({ where: { targetId: created.data.id } }),
      auditCountBeforeConflict,
    );

    const targetCookie = await sessionCookie(created.data.id);
    assert.equal(
      (
        await requestJson(
          `/api/admin/users/${created.data.id}`,
          adminCookie,
          "PATCH",
          {
            status: UserStatus.INACTIVE,
          },
        )
      ).status,
      200,
    );
    assert.equal(
      (await requestJson("/api/auth/session", targetCookie)).status,
      401,
    );
    const inactiveList = await requestJson(
      `/api/admin/users?keyword=${encodeURIComponent(createdEmail)}&status=INACTIVE`,
      adminCookie,
    );
    assert.equal(
      ((await inactiveList.json()) as ApiSuccess<UserListResult>).data.items[0]
        ?.id,
      created.data.id,
    );
    assert.equal(
      (
        await requestJson(
          `/api/admin/users/${created.data.id}`,
          adminCookie,
          "PATCH",
          {
            status: UserStatus.ACTIVE,
          },
        )
      ).status,
      200,
    );

    assert.equal(
      (
        await requestJson(
          `/api/admin/users/${admin.id}`,
          adminCookie,
          "PATCH",
          {
            status: UserStatus.INACTIVE,
          },
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await requestJson(
          `/api/admin/users/${admin.id}`,
          adminCookie,
          "PATCH",
          {
            role: Role.TEACHER,
          },
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await requestJson(
          "/api/admin/users/cm12345678901234567890123",
          adminCookie,
          "PATCH",
          { displayName: "不存在" },
        )
      ).status,
      404,
    );

    const noOpCount = await prisma.auditLog.count({
      where: { targetId: created.data.id },
    });
    assert.equal(
      (
        await requestJson(
          `/api/admin/users/${created.data.id}`,
          adminCookie,
          "PATCH",
          {
            displayName: "已更新测试用户",
            email: createdEmail,
            role: Role.TEACHER,
            status: UserStatus.ACTIVE,
          },
        )
      ).status,
      200,
    );
    assert.equal(
      await prisma.auditLog.count({ where: { targetId: created.data.id } }),
      noOpCount,
    );

    const auditResponse = await requestJson(
      `/api/admin/audit-logs?page=1&pageSize=20&targetId=${created.data.id}`,
      adminCookie,
    );
    assert.equal(auditResponse.status, 200);
    const audits = (await auditResponse.json()) as ApiSuccess<AuditListResult>;
    assert.equal(
      audits.data.items.some(
        (item) => item.action === AuditAction.USER_CREATED,
      ),
      true,
    );
    assert.equal(
      audits.data.items.some(
        (item) => item.action === AuditAction.USER_ROLE_CHANGED,
      ),
      true,
    );
    assert.equal(
      audits.data.items.some(
        (item) => item.action === AuditAction.USER_DISABLED,
      ),
      true,
    );
    assert.equal(
      audits.data.items.some(
        (item) => item.action === AuditAction.USER_ENABLED,
      ),
      true,
    );
    for (let index = 1; index < audits.data.items.length; index += 1) {
      assert.ok(
        new Date(audits.data.items[index - 1].createdAt) >=
          new Date(audits.data.items[index].createdAt),
      );
    }
    const auditJson = JSON.stringify(audits);
    assert.equal(auditJson.includes("Student123!"), false);
    assert.equal(auditJson.includes("passwordHash"), false);

    const actionAuditResponse = await requestJson(
      `/api/admin/audit-logs?action=USER_DISABLED&targetId=${created.data.id}`,
      adminCookie,
    );
    const actionAudits =
      (await actionAuditResponse.json()) as ApiSuccess<AuditListResult>;
    assert.equal(
      actionAudits.data.items.every(
        (item) => item.action === AuditAction.USER_DISABLED,
      ),
      true,
    );

    console.info(
      "Admin HTTP integration checks passed: authentication, role authorization, strict validation, database pagination and filters, safe DTOs, user creation/detail/update, unique conflicts, self/last-admin protections, session invalidation, transactional rollback/no-op behavior, and safe audit pagination/filters/order.",
    );
  } finally {
    if (createdUserIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { targetId: { in: createdUserIds } },
      });
      await prisma.authSession.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    } else {
      const fallback = await prisma.user.findMany({
        where: { email: createdEmail },
        select: { id: true },
      });
      const fallbackIds = fallback.map((user) => user.id);
      if (fallbackIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { targetId: { in: fallbackIds } },
        });
        await prisma.user.deleteMany({ where: { id: { in: fallbackIds } } });
      }
    }
    if (sessionIds.length > 0)
      await prisma.authSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
    await prisma.$disconnect();
    server.kill();
    if (server.exitCode === null)
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
