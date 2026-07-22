import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

import {
  AnnouncementTargetType,
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
  PrismaClient,
  Role,
  UserStatus,
} from "@prisma/client";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

const prisma = new PrismaClient();
const port = 3107;
const baseUrl = `http://127.0.0.1:${port}`;
const jobSecret = `notification-http-${randomBytes(24).toString("hex")}`;
const serverOutput: string[] = [];
const sessionIds: string[] = [];
const notificationIds: string[] = [];
let inactiveUserId: string | undefined;
let announcementId: string | undefined;

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
    env: { ...process.env, NOTIFICATION_JOB_SECRET: jobSecret },
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch {
      // Starting.
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
  sessionIds.push(session.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function requestJson(
  path: string,
  cookie?: string,
  method = "GET",
  body?: unknown,
  headers?: HeadersInit,
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
      prisma.user.findFirstOrThrow({
        where: { role: Role.ADMIN, status: UserStatus.ACTIVE },
      }),
      prisma.user.findFirstOrThrow({
        where: { role: Role.TEACHER, status: UserStatus.ACTIVE },
      }),
      prisma.user.findFirstOrThrow({
        where: { role: Role.STUDENT, status: UserStatus.ACTIVE },
      }),
    ]);
    const inactive = await prisma.user.create({
      data: {
        email: `notification-disabled-${randomUUID()}@example.test`,
        passwordHash: "http-integration-only",
        role: Role.STUDENT,
        status: UserStatus.INACTIVE,
        profile: { create: { displayName: "Disabled notification test" } },
      },
    });
    inactiveUserId = inactive.id;
    const [adminCookie, teacherCookie, studentCookie, inactiveCookie] =
      await Promise.all([
        sessionCookie(admin.id),
        sessionCookie(teacher.id),
        sessionCookie(student.id),
        sessionCookie(inactive.id),
      ]);

    const sourceId = randomUUID();
    const [studentNotification, teacherNotification] = await Promise.all([
      prisma.notification.create({
        data: {
          recipientId: student.id,
          type: NotificationType.ASSIGNMENT_PUBLISHED,
          title: "HTTP student notification",
          content: "Owned by the student",
          priority: NotificationPriority.NORMAL,
          actionUrl: "/student/assignments/test",
          sourceType: NotificationSourceType.ASSIGNMENT,
          sourceId,
          deduplicationKey: `http-student:${sourceId}`,
        },
      }),
      prisma.notification.create({
        data: {
          recipientId: teacher.id,
          type: NotificationType.SYSTEM_ANNOUNCEMENT,
          title: "HTTP teacher notification",
          content: "Owned by the teacher",
          priority: NotificationPriority.NORMAL,
          actionUrl: "/notifications",
          sourceType: NotificationSourceType.ANNOUNCEMENT,
          sourceId,
          deduplicationKey: `http-teacher:${sourceId}`,
        },
      }),
    ]);
    notificationIds.push(studentNotification.id, teacherNotification.id);

    assert.equal((await requestJson("/api/notifications")).status, 401);
    assert.equal(
      (await requestJson("/api/notifications", inactiveCookie)).status,
      401,
    );
    assert.equal(
      (await requestJson("/api/notifications?pageSize=51", studentCookie))
        .status,
      400,
    );
    const listResponse = await requestJson(
      "/api/notifications?status=UNREAD&page=1&pageSize=20",
      studentCookie,
    );
    assert.equal(listResponse.status, 200);
    const list = (await listResponse.json()) as ApiSuccess<{
      items: Array<Record<string, unknown> & { id: string }>;
    }>;
    assert.equal(
      list.data.items.some((item) => item.id === studentNotification.id),
      true,
    );
    assert.equal(
      list.data.items.some((item) => item.id === teacherNotification.id),
      false,
    );
    assert.equal("deduplicationKey" in list.data.items[0], false);
    assert.equal("metadata" in list.data.items[0], false);

    assert.equal(
      (
        await requestJson(
          `/api/notifications/${teacherNotification.id}/read`,
          studentCookie,
          "PATCH",
        )
      ).status,
      404,
    );
    const markedResponse = await requestJson(
      `/api/notifications/${studentNotification.id}/read`,
      studentCookie,
      "PATCH",
    );
    assert.equal(markedResponse.status, 200);
    const marked = (await markedResponse.json()) as ApiSuccess<{
      readAt: string;
    }>;
    const repeatedResponse = await requestJson(
      `/api/notifications/${studentNotification.id}/read`,
      studentCookie,
      "PATCH",
    );
    const repeated = (await repeatedResponse.json()) as ApiSuccess<{
      readAt: string;
    }>;
    assert.equal(repeatedResponse.status, 200);
    assert.equal(repeated.data.readAt, marked.data.readAt);

    const readAllResponse = await requestJson(
      "/api/notifications/read-all",
      studentCookie,
      "POST",
    );
    assert.equal(readAllResponse.status, 200);
    const unread = (await (
      await requestJson("/api/notifications/unread-count", studentCookie)
    ).json()) as ApiSuccess<{ count: number }>;
    assert.equal(unread.data.count, 0);

    const announcementBody = {
      title: `HTTP announcement ${sourceId}`,
      content: "Plain text <script>alert('x')</script>",
      targetType: AnnouncementTargetType.STUDENT,
      expiresAt: null,
    };
    assert.equal(
      (
        await requestJson(
          "/api/admin/announcements",
          teacherCookie,
          "POST",
          announcementBody,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await requestJson(
          "/api/admin/announcements",
          studentCookie,
          "POST",
          announcementBody,
        )
      ).status,
      403,
    );
    const createdResponse = await requestJson(
      "/api/admin/announcements",
      adminCookie,
      "POST",
      announcementBody,
    );
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as ApiSuccess<{
      id: string;
    }>;
    announcementId = created.data.id;
    const publishedResponse = await requestJson(
      `/api/admin/announcements/${announcementId}/publish`,
      adminCookie,
      "POST",
    );
    assert.equal(publishedResponse.status, 200);
    const repeatedPublish = await requestJson(
      `/api/admin/announcements/${announcementId}/publish`,
      adminCookie,
      "POST",
    );
    assert.equal(repeatedPublish.status, 200);
    assert.equal(
      await prisma.notification.count({
        where: {
          sourceType: NotificationSourceType.ANNOUNCEMENT,
          sourceId: announcementId,
          recipientId: student.id,
        },
      }),
      1,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { targetId: announcementId, action: "ANNOUNCEMENT_PUBLISHED" },
      }),
      1,
    );

    assert.equal(
      (
        await requestJson(
          "/api/internal/jobs/assignment-reminders",
          undefined,
          "POST",
          undefined,
          { authorization: "Bearer wrong-secret" },
        )
      ).status,
      401,
    );

    console.log(
      "Notification HTTP integration checks passed: authentication, disabled-user rejection, ownership isolation, safe DTOs, read idempotency, unread counts, admin announcement RBAC, publish idempotency, audit logging, and internal job secret rejection.",
    );
  } finally {
    if (announcementId) {
      await prisma.notification.deleteMany({
        where: {
          sourceType: NotificationSourceType.ANNOUNCEMENT,
          sourceId: announcementId,
        },
      });
      await prisma.auditLog.deleteMany({ where: { targetId: announcementId } });
      await prisma.announcement.deleteMany({ where: { id: announcementId } });
    }
    if (notificationIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { id: { in: notificationIds } },
      });
    }
    if (sessionIds.length > 0) {
      await prisma.authSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
    }
    if (inactiveUserId) {
      await prisma.userProfile.deleteMany({
        where: { userId: inactiveUserId },
      });
      await prisma.user.deleteMany({ where: { id: inactiveUserId } });
    }
    await prisma.$disconnect();
    server.kill("SIGTERM");
    if (server.exitCode === null)
      await once(server, "exit").catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
