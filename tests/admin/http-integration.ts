import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import {
  AuditAction,
  AuditTargetType,
  PrismaClient,
  Role,
  type SystemConfig,
  UserStatus,
} from "@prisma/client";

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
    targetType: AuditTargetType;
    targetId: string;
    summary: string;
    beforeData: unknown;
    afterData: unknown;
    createdAt: string;
  }>;
  pagination: { total: number };
}

interface SystemConfigView {
  values: {
    platformName: string;
    platformAnnouncement: string;
    maintenanceMode: boolean;
    maintenanceMessage: string;
    allowSelfRegistration: boolean;
    assignmentDefaultDueDays: number;
    assignmentAutosaveDelayMs: number;
    aiAnalysisEnabled: boolean;
  };
  changedKeys?: string[];
}

interface DashboardOverviewView {
  users: {
    total: number;
    byRole: Record<Role, number>;
    byStatus: Record<UserStatus, number>;
  };
  teaching: { classroomTotal: number; questionTotal: number };
  ai: { successRate: number | null };
}

interface DashboardTrendsView {
  range: "7d" | "30d" | "90d";
  points: Array<{ date: string; users: number; submissions: number }>;
}

interface DashboardDistributionsView {
  roles: Array<{ key: Role; count: number }>;
}

const prisma = new PrismaClient();
const port = 3107;
const baseUrl = `http://127.0.0.1:${port}`;
const serverOutput: string[] = [];
const sessionIds: string[] = [];
const createdUserIds: string[] = [];
const testSuffix = randomBytes(5).toString("hex");
const createdEmail = `admin-user-it-${testSuffix}@example.com`;
const integrationStartedAt = new Date();
let originalSystemConfig: SystemConfig | null | undefined;
let systemConfigTargetId: string | null = null;

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

    originalSystemConfig = await prisma.systemConfig.findUnique({
      where: { singletonKey: "default" },
    });

    assert.equal((await requestJson("/api/admin/users")).status, 401);
    assert.equal((await requestJson("/api/admin/system-config")).status, 401);
    assert.equal(
      (await requestJson("/api/admin/users", teacherCookie)).status,
      403,
    );
    assert.equal(
      (await requestJson("/api/admin/users", studentCookie)).status,
      403,
    );
    assert.equal(
      (await requestJson("/api/admin/system-config", teacherCookie)).status,
      403,
    );
    assert.equal(
      (
        await requestJson("/api/admin/system-config", studentCookie, "PATCH", {
          updates: { platformName: "越权修改" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await requestJson("/api/admin/audit-logs", teacherCookie)).status,
      403,
    );
    const dashboardPaths = [
      "/api/admin/dashboard/overview",
      "/api/admin/dashboard/trends?range=7d",
      "/api/admin/dashboard/distributions",
      "/api/admin/dashboard/activities?limit=5&type=ALL",
      "/api/admin/system-health",
    ];
    for (const path of dashboardPaths) {
      assert.equal((await requestJson(path)).status, 401);
      assert.equal((await requestJson(path, teacherCookie)).status, 403);
      assert.equal((await requestJson(path, studentCookie)).status, 403);
    }
    assert.equal(
      (await requestJson("/api/admin/users?page=0", adminCookie)).status,
      400,
    );
    assert.equal(
      (await requestJson("/api/admin/dashboard/trends?range=365d", adminCookie))
        .status,
      400,
    );
    assert.equal(
      (
        await requestJson(
          "/api/admin/dashboard/activities?limit=21",
          adminCookie,
        )
      ).status,
      400,
    );

    const inactiveAdmin = await prisma.user.create({
      data: {
        email: `inactive-dashboard-admin-${testSuffix}@example.com`,
        passwordHash: admin.passwordHash,
        role: Role.ADMIN,
        status: UserStatus.INACTIVE,
        profile: { create: { displayName: "禁用仪表盘管理员" } },
      },
      select: { id: true },
    });
    createdUserIds.push(inactiveAdmin.id);
    const inactiveAdminCookie = await sessionCookie(inactiveAdmin.id);
    assert.equal(
      (await requestJson("/api/admin/dashboard/overview", inactiveAdminCookie))
        .status,
      401,
    );

    const overviewResponse = await requestJson(
      "/api/admin/dashboard/overview",
      adminCookie,
    );
    assert.equal(overviewResponse.status, 200);
    const overview =
      (await overviewResponse.json()) as ApiSuccess<DashboardOverviewView>;
    const [databaseUserCount, databaseClassroomCount, databaseQuestionCount] =
      await Promise.all([
        prisma.user.count(),
        prisma.classroom.count(),
        prisma.question.count({ where: { deletedAt: null } }),
      ]);
    assert.equal(overview.data.users.total, databaseUserCount);
    assert.equal(overview.data.teaching.classroomTotal, databaseClassroomCount);
    assert.equal(overview.data.teaching.questionTotal, databaseQuestionCount);
    assert.equal(
      Object.values(overview.data.users.byRole).reduce(
        (sum, count) => sum + count,
        0,
      ),
      databaseUserCount,
    );
    const overviewJson = JSON.stringify(overview);
    assert.equal(overviewJson.includes("passwordHash"), false);
    assert.equal(overviewJson.includes("DATABASE_URL"), false);
    assert.equal(overviewJson.includes("AI_API_KEY"), false);

    const trendsResponse = await requestJson(
      "/api/admin/dashboard/trends?range=7d",
      adminCookie,
    );
    assert.equal(trendsResponse.status, 200);
    const trends =
      (await trendsResponse.json()) as ApiSuccess<DashboardTrendsView>;
    assert.equal(trends.data.range, "7d");
    assert.equal(trends.data.points.length, 7);
    assert.deepEqual(
      trends.data.points.map((point) => point.date),
      [...trends.data.points.map((point) => point.date)].sort(),
    );
    assert.equal(
      trends.data.points.every(
        (point) => point.users >= 0 && point.submissions >= 0,
      ),
      true,
    );

    const distributionsResponse = await requestJson(
      "/api/admin/dashboard/distributions",
      adminCookie,
    );
    assert.equal(distributionsResponse.status, 200);
    const distributions =
      (await distributionsResponse.json()) as ApiSuccess<DashboardDistributionsView>;
    assert.equal(
      distributions.data.roles.reduce((sum, item) => sum + item.count, 0),
      databaseUserCount,
    );
    assert.equal(
      (
        (await requestJson(
          "/api/admin/dashboard/activities?limit=3&type=ALL",
          adminCookie,
        ).then((response) => response.json())) as ApiSuccess<{
          items: unknown[];
        }>
      ).data.items.length <= 3,
      true,
    );
    const healthResponse = await requestJson(
      "/api/admin/system-health",
      adminCookie,
    );
    assert.equal(healthResponse.status, 200);
    const healthJson = JSON.stringify(await healthResponse.json());
    assert.equal(healthJson.includes("localhost"), false);
    assert.equal(healthJson.includes("DATABASE_URL"), false);
    assert.equal(healthJson.includes("AI_API_KEY"), false);

    const configResponse = await requestJson(
      "/api/admin/system-config",
      adminCookie,
    );
    assert.equal(configResponse.status, 200);
    const initialConfig =
      (await configResponse.json()) as ApiSuccess<SystemConfigView>;
    assert.equal(typeof initialConfig.data.values.platformName, "string");
    const initialConfigJson = JSON.stringify(initialConfig);
    assert.equal(initialConfigJson.includes("AI_API_KEY"), false);
    assert.equal(initialConfigJson.includes("DATABASE_URL"), false);
    assert.equal(initialConfigJson.includes("apiKey"), false);
    if (initialConfig.data.values.maintenanceMode) {
      assert.equal(
        (
          await requestJson("/api/admin/system-config", adminCookie, "PATCH", {
            updates: { maintenanceMode: false },
          })
        ).status,
        200,
      );
    }
    assert.equal(
      (
        await requestJson("/api/admin/system-config", adminCookie, "PATCH", {
          updates: { apiKey: "forbidden" },
        })
      ).status,
      422,
    );
    assert.equal(
      (
        await requestJson("/api/admin/system-config", adminCookie, "PATCH", {
          updates: { assignmentAutosaveDelayMs: 100 },
        })
      ).status,
      422,
    );

    const updatedPlatformName = `智学集成测试-${testSuffix}`;
    const updateConfigResponse = await requestJson(
      "/api/admin/system-config",
      adminCookie,
      "PATCH",
      {
        updates: {
          platformName: updatedPlatformName,
          assignmentDefaultDueDays: 14,
        },
      },
      { "user-agent": "SystemConfigIntegration/1.0" },
    );
    assert.equal(updateConfigResponse.status, 200);
    const updatedConfig =
      (await updateConfigResponse.json()) as ApiSuccess<SystemConfigView>;
    assert.equal(updatedConfig.data.values.platformName, updatedPlatformName);
    assert.equal(updatedConfig.data.values.assignmentDefaultDueDays, 14);
    systemConfigTargetId = (
      await prisma.systemConfig.findUniqueOrThrow({
        where: { singletonKey: "default" },
        select: { id: true },
      })
    ).id;

    const configAuditCount = await prisma.auditLog.count({
      where: { targetId: systemConfigTargetId },
    });
    assert.equal(
      (
        await requestJson("/api/admin/system-config", adminCookie, "PATCH", {
          updates: { platformName: updatedPlatformName },
        })
      ).status,
      200,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { targetId: systemConfigTargetId },
      }),
      configAuditCount,
    );

    const invalidBatch = await requestJson(
      "/api/admin/system-config",
      adminCookie,
      "PATCH",
      {
        updates: {
          platformName: "不应部分保存",
          assignmentAutosaveDelayMs: 1,
        },
      },
    );
    assert.equal(invalidBatch.status, 422);
    const afterInvalid = (await (
      await requestJson("/api/admin/system-config", adminCookie)
    ).json()) as ApiSuccess<SystemConfigView>;
    assert.equal(afterInvalid.data.values.platformName, updatedPlatformName);

    assert.equal(
      (
        await requestJson("/api/admin/system-config", adminCookie, "PATCH", {
          updates: {
            maintenanceMode: true,
            maintenanceMessage: "系统配置集成测试维护中",
          },
        })
      ).status,
      200,
    );
    const maintenanceResponse = await requestJson(
      "/api/teacher/classrooms",
      teacherCookie,
    );
    assert.equal(maintenanceResponse.status, 503);
    assert.equal(
      ((await maintenanceResponse.json()) as { error: string }).error,
      "系统配置集成测试维护中",
    );
    const maintenanceBody = (await requestJson(
      "/api/teacher/classrooms",
      teacherCookie,
    ).then((response) => response.json())) as { code: string };
    assert.equal(maintenanceBody.code, "SYSTEM_MAINTENANCE");
    assert.equal(
      (await requestJson("/api/admin/system-config", adminCookie)).status,
      200,
    );
    assert.equal(
      (
        await requestJson("/api/admin/system-config", adminCookie, "PATCH", {
          updates: { maintenanceMode: false },
        })
      ).status,
      200,
    );
    assert.equal(
      (await prisma.auditLog.count({
        where: {
          targetId: systemConfigTargetId,
          action: AuditAction.MAINTENANCE_MODE_ENABLED,
        },
      })) > 0,
      true,
    );
    const configAuditResponse = await requestJson(
      `/api/admin/audit-logs?action=MAINTENANCE_MODE_ENABLED&targetId=${systemConfigTargetId}`,
      adminCookie,
    );
    assert.equal(configAuditResponse.status, 200);
    const configAudits =
      (await configAuditResponse.json()) as ApiSuccess<AuditListResult>;
    assert.equal(configAudits.data.items.length > 0, true);
    assert.equal(
      configAudits.data.items.every(
        (item) =>
          item.action === AuditAction.MAINTENANCE_MODE_ENABLED &&
          item.targetType === AuditTargetType.SYSTEM_CONFIG,
      ),
      true,
    );
    const configAuditJson = JSON.stringify(configAudits);
    assert.equal(configAuditJson.includes("AI_API_KEY"), false);
    assert.equal(configAuditJson.includes("DATABASE_URL"), false);

    assert.equal(
      (
        await requestJson("/api/admin/system-config", adminCookie, "PATCH", {
          updates: { allowSelfRegistration: false },
        })
      ).status,
      200,
    );
    const closedRegistrationPage = await requestJson("/register");
    assert.equal(closedRegistrationPage.status, 200);
    assert.match(await closedRegistrationPage.text(), /未开放自主注册/);
    assert.equal(
      (
        await requestJson("/api/admin/system-config", adminCookie, "PATCH", {
          updates: { allowSelfRegistration: true },
        })
      ).status,
      200,
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
      "Admin HTTP integration checks passed: dashboard authorization and database-backed statistics, system health privacy, strict validation, user management, system configuration, and safe audit behavior.",
    );
  } finally {
    if (systemConfigTargetId) {
      await prisma.auditLog.deleteMany({
        where: {
          targetType: AuditTargetType.SYSTEM_CONFIG,
          targetId: systemConfigTargetId,
          createdAt: { gte: integrationStartedAt },
        },
      });
    }
    if (originalSystemConfig === null) {
      await prisma.systemConfig.deleteMany({
        where: { singletonKey: "default" },
      });
    } else if (originalSystemConfig) {
      await prisma.systemConfig.update({
        where: { singletonKey: "default" },
        data: {
          platformName: originalSystemConfig.platformName,
          platformAnnouncement: originalSystemConfig.platformAnnouncement,
          maintenanceMode: originalSystemConfig.maintenanceMode,
          maintenanceMessage: originalSystemConfig.maintenanceMessage,
          allowSelfRegistration: originalSystemConfig.allowSelfRegistration,
          assignmentDefaultDueDays:
            originalSystemConfig.assignmentDefaultDueDays,
          assignmentAutosaveDelayMs:
            originalSystemConfig.assignmentAutosaveDelayMs,
          aiAnalysisEnabled: originalSystemConfig.aiAnalysisEnabled,
          updatedById: originalSystemConfig.updatedById,
        },
      });
    }
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
