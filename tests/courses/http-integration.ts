import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

import { SESSION_COOKIE_NAME } from "@/services/auth/constants";
import { assertIsolatedIntegrationEnvironment } from "../integration/database";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

assertIsolatedIntegrationEnvironment("HTTP_INTEGRATION_SCHEMA");
const prisma = new PrismaClient();
const port = 3111;
const baseUrl = `http://127.0.0.1:${port}`;
const pdfA = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const pdfB = Buffer.from("%PDF-1.5\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const serverOutput: string[] = [];
const sessionIds: string[] = [];
const createdTemplateIds: string[] = [];
const createdCourseIds: string[] = [];
const createdClassroomIds: string[] = [];
const createdSyllabusIds: string[] = [];
const uploadRoot = mkdtempSync(join(tmpdir(), "zhixue-http-syllabus-"));

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
    env: { ...process.env, LOCAL_UPLOAD_ROOT: uploadRoot },
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
  sessionIds.push(session.id);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

async function requestJson(
  path: string,
  cookie?: string,
  method = "GET",
  body?: unknown,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function requestMultipart(
  path: string,
  cookie: string | undefined,
  fileName: string,
  mimeType: string,
  data: Buffer,
): Promise<Response> {
  const formData = new FormData();
  formData.set(
    "file",
    new Blob([new Uint8Array(data)], { type: mimeType }),
    fileName,
  );

  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
    },
    body: formData,
  });
}

