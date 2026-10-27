import "server-only";

import {
  AssignmentStatus,
  AttendanceSessionStatus,
  CourseSurveyStatus,
  KnowledgeGraphNodeType,
  KnowledgeGraphRelationType,
  MembershipStatus,
  QualityReportReviewStatus,
  QualityReportStatus,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { withClassroomQuery } from "@/lib/course-classroom";
import { getTeacherCourseClassroom } from "@/services/courses/classroom-context";
import { calculateAttendanceRate } from "@/services/attendance/calculation";
import { ResourceNotFoundError } from "@/services/auth/policy";
import {
  calculateCourseAssignmentScoreTrend,
  calculateCourseAssignmentStatistics,
} from "@/services/course-analytics/assignment-statistics";
import {
  summarizeCourseProfiles,
  summarizeCourseChapterMastery,
  summarizeCourseAttentionConcepts,
} from "@/services/course-analytics/metrics";

const EFFECTIVE_SUBMISSION_STATUSES: SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.PENDING_REVIEW,
  SubmissionStatus.GRADED,
  SubmissionStatus.PUBLISHED,
];

function percentage(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : null;
}

export async function getTeacherCourseAnalytics(
  teacherId: string,
  courseId: string,
  classroomId?: string,
) {
  await getTeacherCourseClassroom(teacherId, courseId, classroomId);
  const classroomScope = classroomId ? { classroomId } : {};
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId },
    select: {
      id: true,
      name: true,
      courseNo: true,
      term: true,
      currentPublishedAssessmentSchemeId: true,
      classrooms: {
        where: {
          status: "ACTIVE",
          ...(classroomId ? { id: classroomId } : {}),
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          memberships: {
            where: { status: MembershipStatus.ACTIVE },
            select: { studentId: true },
          },
        },
      },
      currentPublishedKnowledgeGraphVersion: {
        select: {
          id: true,
          versionNumber: true,
          nodes: {
            orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
            select: {
              id: true,
              conceptId: true,
              code: true,
              name: true,
              nodeType: true,
            },
          },
          edges: {
            where: { relationType: KnowledgeGraphRelationType.CONTAINS },
            select: { fromNodeId: true, toNodeId: true },
          },
        },
      },
      currentTeachingProgressRevision: {
        select: {
          revisionNumber: true,
          createdAt: true,
          concepts: { select: { conceptId: true } },
        },
      },
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
  const classroomProgress = classroomId
    ? await prisma.courseTeachingProgressRevision.findFirst({
        where: { courseId, classroomId },
        orderBy: { revisionNumber: "desc" },
        select: {
          revisionNumber: true,
          concepts: { select: { conceptId: true } },
        },
      })
    : null;
  const teachingProgress =
    classroomProgress ?? course.currentTeachingProgressRevision;

  const studentIds = [
    ...new Set(
      course.classrooms.flatMap((classroom) =>
        classroom.memberships.map((membership) => membership.studentId),
      ),
    ),
  ];

  const [
    assignments,
    attendanceRecords,
    closedAttendanceSessions,
    profileSnapshots,
    surveys,
    reports,
    gradebooks,
  ] = await Promise.all([
    prisma.assignment.findMany({
      where: { teacherId, classroom: { courseId }, ...classroomScope },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        classroomId: true,
        title: true,
        status: true,
        dueAt: true,
        publishedAt: true,
        createdAt: true,
        classroom: { select: { name: true } },
        _count: {
          select: {
            submissions: {
              where: { status: SubmissionStatus.PENDING_REVIEW },
            },
          },
        },
      },
    }),
    prisma.attendanceRecord.findMany({
      where: {
        session: {
          courseId,
          teacherId,
          ...classroomScope,
          status: AttendanceSessionStatus.CLOSED,
        },
      },
      select: { currentStatus: true },
    }),
    prisma.attendanceSession.count({
      where: {
        courseId,
        teacherId,
        ...classroomScope,
        status: AttendanceSessionStatus.CLOSED,
      },
    }),
    studentIds.length
      ? prisma.learnerProfileSnapshot.findMany({
          where: { courseId, studentId: { in: studentIds } },
          orderBy: [{ revisionNumber: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            studentId: true,
            objectiveMasteryDimension: true,
          },
        })
      : Promise.resolve([]),
    prisma.courseSurvey.findMany({
      where: { courseId, teacherId, ...classroomScope },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        title: true,
        status: true,
        mode: true,
        dueAt: true,
        classroom: { select: { name: true } },
        _count: { select: { responses: true } },
      },
    }),
    prisma.courseQualityReport.findMany({
      where: { courseId, course: { teacherId }, ...classroomScope },
      orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        versionNumber: true,
        status: true,
        reviewStatus: true,
        createdAt: true,
      },
    }),
    prisma.courseGradebook.findMany({
      where: { courseId, course: { teacherId }, ...classroomScope },
      select: {
        id: true,
        classroomId: true,
        schemeId: true,
        currentPublicationId: true,
      },
    }),
  ]);

  const activeStudentIdsByClassroom = new Map(
    course.classrooms.map((classroom) => [
      classroom.id,
      new Set(classroom.memberships.map((membership) => membership.studentId)),
    ]),
  );
  const assignmentIds = assignments
    .filter(
      (assignment) =>
        assignment.status === AssignmentStatus.PUBLISHED ||
        assignment.status === AssignmentStatus.CLOSED,
    )
    .map((assignment) => assignment.id);
  const assignmentSubmissions =
    assignmentIds.length > 0 && studentIds.length > 0
      ? await prisma.submission.findMany({
          where: {
            assignmentId: { in: assignmentIds },
            studentId: { in: studentIds },
            status: { in: EFFECTIVE_SUBMISSION_STATUSES },
          },
          orderBy: [
            { assignmentId: "asc" },
            { studentId: "asc" },
            { attemptNumber: "desc" },
            { submittedAt: "desc" },
            { id: "desc" },
          ],
          select: {
            id: true,
            assignmentId: true,
            studentId: true,
            attemptNumber: true,
            status: true,
            submittedAt: true,
            score: true,
            maxScore: true,
          },
        })
      : [];
  const recentActivitySince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const currentSchemeGradebooks = course.currentPublishedAssessmentSchemeId
    ? gradebooks.filter(
        (gradebook) =>
          gradebook.schemeId === course.currentPublishedAssessmentSchemeId &&
          gradebook.currentPublicationId !== null,
      )
    : [];
  const currentPublicationIds = currentSchemeGradebooks.flatMap((gradebook) =>
    gradebook.currentPublicationId ? [gradebook.currentPublicationId] : [],
  );
  const [
    outcomeRuns,
    recentAttendanceRecords,
    recentPracticeAnswers,
    recentCourseConversations,
  ] = await Promise.all([
    currentPublicationIds.length
      ? prisma.courseOutcomeAttainmentRun.findMany({
          where: {
            courseId,
            ...classroomScope,
            gradebookId: {
              in: currentSchemeGradebooks.map((gradebook) => gradebook.id),
            },
            gradebookPublicationId: { in: currentPublicationIds },
          },
          orderBy: [{ calculatedAt: "desc" }, { versionNumber: "desc" }],
          select: {
            classroomId: true,
            results: {
              select: {
                outcomeCode: true,
                students: {
                  select: { studentId: true, attained: true },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
    studentIds.length
      ? prisma.attendanceRecord.findMany({
          where: {
            studentId: { in: studentIds },
            signedAt: { gte: recentActivitySince },
            session: { courseId, teacherId, ...classroomScope },
          },
          select: { studentId: true },
        })
      : Promise.resolve([]),
    studentIds.length
      ? prisma.recommendationPracticeAnswer.findMany({
          where: {
            createdAt: { gte: recentActivitySince },
            recommendation: {
              is: {
                studentId: { in: studentIds },
                courseCycle: {
                  is: { courseId, ...classroomScope },
                },
              },
            },
          },
          select: {
            recommendation: { select: { studentId: true } },
          },
        })
      : Promise.resolve([]),
    studentIds.length
      ? prisma.studentLearningConversation.findMany({
          where: {
            courseId,
            studentId: { in: studentIds },
            updatedAt: { gte: recentActivitySince },
            deletedAt: null,
          },
          select: { studentId: true },
        })
      : Promise.resolve([]),
  ]);

  const latestOutcomeRunByClassroom = new Map<
    string,
    (typeof outcomeRuns)[number]
  >();
  for (const run of outcomeRuns) {
    if (!latestOutcomeRunByClassroom.has(run.classroomId)) {
      latestOutcomeRunByClassroom.set(run.classroomId, run);
    }
  }
  const courseOutcomeCodes = new Set(
    [...latestOutcomeRunByClassroom.values()].flatMap((run) =>
      run.results.map((result) => result.outcomeCode),
    ),
  );
  const attainedOutcomeStudentIds = new Set<string>();
  const courseOutcomeClassroomIds = new Set<string>();
  for (const run of latestOutcomeRunByClassroom.values()) {
    const classroomStudentIds = activeStudentIdsByClassroom.get(
      run.classroomId,
    );
    if (!classroomStudentIds?.size) continue;
    const attainedStudentIdsByOutcome = new Map(
      run.results.map((result) => [
        result.outcomeCode,
        new Set(
          result.students
            .filter(
              (student) =>
                student.attained === true &&
                classroomStudentIds.has(student.studentId),
            )
            .map((student) => student.studentId),
        ),
      ]),
    );
    for (const result of run.results) {
      if (result.students.some((student) => student.attained !== null)) {
        courseOutcomeClassroomIds.add(run.classroomId);
      }
    }
    if (courseOutcomeCodes.size === 0) continue;
    for (const studentId of classroomStudentIds) {
      if (
        [...courseOutcomeCodes].every((outcomeCode) =>
          attainedStudentIdsByOutcome.get(outcomeCode)?.has(studentId),
        )
      ) {
        attainedOutcomeStudentIds.add(studentId);
      }
    }
  }
  const courseOutcomeAttainedStudentCount = attainedOutcomeStudentIds.size;
  const courseOutcomeAttainmentRate =
    courseOutcomeClassroomIds.size > 0 && studentIds.length > 0
      ? Number(
          (
            (courseOutcomeAttainedStudentCount / studentIds.length) *
            100
          ).toFixed(1),
        )
      : null;
  const recentActiveStudentIds = new Set(
    assignmentSubmissions
      .filter(
        (submission) =>
          submission.submittedAt !== null &&
          submission.submittedAt >= recentActivitySince,
      )
      .map((submission) => submission.studentId),
  );
  for (const record of recentAttendanceRecords) {
    recentActiveStudentIds.add(record.studentId);
  }
  for (const answer of recentPracticeAnswers) {
    recentActiveStudentIds.add(answer.recommendation.studentId);
  }
  for (const conversation of recentCourseConversations) {
    recentActiveStudentIds.add(conversation.studentId);
  }
  const recentActiveStudentCount = recentActiveStudentIds.size;
  const recentActiveStudentRate = studentIds.length
    ? Number(((recentActiveStudentCount / studentIds.length) * 100).toFixed(1))
    : null;
  const normalizedAssignmentSubmissions = assignmentSubmissions.map(
    (submission) => ({
      ...submission,
      score: submission.score?.toNumber() ?? null,
      maxScore: submission.maxScore?.toNumber() ?? null,
    }),
  );
  const assignmentStatistics = calculateCourseAssignmentStatistics({
    assignments: assignments.map(({ id, classroomId, status }) => ({
      id,
      classroomId,
      status,
    })),
    activeStudentIdsByClassroom,
    submissions: normalizedAssignmentSubmissions,
  });
  const assignmentScoreTrend = calculateCourseAssignmentScoreTrend({
    assignments: assignments.map((assignment) => ({
      id: assignment.id,
      classroomId: assignment.classroomId,
      title: assignment.title,
      status: assignment.status,
      dueAt: assignment.dueAt,
      publishedAt: assignment.publishedAt,
      createdAt: assignment.createdAt,
    })),
    activeStudentIdsByClassroom,
    submissions: normalizedAssignmentSubmissions,
  });

  const latestSnapshotByStudent = new Map<
    string,
    (typeof profileSnapshots)[number]
  >();
  for (const snapshot of profileSnapshots) {
    if (!latestSnapshotByStudent.has(snapshot.studentId)) {
      latestSnapshotByStudent.set(snapshot.studentId, snapshot);
    }
  }
  const latestSnapshots = [...latestSnapshotByStudent.values()];
  const profileSummary = summarizeCourseProfiles(
    studentIds.length,
    latestSnapshots,
  );

  const currentGraph = course.currentPublishedKnowledgeGraphVersion;
  const currentPointIds =
    currentGraph?.nodes
      .filter(
        (node) => node.nodeType === KnowledgeGraphNodeType.KNOWLEDGE_POINT,
      )
      .map((node) => node.conceptId) ?? [];
  const conceptEntries =
    currentPointIds.length && latestSnapshots.length
      ? await prisma.learnerProfileConceptEntry.findMany({
          where: {
            snapshotId: { in: latestSnapshots.map((snapshot) => snapshot.id) },
            conceptId: { in: currentPointIds },
          },
          select: {
            conceptId: true,
            masteryScore: true,
            evidenceCount: true,
            evidenceState: true,
            snapshot: { select: { studentId: true } },
          },
        })
      : [];
  const masteryEntries = conceptEntries.map((entry) => ({
    studentId: entry.snapshot.studentId,
    conceptId: entry.conceptId,
    masteryScore: entry.masteryScore?.toNumber() ?? null,
    evidenceCount: entry.evidenceCount,
    evidenceState: entry.evidenceState,
  }));
  const chapterMastery = summarizeCourseChapterMastery(
    studentIds,
    currentGraph?.nodes ?? [],
    currentGraph?.edges ?? [],
    masteryEntries,
  );
  const attentionConcepts = summarizeCourseAttentionConcepts(
    studentIds,
    currentGraph?.nodes ?? [],
    masteryEntries,
  );

  const taughtConceptCount = teachingProgress?.concepts.length ?? 0;
  const totalConceptCount = currentPointIds.length;
  const pendingReviewCount = assignments.reduce(
    (sum, assignment) => sum + assignment._count.submissions,
    0,
  );
  const attendance = calculateAttendanceRate(
    attendanceRecords.map((record) => record.currentStatus),
  );
  const completedSurveys = surveys.filter(
    (survey) => survey.status === CourseSurveyStatus.CLOSED,
  );
  const activeSurveys = surveys.filter(
    (survey) => survey.status === CourseSurveyStatus.PUBLISHED,
  );
  const latestReport = reports[0] ?? null;
  const nextActions: Array<{
    key: string;
    title: string;
    detail: string;
    href: string;
  }> = [];
  if (!currentGraph) {
    nextActions.push({
      key: "publish-graph",
      title: "发布正式知识图谱",
      detail: "画像、教学进度和推荐都需要正式图谱作为版本基线。",
      href: `/teacher/courses/${courseId}/knowledge-graph`,
    });
  } else if (taughtConceptCount === 0) {
    nextActions.push({
      key: "teaching-progress",
      title: "设置已授教学进度",
      detail: `正式图谱已有 ${totalConceptCount} 个知识点，尚未划定学生当前可学范围。`,
      href: `/teacher/courses/${courseId}/teaching-progress`,
    });
  }
  if (pendingReviewCount > 0) {
    nextActions.push({
      key: "pending-review",
      title: `处理 ${pendingReviewCount} 份待批改提交`,
      detail: "完成批改后，成绩和课程画像才会形成新的正式证据。",
      href: "/teacher/assignments",
    });
  }
  if (studentIds.length > 0 && profileSummary.conclusiveCount === 0) {
    nextActions.push({
      key: "profile-evidence",
      title: "关注画像证据积累",
      detail:
        "当前没有学生达到稳定结论门槛，可先检查作业知识点绑定和评分证据。",
      href: `/teacher/courses/${courseId}/profiles`,
    });
  }
  if (surveys.length === 0) {
    nextActions.push({
      key: "course-survey",
      title: "准备结课教学质量问卷",
      detail: "问卷不计入成绩，可在课程结束前发布并汇总学生反馈。",
      href: `/teacher/courses/${courseId}/surveys`,
    });
  }
  if (
    !latestReport ||
    latestReport.status !== QualityReportStatus.SUCCEEDED ||
    latestReport.reviewStatus !== QualityReportReviewStatus.APPROVED
  ) {
    nextActions.push({
      key: "quality-report",
      title: "完成教学质量报告",
      detail: "在成绩、达成度和问卷数据稳定后生成并审核正式报告。",
      href: `/teacher/courses/${courseId}/quality-report`,
    });
  }

  return {
    course: {
      id: course.id,
      name: course.name,
      courseNo: course.courseNo,
      term: course.term,
    },
    assignmentStatistics,
    assignmentScoreTrend,
    classrooms: course.classrooms.map((classroom) => ({
      id: classroom.id,
      name: classroom.name,
      studentCount: classroom.memberships.length,
    })),
    overview: {
      classroomCount: course.classrooms.length,
      studentCount: studentIds.length,
      totalConceptCount,
      taughtConceptCount,
      teachingProgressRate: percentage(taughtConceptCount, totalConceptCount),
      graphVersion: currentGraph?.versionNumber ?? null,
      progressRevision: teachingProgress?.revisionNumber ?? null,
      publishedAssignmentCount: assignments.filter(
        (assignment) =>
          assignment.status === AssignmentStatus.PUBLISHED ||
          assignment.status === AssignmentStatus.CLOSED,
      ).length,
      pendingReviewCount,
      attendanceRate: attendance.rate === null ? null : Number(attendance.rate),
      closedAttendanceSessionCount: closedAttendanceSessions,
      courseOutcomeAttainmentRate,
      courseOutcomeAttainmentClassroomCount: courseOutcomeClassroomIds.size,
      courseOutcomeAttainedStudentCount,
      recentActiveStudentCount,
      recentActiveStudentRate,
      publishedGradebookCount: gradebooks.filter(
        (gradebook) => gradebook.currentPublicationId !== null,
      ).length,
      gradebookCount: gradebooks.length,
      activeSurveyCount: activeSurveys.length,
      completedSurveyCount: completedSurveys.length,
      surveyResponseCount: surveys.reduce(
        (sum, survey) => sum + survey._count.responses,
        0,
      ),
      reportCount: reports.length,
    },
    profiles: profileSummary,
    chapterMastery,
    attentionConcepts,
    recentSurveys: surveys.slice(0, 3).map((survey) => ({
      id: survey.id,
      title: survey.title,
      status: survey.status,
      mode: survey.mode,
      classroomName: survey.classroom.name,
      responseCount: survey._count.responses,
      dueAt: survey.dueAt,
    })),
    latestReport,
    nextActions: nextActions.slice(0, 5).map((action) => ({
      ...action,
      href: withClassroomQuery(action.href, classroomId),
    })),
  };
}

export type TeacherCourseAnalytics = Awaited<
  ReturnType<typeof getTeacherCourseAnalytics>
>;
