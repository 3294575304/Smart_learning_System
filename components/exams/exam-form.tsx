"use client";
import { useEffect, useRef, useState } from "react";
import { QuestionType } from "@prisma/client";
import { selectAssignmentQuestions } from "@/services/assignments/editor-helpers";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import { ExamAIGeneration } from "@/components/exams/exam-ai-generation";
import { ExamPublicationDialog } from "@/components/exams/exam-publication-dialog";
import { ExamRulePresets } from "@/components/exams/exam-rule-presets";
import { checkExamPublication } from "@/services/exams/publication-check";
import type { ExamCreateInput } from "@/services/exams/schemas";
import { toggleChapterConcepts } from "@/services/exams/concept-selection";
import {
  DEFAULT_EXAM_TYPE_WEIGHTS,
  distributeExamPoints,
} from "@/services/exams/auto-assembly-scoring";

type Q = {
  id: string;
  title: string;
  type: QuestionType;
  objectiveCode: string | null;
  blocked: boolean;
};
type Selected = {
  questionId: string;
  title: string;
  type: QuestionType;
  points: number;
};
const emptyCounts = () =>
  Object.fromEntries(
    Object.values(QuestionType).map((type) => [type, 0]),
  ) as Record<QuestionType, number>;
const examField =
  "h-10 w-full min-w-0 rounded-lg border bg-white px-3 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";
