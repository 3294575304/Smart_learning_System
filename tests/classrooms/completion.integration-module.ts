import {
  publishCourseSurvey,
  getStudentCourseSurvey,
  submitCourseSurveyResponse,
} from "@/services/course-surveys/service";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  completeClassroom,
  closeClassroom,
  joinClassroom,
  removeClassroomStudent,
} from "@/services/classrooms/service";
import { closeAdminClassroom } from "@/services/admin/classrooms/service";
import {
  assignmentBatchSchema,
  assignmentListQuerySchema,
} from "@/services/assignments/schemas";
import {
  createAssignmentBatch,
  listTeacherAssignments,
  startOrResumeAttempt,
  saveStudentAnswers,
  submitStudentAssignment,
  listStudentAssignments,
} from "@/services/assignments/service";
import { publishAssignmentResults } from "@/services/assignments/manual-grading";
import { getTeacherDashboard } from "@/services/dashboard/teacher-dashboard";
import { createTeacherAttendanceSession } from "@/services/attendance/service";

export async function verifyClassroomCompletion(ids: {
  teacherId: string;
  otherTeacherId: string;
  studentId: string;
  courseId: string;
}) {
  const context = { ipAddress: null, userAgent: "isolated-completion-test" };
  const classroom = await prisma.classroom.create({
    data: {
      teacherId: ids.teacherId,
      courseId: ids.courseId,
      name: "结课隔离验收班",
      joinCode: randomUUID().slice(0, 8),
      memberships: { create: { studentId: ids.studentId } },
    },
  });
  const batch = assignmentBatchSchema.parse({
    requestId: randomUUID(),
    publish: true,
    classroomIds: [classroom.id],
    assignment: {
      title: "结课前任务",
      classroomId: classroom.id,
      publishedAt: new Date(Date.now() - 60000),
      dueAt: new Date(Date.now() + 86400000),
      allowResubmission: true,
      questions: [],
      submissionTask: {
        prompt: "提交实验说明",
        referenceAnswer: "教师评分参考",
        points: 100,
      },
    },
  });
  const {
    assignments: [assignment],
  } = await createAssignmentBatch(ids.teacherId, batch);
  assert.ok(assignment);
  const graded = await prisma.submission.create({
    data: {
      assignmentId: assignment.id,
      studentId: ids.studentId,
      attemptNumber: 1,
      idempotencyKey: randomUUID(),
      status: "GRADED",
      startedAt: new Date(Date.now() - 1000),
      score: 85,
      maxScore: 100,
      percentage: 85,
      submittedAt: new Date(),
      gradedAt: new Date(),
    },
  });
  const key = randomUUID();
  const draft = await startOrResumeAttempt(ids.studentId, assignment.id, key);
  const membership = await prisma.classMembership.findUniqueOrThrow({
    where: {
      classroomId_studentId: {
        classroomId: classroom.id,
        studentId: ids.studentId,
      },
    },
  });
  const frozen = await prisma.assignmentQuestion.findMany({
    where: { assignmentId: assignment.id },
  });
  await assert.rejects(
    completeClassroom(ids.otherTeacherId, classroom.id, context),
    /班级不存在/,
  );
  await assert.rejects(
    closeClassroom(ids.teacherId, classroom.id),
    /入口已停用/,
  );
  const [completed, concurrent] = await Promise.all([
    completeClassroom(ids.teacherId, classroom.id, context),
    completeClassroom(ids.teacherId, classroom.id, context),
  ]);
  assert.equal(
    completed.completedAt?.getTime(),
    concurrent.completedAt?.getTime(),
  );
  assert.equal(completed.status, "COMPLETED");
  const currentOptions = await listTeacherAssignments(
    ids.teacherId,
    assignmentListQuerySchema.parse({ courseId: ids.courseId }),
  );
  assert.ok(!currentOptions.availableClassroomIds.includes(classroom.id));
  const historyOptions = await listTeacherAssignments(
    ids.teacherId,
    assignmentListQuerySchema.parse({
      courseId: ids.courseId,
      section: "HISTORY",
    }),
  );
  assert.ok(historyOptions.availableClassroomIds.includes(classroom.id));
  assert.ok(completed.completedAt);
  const again = await completeClassroom(ids.teacherId, classroom.id, context);
  assert.equal(again.completedAt?.getTime(), completed.completedAt?.getTime());
  assert.equal(
    await prisma.auditLog.count({
      where: { targetId: classroom.id, action: "CLASSROOM_COMPLETED" },
    }),
    1,
  );
  assert.equal(
    (
      await prisma.classMembership.findUniqueOrThrow({
        where: { id: membership.id },
      })
    ).status,
    "ACTIVE",
  );
  assert.equal(
    (
      await prisma.assignment.findUniqueOrThrow({
        where: { id: assignment.id },
      })
    ).status,
    "PUBLISHED",
  );
  assert.deepEqual(
    await prisma.assignmentQuestion.findMany({
      where: { assignmentId: assignment.id },
    }),
    frozen,
  );
  const query = { classroomId: classroom.id, courseId: ids.courseId };
  assert.equal(
    (
      await listTeacherAssignments(
        ids.teacherId,
        assignmentListQuerySchema.parse(query),
      )
    ).pagination.total,
    0,
  );
  assert.equal(
    (
      await listTeacherAssignments(
        ids.teacherId,
        assignmentListQuerySchema.parse({ ...query, section: "HISTORY" }),
      )
    ).items[0]?.id,
    assignment.id,
  );
  assert.ok(
    (await listStudentAssignments(ids.studentId)).find(
      (item) => item.id === assignment.id,
    )?.historyOnly,
  );
  assert.ok(
    (
      await getTeacherDashboard(ids.teacherId, { courseId: ids.courseId })
    ).workspace?.todo.some((item) => item.key === `publish:${assignment.id}`),
  );
  await assert.rejects(
    startOrResumeAttempt(ids.studentId, assignment.id, randomUUID()),
    /班级已结课/,
  );
  await assert.rejects(
    startOrResumeAttempt(ids.studentId, assignment.id, key),
    /班级已结课/,
  );
  await assert.rejects(
    saveStudentAnswers(ids.studentId, draft.id, {
      version: draft.version,
      answers: [
        { kind: "EMPTY", assignmentQuestionId: assignment.questions[0].id },
      ],
    }),
    /班级已结课/,
  );
  await assert.rejects(
    submitStudentAssignment(ids.studentId, draft.id),
    /班级已结课/,
  );
  await assert.rejects(
    joinClassroom(ids.studentId, classroom.joinCode),
    /已结课或已关闭/,
  );
  await assert.rejects(
    removeClassroomStudent(ids.teacherId, classroom.id, membership.id),
    /保留历史名单/,
  );
  await assert.rejects(
    createAssignmentBatch(ids.teacherId, { ...batch, requestId: randomUUID() }),
    /班级不存在/,
  );
  await assert.rejects(
    createTeacherAttendanceSession(
      ids.teacherId,
      ids.courseId,
      {
        classroomId: classroom.id,
        title: "禁止新签到",
        startsAt: new Date(),
        signInOpensAt: new Date(),
        lateAfter: new Date(),
        signInClosesAt: new Date(Date.now() + 60000),
      },
      context,
    ),
    /班级不存在/,
  );
  assert.equal(
    (await publishAssignmentResults(ids.teacherId, assignment.id, context))
      .publishedCount,
    1,
  );
  assert.equal(
    (await prisma.submission.findUniqueOrThrow({ where: { id: graded.id } }))
      .status,
    "PUBLISHED",
  );
  const survey = await prisma.courseSurvey.create({
    data: {
      courseId: ids.courseId,
      classroomId: classroom.id,
      teacherId: ids.teacherId,
      title: "结课后的教学评价",
      instructions: "不计入成绩",
      mode: "ANONYMOUS",
      opensAt: new Date(Date.now() - 1000),
      dueAt: new Date(Date.now() + 86400000),
      questions: {
        create: {
          type: "LIKERT_5",
          dimension: "CONTENT",
          prompt: "课程内容是否清晰",
          sortOrder: 1,
        },
      },
    },
    include: { questions: true },
  });
  await publishCourseSurvey(
    ids.teacherId,
    ids.courseId,
    survey.id,
    1,
    context,
    true,
  );
  assert.equal(
    (await getStudentCourseSurvey(ids.studentId, survey.id)).isOpen,
    true,
  );
  await submitCourseSurveyResponse(
    ids.studentId,
    survey.id,
    {
      idempotencyKey: randomUUID(),
      answers: [
        { questionId: survey.questions[0].id, kind: "SCALE", value: 4 },
      ],
    },
    context,
  );
  assert.ok(
    (await getStudentCourseSurvey(ids.studentId, survey.id)).submittedAt,
  );
  const admin = await prisma.user.findFirstOrThrow({
    where: { role: "ADMIN" },
  });
  await assert.rejects(
    closeAdminClassroom(admin.id, classroom.id, context, ""),
  );
  const closed = await closeAdminClassroom(
    admin.id,
    classroom.id,
    context,
    "异常教学班停用",
  );
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.closureReason, "异常教学班停用");
  assert.ok(closed.completedAt);
  await assert.rejects(
    getStudentCourseSurvey(ids.studentId, survey.id),
    /问卷不存在/,
  );
  assert.equal(closed.activeStudentCount, 1);
  await assert.rejects(
    completeClassroom(ids.teacherId, classroom.id, context),
    /仅授课中/,
  );
  assert.equal(
    (
      await listTeacherAssignments(
        ids.teacherId,
        assignmentListQuerySchema.parse({ ...query, section: "HISTORY" }),
      )
    ).pagination.total,
    1,
  );
  console.log(
    "Classroom completion passed: ownership, idempotent audit, automatic history, immutable snapshots, student write restrictions, retained members, post-completion grades and administrative closure reasons.",
  );
}
