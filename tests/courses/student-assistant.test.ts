import assert from "node:assert/strict";
import test from "node:test";
import type { StudentTaskItem } from "@/services/dashboard/student-task-overview";
import {
  findStudyDestination,
  studyAssistantInput,
  todayStudyTasks,
} from "@/services/student-assistant/rules";

test("study assistant links come from the student directory and reject client scope", () => {
  assert.deepEqual(findStudyDestination("我的考试").links, [
    { label: "我的考试", href: "/student/exams" },
  ]);
  assert.ok(
    findStudyDestination("帮我看看").links.every(({ href }) =>
      href.startsWith("/student/"),
    ),
  );
  assert.equal(
    studyAssistantInput.safeParse({
      action: "today",
      classroomId: "another-class",
    }).success,
    false,
  );
  assert.equal(
    studyAssistantInput.safeParse({ action: "find", text: " " }).success,
    false,
  );
});

test("today tasks use Beijing midnight, preserve task order and count before limiting", () => {
  const now = new Date("2026-11-13T16:00:00.000Z");
  const make = (id: number, deadline: string): StudentTaskItem => ({
    id: String(id),
    title: "作业",
    kind: "assignment",
    status: "TODO",
    classroomName: id % 2 ? "Python 一班" : "Python 二班",
    courseName: "Python 程序设计",
    dueAt: new Date(deadline),
    action: "继续作答",
    state: "进行中",
    href: `/student/assignments/${id}?classroomId=room${id % 2}`,
  });
  const pendingItems = [
    make(0, "2026-11-13T15:59:59.999Z"),
    ...Array.from({ length: 6 }, (_, i) =>
      make(i + 1, "2026-11-13T16:00:00.000Z"),
    ),
    make(7, "2026-11-14T15:59:59.999Z"),
    make(8, "2026-11-14T16:00:00.000Z"),
  ];
  const reply = todayStudyTasks({ pendingItems }, now);
  assert.equal(reply.total, 7);
  assert.deepEqual(
    reply.items.map(({ id }) => id),
    ["1", "2", "3", "4", "5"],
  );
  assert.equal(
    reply.items[1]?.href,
    "/student/assignments/2?classroomId=room0",
  );
});
