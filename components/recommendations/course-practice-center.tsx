"use client";

import { useEffect, useState } from "react";

interface ChapterOption {
  id: string;
  code: string;
  name: string;
  conceptIds: string[];
}

interface CourseOption {
  courseId: string;
  courseName: string;
  classroomId: string;
  classroomName: string;
  graphVersionNumber: number | null;
  progressRevisionNumber: number | null;
  concepts: Array<{ id: string; code: string; name: string }>;
  chapters: ChapterOption[];
}

type PracticeTemplate = "CHOICE20" | "TRUE_FALSE10" | "PYTHON5";

export function CoursePracticeCenter({
  courses,
  initialCourseId,
  initialClassroomId,
  initialConceptId,
  initialChapterId: requestedChapterId,
  initialChapterIds = [],
  initialDifficulty = 3,
  initialTemplate = "CHOICE20",
  initialMode = "PRACTICE",
}: {
  courses: CourseOption[];
  initialCourseId?: string;
  initialClassroomId?: string;
  initialConceptId?: string;
  initialChapterId?: string;
  initialChapterIds?: string[];
  initialDifficulty?: number;
  initialTemplate?: PracticeTemplate;
  initialMode?: "PRACTICE" | "TEST";
}) {
  const requestedCourse = courses.find(
    (item) =>
      (!initialCourseId || item.courseId === initialCourseId) &&
      (!initialClassroomId || item.classroomId === initialClassroomId),
  );
  const [selectedClassroomId, setSelectedClassroomId] = useState(
    requestedCourse?.classroomId ?? courses[0]?.classroomId ?? "",
  );
  const course =
    courses.find((item) => item.classroomId === selectedClassroomId) ??
    courses[0];
  const initialChapterId = requestedCourse?.chapters.find((chapter) =>
    chapter.conceptIds.includes(initialConceptId ?? ""),
  )?.id;
  const initialSelectionUnavailable = Boolean(
    ((initialCourseId || initialClassroomId) && !requestedCourse) ||
    (initialConceptId && !initialChapterId) ||
    initialChapterIds.some(
      (id) => !requestedCourse?.chapters.some((chapter) => chapter.id === id),
    ) ||
    (requestedChapterId &&
      !requestedCourse?.chapters.some(
        (chapter) => chapter.id === requestedChapterId,
      )),
  );
  const [chapterIds, setChapterIds] = useState<string[]>(() =>
    initialChapterIds.length && !initialConceptId
      ? initialChapterIds.filter((id) =>
          requestedCourse?.chapters.some((chapter) => chapter.id === id),
        )
      : !initialConceptId &&
          requestedCourse?.chapters.some(
            (chapter) => chapter.id === requestedChapterId,
          ) &&
          requestedChapterId
        ? [requestedChapterId]
        : !initialConceptId && initialChapterId
          ? [initialChapterId]
          : [],
  );
  const [focusedConceptId, setFocusedConceptId] = useState(
    initialConceptId ?? "",
  );
  const [mode, setMode] = useState<"PRACTICE" | "TEST">(initialMode);
  const [template, setTemplate] = useState<PracticeTemplate>(initialTemplate);
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [selectionNeedsReview, setSelectionNeedsReview] = useState(
    initialSelectionUnavailable,
  );
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(
    initialSelectionUnavailable
      ? "原学习主题当前不可用或已更新，请重新选择课程知识点或章节。"
      : null,
  );

  useEffect(() => {
    const applyAssistantSelection = (event: Event) => {
      const url = new URL(
        (event as CustomEvent<string>).detail,
        window.location.origin,
      );
      const selected = courses.find(
        (item) => item.courseId === url.searchParams.get("courseId"),
      );
      const conceptId = url.searchParams.get("conceptId") ?? "";
      const chapterSelection = [
        ...new Set(url.searchParams.getAll("chapterId")),
      ];
      const valid =
        selected &&
        (!conceptId ||
          selected.concepts.some((item) => item.id === conceptId)) &&
        chapterSelection.every((id) =>
          selected.chapters.some((item) => item.id === id),
        );
      if (!valid || pending) {
        setSelectionNeedsReview(true);
        setFeedback("请重新确认课程、知识点或章节后再生成练习。");
        return;
      }
      setSelectedClassroomId(selected.classroomId);
      setFocusedConceptId(conceptId);
      setChapterIds(chapterSelection);
      const requestedDifficulty = Number(url.searchParams.get("difficulty"));
      setDifficulty(
        Number.isInteger(requestedDifficulty) &&
          requestedDifficulty >= 1 &&
          requestedDifficulty <= 5
          ? requestedDifficulty
          : 3,
      );
      const requestedTemplate = url.searchParams.get("template");
      setTemplate(
        requestedTemplate === "TRUE_FALSE10" || requestedTemplate === "PYTHON5"
          ? requestedTemplate
          : "CHOICE20",
      );
      setMode(url.searchParams.get("mode") === "TEST" ? "TEST" : "PRACTICE");
      setSelectionNeedsReview(false);
      setFeedback(null);
    };
    window.addEventListener(
      "learning-assistant-practice",
      applyAssistantSelection,
    );
    return () =>
      window.removeEventListener(
        "learning-assistant-practice",
        applyAssistantSelection,
      );
  }, [courses, pending]);

  const effectiveTemplate = mode === "TEST" ? "MIXED_TEST50" : template;
  const [practiceCount, setPracticeCount] = useState(
    initialTemplate === "PYTHON5"
      ? 5
      : initialTemplate === "TRUE_FALSE10"
        ? 10
        : 20,
  );
  const count = mode === "TEST" ? 50 : practiceCount;

  async function generate() {
    if (!course || pending || selectionNeedsReview) return;
    if (
      mode === "PRACTICE" &&
      (!Number.isInteger(practiceCount) ||
        practiceCount < 1 ||
        practiceCount > 50)
    ) {
      setFeedback("请输入 1–50 的整数题量。");
      return;
    }
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
            chapterIds: focusedConceptId ? [] : chapterIds,
            conceptIds: focusedConceptId ? [focusedConceptId] : [],
            questionTypes: [],
            mode,
            template: effectiveTemplate,
            count,
            ...(mode === "PRACTICE" ? { practiceCount } : {}),
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
        body.success !== true ||
        !("data" in body) ||
        !body.data ||
        typeof body.data !== "object" ||
        !("cycle" in body.data) ||
        !body.data.cycle ||
        typeof body.data.cycle !== "object" ||
        !("id" in body.data.cycle) ||
        typeof body.data.cycle.id !== "string"
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
      window.location.assign(`/student/practice/${body.data.cycle.id}`);
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
    <section
      id="course-practice-center"
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div>
        <h2 className="font-semibold">按课程章节生成练习或测试</h2>
        <p className="mt-1 text-sm text-gray-500">
          优先使用本课程授课教师的已审核题目，再从公共题库补充；可练习课程图谱中的任意章节，包含尚未授课的内容。
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          课程与教学班
          <select
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5"
            value={course.classroomId}
            onChange={(event) => {
              setSelectedClassroomId(event.target.value);
              setSelectionNeedsReview(false);
              setFeedback(null);
              setChapterIds([]);
              setFocusedConceptId("");
            }}
          >
            {courses.map((item) => (
              <option
                key={`${item.courseId}:${item.classroomId}`}
                value={item.classroomId}
              >
                {item.courseName} · 教学班：{item.classroomName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          难度
          <input
            aria-label="目标难度"
            className="mt-1 w-full"
            min={1}
            max={5}
            type="range"
            value={difficulty}
            onChange={(event) => setDifficulty(Number(event.target.value))}
          />
          <span>{difficulty}</span>
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">
          课程大章节（不选表示全部章节）
        </legend>
        {course.chapters.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {course.chapters.map((chapter) => (
              <label
                className="rounded-full border px-3 py-2 text-xs"
                key={chapter.id}
              >
                <input
                  className="mr-2"
                  type="checkbox"
                  checked={chapterIds.includes(chapter.id)}
                  onChange={(event) => {
                    setFocusedConceptId("");
                    setSelectionNeedsReview(false);
                    setFeedback(null);
                    setChapterIds((current) =>
                      event.target.checked
                        ? [...current, chapter.id]
                        : current.filter((id) => id !== chapter.id),
                    );
                  }}
                />
                {chapter.code} {chapter.name}
              </label>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-amber-700">
            当前课程没有包含已授知识点的大章节。
          </p>
        )}
      </fieldset>

      {focusedConceptId ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-100">
          <span>
            定向练习 · 当前知识点：
            {course.concepts.find((item) => item.id === focusedConceptId)
              ?.name ?? "已选知识点"}
            。本次仅从关联到该知识点的题目中组题，不会扩展到同章节其他知识点。
          </span>
          <button
            className="rounded border border-sky-300 bg-white px-3 py-1.5 text-xs hover:bg-sky-100"
            onClick={() => {
              setFocusedConceptId("");
              setSelectionNeedsReview(false);
              setFeedback(null);
              setChapterIds(initialChapterId ? [initialChapterId] : []);
            }}
            type="button"
          >
            改为章节范围
          </button>
        </div>
      ) : null}

      <fieldset>
        <legend className="text-sm font-medium">生成类型</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["PRACTICE", "练习"],
              ["TEST", "测试"],
            ] as const
          ).map(([value, label]) => (
            <label className="rounded-md border px-3 py-2 text-sm" key={value}>
              <input
                className="mr-2"
                checked={mode === value}
                name="practice-mode"
                onChange={() => setMode(value)}
                type="radio"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {mode === "PRACTICE" ? (
        <label className="block max-w-md text-sm">
          练习题型
          <select
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5"
            value={template}
            onChange={(event) =>
              setTemplate(event.target.value as PracticeTemplate)
            }
          >
            <option value="CHOICE20">单选 / 多选（约 3 : 1）</option>
            <option value="TRUE_FALSE10">判断题</option>
            <option value="PYTHON5">Python 编程</option>
          </select>
          <span className="mt-3 block">练习题量（1–50 题）</span>
          <input
            aria-label="练习题量"
            className="mt-1.5 w-28 rounded-lg border p-2.5"
            type="number"
            min={1}
            max={50}
            value={practiceCount}
            onChange={(event) => setPracticeCount(Number(event.target.value))}
          />
          <span className="ml-3 text-slate-500">按自己的学习时间安排</span>
        </label>
      ) : (
        <p className="rounded-md bg-sky-50 p-3 text-sm text-sky-900">
          综合测试固定 50
          题，按本课程最近的测试/考试作业题型比例组卷；没有历史试卷时使用系统默认配比。
        </p>
      )}

      <div className="rounded-md bg-sky-50/60 p-3 text-sm">
        确认条件：
        {focusedConceptId
          ? `当前知识点 · ${course.concepts.find((item) => item.id === focusedConceptId)?.name ?? "知识点"}`
          : `${chapterIds.length || "全部"} 个大章节`}{" "}
        ·{mode === "TEST" ? " 综合测试" : " 练习"} · {count} 题 · 难度{" "}
        {difficulty}。 图谱版本 {course.graphVersionNumber ?? "未发布"}
        。自主练习不受教师教学进度限制。
      </div>
      {mode === "PRACTICE" ? (
        <p className="text-sm text-slate-500">
          题量为上限；当前知识点题目不足时，按实际可用题目开始练习，不扩展到其他知识点。
        </p>
      ) : null}
      {feedback ? (
        <p className="text-sm text-red-700" role="alert">
          {feedback}
        </p>
      ) : null}
      <button
        className="rounded-md bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        disabled={pending || selectionNeedsReview || !course.chapters.length}
        onClick={() => void generate()}
        type="button"
      >
        {pending
          ? "正在生成…"
          : `生成${mode === "TEST" ? "测试" : "练习"}（${count} 题）`}
      </button>
    </section>
  );
}
