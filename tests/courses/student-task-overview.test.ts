import assert from "node:assert/strict";
import test from "node:test";
import type { StudentAssignmentListItem } from "@/services/assignments/types";
import { summarizeStudentTasks } from "@/services/dashboard/student-task-overview";

const now = new Date("2026-10-27T04:00:00Z");
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
function assignment(
  id: string,
  overrides: Partial<StudentAssignmentListItem> & { canWrite?: boolean } = {},
): StudentAssignmentListItem & { canWrite?: boolean } {
  return {
    id,
    title: `作业 ${id}`,
    description: "",
    classroomName: "二班",
    totalPoints: 100,
    questionCount: 1,
    publishedAt: later(-60),
    dueAt: later(60),
    allowResubmission: false,
    attemptCount: 0,
    inProgressSubmissionId: null,
    latestSubmissionId: null,
    ...overrides,
  };
}
const context = (id: string) => ({
  id,
  classroomId: `class-${id}`,
  classroom: { name: "二班", course: { id: "course-python", name: "Python" } },
});
const survey = (id: string, opensAt = later(-5)) => ({
  id,
  title: `问卷 ${id}`,
  status: "PUBLISHED" as const,
  opensAt,
  dueAt: later(40),
  submittedAt: null as Date | null,
  course: { id: "python", name: "Python" },
  classroom: { id: "two", name: "二班" },
});
const attendance = (id: string) => ({
  id,
  session: {
    title: "课堂签到",
    signInClosesAt: later(90),
    course: { id: "python", name: "Python" },
    classroom: { id: "two", name: "二班" },
  },
});
type Input = Parameters<typeof summarizeStudentTasks>[0];
const empty = (): Input => ({
  assignments: [],
  contexts: [],
  attendance: [],
  surveys: [],
});

test("签到优先，其他任务按截止时间和稳定 ID 排序，不受输入顺序影响", () => {
  const input: Input = {
    assignments: [
      assignment("b", { dueAt: later(10) }),
      assignment("a", { dueAt: later(10) }),
    ],
    contexts: [context("a"), context("b")],
    attendance: [attendance("sign")],
    surveys: [survey("one")],
  };
  const result = summarizeStudentTasks(input, now);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["attendance:sign", "assignment:a", "assignment:b", "survey:one"],
  );
  input.assignments.reverse();
  assert.deepEqual(summarizeStudentTasks(input, now), result);
});

test("已提交、已截止、历史班级、无操作权限、尚未发布及失去归属的作业不进入待办", () => {
  const assignments = [
    assignment("submitted", { latestSubmissionId: "submitted" }),
    assignment("expired", { dueAt: now }),
    assignment("history", { historyOnly: true }),
    assignment("readonly", { canWrite: false }),
    assignment("future", { publishedAt: later(1) }),
    assignment("no-context"),
    assignment("pending"),
  ];
  const result = summarizeStudentTasks(
    {
      ...empty(),
      assignments,
      contexts: assignments
        .filter((a) => a.id !== "no-context")
        .map((a) => context(a.id)),
    },
    now,
  );
  assert.deepEqual(
    result.items.map((item) => item.id),
    ["assignment:pending"],
  );
  assert.equal(result.total, 1);
});

test("继续作答直接进入草稿，作业、签到和问卷跳转均保留各自课程班级", () => {
  const result = summarizeStudentTasks(
    {
      assignments: [
        assignment("draft", { inProgressSubmissionId: "draft-id" }),
      ],
      contexts: [context("draft")],
      attendance: [attendance("s")],
      surveys: [survey("q")],
    },
    now,
  );
  const draft = result.items.find((item) => item.kind === "assignment");
  assert.ok(draft);
  assert.equal(draft.action, "继续作答");
  assert.match(draft.href, /\/student\/submissions\/draft-id\/answer\?/u);
  for (const item of result.items) {
    const url = new URL(item.href, "https://test.local");
    assert.ok(url.searchParams.get("courseId"));
    assert.ok(url.searchParams.get("classroomId"));
  }
});

test("待开放单列，已填写、已截止、草稿和已归档问卷不计待办", () => {
  const result = summarizeStudentTasks(
    {
      ...empty(),
      surveys: [
        survey("open"),
        survey("scheduled", later(10)),
        { ...survey("submitted"), submittedAt: later(-1) },
        { ...survey("expired"), dueAt: now },
        { ...survey("draft"), status: "DRAFT" },
        { ...survey("archived"), status: "ARCHIVED" },
      ],
    },
    now,
  );
  assert.equal(result.counts.survey, 1);
  assert.equal(result.total, 1);
  assert.deepEqual(
    result.scheduledSurveys.map((s) => s.id),
    ["scheduled"],
  );
  assert.equal(result.nextChangeAt?.getTime(), later(10).getTime());
});

test("问卷开放和截止时刻按同一统计时间切换", () => {
  const q = survey("q", now);
  const result = summarizeStudentTasks({ ...empty(), surveys: [q] }, now);
  assert.equal(result.counts.survey, 1);
  assert.equal(result.scheduledSurveys.length, 0);
  assert.equal(
    summarizeStudentTasks({ ...empty(), surveys: [q] }, q.dueAt).total,
    0,
  );
});

test("全部数量在首页截取前统计，空数据不产生任务或虚假成绩", () => {
  const assignments = Array.from({ length: 8 }, (_, i) => assignment(`a${i}`));
  const result = summarizeStudentTasks(
    {
      ...empty(),
      assignments,
      contexts: assignments.map((a) => context(a.id)),
    },
    now,
  );
  assert.equal(result.total, 8);
  assert.equal(result.counts.assignment, 8);
  assert.equal(result.items.slice(0, 5).length, 5);
  assert.deepEqual(summarizeStudentTasks(empty(), now), {
    items: [],
    total: 0,
    counts: { assignment: 0, attendance: 0, survey: 0 },
    scheduledSurveys: [],
    nextChangeAt: null,
  });
});

test("已结束签到剔除，截止时刻仍有效；无课程的旧班级保留可解释的入口", () => {
  const result = summarizeStudentTasks(
    {
      ...empty(),
      assignments: [assignment("old")],
      contexts: [
        {
          id: "old",
          classroomId: "old-class",
          classroom: { name: "旧班", course: null },
        },
      ],
      attendance: [
        {
          ...attendance("ended"),
          session: {
            ...attendance("ended").session,
            signInClosesAt: later(-1),
          },
        },
        {
          ...attendance("boundary"),
          session: { ...attendance("boundary").session, signInClosesAt: now },
        },
      ],
    },
    now,
  );
  assert.equal(result.counts.attendance, 1);
  const old = result.items.find((item) => item.kind === "assignment");
  assert.equal(old?.courseName, null);
  assert.match(old?.href ?? "", /classroomId=old-class/u);
});
