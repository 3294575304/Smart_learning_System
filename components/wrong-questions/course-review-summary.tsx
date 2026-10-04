"use client";

import { useState } from "react";
import Link from "next/link";
import type { QuestionType } from "@prisma/client";
import type { summarizeWrongCourses } from "@/services/wrong-questions/service";

type Summary = Awaited<ReturnType<typeof summarizeWrongCourses>>;
type PracticeType = Extract<
  QuestionType,
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "TRUE_FALSE"
  | "FILL_BLANK"
  | "PYTHON_PROGRAMMING"
>;

const questionTypeOptions: Array<{ value: PracticeType; label: string }> = [
  { value: "SINGLE_CHOICE", label: "单选" },
  { value: "MULTIPLE_CHOICE", label: "多选" },
  { value: "TRUE_FALSE", label: "判断" },
  { value: "FILL_BLANK", label: "填空" },
  { value: "PYTHON_PROGRAMMING", label: "编程" },
];

export function CourseReviewSummary({ summaries }: { summaries: Summary }) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [selectedConcepts, setSelectedConcepts] = useState<
    Record<string, string[]>
  >({});
  const [classroomByCourse, setClassroomByCourse] = useState<
    Record<string, string>
  >({});
  const [selectedTypes, setSelectedTypes] = useState<
    Record<string, PracticeType[]>
  >({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [difficulties, setDifficulties] = useState<Record<string, number>>({});
  const [pendingCourseId, setPendingCourseId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  if (!summaries.length) return null;

  async function generate(course: Summary[number]) {
    const classroomId =
      classroomByCourse[course.courseId] ?? course.classrooms[0]?.id;
    const recommendedConcepts = course.knowledgePoints
      .slice(0, 3)
      .map((point) => point.id);
    const recommendedChapters = [...course.topics]
      .sort((a, b) => b.count - a.count)
      .slice(0, 2)
      .map((topic) => topic.id);
    const conceptIds = Object.hasOwn(selectedConcepts, course.courseId)
      ? (selectedConcepts[course.courseId] ?? [])
      : recommendedConcepts;
    const chapterIds = Object.hasOwn(selected, course.courseId)
      ? (selected[course.courseId] ?? [])
      : conceptIds.length
        ? []
        : recommendedChapters;
    const questionTypes = selectedTypes[course.courseId] ?? [
      "SINGLE_CHOICE",
      "MULTIPLE_CHOICE",
    ];
    const count = counts[course.courseId] ?? 10;
    const difficulty = difficulties[course.courseId] ?? 3;

    if (!classroomId) {
      setFeedback((current) => ({
        ...current,
        [course.courseId]: "当前课程没有可用于练习的已加入教学班。",
      }));
      return;
    }
    if (questionTypes.length === 0) {
      setFeedback((current) => ({
        ...current,
        [course.courseId]: "至少选择一种题型。",
      }));
      return;
    }
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      setFeedback((current) => ({
        ...current,
        [course.courseId]: "题量须为 1–50 的整数。",
      }));
      return;
    }

    setPendingCourseId(course.courseId);
    setFeedback((current) => ({ ...current, [course.courseId]: "" }));
    try {
      const response = await fetch(
        `/api/student/courses/${encodeURIComponent(course.courseId)}/recommendations`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            classroomId,
            chapterIds: conceptIds.length ? [] : chapterIds,
            conceptIds,
            questionTypes,
            count,
            difficulty,
            mode: "PRACTICE",
          }),
        },
      );
      const body: unknown = await response.json();
      const cycleId =
        body &&
        typeof body === "object" &&
        "success" in body &&
        body.success === true &&
        "data" in body &&
        body.data &&
        typeof body.data === "object" &&
        "cycle" in body.data &&
        body.data.cycle &&
        typeof body.data.cycle === "object" &&
        "id" in body.data.cycle &&
        typeof body.data.cycle.id === "string"
          ? body.data.cycle.id
          : null;
      if (!response.ok || !cycleId) {
        const message =
          body &&
          typeof body === "object" &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "暂时无法生成练习，请调整条件后重试。";
        setFeedback((current) => ({
          ...current,
          [course.courseId]: message,
        }));
        return;
      }
      window.location.assign(`/student/practice/${cycleId}`);
    } catch {
      setFeedback((current) => ({
        ...current,
        [course.courseId]: "网络连接异常，请稍后重试。",
      }));
    } finally {
      setPendingCourseId(null);
    }
  }

  return (
    <details className="rounded-xl border border-sky-100 bg-white px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-sky-800">
        错题分析与针对性练习
      </summary>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        按课程汇总全部错题，不受列表筛选影响。薄弱章节来自当前课程正式图谱；生成时仍会校验教学班归属、题目审核状态和可用题量。
      </p>
      <div className="mt-3 grid gap-4">
        {summaries.map((course) => {
          const ids = selected[course.courseId] ?? [];
          const defaultConceptIds = course.knowledgePoints
            .slice(0, 3)
            .map((point) => point.id);
          const conceptIds = Object.hasOwn(selectedConcepts, course.courseId)
            ? (selectedConcepts[course.courseId] ?? [])
            : defaultConceptIds;
          const types = selectedTypes[course.courseId] ?? [
            "SINGLE_CHOICE",
            "MULTIPLE_CHOICE",
          ];
          const classroomId =
            classroomByCourse[course.courseId] ??
            course.classrooms[0]?.id ??
            "";
          const params = new URLSearchParams({
            view: "generate",
            courseId: course.courseId,
          });
          if (classroomId) params.set("classroomId", classroomId);
          if (conceptIds.length > 0)
            params.set("conceptId", conceptIds[0] ?? "");
          else ids.forEach((id) => params.append("chapterId", id));
          const topTopics = [...course.topics]
            .sort((a, b) => b.count - a.count)
            .slice(0, 2);
          const recommendedNames = course.knowledgePoints.length
            ? course.knowledgePoints.slice(0, 3).map((point) => point.name)
            : topTopics.map((topic) => topic.name);

          return (
            <article
              key={course.courseId}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {course.name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {course.total} 道错题 · {course.pending} 道待巩固
                  </p>
                </div>
                {course.unmapped > 0 ? (
                  <span className="text-xs text-slate-500">
                    {course.unmapped} 道未关联正式知识图谱
                  </span>
                ) : null}
              </div>

              {recommendedNames.length ? (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500">优先巩固</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {recommendedNames.map((name, index) => (
                      <span
                        key={`${name}:${index}`}
                        className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-900"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">
                  {course.pending > 0
                    ? "这些错题尚未关联到当前正式知识图谱，一键练习将按本课程范围筛选已审核题目。"
                    : "目前没有待巩固错题，可以生成课程综合练习检查掌握情况。"}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {course.classrooms.length > 1 ? (
                  <label className="text-sm text-slate-600">
                    教学班
                    <select
                      className="ml-2 min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                      value={classroomId}
                      onChange={(event) =>
                        setClassroomByCourse((current) => ({
                          ...current,
                          [course.courseId]: event.target.value,
                        }))
                      }
                    >
                      {course.classrooms.map((classroom) => (
                        <option key={classroom.id} value={classroom.id}>
                          {classroom.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  className="min-h-10 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  disabled={
                    pendingCourseId !== null || !course.classrooms.length
                  }
                  onClick={() => void generate(course)}
                >
                  {pendingCourseId === course.courseId
                    ? "正在生成…"
                    : "按薄弱点一键练习 · 10 题"}
                </button>
                <Link
                  className="inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm text-sky-800 hover:bg-sky-50"
                  href={`/student/recommendations?${params}`}
                >
                  打开练习中心 →
                </Link>
                {!course.classrooms.length ? (
                  <span className="text-sm text-amber-800">
                    当前课程没有可用教学班
                  </span>
                ) : null}
              </div>

              <details className="mt-3 border-t border-slate-100 pt-3">
                <summary className="cursor-pointer text-sm text-slate-600 hover:text-sky-800">
                  调整练习范围、题型和难度
                </summary>
                <div className="pt-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      题量（1–50）
                      <input
                        className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                        type="number"
                        min={1}
                        max={50}
                        value={counts[course.courseId] ?? 10}
                        onChange={(event) =>
                          setCounts((current) => ({
                            ...current,
                            [course.courseId]: Number(event.target.value),
                          }))
                        }
                      />
                    </label>
                  </div>

                  {course.topics.length > 0 ? (
                    <fieldset className="mt-4">
                      <legend className="text-sm font-medium text-slate-800">
                        薄弱章节（不选表示整门课程）
                      </legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {course.topics.map((topic) => (
                          <label
                            key={topic.id}
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${ids.includes(topic.id) ? "border-sky-300 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-700"}`}
                          >
                            <input
                              type="checkbox"
                              checked={ids.includes(topic.id)}
                              onChange={(event) =>
                                (() => {
                                  setSelected((current) => ({
                                    ...current,
                                    [course.courseId]: event.target.checked
                                      ? [...ids, topic.id]
                                      : ids.filter((id) => id !== topic.id),
                                  }));
                                  setSelectedConcepts((current) => ({
                                    ...current,
                                    [course.courseId]: [],
                                  }));
                                })()
                              }
                            />
                            {topic.name}
                            <span className="text-xs text-slate-500">
                              {topic.count} 道
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      当前没有可选的已发布章节；整门课程范围仍会由服务端按课程图谱和审核题目校验。
                    </p>
                  )}

                  {course.knowledgePoints.length > 0 ? (
                    <fieldset className="mt-4">
                      <legend className="text-sm font-medium text-slate-800">
                        重点知识点（勾选后按知识点精准组题，优先于章节范围）
                      </legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {course.knowledgePoints.slice(0, 12).map((point) => (
                          <label
                            key={point.id}
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${conceptIds.includes(point.id) ? "border-violet-300 bg-violet-50 text-violet-900" : "border-slate-200 bg-white text-slate-700"}`}
                          >
                            <input
                              type="checkbox"
                              checked={conceptIds.includes(point.id)}
                              onChange={(event) =>
                                (() => {
                                  setSelectedConcepts((current) => ({
                                    ...current,
                                    [course.courseId]: event.target.checked
                                      ? [...conceptIds, point.id]
                                      : conceptIds.filter(
                                          (id) => id !== point.id,
                                        ),
                                  }));
                                  setSelected((current) => ({
                                    ...current,
                                    [course.courseId]: [],
                                  }));
                                })()
                              }
                            />
                            {point.name}
                            <span className="text-xs text-slate-500">
                              {point.count} 道错题
                            </span>
                          </label>
                        ))}
                      </div>
                      {course.knowledgePoints.length > 12 ? (
                        <p className="mt-2 text-xs text-slate-500">
                          这里只展示错题最多的 12
                          个知识点；生成练习中心可继续调整范围。
                        </p>
                      ) : null}
                    </fieldset>
                  ) : null}

                  <fieldset className="mt-4">
                    <legend className="text-sm font-medium text-slate-800">
                      练习题型（可多选）
                    </legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {questionTypeOptions.map((option) => (
                        <label
                          key={option.value}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={types.includes(option.value)}
                            onChange={(event) =>
                              setSelectedTypes((current) => ({
                                ...current,
                                [course.courseId]: event.target.checked
                                  ? [...types, option.value]
                                  : types.filter(
                                      (type) => type !== option.value,
                                    ),
                              }))
                            }
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <label className="mt-4 block max-w-sm text-sm">
                    题目难度：{difficulties[course.courseId] ?? 3} / 5
                    <input
                      aria-label={`${course.name}练习难度`}
                      className="mt-2 block w-full accent-sky-600"
                      type="range"
                      min={1}
                      max={5}
                      value={difficulties[course.courseId] ?? 3}
                      onChange={(event) =>
                        setDifficulties((current) => ({
                          ...current,
                          [course.courseId]: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    题量是本次请求上限；所选课程、知识范围、题型和难度下题目不足时，只使用符合条件的题目，不跨课程或扩展知识范围补题。若没有可用题目，系统会提示调整条件。
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {conceptIds.length
                        ? `推荐知识点 ${conceptIds.length} 个`
                        : ids.length
                          ? `章节 ${ids.length} 个`
                          : "整门课程范围"}
                      ，题量不足时按可用题目生成，不跨课程补题。
                    </span>
                    <button
                      className="min-h-9 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-sm text-sky-800 hover:bg-sky-50 disabled:opacity-60"
                      type="button"
                      disabled={
                        pendingCourseId !== null ||
                        !course.classrooms.length ||
                        !types.length
                      }
                      onClick={() => void generate(course)}
                    >
                      {pendingCourseId === course.courseId
                        ? "正在生成…"
                        : `按设置生成 · ${counts[course.courseId] ?? 10} 题`}
                    </button>
                  </div>
                  {feedback[course.courseId] ? (
                    <p
                      className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
                      role="alert"
                    >
                      {feedback[course.courseId]}
                    </p>
                  ) : null}
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </details>
  );
}
