import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCourseAssignmentStatistics,
  type CourseAssignmentStatisticsInput,
} from "@/services/course-analytics/assignment-statistics";

function submission(
  values: Partial<CourseAssignmentStatisticsInput["submissions"][number]> &
    Pick<
      CourseAssignmentStatisticsInput["submissions"][number],
      "id" | "assignmentId" | "studentId" | "attemptNumber" | "status"
    >,
): CourseAssignmentStatisticsInput["submissions"][number] {
  return {
    submittedAt: null,
    score: null,
    maxScore: null,
    ...values,
  };
}

test("完成率只计最新有效提交，得分率只按最终评分的总分与总满分计算", () => {
  const result = calculateCourseAssignmentStatistics({
    assignments: [
      {
        id: "assignment-1",
        classroomId: "room-1",
        status: "PUBLISHED",
        publishedAt: new Date("2026-01-01"),
        dueAt: null,
      },
    ],
    activeStudentIdsByClassroom: new Map([
      ["room-1", new Set(["s1", "s2", "s3", "s4", "s5"])],
    ]),
    submissions: [
      submission({
        id: "s1-graded-old",
        assignmentId: "assignment-1",
        studentId: "s1",
        attemptNumber: 1,
        status: "GRADED",
        score: 90,
        maxScore: 100,
      }),
      submission({
        id: "s1-pending-latest",
        assignmentId: "assignment-1",
        studentId: "s1",
        attemptNumber: 2,
        status: "PENDING_REVIEW",
      }),
      submission({
        id: "s1-in-progress",
        assignmentId: "assignment-1",
        studentId: "s1",
        attemptNumber: 3,
        status: "IN_PROGRESS",
      }),
      submission({
        id: "s2-submitted-old",
        assignmentId: "assignment-1",
        studentId: "s2",
        attemptNumber: 1,
        status: "SUBMITTED",
        score: 50,
        maxScore: 50,
      }),
      submission({
        id: "s2-graded-latest",
        assignmentId: "assignment-1",
        studentId: "s2",
        attemptNumber: 2,
        status: "GRADED",
        score: 25,
        maxScore: 50,
      }),
      submission({
        id: "s3-published",
        assignmentId: "assignment-1",
        studentId: "s3",
        attemptNumber: 1,
        status: "PUBLISHED",
        score: 90,
        maxScore: 100,
      }),
      submission({
        id: "s4-withdrawn",
        assignmentId: "assignment-1",
        studentId: "s4",
        attemptNumber: 1,
        status: "WITHDRAWN",
      }),
      submission({
        id: "s5-submitted",
        assignmentId: "assignment-1",
        studentId: "s5",
        attemptNumber: 1,
        status: "SUBMITTED",
        score: 0,
        maxScore: 100,
      }),
    ],
  });

  assert.equal(result.eligibleSubmissionCount, 5);
  assert.equal(result.completedSubmissionCount, 4);
  assert.equal(result.completionRate, 80);
  assert.equal(result.finalizedSubmissionCount, 2);
  assert.equal(result.scoreRate, 76.7);
  assert.equal(result.scoredStudentCount, 2);
  assert.equal(result.unscoredStudentCount, 3);
  assert.deepEqual(
    result.scoreDistribution.map(({ key, count }) => [key, count]),
    [
      ["0-59", 1],
      ["60-69", 0],
      ["70-79", 0],
      ["80-89", 0],
      ["90-100", 1],
      ["ungraded", 3],
    ],
  );
});

test("按学生跨作业平均得分率归档，覆盖五档边界且比例合计为 100%", () => {
  const studentIds = [
    "s0",
    "s5999",
    "s60",
    "s6999",
    "s70",
    "s7999",
    "s80",
    "s8999",
    "s90",
    "s100",
    "s-ungraded",
  ];
  const percentages = new Map([
    ["s0", [0, 0]],
    ["s5999", [59.99, 59.99]],
    ["s60", [60, 60]],
    ["s6999", [69.99, 69.99]],
    ["s70", [60, 80]],
    ["s7999", [79.99, 79.99]],
    ["s80", [80, 80]],
    ["s8999", [89.99, 89.99]],
    ["s90", [90, 90]],
    ["s100", [100, 100]],
  ]);
  const submissions = ["assignment-1", "assignment-2"].flatMap(
    (assignmentId, assignmentIndex) =>
      studentIds.flatMap((studentId) => {
        const percentage = percentages.get(studentId)?.[assignmentIndex];
        return percentage === undefined
          ? []
          : [
              submission({
                id: `${assignmentId}-${studentId}`,
                assignmentId,
                studentId,
                attemptNumber: 1,
                status: "GRADED",
                score: percentage,
                maxScore: 100,
              }),
            ];
      }),
  );

  const result = calculateCourseAssignmentStatistics({
    assignments: [
      {
        id: "assignment-1",
        classroomId: "room-1",
        status: "PUBLISHED",
        publishedAt: new Date("2026-01-01"),
        dueAt: null,
      },
      {
        id: "assignment-2",
        classroomId: "room-1",
        status: "CLOSED",
        publishedAt: new Date("2026-01-01"),
        dueAt: null,
      },
    ],
    activeStudentIdsByClassroom: new Map([["room-1", new Set(studentIds)]]),
    submissions,
  });

  assert.equal(
    result.scoreDistribution.find((band) => band.key === "70-79")?.count,
    2,
  );
  assert.deepEqual(
    result.scoreDistribution.map(({ key, count }) => [key, count]),
    [
      ["0-59", 2],
      ["60-69", 2],
      ["70-79", 2],
      ["80-89", 2],
      ["90-100", 2],
      ["ungraded", 1],
    ],
  );
  assert.equal(
    result.scoreDistribution.reduce((sum, band) => sum + (band.ratio ?? 0), 0),
    100,
  );
});

