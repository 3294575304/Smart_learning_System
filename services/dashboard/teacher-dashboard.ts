import "server-only";
import { latestEffectiveSubmissions } from "@/services/assignments/latest-submissions";

import { summarizeAssignmentParticipation } from "@/services/dashboard/teacher-assignment-metrics";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { groupKnowledgeChapters } from "@/services/knowledge-graph/chapter-groups";
import {
  summarizeDashboardAssignmentTodo,
  summarizeDashboardMastery,
} from "@/services/dashboard/teacher-dashboard-metrics";
import {
  teacherDashboardQuerySchema,
  type TeacherDashboardQuery,
} from "@/services/dashboard/teacher-dashboard-schemas";

export interface TeacherDashboardTodo {
  key: string;
  title: string;
  detail: string;
  scope: string;
  classroomId: string | null;
  href: string;
  kind: "review" | "publish" | "recover";
}

export async function getTeacherDashboard(
  teacherId: string,
  input: TeacherDashboardQuery = {},
) {
  const query = teacherDashboardQuerySchema.parse(input);
  const courses = await prisma.course.findMany({
    where: { teacherId, status: { not: "ARCHIVED" } },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: { id: true, name: true, term: true },
  });
  const selectedCourse = query.courseId
    ? courses.find((course) => course.id === query.courseId)
    : courses[0];
  if (
    (!selectedCourse && query.courseId) ||
    (!selectedCourse && query.classroomId)
  )
    throw new ResourceNotFoundError("课程或班级不存在");
  if (!selectedCourse) return { courses, workspace: null };
  const courseId = selectedCourse.id;
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      name: true,
      term: true,
      courseNo: true,
      currentPublishedSyllabusStructureId: true,
      classrooms: {
        where: { teacherId, status: { in: ["ACTIVE", "COMPLETED"] } },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          memberships: {
            where: { status: "ACTIVE" },
            select: { studentId: true },
          },
        },
      },
      currentPublishedKnowledgeGraphVersion: {
        select: {
          versionNumber: true,
          sourceSyllabusStructureId: true,
          nodes: {
            orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
            select: {
              id: true,
              conceptId: true,
              name: true,
              code: true,
              nodeType: true,
            },
          },
          edges: {
            where: { relationType: "CONTAINS" },
            select: { fromNodeId: true, toNodeId: true },
          },
        },
      },
      syllabi: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          parseDrafts: {
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              id: true,
              status: true,
              reviewRevisions: {
                orderBy: { revisionNumber: "desc" },
                take: 1,
                select: { publishedStructure: { select: { id: true } } },
              },
            },
          },
        },
      },
      knowledgeGraphDrafts: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          id: true,
          status: true,
          sourceSyllabusStructureId: true,
          reviewRevisions: {
            orderBy: { revisionNumber: "desc" },
            take: 1,
            select: { publishedVersion: { select: { id: true } } },
          },
        },
      },
    },
  });
  if (!course) throw new ResourceNotFoundError("课程或班级不存在");
  const selectedClassroom = query.classroomId
    ? course.classrooms.find((item) => item.id === query.classroomId)
    : null;
  if (query.classroomId && !selectedClassroom)
    throw new ResourceNotFoundError("课程或班级不存在");
  const classrooms = selectedClassroom
    ? [selectedClassroom]
    : course.classrooms;
  const classroomIds = classrooms.map((item) => item.id);
  const studentIds = [
    ...new Set(
      classrooms.flatMap((item) =>
        item.memberships.map((member) => member.studentId),
      ),
    ),
  ];
  const graph = course.currentPublishedKnowledgeGraphVersion;
  const nodes = graph?.nodes ?? [];
  const conceptIds = nodes
    .filter((node) => node.nodeType === "KNOWLEDGE_POINT")
    .map((node) => node.conceptId);
  const [assignments, masteryStates, questionCount, reports, mapping] =
    await Promise.all([
      prisma.assignment.findMany({
        where: {
          teacherId,
          classroomId: { in: classroomIds },
          classroom: { teacherId, courseId },
          status: { not: "ARCHIVED" },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          title: true,
          status: true,
          dueAt: true,
          updatedAt: true,
          publishedAt: true,
          createdAt: true,
          classroom: { select: { id: true, name: true } },
          submissions: {
            where: {
              status: {
                in: ["SUBMITTED", "PENDING_REVIEW", "GRADED", "PUBLISHED"],
              },
            },
            select: {
              id: true,
              attemptNumber: true,
              submittedAt: true,
              status: true,
              studentId: true,
              score: true,
              maxScore: true,
              gradedAt: true,
              _count: {
                select: {
                  answers: {
                    where: { gradingStatus: "MANUAL_REVIEW_REQUIRED" },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.studentCourseConceptMasteryState.findMany({
        where: { courseId, studentId: { in: studentIds } },
        select: {
          studentId: true,
          revisions: {
            orderBy: { revisionNumber: "desc" },
            take: 1,
            select: {
              entries: {
                where: { conceptId: { in: conceptIds } },
                select: {
                  conceptId: true,
                  masteryScore: true,
                  evidenceCount: true,
                  lastEvidenceAt: true,
                },
              },
            },
          },
        },
      }),
      prisma.question.count({
        where: {
          deletedAt: null,
          isAssignmentOnly: false,
          status: "ACTIVE",
          AND: [
            { OR: [{ creatorId: teacherId }, { visibility: "PUBLIC" }] },
            {
              OR: [
                { categoryCourseId: courseId },
                { graphBindings: { some: { courseId } } },
              ],
            },
          ],
        },
      }),
      prisma.courseQualityReport.findMany({
        where: {
          courseId,
          course: { teacherId },
          ...(selectedClassroom ? { classroomId: selectedClassroom.id } : {}),
        },
        orderBy: { versionNumber: "desc" },
        distinct: ["classroomId"],
        select: {
          id: true,
          versionNumber: true,
          status: true,
          reviewStatus: true,
          classroom: { select: { id: true, name: true } },
        },
      }),
      prisma.aIQuestionMappingBatch.findFirst({
        where: { courseId, course: { teacherId } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { status: true },
      }),
    ]);
  const answerCounts = await prisma.studentAnswer.groupBy({
    by: ["submissionId", "isCorrect"],
    where: {
      submissionId: {
        in: assignments.flatMap((item) =>
          item.submissions.map((submission) => submission.id),
        ),
      },
      gradingStatus: { in: ["AUTO_GRADED", "GRADED"] },
      isCorrect: { not: null },
    },
    _count: { _all: true },
  });
  const countsBySubmission = new Map<
    string,
    { judgedCount: number; correctCount: number }
  >();
  for (const count of answerCounts) {
    const totals = countsBySubmission.get(count.submissionId) ?? {
      judgedCount: 0,
      correctCount: 0,
    };
    totals.judgedCount += count._count._all;
    if (count.isCorrect) totals.correctCount += count._count._all;
    countsBySubmission.set(count.submissionId, totals);
  }
  const membersByClass = new Map(
    classrooms.map((item) => [
      item.id,
      item.memberships.map((member) => member.studentId),
    ]),
  );
  const assignmentProgress = assignments
    .filter((item) => item.status === "PUBLISHED" || item.status === "CLOSED")
    .map((item) => ({
      id: item.id,
      title: item.title,
      classroomId: item.classroom.id,
      classroomName: item.classroom.name,
      publishedAt: (item.publishedAt ?? item.createdAt).toISOString(),
      ...summarizeAssignmentParticipation(
        membersByClass.get(item.classroom.id) ?? [],
        item.submissions.map((submission) => ({
          ...submission,
          ...(countsBySubmission.get(submission.id) ?? {
            judgedCount: 0,
            correctCount: 0,
          }),
        })),
      ),
    }))
    .sort(
      (left, right) =>
        left.publishedAt.localeCompare(right.publishedAt) ||
        left.id.localeCompare(right.id),
    );
  const entries = masteryStates.flatMap((state) =>
    (state.revisions[0]?.entries ?? []).map((entry) => ({
      studentId: state.studentId,
      conceptId: entry.conceptId,
      score: entry.masteryScore.toNumber(),
      evidenceCount: entry.evidenceCount,
      lastEvidenceAt: entry.lastEvidenceAt,
    })),
  );
  const chapters = groupKnowledgeChapters(nodes, graph?.edges ?? []);
  const todo: TeacherDashboardTodo[] = [];
  let pendingReviewCount = 0;
  let publishableCount = 0;
  for (const assignment of assignments) {
    if (assignment.status !== "PUBLISHED" && assignment.status !== "CLOSED")
      continue;
    const state = summarizeDashboardAssignmentTodo(
      latestEffectiveSubmissions(
        assignment.submissions.filter((item) =>
          (membersByClass.get(assignment.classroom.id) ?? []).includes(
            item.studentId,
          ),
        ),
      ).map((submission) => ({
        ...submission,
        manualAnswerCount: submission._count.answers,
      })),
    );
    pendingReviewCount += state.pendingReviewCount;
    publishableCount += state.publishableCount;
    if (state.pendingReviewCount > 0)
      todo.push({
        key: `grade:${assignment.id}`,
        title: assignment.title,
        detail: `${state.pendingReviewCount} 份提交待人工批改`,
        scope: assignment.classroom.name,
        classroomId: assignment.classroom.id,
        href: `/teacher/assignments/${assignment.id}/submissions?status=PENDING_REVIEW`,
        kind: "review",
      });
    else if (state.publishableCount > 0)
      todo.push({
        key: `publish:${assignment.id}`,
        title: assignment.title,
        detail: `${state.publishableCount} 份成绩待向学生公布`,
        scope: assignment.classroom.name,
        classroomId: assignment.classroom.id,
        href: `/teacher/assignments/${assignment.id}/results`,
        kind: "publish",
      });
  }
  const courseBase = `/teacher/courses/${courseId}`;
  const syllabus = course.syllabi[0]?.parseDrafts[0];
  if (
    syllabus?.status === "FAILED" ||
    (syllabus?.status === "SUCCEEDED" &&
      !syllabus.reviewRevisions[0]?.publishedStructure)
  )
    todo.push({
      key: `syllabus:${syllabus.id}`,
      title: "教学大纲",
      detail:
        syllabus.status === "FAILED"
          ? "解析失败，请检查文件并重试"
          : "解析已完成，等待审核发布",
      scope: "课程共用",
      classroomId: null,
      href: `${courseBase}/syllabus`,
      kind: syllabus.status === "FAILED" ? "recover" : "review",
    });
  const draft = course.knowledgeGraphDrafts[0];
  if (
    draft &&
    draft.sourceSyllabusStructureId ===
      course.currentPublishedSyllabusStructureId &&
    (draft.status === "FAILED" ||
      (draft.status === "SUCCEEDED" &&
        !draft.reviewRevisions[0]?.publishedVersion))
  )
    todo.push({
      key: `graph:${draft.id}`,
      title: "知识图谱",
      detail:
        draft.status === "FAILED"
          ? "生成失败，请检查并重试"
          : "草稿已生成，等待审核发布",
      scope: "课程共用",
      classroomId: null,
      href: `${courseBase}/knowledge-graph`,
      kind: draft.status === "FAILED" ? "recover" : "review",
    });
  if (mapping?.status === "FAILED" || mapping?.status === "READY")
    todo.push({
      key: "mapping",
      title: "题目知识点关联",
      detail:
        mapping.status === "FAILED"
          ? "候选生成失败，请检查并重试"
          : "候选已生成，等待教师确认关联",
      scope: "课程共用",
      classroomId: null,
      href: `${courseBase}/question-mapping`,
      kind: mapping.status === "FAILED" ? "recover" : "review",
    });
  for (const report of reports) {
    if (
      report.status === "FAILED" ||
      (report.status === "SUCCEEDED" &&
        report.reviewStatus === "PENDING_REVIEW")
    )
      todo.push({
        key: `report:${report.id}`,
        title: `教学质量报告 V${report.versionNumber}`,
        detail:
          report.status === "FAILED"
            ? "报告生成失败，请检查并重试"
            : "审核稿已生成，等待教师确认",
        scope: report.classroom?.name ?? "课程共用",
        classroomId: report.classroom?.id ?? null,
        href: `${courseBase}/quality-report`,
        kind: report.status === "FAILED" ? "recover" : "review",
      });
  }
  // Keep four recent records per class, in global updated order, without serializing the full history.
  const recentCounts = new Map<string, number>();
  const recentAssignments = assignments.filter((item) => {
    const count = recentCounts.get(item.classroom.id) ?? 0;
    recentCounts.set(item.classroom.id, count + 1);
    return count < 4;
  });
  return {
    courses,
    workspace: {
      course: {
        id: course.id,
        name: course.name,
        term: course.term,
        courseNo: course.courseNo,
      },
      classrooms: course.classrooms.map((item) => ({
        id: item.id,
        name: item.name,
      })),
      classroomMetrics: classrooms.map((classroom) => {
        const published = assignments.filter(
          (item) =>
            item.classroom.id === classroom.id &&
            (item.status === "PUBLISHED" || item.status === "CLOSED"),
        );
        const states = published.map((item) =>
          summarizeDashboardAssignmentTodo(
            latestEffectiveSubmissions(
              item.submissions.filter((submission) =>
                (membersByClass.get(item.classroom.id) ?? []).includes(
                  submission.studentId,
                ),
              ),
            ).map((submission) => ({
              ...submission,
              manualAnswerCount: submission._count.answers,
            })),
          ),
        );
        return {
          classroomId: classroom.id,
          studentCount: classroom.memberships.length,
          publishedAssignmentCount: published.length,
          pendingReviewCount: states.reduce(
            (sum, item) => sum + item.pendingReviewCount,
            0,
          ),
          publishableCount: states.reduce(
            (sum, item) => sum + item.publishableCount,
            0,
          ),
        };
      }),
      selectedClassroomId: selectedClassroom?.id ?? null,
      scopeName: selectedClassroom?.name ?? "全部班级",
      todo,
      assignmentProgress,
      metrics: {
        classroomCount: classrooms.length,
        studentCount: studentIds.length,
        questionCount,
        conceptCount: conceptIds.length,
        publishedAssignmentCount: assignments.filter(
          (item) => item.status === "PUBLISHED" || item.status === "CLOSED",
        ).length,
        pendingReviewCount,
        publishableCount,
      },
      graphVersion: graph?.versionNumber ?? null,
      graphOutdated: Boolean(
        graph &&
        graph.sourceSyllabusStructureId !==
          course.currentPublishedSyllabusStructureId,
      ),
      chapters: chapters.map((chapter) => ({
        id: chapter.id,
        name: chapter.name,
        conceptCount: chapter.nodes.length,
      })),
      mastery: classrooms.map((classroom) => {
        const members = classroom.memberships.map((member) => member.studentId);
        return {
          classroomId: classroom.id,
          classroomName: classroom.name,
          studentCount: members.length,
          chapters: chapters.map((chapter) => ({
            chapterId: chapter.id,
            ...summarizeDashboardMastery(
              members,
              chapter.nodes.map((node) => node.conceptId),
              entries,
            ),
          })),
          ...summarizeDashboardMastery(members, conceptIds, entries),
        };
      }),
      recentAssignments: recentAssignments.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        classroomName: item.classroom.name,
        classroomId: item.classroom.id,
        dueAt: item.dueAt,
        submissionCount: new Set(
          item.submissions.map((submission) => submission.studentId),
        ).size,
      })),
    },
  };
}

export type TeacherDashboardData = Awaited<
  ReturnType<typeof getTeacherDashboard>
>;