async function main(): Promise<void> {
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
    const [adminCookie, teacherCookie, teacherTwoCookie, studentCookie] =
      await Promise.all([
        sessionCookie(admin.id),
        sessionCookie(teacher.id),
        sessionCookie(teacherTwo.id),
        sessionCookie(student.id),
      ]);

    assert.equal(
      (await requestJson("/api/admin/course-templates")).status,
      401,
    );
    assert.equal(
      (await requestJson("/api/admin/course-templates", teacherCookie)).status,
      403,
    );
    assert.equal(
      (await requestJson("/api/admin/course-templates", studentCookie)).status,
      403,
    );
    assert.equal(
      (await requestJson("/api/teacher/course-templates")).status,
      401,
    );
    assert.equal(
      (await requestJson("/api/teacher/course-templates", adminCookie)).status,
      403,
    );
    assert.equal((await requestJson("/api/teacher/courses")).status, 401);
    assert.equal(
      (await requestJson("/api/teacher/courses", adminCookie)).status,
      403,
    );
    assert.equal(
      (await requestJson("/api/teacher/courses", studentCookie)).status,
      403,
    );

    const invalidTemplate = await requestJson(
      "/api/admin/course-templates",
      adminCookie,
      "POST",
      {
        code: "Bad Template",
        name: "",
        description: "",
        version: "",
      },
    );
    assert.equal(invalidTemplate.status, 400);

    const templateCode = `it-course-template-${randomBytes(4).toString("hex")}`;
    const createdTemplateResponse = await requestJson(
      "/api/admin/course-templates",
      adminCookie,
      "POST",
      {
        code: templateCode,
        name: "HTTP 测试课程模板",
        description: "用于课程 HTTP 集成测试",
        version: "1.0",
      },
    );
    assert.equal(createdTemplateResponse.status, 201);
    const createdTemplate =
      (await createdTemplateResponse.json()) as ApiSuccess<{ id: string }>;
    createdTemplateIds.push(createdTemplate.data.id);

    assert.equal(
      (
        await requestJson("/api/admin/course-templates", adminCookie, "POST", {
          code: templateCode,
          name: "重复模板",
          description: "重复",
          version: "1.0",
        })
      ).status,
      409,
    );

    const editTemplateResponse = await requestJson(
      `/api/admin/course-templates/${createdTemplate.data.id}`,
      adminCookie,
      "PATCH",
      {
        name: "HTTP 测试课程模板（更新）",
        description: "更新后的描述",
        version: "1.1",
      },
    );
    assert.equal(editTemplateResponse.status, 200);

    assert.equal(
      (
        await requestJson(
          `/api/admin/course-templates/${createdTemplate.data.id}/disable`,
          adminCookie,
          "POST",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await requestJson("/api/teacher/courses", teacherCookie, "POST", {
          templateId: createdTemplate.data.id,
          courseNo: `HTTP-${randomBytes(3).toString("hex").toUpperCase()}`,
          term: "2026-2027-1",
          name: "停用模板课程",
          description: "不应被允许",
        })
      ).status,
      404,
    );

    assert.equal(
      (
        await requestJson(
          `/api/admin/course-templates/${createdTemplate.data.id}/enable`,
          adminCookie,
          "POST",
        )
      ).status,
      200,
    );

    const activeTemplatesResponse = await requestJson(
      "/api/teacher/course-templates",
      teacherCookie,
    );
    assert.equal(activeTemplatesResponse.status, 200);
    const activeTemplates =
      (await activeTemplatesResponse.json()) as ApiSuccess<
        Array<{ id: string }>
      >;
    assert.equal(
      activeTemplates.data.some((item) => item.id === createdTemplate.data.id),
      true,
    );

    assert.equal(
      (await requestJson("/api/teacher/courses/not-a-cuid", teacherCookie))
        .status,
      400,
    );
    assert.equal(
      (
        await requestJson(
          "/api/admin/course-templates/cm12345678901234567890123",
          adminCookie,
        )
      ).status,
      404,
    );

    const courseNo = `HTTP-${randomBytes(3).toString("hex").toUpperCase()}`;
    const createCourseResponse = await requestJson(
      "/api/teacher/courses",
      teacherCookie,
      "POST",
      {
        templateId: createdTemplate.data.id,
        courseNo,
        term: "2026-2027-1",
        name: "HTTP 测试课程",
        description: "课程创建测试",
      },
    );
    assert.equal(createCourseResponse.status, 201);
    const createdCourse = (await createCourseResponse.json()) as ApiSuccess<{
      id: string;
    }>;
    createdCourseIds.push(createdCourse.data.id);

    const syllabusPath = `/api/teacher/courses/${createdCourse.data.id}/syllabus`;
    const syllabusDownloadPath = `${syllabusPath}/download`;
    assert.equal(
      (
        await requestMultipart(
          syllabusPath,
          undefined,
          "unauthorized.pdf",
          "application/pdf",
          pdfA,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await requestMultipart(
          syllabusPath,
          studentCookie,
          "student.pdf",
          "application/pdf",
          pdfA,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await requestMultipart(
          syllabusPath,
          adminCookie,
          "admin.pdf",
          "application/pdf",
          pdfA,
        )
      ).status,
      403,
    );

    const uploadSyllabusResponse = await requestMultipart(
      syllabusPath,
      teacherCookie,
      "python-syllabus.pdf",
      "application/pdf",
      pdfA,
    );
    assert.equal(uploadSyllabusResponse.status, 200);
    const uploadedSyllabus =
      (await uploadSyllabusResponse.json()) as ApiSuccess<{
        id: string;
        originalName: string;
        sizeBytes: number;
      }>;
    createdSyllabusIds.push(uploadedSyllabus.data.id);
    assert.equal(uploadedSyllabus.data.originalName, "python-syllabus.pdf");
    assert.equal(uploadedSyllabus.data.sizeBytes, pdfA.length);

    assert.equal(
      (
        await requestMultipart(
          syllabusPath,
          teacherTwoCookie,
          "foreign.pdf",
          "application/pdf",
          pdfA,
        )
      ).status,
      404,
    );

    const syllabusInfoResponse = await requestJson(syllabusPath, teacherCookie);
    assert.equal(syllabusInfoResponse.status, 200);
    const syllabusInfo = (await syllabusInfoResponse.json()) as ApiSuccess<{
      originalName: string;
      sizeBytes: number;
      storageKey?: string;
    } | null>;
    assert.equal(syllabusInfo.data?.originalName, "python-syllabus.pdf");
    assert.equal(syllabusInfo.data?.sizeBytes, pdfA.length);
    assert.equal(syllabusInfo.data?.storageKey, undefined);

    const downloadResponse = await fetch(`${baseUrl}${syllabusDownloadPath}`, {
      headers: { cookie: teacherCookie },
    });
    assert.equal(downloadResponse.status, 200);
    assert.match(
      downloadResponse.headers.get("content-type") ?? "",
      /application\/pdf/u,
    );
    assert.match(
      downloadResponse.headers.get("content-disposition") ?? "",
      /attachment/u,
    );
    assert.equal(
      Buffer.from(await downloadResponse.arrayBuffer()).equals(pdfA),
      true,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}${syllabusDownloadPath}`, {
          headers: { cookie: teacherTwoCookie },
        })
      ).status,
      404,
    );

    const invalidSyllabusResponse = await requestMultipart(
      syllabusPath,
      teacherCookie,
      "fake.pdf",
      "application/pdf",
      Buffer.from("not a pdf"),
    );
    assert.equal(invalidSyllabusResponse.status, 400);
    const invalidSyllabus = (await invalidSyllabusResponse.json()) as {
      success: false;
      error: string;
    };
    assert.equal(invalidSyllabus.success, false);
    assert.equal(invalidSyllabus.error.includes(uploadRoot), false);
    assert.equal(invalidSyllabus.error.includes("Prisma"), false);

    const replaceSyllabusResponse = await requestMultipart(
      syllabusPath,
      teacherCookie,
      "python-syllabus-v2.pdf",
      "application/pdf",
      pdfB,
    );
    assert.equal(replaceSyllabusResponse.status, 200);
    const replacedSyllabus =
      (await replaceSyllabusResponse.json()) as ApiSuccess<{
        id: string;
        originalName: string;
        sizeBytes: number;
      }>;
    assert.equal(replacedSyllabus.data.id, uploadedSyllabus.data.id);
    assert.equal(replacedSyllabus.data.originalName, "python-syllabus-v2.pdf");
    assert.equal(replacedSyllabus.data.sizeBytes, pdfB.length);
    const replacedDownloadResponse = await fetch(
      `${baseUrl}${syllabusDownloadPath}`,
      {
        headers: { cookie: teacherCookie },
      },
    );
    assert.equal(
      Buffer.from(await replacedDownloadResponse.arrayBuffer()).equals(pdfB),
      true,
    );

    assert.equal(
      (
        await requestJson("/api/teacher/courses", teacherCookie, "POST", {
          templateId: createdTemplate.data.id,
          courseNo,
          term: "2026-2027-1",
          name: "重复课程",
          description: "重复课程",
        })
      ).status,
      409,
    );

    const teacherCoursesResponse = await requestJson(
      "/api/teacher/courses",
      teacherCookie,
    );
    assert.equal(teacherCoursesResponse.status, 200);
    const teacherCourses = (await teacherCoursesResponse.json()) as ApiSuccess<
      Array<{ id: string }>
    >;
    assert.equal(
      teacherCourses.data.some((item) => item.id === createdCourse.data.id),
      true,
    );

    assert.equal(
      (
        await requestJson(
          `/api/teacher/courses/${createdCourse.data.id}`,
          teacherTwoCookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await requestJson(
          "/api/teacher/courses/cm12345678901234567890123",
          teacherCookie,
        )
      ).status,
      404,
    );

    const classroom = await prisma.classroom.create({
      data: {
        teacherId: teacher.id,
        joinCode: `HTTPCOURSE${randomBytes(4).toString("hex").toUpperCase()}`,
        name: "HTTP 课程关联班级",
        description: "HTTP 集成测试班级",
        status: "ACTIVE",
        allowStudentLeave: true,
      },
      select: { id: true },
    });
    createdClassroomIds.push(classroom.id);

    assert.equal(
      (
        await requestJson(
          `/api/teacher/courses/${createdCourse.data.id}/classrooms/${classroom.id}`,
          teacherCookie,
          "POST",
        )
      ).status,
      200,
    );
    const linkedDetail = (await requestJson(
      `/api/teacher/courses/${createdCourse.data.id}`,
      teacherCookie,
    ).then((response) => response.json())) as ApiSuccess<{
      linkedClassrooms: Array<{ id: string }>;
      classrooms: Array<{ id: string; currentCourse: { id: string } | null }>;
    }>;
    assert.equal(linkedDetail.data.linkedClassrooms.length, 1);
    assert.equal(linkedDetail.data.linkedClassrooms[0]?.id, classroom.id);
    assert.equal(
      linkedDetail.data.classrooms.find((item) => item.id === classroom.id)
        ?.currentCourse?.id,
      createdCourse.data.id,
    );

    assert.equal(
      (
        await requestJson(
          `/api/teacher/courses/${createdCourse.data.id}/classrooms/${classroom.id}`,
          teacherTwoCookie,
          "DELETE",
        )
      ).status,
      404,
    );

    assert.equal(
      (
        await requestJson(
          `/api/teacher/courses/${createdCourse.data.id}/classrooms/${classroom.id}`,
          teacherCookie,
          "DELETE",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await requestJson(
          `/api/teacher/courses/${createdCourse.data.id}/classrooms/${classroom.id}`,
          teacherCookie,
          "DELETE",
        )
      ).status,
      404,
    );

    assert.equal(
      (
        await requestJson(
          `/api/teacher/courses/${createdCourse.data.id}`,
          teacherCookie,
          "PATCH",
          {
            courseNo: `HTTP-${randomBytes(3).toString("hex").toUpperCase()}`,
            term: "2026-2027-1",
            name: "HTTP 测试课程（更新）",
            description: "更新后的课程说明",
          },
        )
      ).status,
      200,
    );

    console.info(
      "Course HTTP integration checks passed: template governance, teacher template visibility, course creation, duplicate protection, ownership isolation, classroom linking, unlinking, and invalid input handling.",
    );
  } finally {
    if (createdClassroomIds.length > 0) {
      await prisma.classroom.deleteMany({
        where: { id: { in: createdClassroomIds } },
      });
    }
    if (createdCourseIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { targetId: { in: createdCourseIds } },
      });
      if (createdSyllabusIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { targetId: { in: createdSyllabusIds } },
        });
      }
      await prisma.course.deleteMany({
        where: { id: { in: createdCourseIds } },
      });
    }
    if (createdClassroomIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { targetId: { in: createdClassroomIds } },
      });
    }
    if (createdTemplateIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { targetId: { in: createdTemplateIds } },
      });
      await prisma.courseTemplate.deleteMany({
        where: { id: { in: createdTemplateIds } },
      });
    }
    if (sessionIds.length > 0) {
      await prisma.authSession.deleteMany({
        where: { id: { in: sessionIds } },
      });
    }
    await prisma.$disconnect();
    server.kill();
    await Promise.race([
      once(server, "exit"),
      new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000)),
    ]);
    rmSync(uploadRoot, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
