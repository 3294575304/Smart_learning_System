import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import { createPublishedGraphFixture } from "../helpers/teaching-graph-fixture";
import {
  getTeacherQualityReports,
  queueUploadedQualityReport,
} from "@/services/quality-reports/service";
import { qualityReportSourceSnapshotSchema } from "@/services/quality-reports/schemas";

async function main() {
  assert.match(
    new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema") ?? "",
    /^quality_scope_it_/u,
  );
  const [teacher, outsider, student, otherStudent] = await Promise.all(
    [
      "teacher@example.com",
      "teacher2@example.com",
      "student@example.com",
      "student2@example.com",
    ].map((email) =>
      prisma.user.findUniqueOrThrow({
        where: { email },
        include: { profile: true },
      }),
    ),
  );
  const template = await prisma.courseTemplate.findFirstOrThrow();
  const course = await prisma.course.create({
    data: {
      teacher: { connect: { id: teacher.id } },
      template: { connect: { id: template.id } },
      questionCategory: {
        create: {
          name: "报告分班回归",
          normalizedName: `quality-scope-${randomUUID()}`,
          schoolId: teacher.schoolId,
        },
      },
      name: "报告分班回归",
      courseNo: randomUUID(),
      term: "2026",
    },
  });
  const a = await prisma.classroom.create({
    data: {
      courseId: course.id,
      teacherId: teacher.id,
      name: "报告甲班",
      joinCode: randomUUID(),
      status: "COMPLETED",
      memberships: { create: { studentId: student.id } },
    },
  });
  const b = await prisma.classroom.create({
    data: {
      courseId: course.id,
      teacherId: teacher.id,
      name: "报告乙班",
      joinCode: randomUUID(),
      memberships: { create: { studentId: otherStudent.id } },
    },
  });
  await createPublishedGraphFixture(course.id, teacher.id);
  const syllabus = await prisma.publishedSyllabusStructure.findFirstOrThrow({
    where: { courseId: course.id },
  });
  const fingerprint = "b".repeat(64);
  const draft = await prisma.assessmentSchemeDraft.create({
    data: {
      courseId: course.id,
      createdById: teacher.id,
      structureJson: {},
      sourceFingerprint: fingerprint,
    },
  });
  const review = await prisma.assessmentSchemeReviewRevision.create({
    data: {
      draftId: draft.id,
      courseId: course.id,
      editedById: teacher.id,
      revisionNumber: 1,
      structureJson: {},
      sourceFingerprint: fingerprint,
    },
  });
  const scheme = await prisma.publishedAssessmentScheme.create({
    data: {
      courseId: course.id,
      reviewRevisionId: review.id,
      sourcePublishedSyllabusStructureId: syllabus.id,
      publishedById: teacher.id,
      versionNumber: 1,
      structureJson: {},
      sourceFingerprint: fingerprint,
      calculationRuleVersion: "test",
      components: {
        create: {
          code: "FINAL",
          name: "期末考试",
          type: "FINAL_EXAM",
          fullScore: 100,
          weight: 100,
          sourceType: "MANUAL",
          sortOrder: 1,
          sourceJson: [],
          rubricJson: [],
        },
      },
    },
  });
  await prisma.course.update({
    where: { id: course.id },
    data: {
      currentPublishedSyllabusStructureId: syllabus.id,
      currentPublishedAssessmentSchemeId: scheme.id,
    },
  });
  const context = { ipAddress: null, userAgent: "quality-scope-test" };
  function fileFor(member: typeof student) {
    return new File(
      [
        `学号,姓名,期末考试(100%)\n${member.profile!.studentNo},${member.profile!.displayName},80\n`,
      ],
      "grades.csv",
      { type: "text/csv" },
    );
  }
  const input = {
    sourceType: "UPLOAD",
    classroomId: a.id,
    teachingMethodDetails: "小组讨论",
    scoringCriteria: "按评分细则逐项核对",
  };
  await assert.rejects(
    queueUploadedQualityReport(
      outsider.id,
      course.id,
      input,
      fileFor(student),
      context,
    ),
    /不存在/u,
  );
  await assert.rejects(
    queueUploadedQualityReport(
      teacher.id,
      course.id,
      input,
      fileFor(otherStudent),
      context,
    ),
    /名单不符/u,
  );
  await assert.rejects(
    queueUploadedQualityReport(
      teacher.id,
      course.id,
      { ...input, classroomId: b.id },
      fileFor(student),
      context,
    ),
    /名单不符/u,
  );
  const queued = await queueUploadedQualityReport(
    teacher.id,
    course.id,
    input,
    fileFor(student),
    context,
  );
  const snapshot = qualityReportSourceSnapshotSchema.parse(
    queued.report.sourceSnapshotJson,
  );
  assert.equal(snapshot.classroom.id, a.id);
  assert.equal(snapshot.students.length, 1);
  assert.equal(snapshot.students[0]?.studentId, student.id);
  assert.equal(snapshot.components[0]?.weight, 1);
  assert.equal(
    snapshot.course.teachingMethodDetails,
    input.teachingMethodDetails,
  );
  const replay = await queueUploadedQualityReport(
    teacher.id,
    course.id,
    input,
    fileFor(student),
    context,
  );
  assert.equal(replay.report.id, queued.report.id);
  await queueUploadedQualityReport(
    teacher.id,
    course.id,
    { ...input, classroomId: b.id },
    fileFor(otherStudent),
    context,
  );
  const scoped = await getTeacherQualityReports(teacher.id, course.id, a.id);
  assert.equal(scoped.reports.length, 1);
  assert.equal(scoped.reports[0]?.classroom?.id, a.id);
  assert.ok(scoped.classrooms.every((item) => item.id === a.id));
  const all = await getTeacherQualityReports(teacher.id, course.id);
  assert.equal(all.reports.length, 2);
  assert.ok(all.classrooms.some((item) => item.id === a.id));
  await assert.rejects(
    getTeacherQualityReports(outsider.id, course.id, a.id),
    /不存在/u,
  );
  console.log(
    "PASS quality report service: class ownership, closed class options, roster scope, dynamic scheme, retained metadata, idempotency, scoped history",
  );

  if (process.argv.includes("--http")) {
    const token = randomUUID();
    await prisma.authSession.create({
      data: {
        userId: teacher.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const server = spawn(
      process.execPath,
      [
        resolve("node_modules/next/dist/bin/next"),
        "start",
        "-H",
        "127.0.0.1",
        "-p",
        "3193",
      ],
      {
        env: { ...process.env, BACKGROUND_LONG_TASK_WORKER_WAKE_URL: "" },
        windowsHide: true,
        stdio: "ignore",
      },
    );
    try {
      let ready = false;
      for (let i = 0; i < 60; i++) {
        try {
          if ((await fetch("http://127.0.0.1:3193/login")).ok) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 250));
      }
      assert.ok(ready, "isolated HTTP server must start");
      const form = new FormData();
      form.set("file", fileFor(student));
      form.set("classroomId", a.id);
      form.set("teachingMethodDetails", "HTTP上传授课方式");
      form.set("scoringCriteria", "HTTP上传评分标准");
      const response = await fetch(
        `http://127.0.0.1:3193/api/teacher/courses/${course.id}/quality-reports`,
        {
          method: "POST",
          headers: { cookie: `smart_learning_session=${token}` },
          body: form,
        },
      );
      assert.equal(response.status, 202);
      const payload = await response.json();
      const report = await prisma.courseQualityReport.findUniqueOrThrow({
        where: { id: payload.data.report.id },
      });
      const saved = qualityReportSourceSnapshotSchema.parse(
        report.sourceSnapshotJson,
      );
      assert.equal(saved.course.teachingMethodDetails, "HTTP上传授课方式");
      assert.equal(saved.course.scoringCriteria, "HTTP上传评分标准");
      const history = await fetch(
        `http://127.0.0.1:3193/api/teacher/courses/${course.id}/quality-reports?classroomId=${a.id}`,
        { headers: { cookie: `smart_learning_session=${token}` } },
      );
      const records = await history.json();
      assert.equal(history.status, 200);
      assert.equal(records.data.reports.length, 2);
      assert.ok(
        records.data.reports.every(
          (item: { classroom: { id: string } }) => item.classroom.id === a.id,
        ),
      );
      console.log(
        "PASS quality report HTTP: multipart metadata preserved and history filtered by classroom",
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
