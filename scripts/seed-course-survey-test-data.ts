import "dotenv/config";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertSafeSeedDatabase } from "@/prisma/seed-safety";
import {
  defaultSurveyQuestions,
  generateCourseSurveySummary,
} from "@/services/course-surveys/service";
import { gradeFingerprint } from "@/services/gradebook/service";
import { syntheticSurveyAnswers } from "./survey-test-data";
import { testDataId, TEST_DATA_LABEL } from "./course-test-data";

const VERSION = "course-survey-test-data-v1";

async function main() {
  const { values } = parseArgs({
    options: {
      "course-id": { type: "string" },
      "classroom-id": { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  assertSafeSeedDatabase();
  const courseId = values["course-id"],
    classroomId = values["classroom-id"];
  if (!courseId || !classroomId)
    throw new Error(
      "必须指定 --course-id 和 --classroom-id；默认预览，--apply 才写入。",
    );
  const surveyId = testDataId(`${VERSION}:${courseId}:${classroomId}`);
  const markerId = testDataId(`${surveyId}:completed`);
  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Course" WHERE "id" = ${courseId} FOR UPDATE`;
      const course = await tx.course.findFirstOrThrow({
        where: {
          id: courseId,
          status: "ACTIVE",
          teacher: { role: "TEACHER", status: "ACTIVE" },
        },
        include: { currentPublishedSyllabusStructure: true },
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
            where: { status: "ACTIVE" },
            select: {
              studentId: true,
              student: { select: { role: true, status: true } },
            },
            orderBy: { studentId: "asc" },
          },
        },
      });
      const syllabus = course.currentPublishedSyllabusStructure;
      if (!syllabus || !classroom.memberships.length)
        throw new Error("需要正式大纲和在读学生。");
      if (
        classroom.memberships.some(
          (m) => m.student.role !== "STUDENT" || m.student.status !== "ACTIVE",
        )
      )
        throw new Error("存在无效学生账号，请先核对班级名单。");
      const studentIds = classroom.memberships.map((m) => m.studentId);
      const questions = defaultSurveyQuestions(syllabus.structureJson).map(
        (q) => ({
          ...q,
          id: testDataId(`${surveyId}:question:${q.sortOrder}`),
        }),
      );
      const manifest = {
        version: VERSION,
        courseId,
        classroomId,
        surveyId,
        syllabusId: syllabus.id,
        studentCount: studentIds.length,
        rosterFingerprint: gradeFingerprint(studentIds),
        questionCount: questions.length,
        responseCount: studentIds.length,
        answerCount: studentIds.length * questions.length,
        mode: "ANONYMOUS",
        title: `${TEST_DATA_LABEL}${course.name}结课调查问卷`,
      };
      const marker = await tx.auditLog.findUnique({ where: { id: markerId } });
      if (marker) {
        if (gradeFingerprint(marker.afterData) !== gradeFingerprint(manifest))
          throw new Error("已有批次的名单或正式大纲发生变化，拒绝覆盖。");
        const existing = await tx.courseSurvey.findUniqueOrThrow({
          where: { id: surveyId },
          include: {
            _count: {
              select: {
                responses: true,
                participations: true,
                questions: true,
              },
            },
          },
        });
        if (
          existing.courseId !== courseId ||
          existing.classroomId !== classroomId ||
          existing.mode !== "ANONYMOUS" ||
          existing.status !== "CLOSED" ||
          existing._count.responses !== studentIds.length ||
          existing._count.participations !== studentIds.length ||
          existing._count.questions !== questions.length
        )
          throw new Error("已有测试问卷状态或数量发生变化，请人工核对。");
        return { ...manifest, teacherId: course.teacherId, action: "reused" };
      }
      if (await tx.courseSurvey.count({ where: { courseId, classroomId } }))
        throw new Error("班级已有其他问卷，拒绝自动混入测试回答。");
      if (!values.apply)
        return { ...manifest, teacherId: course.teacherId, action: "preview" };
      const now = new Date();
      await tx.courseSurvey.create({
        data: {
          id: surveyId,
          courseId,
          classroomId,
          teacherId: course.teacherId,
          sourcePublishedSyllabusStructureId: syllabus.id,
          title: manifest.title,
          description: `${VERSION}；全班模拟问卷，仅用于系统功能测试，所有回答均为合成数据。`,
          instructions:
            "本问卷不计入课程成绩。此份为模拟测试问卷，回答不代表学生真实意见。",
          mode: "ANONYMOUS",
          status: "CLOSED",
          version: 3,
          opensAt: new Date(now.getTime() - 86400000),
          publishedAt: new Date(now.getTime() - 86400000),
          dueAt: now,
          closedAt: now,
          questions: { createMany: { data: questions } },
        },
      });
      // No per-student answer mapping: all timestamps are identical, IDs are random,
      // and response generation never receives a membership or student identifier.
      await tx.courseSurveyParticipation.createMany({
        data: studentIds.map((studentId) => ({
          id: testDataId(randomUUID()),
          surveyId,
          studentId,
          submittedAt: now,
          createdAt: now,
          updatedAt: now,
        })),
      });
      for (let index = 0; index < studentIds.length; index++) {
        const answers = syntheticSurveyAnswers(questions);
        await tx.courseSurveyResponse.create({
          data: {
            id: testDataId(randomUUID()),
            surveyId,
            studentId: null,
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
            answers: {
              createMany: {
                data: answers.map((answer) => ({
                  id: testDataId(randomUUID()),
                  questionId: answer.questionId,
                  scaleValue: answer.kind === "SCALE" ? answer.value : null,
                  textValue: answer.kind === "TEXT" ? answer.value : null,
                  createdAt: now,
                  updatedAt: now,
                })),
              },
            },
          },
        });
      }
      await tx.auditLog.create({
        data: {
          id: markerId,
          actorId: course.teacherId,
          action: "COURSE_SURVEY_CREATED",
          targetType: "COURSE_SURVEY",
          targetId: surveyId,
          summary: `${TEST_DATA_LABEL}生成匿名结课问卷及 ${studentIds.length} 份模拟回答，已结束`,
          afterData: manifest,
        },
      });
      return { ...manifest, teacherId: course.teacherId, action: "created" };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 120000,
    },
  );
  console.log(JSON.stringify(result, null, 2));
  if (values.apply) {
    // The normal summary service can be retried independently after fixture commit.
    const summary = await generateCourseSurveySummary(
      result.teacherId,
      courseId,
      surveyId,
      { ipAddress: null, userAgent: VERSION },
    );
    console.log(
      JSON.stringify(
        {
          summaryId: summary.id,
          revision: summary.revisionNumber,
          responseCount: summary.responseCount,
          eligibleCount: summary.eligibleCount,
          suppressed: summary.isSuppressed,
          statistics: summary.statisticsJson,
          themes: summary.themesJson,
        },
        null,
        2,
      ),
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Prisma.PrismaClientKnownRequestError
        ? `数据库操作失败（${error.code}）。若已输出 created，问卷数据已保存，重跑可恢复汇总。`
        : error instanceof Error
          ? error.message
          : "生成失败。",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