test("选定班级按该班有效成员统计，未评分不当作零分", () => {
  const result = calculateCourseAssignmentStatistics({
    assignments: [
      {
        id: "room-1-assignment",
        classroomId: "room-1",
        status: "PUBLISHED",
        publishedAt: new Date("2026-01-01"),
        dueAt: null,
      },
    ],
    activeStudentIdsByClassroom: new Map([["room-1", new Set(["s1", "s2"])]]),
    submissions: [
      submission({
        id: "foreign-student-submission",
        assignmentId: "room-1-assignment",
        studentId: "student-from-another-class",
        attemptNumber: 1,
        status: "GRADED",
        score: 0,
        maxScore: 100,
      }),
      submission({
        id: "pending-submission",
        assignmentId: "room-1-assignment",
        studentId: "s1",
        attemptNumber: 1,
        status: "PENDING_REVIEW",
      }),
    ],
  });

  assert.equal(result.eligibleSubmissionCount, 2);
  assert.equal(result.completedSubmissionCount, 1);
  assert.equal(result.scoreRate, null);
  assert.equal(result.scoreDistribution.at(-1)?.count, 2);
  assert.equal(result.scoreDistribution.at(-1)?.ratio, 100);
});

test("无作业、无有效学生和无最终成绩均返回明确可展示的空统计", () => {
  const noAssignments = calculateCourseAssignmentStatistics({
    assignments: [
      {
        id: "draft",
        classroomId: "room-1",
        status: "DRAFT",
        publishedAt: new Date("2026-01-01"),
        dueAt: null,
      },
    ],
    activeStudentIdsByClassroom: new Map([["room-1", new Set(["s1", "s2"])]]),
    submissions: [],
  });
  assert.equal(noAssignments.assignmentCount, 0);
  assert.equal(noAssignments.studentCount, 2);
  assert.equal(noAssignments.completionRate, null);
  assert.equal(noAssignments.scoreDistribution.at(-1)?.ratio, 100);

  const noStudents = calculateCourseAssignmentStatistics({
    assignments: [
      {
        id: "assignment",
        classroomId: "room-1",
        status: "PUBLISHED",
        publishedAt: new Date("2026-01-01"),
        dueAt: null,
      },
    ],
    activeStudentIdsByClassroom: new Map([["room-1", new Set<string>()]]),
    submissions: [],
  });
  assert.equal(noStudents.studentCount, 0);
  assert.equal(noStudents.completionRate, null);
  assert.ok(noStudents.scoreDistribution.every((band) => band.ratio === null));

  const noFinalScores = calculateCourseAssignmentStatistics({
    assignments: [
      {
        id: "assignment",
        classroomId: "room-1",
        status: "PUBLISHED",
        publishedAt: new Date("2026-01-01"),
        dueAt: null,
      },
    ],
    activeStudentIdsByClassroom: new Map([["room-1", new Set(["s1"])]]),
    submissions: [
      submission({
        id: "pending",
        assignmentId: "assignment",
        studentId: "s1",
        attemptNumber: 1,
        status: "PENDING_REVIEW",
      }),
    ],
  });
  assert.equal(noFinalScores.scoreRate, null);
  assert.equal(noFinalScores.scoreDistribution.at(-1)?.ratio, 100);
});

test("统计排除预约和未发布归档，补入成员承担旧作业且历史成员单列", () => {
  const now = new Date("2026-10-24T08:00:00Z");
  const base = {
    classroomId: "room",
    publishedAt: new Date("2026-10-01"),
    dueAt: now,
  };
  const result = calculateCourseAssignmentStatistics(
    {
      assignments: [
        { ...base, id: "past", status: "ARCHIVED" },
        {
          ...base,
          id: "future",
          status: "PUBLISHED",
          publishedAt: new Date(now.getTime() + 1),
        },
        {
          ...base,
          id: "never-published",
          status: "ARCHIVED",
          publishedAt: null,
        },
        { ...base, id: "draft", status: "DRAFT" },
      ],
      activeStudentIdsByClassroom: new Map([
        ["room", new Set(["late-joiner"])],
      ]),
      submissions: [
        submission({
          id: "historical",
          assignmentId: "past",
          studentId: "removed",
          attemptNumber: 1,
          status: "GRADED",
          score: 100,
          maxScore: 100,
        }),
      ],
    },
    now,
  );
  assert.equal(result.assignmentCount, 1);
  assert.equal(result.eligibleSubmissionCount, 1);
  assert.equal(result.completedSubmissionCount, 0);
  assert.equal(result.overdueCount, 1);
  assert.equal(result.historicalSubmittedCount, 1);
  assert.equal(result.scoreRate, null);
});
