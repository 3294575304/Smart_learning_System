"use client";

import { QuestionType } from "@prisma/client";
import { useState } from "react";

interface CourseOption {
  courseId: string;
  courseName: string;
  classroomId: string;
  classroomName: string;
  graphVersionNumber: number | null;
  progressRevisionNumber: number | null;
  concepts: Array<{ id: string; code: string; name: string }>;
}

export function CoursePracticeCenter({ courses }: { courses: CourseOption[] }) {
  const [selectedCourseId, setSelectedCourseId] = useState(
    courses[0]?.courseId ?? "",
  );
  const course =
    courses.find((item) => item.courseId === selectedCourseId) ?? courses[0];
  const [conceptIds, setConceptIds] = useState<string[]>([]);
  const [questionType, setQuestionType] = useState<QuestionType | "">("");
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState(3);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function generate() {
    if (!course || pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/student/courses/${encodeURIComponent(course.courseId)}/recommendations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            classroomId: course.classroomId,
            conceptIds,
            questionTypes: questionType ? [questionType] : [],
            count,
            difficulty,
          }),
        },
      );
      const body: unknown = await response.json();
      if (
        !response.ok ||
        !body ||
        typeof body !== "object" ||
        !("success" in body) ||
        body.success !== true
      ) {
        const message =
          body &&
          typeof body === "object" &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "生成失败，请调整条件后重试";
        setFeedback(message);
        return;
      }
      window.location.reload();
    } catch {
      setFeedback("网络连接异常，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  if (!course)
    return (
      <p className="rounded-xl border bg-white p-5 text-sm text-gray-600">
        当前没有已关联课程的有效班级。
      </p>
    );
  return (
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <div>
        <h2 className="font-semibold">课程图谱自主练习</h2>
        <p className="mt-1 text-sm text-gray-500">
          条件会先显示并由你确认，服务端仍会执行课程范围、教学进度、题目审核和近期重复过滤。
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <label className="text-sm">
          课程
          <select
            className="mt-1 w-full rounded-md border p-2"
            value={course.courseId}
            onChange={(e) => {
              setSelectedCourseId(e.target.value);
              setConceptIds([]);
            }}
          >
            {courses.map((item) => (
              <option
                key={`${item.courseId}:${item.classroomId}`}
                value={item.courseId}
              >
                {item.courseName} · {item.classroomName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          题型
          <select
            className="mt-1 w-full rounded-md border p-2"
            value={questionType}
            onChange={(e) =>
              setQuestionType(e.target.value as QuestionType | "")
            }
          >
            <option value="">全部可用题型</option>
            <option value={QuestionType.SINGLE_CHOICE}>单选题</option>
            <option value={QuestionType.MULTIPLE_CHOICE}>多选题</option>
            <option value={QuestionType.TRUE_FALSE}>判断题</option>
            <option value={QuestionType.FILL_BLANK}>填空题</option>
            <option value={QuestionType.PYTHON_PROGRAMMING}>
              Python 编程题
            </option>
          </select>
        </label>
        <label className="text-sm">
          题量
          <input
            className="mt-1 w-full rounded-md border p-2"
            min={1}
            max={20}
            type="number"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
        <label className="text-sm">
          难度
          <input
            className="mt-1 w-full"
            min={1}
            max={5}
            type="range"
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
          />{" "}
          <span>{difficulty}</span>
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">
          已授知识点（不选表示全部）
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {course.concepts.map((concept) => (
            <label
              className="rounded-full border px-3 py-2 text-xs"
              key={concept.id}
            >
              <input
                className="mr-2"
                type="checkbox"
                checked={conceptIds.includes(concept.id)}
                onChange={(e) =>
                  setConceptIds(
                    e.target.checked
                      ? [...conceptIds, concept.id]
                      : conceptIds.filter((id) => id !== concept.id),
                  )
                }
              />
              {concept.code} {concept.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="rounded-md bg-slate-50 p-3 text-sm">
        确认条件：{conceptIds.length || "全部已授"} 个知识点 ·{" "}
        {questionType || "全部题型"} · {count} 题 · 难度 {difficulty}。图谱版本{" "}
        {course.graphVersionNumber ?? "未发布"}，进度修订{" "}
        {course.progressRevisionNumber ?? "未配置"}。
      </div>
      {feedback ? (
        <p className="text-sm text-red-700" role="alert">
          {feedback}
        </p>
      ) : null}
      <button
        className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        disabled={pending || !course.concepts.length}
        onClick={() => void generate()}
        type="button"
      >
        {pending ? "正在生成…" : "确认并生成练习"}
      </button>
    </section>
  );
}