export function ExamForm({
  courses,
  classrooms,
  conceptGroups,
  assemblyChapters,
  courseObjectives,
}: {
  courses: { id: string; name: string; term: string }[];
  classrooms: { id: string; name: string; courseId: string | null }[];
  conceptGroups: {
    id: string;
    chapters: {
      id: string;
      name: string;
      nodes: { conceptId: string; name?: string }[];
    }[];
  }[];
  assemblyChapters: Record<
    string,
    Array<{
      id: string;
      name: string;
      nodes: Array<{ conceptId: string; code: string; name: string }>;
    }>
  >;
  courseObjectives: Array<{
    courseId: string;
    objectives: Array<{ code: string; title: string }>;
  }>;
}) {
  const requestIdRef = useRef<string | null>(null);
  const [publication, setPublication] = useState<ExamCreateInput | null>(null);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const currentCourseRef = useRef(courseId);
  currentCourseRef.current = courseId;
  const [classroomIds, setClassroomIds] = useState<string[]>([]);
  const [type, setType] = useState("MIDTERM");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [allowedSwitches, setAllowedSwitches] = useState(2);
  const [questionType, setQuestionType] = useState("");
  const [conceptId, setConceptId] = useState("");
  const [objectiveCode, setObjectiveCode] = useState("");
  const [count, setCount] = useState(10);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [selected, setSelected] = useState<Selected[]>([]);
  const [conceptIds, setConceptIds] = useState<string[]>([]);
  const [conceptSelectionMessage, setConceptSelectionMessage] = useState("");
  const [autoCounts, setAutoCounts] =
    useState<Record<QuestionType, number>>(emptyCounts);
  const [weights, setWeights] = useState(DEFAULT_EXAM_TYPE_WEIGHTS);
  const [autoMode, setAutoMode] = useState(false);
  const [scoresEdited, setScoresEdited] = useState(false);
  const [shortages, setShortages] = useState<
    Array<{ type: QuestionType; requested: number; found: number }>
  >([]);
  const [assembling, setAssembling] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const publishedRef = useRef(false);
  const chapters = assemblyChapters[courseId] ?? [];
  const graphNodes = chapters.flatMap((chapter) =>
    chapter.nodes.map((node) => ({ ...node, id: node.conceptId })),
  );
  const totalPoints =
    Math.round(selected.reduce((sum, item) => sum + item.points, 0) * 100) /
    100;

  useEffect(() => {
    const raw = window.sessionStorage.getItem("exam-auto-draft");
    if (!raw) {
      setHydrated(true);
      return;
    }
    try {
      const draft = JSON.parse(raw) as {
        courseId: string;
        conceptIds: string[];
        selected: Selected[];
        counts: Record<QuestionType, number>;
        weights: Record<QuestionType, number>;
        autoMode: boolean;
        scoresEdited: boolean;
        classroomIds: string[];
        type: string;
        title: string;
        startsAt: string;
        endsAt: string;
        allowedSwitches: number;
      };
      if (!courses.some((item) => item.id === draft.courseId)) {
        setHydrated(true);
        return;
      }
      setCourseId(draft.courseId);
      const allowed = new Set(
        (assemblyChapters[draft.courseId] ?? []).flatMap((chapter) =>
          chapter.nodes.map((node) => node.conceptId),
        ),
      );
      setConceptIds(draft.conceptIds.filter((id) => allowed.has(id)));
      setSelected(
        draft.selected.filter(
          (item) =>
            item.questionId && Object.values(QuestionType).includes(item.type),
        ),
      );
      setAutoCounts(draft.counts);
      setWeights(draft.weights);
      setAutoMode(draft.autoMode);
      setScoresEdited(Boolean(draft.scoresEdited));
      setClassroomIds(
        draft.classroomIds.filter((id) =>
          classrooms.some(
            (item) => item.id === id && item.courseId === draft.courseId,
          ),
        ),
      );
      setType(draft.type);
      setTitle(draft.title);
      setStartsAt(draft.startsAt);
      setEndsAt(draft.endsAt);
      setAllowedSwitches(draft.allowedSwitches);
    } catch {
      window.sessionStorage.removeItem("exam-auto-draft");
    }
    setHydrated(true);
  }, [courses, classrooms, assemblyChapters]);
  useEffect(() => {
    if (!hydrated || publishedRef.current) return;
    window.sessionStorage.setItem(
      "exam-auto-draft",
      JSON.stringify({
        courseId,
        conceptIds,
        selected,
        counts: autoCounts,
        weights,
        autoMode,
        scoresEdited,
        classroomIds,
        type,
        title,
        startsAt,
        endsAt,
        allowedSwitches,
      }),
    );
  }, [
    hydrated,
    courseId,
    conceptIds,
    selected,
    autoCounts,
    weights,
    autoMode,
    scoresEdited,
    classroomIds,
    type,
    title,
    startsAt,
    endsAt,
    allowedSwitches,
  ]);

  function rescore(items: Selected[]) {
    return distributeExamPoints(items, weights);
  }
  function addConfirmed(item: {
    id: string;
    title: string;
    type: QuestionType;
  }) {
    if (
      selected.length >= 200 &&
      !selected.some((row) => row.questionId === item.id)
    ) {
      setError("单场考试最多 200 道题，请先移除部分题目");
      return;
    }
    setAutoMode(true);
    setSelected((old) =>
      old.some((row) => row.questionId === item.id)
        ? old
        : old.length >= 200
          ? old
          : scoresEdited
            ? [
                ...old,
                {
                  questionId: item.id,
                  title: item.title,
                  type: item.type,
                  points: 0,
                },
              ]
            : rescore([
                ...old,
                {
                  questionId: item.id,
                  title: item.title,
                  type: item.type,
                  points: 0,
                },
              ]),
    );
  }
  async function assembleFromBank() {
    if (!startsAt || !conceptIds.length) {
      setError("请先设置开考时间并勾选知识点");
      return;
    }
    setAssembling(true);
    setError("");
    const requestedCourseId = courseId;
    try {
      const response = await fetch("/api/teacher/exams/auto-assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          startsAt: new Date(startsAt).toISOString(),
          conceptIds,
          counts: autoCounts,
          excludeQuestionIds: selected.map((item) => item.questionId),
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error ?? "组卷失败");
      if (currentCourseRef.current !== requestedCourseId) return;
      const data = body.data as {
        questions: Array<{ id: string; title: string; type: QuestionType }>;
        shortages: typeof shortages;
      };
      setShortages(data.shortages);
      setAutoMode(true);
      setSelected((old) => {
        const next = [
          ...old,
          ...data.questions.map((item) => ({
            questionId: item.id,
            title: item.title,
            type: item.type,
            points: 0,
          })),
        ];
        return scoresEdited ? next : rescore(next);
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "组卷失败");
    } finally {
      setAssembling(false);
    }
  }
  async function load() {
    if (!startsAt) {
      setError("请先设置开考时间");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        courseId,
        startsAt: new Date(startsAt).toISOString(),
      });
      if (questionType) params.set("questionType", questionType);
      if (conceptId) params.set("conceptId", conceptId);
      if (objectiveCode) params.set("objectiveCode", objectiveCode);
      const response = await fetch(`/api/teacher/exams/questions?${params}`);
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error ?? "题库加载失败");
      setQuestions(body.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "题库加载失败");
    } finally {
      setBusy(false);
    }
  }
  function add(item: Q) {
    setSelected((old) => [
      ...old,
      { questionId: item.id, title: item.title, type: item.type, points: 10 },
    ]);
  }
  function randomPick() {
    let pool: Q[];
    try {
      pool = selectAssignmentQuestions(
        questions.filter((item) => !item.blocked),
        selected.map((item) => item.questionId),
        count,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "选题失败");
      return;
    }
    setSelected((old) => [
      ...old,
      ...pool.map((item) => ({
        questionId: item.id,
        title: item.title,
        type: item.type,
        points: 10,
      })),
    ]);
  }
  function move(index: number, offset: number) {
    setSelected((old) => {
      const next = [...old];
      const target = index + offset;
      if (target < 0 || target >= next.length) return old;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function previewPublication() {
    if (
      autoMode &&
      (totalPoints !== 100 || selected.some((item) => item.points <= 0))
    ) {
      setError("自动组卷总分须为 100 分，且每题分值大于零；请重新配分");
      return;
    }
    const result = checkExamPublication(
      {
        requestId: (requestIdRef.current ??= crypto.randomUUID()),
        courseId,
        classroomIds,
        type,
        title,
        startsAt,
        endsAt,
        allowedSwitches,
        questions: selected.map(({ questionId, points }) => ({
          questionId,
          points,
        })),
      },
      availableClassrooms.map(({ id }) => id),
    );
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    setError("");
    setPublication(result.data);
  }

  async function publish() {
    if (!publication || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/teacher/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(publication),
      });
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error ?? "发布失败");
      publishedRef.current = true;
      window.sessionStorage.removeItem("exam-auto-draft");
      window.location.replace("/teacher/exams");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "发布失败");
    } finally {
      setBusy(false);
    }
  }
  const availableClassrooms = classrooms.filter(
    (item) => item.courseId === courseId,
  );
  return (
    <div className="space-y-5">
      <nav aria-label="考试创建步骤" className="flex flex-wrap gap-2 text-sm">
        {[
          ["exam-schedule", "考试安排"],
          ["exam-questions", "试卷选题"],
          ["exam-publish", "发布核对"],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-lg border bg-white px-3 py-2 text-sky-800 hover:bg-sky-50"
          >
            {label}
          </a>
        ))}
      </nav>
      <section
        id="exam-schedule"
        className="grid scroll-mt-24 gap-4 rounded-2xl border border-sky-100 bg-white p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3"
      >
        <h2 className="font-semibold text-slate-950 sm:col-span-2 xl:col-span-3">
          考试安排
        </h2>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          考试名称
          <input
            className={examField}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          课程
          <select
            className={examField}
            value={courseId}
            disabled={assembling || busy || courses.length === 0}
            onChange={(e) => {
              setCourseId(e.target.value);
              setClassroomIds([]);
              setQuestions([]);
              setSelected([]);
              setObjectiveCode("");
              setConceptId("");
              setConceptIds([]);
              setConceptSelectionMessage("");
              setAutoCounts(emptyCounts());
              setShortages([]);
              setAutoMode(false);
              setScoresEdited(false);
            }}
          >
            {courses.length === 0 && <option value="">暂无可选课程</option>}
            {courses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.term}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          考试类型
          <select
            className={examField}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="MIDTERM">期中考试</option>
            <option value="FINAL">期末考试</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          开考时间
          <input
            className={examField}
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          截止时间
          <input
            className={examField}
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </label>
        <div className="min-w-0 space-y-2">
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            允许切屏次数
            <input
              className={examField}
              type="number"
              min="0"
              max="20"
              value={allowedSwitches}
              onChange={(e) => setAllowedSwitches(Number(e.target.value))}
            />
          </label>
          <ExamRulePresets
            switches={allowedSwitches}
            onChange={setAllowedSwitches}
          />
        </div>
        <fieldset className="min-w-0 sm:col-span-2 xl:col-span-3">
          <legend className="text-sm font-medium">参加班级</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {availableClassrooms.map((item) => (
              <label
                key={item.id}
                className="inline-flex min-h-10 min-w-0 items-center gap-2 rounded-lg border bg-sky-50/40 px-3 text-sm [overflow-wrap:anywhere]"
              >
                <input
                  className="size-4 shrink-0 accent-sky-700"
                  type="checkbox"
                  checked={classroomIds.includes(item.id)}
                  onChange={(e) =>
                    setClassroomIds((old) =>
                      e.target.checked
                        ? [...old, item.id]
                        : old.filter((id) => id !== item.id),
                    )
                  }
                />
                {item.name}
              </label>
            ))}
            {availableClassrooms.length === 0 && (
              <p className="text-sm text-slate-600">
                所选课程暂无可参加考试的班级。
              </p>
            )}
          </div>
        </fieldset>
      </section>
      <section
        id="exam-questions"
        className="scroll-mt-24 space-y-4 rounded-2xl border border-sky-100 bg-white p-4 sm:p-5"
      >
        <h2 className="font-semibold">试卷选题</h2>
        <div className="space-y-4 rounded-lg border border-sky-200 bg-sky-50/40 p-4">
          <h3 className="font-medium">按知识点自动组卷</h3>
          <p className="text-xs text-slate-600">
            可从已审核题库选题，也可生成 AI 候选题；两种方式能加入同一试卷。
          </p>
          <fieldset>
            <legend className="text-sm font-medium">
              知识点（可多选，最多 20 个，已选 {conceptIds.length} 个）
            </legend>
            {chapters.length ? (
              <div className="mt-2 max-h-52 space-y-3 overflow-y-auto rounded border bg-white p-3">
                {chapters.map((chapter) => {
                  const chapterIds = [
                    ...new Set(chapter.nodes.map((node) => node.conceptId)),
                  ];
                  const selectedCount = chapterIds.filter((id) =>
                    conceptIds.includes(id),
                  ).length;
                  return (
                    <div key={chapter.id}>
                      <label className="inline-flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          aria-label={`选择整章：${chapter.name}`}
                          checked={
                            chapterIds.length > 0 &&
                            selectedCount === chapterIds.length
                          }
                          disabled={chapterIds.length === 0}
                          ref={(element) => {
                            if (element)
                              element.indeterminate =
                                selectedCount > 0 &&
                                selectedCount < chapterIds.length;
                          }}
                          onChange={() => {
                            const result = toggleChapterConcepts(
                              conceptIds,
                              chapterIds,
                              20,
                            );
                            if (result.exceeded) {
                              setConceptSelectionMessage(
                                `最多选择 20 个知识点；整章「${chapter.name}」将超过上限，请先取消其他知识点。`,
                              );
                              return;
                            }
                            setConceptIds(result.ids);
                            setConceptSelectionMessage("");
                          }}
                        />
                        {chapter.name}（{selectedCount}/{chapterIds.length}）
                      </label>
                      <div className="mt-1 grid gap-2 sm:grid-cols-2">
                        {chapter.nodes.map((node) => (
                          <label
                            key={node.conceptId}
                            className="flex gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={conceptIds.includes(node.conceptId)}
                              disabled={
                                conceptIds.length >= 20 &&
                                !conceptIds.includes(node.conceptId)
                              }
                              onChange={(event) => {
                                setConceptIds((old) =>
                                  event.target.checked
                                    ? [...new Set([...old, node.conceptId])]
                                    : old.filter((id) => id !== node.conceptId),
                                );
                                setConceptSelectionMessage("");
                              }}
                            />
                            {node.code} · {node.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                当前课程暂无正式知识图谱知识点。
              </p>
            )}
            {conceptSelectionMessage ? (
              <p role="alert" className="mt-2 text-sm text-amber-700">
                {conceptSelectionMessage}
              </p>
            ) : null}
          </fieldset>
          <div>
            <p className="text-sm font-medium">各题型数量与配分权重</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.values(QuestionType).map((questionType) => (
                <div
                  key={questionType}
                  className="rounded border bg-white p-2 text-sm"
                >
                  <span className="block font-medium">
                    {QUESTION_TYPE_LABELS[questionType]}
                  </span>
                  <div className="mt-1 flex gap-2">
                    <label>
                      题数
                      <input
                        aria-label={`${QUESTION_TYPE_LABELS[questionType]}题数`}
                        className="ml-1 w-16 rounded border p-1"
                        type="number"
                        min="0"
                        max="200"
                        value={autoCounts[questionType]}
                        onChange={(event) =>
                          setAutoCounts((old) => ({
                            ...old,
                            [questionType]: Math.max(
                              0,
                              Math.min(
                                200,
                                Math.trunc(Number(event.target.value) || 0),
                              ),
                            ),
                          }))
                        }
                      />
                    </label>
                    <label>
                      权重
                      <input
                        aria-label={`${QUESTION_TYPE_LABELS[questionType]}权重`}
                        className="ml-1 w-16 rounded border p-1"
                        type="number"
                        min="1"
                        max="100"
                        value={weights[questionType]}
                        onChange={(event) =>
                          setWeights((old) => ({
                            ...old,
                            [questionType]: Math.max(
                              1,
                              Math.min(
                                100,
                                Math.trunc(Number(event.target.value) || 1),
                              ),
                            ),
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="rounded bg-sky-700 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={assembling}
            onClick={() => void assembleFromBank()}
          >
            {assembling ? "正在组卷…" : "从题库自动组卷"}
          </button>
          {shortages.length ? (
            <p role="status" className="text-sm text-amber-800">
              题库数量不足：
              {shortages
                .map(
                  (item) =>
                    `${QUESTION_TYPE_LABELS[item.type]}缺 ${item.requested - item.found} 道`,
                )
                .join("；")}
              。请调整条件或使用 AI 生成。
            </p>
          ) : null}
          <ExamAIGeneration
            key={courseId}
            courseId={courseId}
            conceptIds={conceptIds}
            counts={autoCounts}
            graphNodes={graphNodes}
            objectives={
              courseObjectives.find((item) => item.courseId === courseId)
                ?.objectives ?? []
            }
            onConfirmed={(item) => {
              if (currentCourseRef.current === courseId) addConfirmed(item);
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded border p-2"
            value={questionType}
            onChange={(e) => setQuestionType(e.target.value)}
          >
            <option value="">全部题型</option>
            {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="rounded border p-2"
            value={conceptId}
            onChange={(e) => setConceptId(e.target.value)}
          >
            <option value="">全部知识点</option>
            {conceptGroups
              .find((item) => item.id === courseId)
              ?.chapters.flatMap((chapter) =>
                chapter.nodes.map((node) => (
                  <option key={node.conceptId} value={node.conceptId}>
                    {chapter.name} · {node.name ?? node.conceptId}
                  </option>
                )),
              )}
          </select>
          <select
            className="rounded border p-2"
            value={objectiveCode}
            onChange={(event) => setObjectiveCode(event.target.value)}
            aria-label="课程目标筛选"
          >
            <option value="">全部课程目标</option>
            {courseObjectives
              .find((item) => item.courseId === courseId)
              ?.objectives.map((objective) => (
                <option key={objective.code} value={objective.code}>
                  {objective.code} · {objective.title}
                </option>
              ))}
          </select>
          <button
            className="rounded border px-3"
            disabled={busy}
            onClick={load}
          >
            查询可用题
          </button>
          <input
            aria-label="一键选题数量"
            className="w-20 rounded border p-2"
            type="number"
            min="1"
            max="200"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
          <button
            className="rounded bg-sky-700 px-3 text-white"
            onClick={randomPick}
          >
            一键选题
          </button>
        </div>
        <ul className="max-h-64 overflow-auto">
          {questions.map((item) => (
            <li
              key={item.id}
              className="flex justify-between border-b py-2 text-sm"
            >
              <span>
                {item.title}
                {item.blocked ? " · 三年禁重" : ""}
              </span>
              <button
                className="text-sky-700 disabled:text-slate-400"
                disabled={
                  item.blocked ||
                  selected.some((row) => row.questionId === item.id)
                }
                onClick={() => add(item)}
              >
                加入
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl border border-sky-100 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            题序 · {selected.length} 题 · 总分 {totalPoints} 分
          </h2>
          {autoMode && selected.length ? (
            <button
              type="button"
              className="rounded border px-3 py-1 text-sm"
              onClick={() => {
                try {
                  setSelected((old) => rescore(old));
                  setScoresEdited(false);
                  setError("");
                } catch {
                  setError("请将已选题型的权重设为正数");
                }
              }}
            >
              重新配分至 100 分
            </button>
          ) : null}
        </div>
        {autoMode &&
        selected.length &&
        (totalPoints !== 100 || selected.some((item) => item.points <= 0)) ? (
          <p role="status" className="mt-2 text-sm text-amber-700">
            自动组卷总分应为 100 分且每题大于零，请重新配分或调整单题分值。
          </p>
        ) : null}
        <ol>
          {selected.map((item, index) => (
            <li
              key={item.questionId}
              className="flex flex-wrap items-center gap-2 border-b py-2"
            >
              <span className="min-w-0 flex-1 basis-48 [overflow-wrap:anywhere]">
                {index + 1}. {item.title}
              </span>
              <input
                aria-label="分值"
                className="w-20 rounded border p-1"
                type="number"
                min="0.01"
                step="0.01"
                value={item.points}
                onChange={(e) => {
                  setScoresEdited(true);
                  setSelected((old) =>
                    old.map((row, i) =>
                      i === index
                        ? { ...row, points: Number(e.target.value) }
                        : row,
                    ),
                  );
                }}
              />
              <button onClick={() => move(index, -1)}>上移</button>
              <button onClick={() => move(index, 1)}>下移</button>
              <button
                onClick={() =>
                  setSelected((old) =>
                    old.filter((row) => row.questionId !== item.questionId),
                  )
                }
              >
                移除
              </button>
            </li>
          ))}
        </ol>
      </section>
      <div
        id="exam-publish"
        className="flex scroll-mt-24 flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-white p-4"
      >
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            已选 {classroomIds.length} 个班级 · {selected.length} 道题 ·{" "}
            {totalPoints} 分
          </p>
        )}
        <button
          type="button"
          className="ms-auto inline-flex min-h-10 items-center rounded-lg bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50"
          disabled={busy || assembling}
          onClick={previewPublication}
        >
          核对并发布
        </button>
      </div>
      <ExamPublicationDialog
        exam={publication}
        course={
          courses.find((item) => item.id === publication?.courseId)?.name ?? ""
        }
        classrooms={availableClassrooms
          .filter(({ id }) => publication?.classroomIds.includes(id))
          .map(({ name }) => name)}
        busy={busy}
        error={error}
        onClose={() => {
          setPublication(null);
          setError("");
        }}
        onConfirm={() => void publish()}
      />
    </div>
  );
}
