import "dotenv/config";
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AssessmentComponentType,
  AttendanceRecordSource,
  AttendanceSessionStatus,
  AttendanceStatus,
  AuditAction,
  AuditTargetType,
  GradeSourceType,
  GradeValueStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertSafeSeedDatabase } from "@/prisma/seed-safety";
import { calculateAttendanceRate } from "@/services/attendance/calculation";
import {
  calculateStudentGradeInTransaction,
  gradeFingerprint,
} from "@/services/gradebook/service";
import {
  classDates,
  gradeDefinitions,
  studentTestData,
  testDataId,
  TEST_DATA_LABEL,
  TEST_DATA_VERSION,
} from "./course-test-data";

async function main() {
  const { values } = parseArgs({
    options: {
      "course-id": { type: "string" },
      "classroom-id": { type: "string" },
      "start-date": { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  assertSafeSeedDatabase();
  const courseId = values["course-id"];
  const classroomId = values["classroom-id"];
  const startDate = values["start-date"];
  if (!courseId || !classroomId || !startDate)
    throw new Error(
      "必须指定 --course-id、--classroom-id 和 --start-date；默认只预览，--apply 才写入。",
    );
  const dates = classDates(startDate);
  if (dates.some((date) => date.getTime() + 90 * 60000 > Date.now()))
    throw new Error("已结束的测试考勤不能使用未来日期。");
  const batchKey = `${courseId}:${classroomId}`;
  const gradebookId = testDataId(`${batchKey}:gradebook`);
  const markerId = testDataId(`${batchKey}:completed`);
  const result = await prisma.$transaction(
    async (tx) => {
      // Serialize with normal gradebook creation; all fixtures and totals commit together.
      await tx.$queryRaw`SELECT "id" FROM "Course" WHERE "id" = ${courseId} FOR UPDATE`;
      const course = await tx.course.findFirstOrThrow({
        where: {
          id: courseId,
          status: "ACTIVE",
          teacher: { role: "TEACHER", status: "ACTIVE" },
        },
        include: {
          currentPublishedAssessmentScheme: {
            include: { components: { where: { enabled: true } } },
          },
        },
      });
      const classroom = await tx.classroom.findFirstOrThrow({
        where: {
          id: classroomId,
          courseId,
          teacherId: course.teacherId,
          status: "ACTIVE",
        },
        include: {
          memberships: {
            where: {
              status: "ACTIVE",
              student: { role: "STUDENT", status: "ACTIVE" },
            },
            select: { studentId: true },
            orderBy: { studentId: "asc" },
          },
        },
      });
      const scheme = course.currentPublishedAssessmentScheme;
      if (!scheme || !classroom.memberships.length)
        throw new Error("需要正式考核方案和已入班的有效学生。");
      const components = gradeDefinitions.map((definition) => {
        const matches = scheme.components.filter(
          (component) => component.type === definition.type,
        );
        if (matches.length !== 1)
          throw new Error(
            `考核类型 ${definition.type} 必须唯一，请先检查正式方案。`,
          );
        return matches[0];
      });
      if (
        scheme.components.length !== 5 ||
        scheme.components
          .reduce((sum, c) => sum.add(c.weight), new Prisma.Decimal(0))
          .toNumber() !== 100
      )
        throw new Error("脚本仅支持五类考核项目且权重合计 100% 的正式方案。");
      const studentIds = classroom.memberships.map((m) => m.studentId);
      const manifest = {
        version: TEST_DATA_VERSION,
        courseId,
        classroomId,
        gradebookId,
        courseName: course.name,
        classroomName: classroom.name,
        term: course.term,
        schemeId: scheme.id,
        studentCount: studentIds.length,
        rosterFingerprint: gradeFingerprint(studentIds),
        startDate,
        lastClassDate: dates[23].toISOString(),
        attendanceSessions: 24,
        attendanceRecords: studentIds.length * 24,
        experimentGrades: studentIds.length * 8,
        assignmentGrades: studentIds.length * 8,
        midtermGrades: studentIds.length,
        finalGrades: studentIds.length,
        attendanceSummaryGrades: studentIds.length,
        gradeItems: 19,
        gradeEntries: studentIds.length * 19,
        published: false,
      };
      const marker = await tx.auditLog.findUnique({ where: { id: markerId } });
      if (marker) {
        if (gradeFingerprint(marker.afterData) !== gradeFingerprint(manifest))
          throw new Error(
            "已生成批次的名单、方案或日期不同；拒绝覆盖，请人工检查。",
          );
        return { ...manifest, mode: "reused" };
      }
      if (
        (await tx.courseGradebook.count({
          where: { courseId, classroomId },
        })) ||
        (await tx.attendanceSession.count({ where: { courseId, classroomId } }))
      )
        throw new Error("班级已有成绩台账或考勤，拒绝混入测试数据或覆盖记录。");
      if (!values.apply) return { ...manifest, mode: "preview" };
      const fixtures = studentIds.map((studentId) => ({
        studentId,
        ...studentTestData(studentId),
      }));
      await tx.courseGradebook.create({
        data: {
          id: gradebookId,
          courseId,
          classroomId,
          schemeId: scheme.id,
          createdById: course.teacherId,
        },
      });
      const items = gradeDefinitions.map((definition, index) => ({
        id: testDataId(`${batchKey}:item:${definition.key}`),
        gradebookId,
        componentId: components[index].id,
        sourceKey: `${TEST_DATA_VERSION}:${definition.key}`,
        name: `${TEST_DATA_LABEL}${definition.name}`,
        maxScore: new Prisma.Decimal(100),
        itemWeight: new Prisma.Decimal(1),
        sourceType:
          definition.type === AssessmentComponentType.REGULAR_PERFORMANCE
            ? GradeSourceType.ATTENDANCE
            : GradeSourceType.MANUAL,
        sortOrder: index + 1,
      }));
      await tx.gradeItem.createMany({ data: items });
      for (const [index, startsAt] of dates.entries()) {
        const sessionId = testDataId(`${batchKey}:session:${index}`);
        const endsAt = new Date(startsAt.getTime() + 90 * 60000);
        await tx.attendanceSession.create({
          data: {
            id: sessionId,
            courseId,
            classroomId,
            teacherId: course.teacherId,
            title: `${TEST_DATA_LABEL}第 ${String(index + 1).padStart(2, "0")} 次课`,
            status: AttendanceSessionStatus.CLOSED,
            startsAt,
            signInOpensAt: new Date(startsAt.getTime() - 10 * 60000),
            lateAfter: new Date(startsAt.getTime() + 10 * 60000),
            signInClosesAt: endsAt,
            endedAt: endsAt,
            revision: 1,
          },
        });
        const records = fixtures.map((student) => ({
          id: testDataId(`${sessionId}:${student.studentId}`),
          sessionId,
          studentId: student.studentId,
          currentStatus: student.attendance[index],
          currentRevisionNumber: 1,
        }));
        await tx.attendanceRecord.createMany({ data: records });
        await tx.attendanceRecordRevision.createMany({
          data: records.map((record) => ({
            recordId: record.id,
            revisionNumber: 1,
            previousStatus: AttendanceStatus.PENDING,
            newStatus: record.currentStatus,
            source: AttendanceRecordSource.TEACHER_CORRECTION,
            actorId: course.teacherId,
            reason: `${TEST_DATA_LABEL}${TEST_DATA_VERSION} 模拟考勤，非真实签到`,
            occurredAt: endsAt,
          })),
        });
        await tx.auditLog.create({
          data: {
            actorId: course.teacherId,
            action: AuditAction.ATTENDANCE_SESSION_CREATED,
            targetType: AuditTargetType.ATTENDANCE_SESSION,
            targetId: sessionId,
            summary: `${TEST_DATA_LABEL}生成第 ${index + 1} 次课及 ${studentIds.length} 条模拟考勤`,
            afterData: {
              batchKey,
              version: TEST_DATA_VERSION,
              sessionId,
              recordCount: records.length,
            },
          },
        });
      }
      for (const [index, item] of items.entries()) {
        const definition = gradeDefinitions[index];
        const entries = fixtures.map((student) => ({
          id: testDataId(`${item.id}:${student.studentId}`),
          gradebookId,
          gradeItemId: item.id,
          studentId: student.studentId,
          currentRevisionNumber: 1,
        }));
        await tx.studentGradeEntry.createMany({ data: entries });
        await tx.studentGradeEntryRevision.createMany({
          data: fixtures.map((student, studentIndex) => {
            let score: number;
            switch (definition.type) {
              case AssessmentComponentType.REGULAR_PERFORMANCE: {
                const rate = calculateAttendanceRate(student.attendance).rate;
                if (rate === null) throw new Error("考勤样本缺少有效分母。");
                score = Number(rate);
                break;
              }
              case AssessmentComponentType.COURSE_EXPERIMENT:
                score = student.experiments[definition.index];
                break;
              case AssessmentComponentType.COURSE_ASSIGNMENT:
                score = student.assignments[definition.index];
                break;
              case AssessmentComponentType.MIDTERM_EXAM:
                score = student.midterm;
                break;
              case AssessmentComponentType.FINAL_EXAM:
                score = student.final;
                break;
              default:
                throw new Error("不支持的考核类型。");
            }
            return {
              entryId: entries[studentIndex].id,
              gradebookId,
              gradeItemId: item.id,
              studentId: student.studentId,
              revisionNumber: 1,
              status: GradeValueStatus.SCORED,
              score: new Prisma.Decimal(score),
              sourceType: item.sourceType,
              sourceFingerprint: gradeFingerprint({
                version: TEST_DATA_VERSION,
                itemId: item.id,
                studentId: student.studentId,
                score,
              }),
              changedById: course.teacherId,
              reason: `${TEST_DATA_LABEL}${TEST_DATA_VERSION}；仅供系统功能测试`,
            };
          }),
        });
        await tx.auditLog.create({
          data: {
            actorId: course.teacherId,
            action: AuditAction.GRADE_ENTRY_CORRECTED,
            targetType: AuditTargetType.GRADEBOOK,
            targetId: gradebookId,
            summary: `${item.name}：批量生成 ${studentIds.length} 条模拟成绩`,
            afterData: {
              batchKey,
              version: TEST_DATA_VERSION,
              gradebookId,
              gradeItemId: item.id,
              entryCount: entries.length,
            },
          },
        });
      }
      for (const studentId of studentIds)
        await calculateStudentGradeInTransaction(
          tx,
          gradebookId,
          studentId,
          course.teacherId,
        );
      await tx.auditLog.create({
        data: {
          id: markerId,
          actorId: course.teacherId,
          action: AuditAction.GRADEBOOK_CREATED,
          targetType: AuditTargetType.GRADEBOOK,
          targetId: gradebookId,
          summary: `${TEST_DATA_LABEL}${TEST_DATA_VERSION} 生成完成（未发布成绩）`,
          afterData: manifest,
        },
      });
      return { ...manifest, mode: "created" };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 120000,
    },
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.mode !== "preview") {
    const directory = path.join(process.cwd(), ".data", "course-test-data");
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, `${gradebookId}.json`),
      JSON.stringify(result, null, 2),
      "utf8",
    );
  }
}

main()
  .catch((error: unknown) => {
    // Prisma errors may contain internal connection or query details.
    console.error(
      error instanceof Prisma.PrismaClientKnownRequestError
        ? `数据库操作失败（${error.code}），事务未提交。`
        : error instanceof Error
          ? error.message
          : "测试数据生成失败。",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
