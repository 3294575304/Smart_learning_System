"use client";

import { useState } from "react";

type Course = {
  courseId: string;
  name: string;
  term: string;
  syllabusStructureId: string;
  versionNumber: number;
  objectives: Array<{ code: string; title: string }>;
  objectiveCode: string | null;
};

export function QuestionCourseObjectivePanel({
  questionId,
  courses,
}: {
  questionId: string;
  courses: Course[];
}) {
  const [items, setItems] = useState(courses);
  const [selected, setSelected] = useState(courses[0]?.courseId ?? "");
  const [value, setValue] = useState(courses[0]?.objectiveCode ?? "");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  if (!courses.length) return null;
  const course = items.find(({ courseId }) => courseId === selected);
  async function save() {
    if (!course || !value || busy) return;
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch(
        `/api/teacher/questions/${encodeURIComponent(questionId)}/course-objective`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            courseId: course.courseId,
            syllabusStructureId: course.syllabusStructureId,
            objectiveCode: value,
            expectedObjectiveCode: course.objectiveCode,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error ?? "保存失败");
      setItems((current) =>
        current.map((item) =>
          item.courseId === course.courseId
            ? { ...item, objectiveCode: value }
            : item,
        ),
      );
      setFeedback("课程目标已保存");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">课程主目标</h2>
      <p className="text-sm text-gray-600">
        共享题目在每门课程可关联不同的正式大纲目标；更换大纲版本后需要重新分类。
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          课程
          <select
            className="mt-1 block rounded border p-2"
            value={selected}
            onChange={(event) => {
              const next = items.find(
                (item) => item.courseId === event.target.value,
              );
              setSelected(event.target.value);
              setValue(next?.objectiveCode ?? "");
              setFeedback("");
            }}
          >
            {items.map((item) => (
              <option key={item.courseId} value={item.courseId}>
                {item.name} · {item.term} · 大纲 v{item.versionNumber}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          主课程目标
          <select
            className="mt-1 block rounded border p-2"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          >
            <option value="">待分类</option>
            {course?.objectives.map((objective) => (
              <option key={objective.code} value={objective.code}>
                {objective.code} · {objective.title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="self-end rounded bg-sky-700 px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy || !value || value === course?.objectiveCode}
          onClick={() => void save()}
          type="button"
        >
          {busy ? "保存中…" : "保存目标"}
        </button>
      </div>
      {feedback ? (
        <p aria-live="polite" className="text-sm">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
