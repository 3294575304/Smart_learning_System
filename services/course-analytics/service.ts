import "server-only";

import {
  AssignmentStatus,
  AttendanceSessionStatus,
  CourseSurveyStatus,
  KnowledgeGraphNodeType,
  MembershipStatus,
  QualityReportReviewStatus,
  QualityReportStatus,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { calculateAttendanceRate } from "@/services/attendance/calculation";
import { ResourceNotFoundError } from "@/services/auth/policy";
import {
  summarizeCourseProfiles,
  summarizeWeakCourseConcepts,
} from "@/services/course-analytics/metrics";

function percentage(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : null;
}

export async function getTeacherCourseAnalytics(
  teacherId: string,
  courseId: string,
) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId },
    select: {
      id: true,
      name: true,
      courseNo: true,
      term: true,
      classrooms: {
        where: { status: "ACTIVE" },
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
            where: { nodeType: KnowledgeGraphNodeType.KNOWLEDGE_POINT },
            orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
            select: { conceptId: true, code: true, name: true },
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
      where: { teacherId, classroom: { courseId } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        title: true,
        status: true,
        dueAt: true,
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
          status: AttendanceSessionStatus.CLOSED,
        },
      },
      select: { currentStatus: true },
    }),
    prisma.attendanceSession.count({
      where: {
        courseId,
        teacherId,
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
      where: { courseId, teacherId },
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
      where: { courseId, course: { teacherId } },
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
      where: { courseId, course: { teacherId } },
      select: { id: true, currentPublicationId: true },
    }),
  ]);

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
  const conceptEntries =
    currentGraph && latestSnapshots.length
      ? await prisma.learnerProfileConceptEntry.findMany({
          where: {
            snapshotId: { in: latestSnapshots.map((snapshot) => snapshot.id) },
            masteryScore: { not: null },
          },
          select: {
            conceptId: true,
            masteryScore: true,
            concept: {
              select: {
                stableKey: true,
                nodes: {
                  where: { graphVersionId: currentGraph.id },
                  take: 1,
                  select: { code: true, name: true },
                },
              },
            },
          },
        })
      : [];
  const weakConcepts = summarizeWeakCourseConcepts(
    conceptEntries.flatMap((entry) => {
      const node = entry.concept.nodes[0];
      return entry.masteryScore !== null && node
        ? [
            {
              conceptId: entry.conceptId,
              code: node.code,
              name: node.name,
              masteryScore: entry.masteryScore.toNumber(),
            },
          ]
        : [];
    }),
  );

  const taughtConceptCount =
    course.currentTeachingProgressRevision?.concepts.length ?? 0;
  const totalConceptCount = currentGraph?.nodes.length ?? 0;
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
      progressRevision:
        course.currentTeachingProgressRevision?.revisionNumber ?? null,
      publishedAssignmentCount: assignments.filter(
        (assignment) =>
          assignment.status === AssignmentStatus.PUBLISHED ||
          assignment.status === AssignmentStatus.CLOSED,
      ).length,
      pendingReviewCount,
      attendanceRate: attendance.rate === null ? null : Number(attendance.rate),
      closedAttendanceSessionCount: closedAttendanceSessions,
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
    weakConcepts,
    recentAssignments: assignments.slice(0, 5).map((assignment) => ({
      id: assignment.id,
      title: assignment.title,
      status: assignment.status,
      classroomName: assignment.classroom.name,
      dueAt: assignment.dueAt,
      pendingReviewCount: assignment._count.submissions,
    })),
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
    nextActions: nextActions.slice(0, 5),
  };
}

export type TeacherCourseAnalytics = Awaited<
  ReturnType<typeof getTeacherCourseAnalytics>
>;
