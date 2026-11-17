"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { QuestionType } from "@prisma/client";
import { selectAssignmentQuestions } from "@/services/assignments/editor-helpers";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import { ExamAIGeneration } from "@/components/exams/exam-ai-generation";
import { ExamPublicationDialog } from "@/components/exams/exam-publication-dialog";
import { ExamRulePresets } from "@/components/exams/exam-rule-presets";
import {
  checkExamPublication,
  collectExamPublicationIssues,
} from "@/services/exams/publication-check";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TypedScoreDialog } from "@/components/assignments/typed-score-dialog";
import {
  ExamScoreToolbar,
  type ExamScoreAction,
  type ExamScoreMode,
} from "@/components/exams/exam-score-toolbar";
import { organizeQuestionsByType } from "@/services/questions/question-order";
import { distributeEvenPoints } from "@/services/questions/score-distribution";
import type { ExamCreateInput } from "@/services/exams/schemas";
import { toggleChapterConcepts } from "@/services/exams/concept-selection";
import {
  applyExamTypeSubtotals,
  AUTO_EXAM_TOTAL_POINTS,
  DEFAULT_EXAM_TYPE_WEIGHTS,
  distributeExamPoints,
  sumExamPointsByType,
  type ExamTypeSubtotals,
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
const examFieldInvalid = "border-red-400 aria-invalid:border-red-500";
const EXAM_DURATION_MS = 2 * 60 * 60 * 1000;

/** 把 KP-1-2 这类编码显示成“1.2”，让下拉里能看出是章下第几节。 */
function formatPointCode(code: string | undefined, name: string) {
  const matched = /^KP-(\d+)-(\d+)$/.exec(code ?? "");
  return matched ? `${Number(matched[1])}.${Number(matched[2])} ${name}` : name;
}

/** datetime-local 只接受"本地时间"字符串，这里去掉时区偏差后的 Z 后缀。 */
function toDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/**
 * 默认考试窗口：下一个整点开考、时长 2 小时。
 * 落在 21:00 之后或清晨时顺延到次日 09:00，避免默认值出现在深夜。
 */
function defaultExamWindow(now = new Date()) {
  const start = new Date(now.getTime());
  start.setSeconds(0, 0);
  start.setMinutes(0);
  start.setHours(start.getHours() + 1);
  if (start.getHours() > 21 || start.getHours() < 6) {
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
  }
  return {
    startsAt: toDateTimeInput(start),
    endsAt: toDateTimeInput(new Date(start.getTime() + EXAM_DURATION_MS)),
  };
}
/** 字段 → 页面锚点，用于把首个错误滚到视野里并聚焦。 */
const FIELD_ANCHORS: Record<string, string> = {
  title: "exam-field-title",
  courseId: "exam-field-course",
  classroomIds: "exam-field-classrooms",
  startsAt: "exam-field-starts",
  endsAt: "exam-field-ends",
  allowedSwitches: "exam-field-switches",
  questions: "exam-field-questions",
};
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
  const [selectedQuestions, setSelected] = useState<Selected[]>([]);
  const [typeSubtotals, setTypeSubtotals] = useState<ExamTypeSubtotals | null>(
    null,
  );
  const selected = useMemo(
    () =>
      typeSubtotals
        ? applyExamTypeSubtotals(selectedQuestions, typeSubtotals)
        : selectedQuestions,
    [selectedQuestions, typeSubtotals],
  );
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
  const [pickMode, setPickMode] = useState<"auto" | "bank">("auto");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingCourseId, setPendingCourseId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [bankLoaded, setBankLoaded] = useState(false);
  const [timeHint, setTimeHint] = useState("");
  const [manualTarget, setManualTarget] = useState(AUTO_EXAM_TOTAL_POINTS);
  const targetPoints = autoMode ? AUTO_EXAM_TOTAL_POINTS : manualTarget;
  const [scoreMode, setScoreMode] = useState<ExamScoreMode>("weights");
  const [scoreDialog, setScoreDialog] = useState<
    "current" | "weights" | "byType" | null
  >(null);
  const [evenPreview, setEvenPreview] = useState<number[] | null>(null);
  const [scoreMessage, setScoreMessage] = useState<{
    text: string;
    tone: "info" | "warn";
  } | null>(null);
  const [pendingClear, setPendingClear] = useState(false);
  const [pendingOrganize, setPendingOrganize] = useState(false);
  const [orderAdjusted, setOrderAdjusted] = useState(false);
  const publishedRef = useRef(false);
  const chapters = assemblyChapters[courseId] ?? [];
  // 筛选下拉用图谱章节（带 KP-x-y 编码）；图谱缺失时退回课程选项里的章节
  const filterChapters: Array<{
    id: string;
    name: string;
    nodes: Array<{ conceptId: string; code: string; name: string }>;
  }> = chapters.length
    ? chapters
    : (conceptGroups.find((item) => item.id === courseId)?.chapters ?? []).map(
        (chapter) => ({
          id: chapter.id,
          name: chapter.name,
          nodes: chapter.nodes.map((node) => ({
            conceptId: node.conceptId,
            code: "",
            name: node.name ?? node.conceptId,
          })),
        }),
      );
  const graphNodes = chapters.flatMap((chapter) =>
    chapter.nodes.map((node) => ({ ...node, id: node.conceptId })),
  );
  const totalPoints =
    Math.round(selected.reduce((sum, item) => sum + item.points, 0) * 100) /
    100;
  const needsScoring =
    totalPoints !== targetPoints || selected.some((item) => item.points <= 0);
  const durationLabel = (() => {
    if (!startsAt || !endsAt) return "";
    const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return "";
    const hours = ms / 3_600_000;
    return hours >= 1
      ? `${Math.round(hours * 10) / 10} 小时`
      : `${Math.round(ms / 60_000)} 分钟`;
  })();

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
        pickMode?: "auto" | "bank";
        targetPoints?: number;
        scoreMode?: ExamScoreMode;
        typeSubtotals?: ExamTypeSubtotals;
        questionType?: string;
        conceptId?: string;
        objectiveCode?: string;
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
      if (draft.pickMode === "auto" || draft.pickMode === "bank")
        setPickMode(draft.pickMode);
      if (typeof draft.targetPoints === "number" && draft.targetPoints > 0)
        setManualTarget(draft.targetPoints);
      if (draft.typeSubtotals && draft.scoreMode === "typed") {
        setTypeSubtotals(
          Object.fromEntries(
            Object.entries(draft.typeSubtotals).filter(
              ([type, points]) =>
                Object.values(QuestionType).some(
                  (questionType) => questionType === type,
                ) &&
                Number.isFinite(points) &&
                points > 0 &&
                points <= 10_000 &&
                Math.abs(Math.round(points * 100) / 100 - points) < 1e-8,
            ),
          ),
        );
        setScoreMode("typed");
      }
      if (
        draft.scoreMode === "weights" ||
        draft.scoreMode === "byType" ||
        draft.scoreMode === "even" ||
        draft.scoreMode === "custom"
      )
        setScoreMode(draft.scoreMode);
      setQuestionType(draft.questionType ?? "");
      setConceptId(draft.conceptId ?? "");
      setObjectiveCode(draft.objectiveCode ?? "");
    } catch {
      window.sessionStorage.removeItem("exam-auto-draft");
    }
    setHydrated(true);
  }, [courses, classrooms, assemblyChapters]);
  // 没有草稿时自动给出一段默认考试窗口：下一个整点开考、时长 2 小时
  useEffect(() => {
    if (!hydrated) return;
    if (startsAt || endsAt) return;
    const { startsAt: start, endsAt: end } = defaultExamWindow();
    setStartsAt(start);
    setEndsAt(end);
  }, [hydrated, startsAt, endsAt]);

  // 进入页面或切换课程后自动拉一次题库：
  // 之前列表一直是空的，教师会以为题库里没有题（实际是查询条件缺开考时间）。
  useEffect(() => {
    if (!hydrated || !courseId || !startsAt) return;
    void load();
    // 只在课程/开考时间变化时重查，其余筛选仍由「查询可用题」触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, courseId, startsAt]);

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
        pickMode,
        targetPoints: manualTarget,
        scoreMode,
        typeSubtotals,
        questionType,
        conceptId,
        objectiveCode,
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
    pickMode,
    manualTarget,
    scoreMode,
    typeSubtotals,
    questionType,
    conceptId,
    objectiveCode,
    startsAt,
    endsAt,
    allowedSwitches,
  ]);

  function rescore(items: Selected[]) {
    return distributeExamPoints(items, weights, AUTO_EXAM_TOTAL_POINTS);
  }
  function formatPoints(value: number) {
    return Number(value.toFixed(2));
  }
  function organizeOrder() {
    setSelected((old) => organizeQuestionsByType(old));
    setOrderAdjusted(false);
    setScoreMessage({
      text: `已按题型重排 ${selected.length} 题，同题型内顺序不变`,
      tone: "info",
    });
  }
  function requestOrganize() {
    if (!selected.length) return;
    if (orderAdjusted) {
      setPendingOrganize(true);
      return;
    }
    organizeOrder();
  }
  function requestScoreMode(next: ExamScoreAction) {
    if (!selected.length) return;
    if (next !== "even") {
      setScoreDialog(next === "typed" ? "current" : next);
      return;
    }
    try {
      setEvenPreview(distributeEvenPoints(selected.length, targetPoints));
    } catch (reason) {
      setScoreMessage({
        text: reason instanceof Error ? reason.message : "配分失败",
        tone: "warn",
      });
    }
  }

  function closeScoreDialog() {
    setScoreDialog(null);
    requestAnimationFrame(() =>
      document.getElementById("exam-type-score-trigger")?.focus(),
    );
  }

  function applyScores(points: number[], goal: number, mode: "typed" | "even") {
    const scored = selected.map((row, index) => ({
      ...row,
      points: points[index],
    }));
    setSelected(scored);
    setTypeSubtotals(mode === "typed" ? sumExamPointsByType(scored) : null);
    if (!autoMode) setManualTarget(goal);
    setScoreMode(mode);
    setScoresEdited(true);
    setError("");
    clearFieldError("questions");
    setScoreMessage({
      text: `已应用分值，合计 ${formatPoints(goal)} 分`,
      tone: "info",
    });
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
    setScoreMessage(null);
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
      setScoreMessage(null);
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
  async function load(overrides?: {
    questionType?: string;
    conceptId?: string;
    objectiveCode?: string;
  }) {
    if (!startsAt) {
      setFieldErrors((old) => ({ ...old, startsAt: "请先设置开考时间" }));
      focusFirstError("startsAt");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        courseId,
        startsAt: new Date(startsAt).toISOString(),
      });
      const type = overrides ? overrides.questionType : questionType;
      const concept = overrides ? overrides.conceptId : conceptId;
      const objective = overrides ? overrides.objectiveCode : objectiveCode;
      if (type) params.set("questionType", type);
      if (concept) params.set("conceptId", concept);
      if (objective) params.set("objectiveCode", objective);
      const response = await fetch(`/api/teacher/exams/questions?${params}`);
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error ?? "题库加载失败");
      setQuestions(body.data);
      setBankLoaded(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "题库加载失败");
    } finally {
      setBusy(false);
    }
  }
  function add(item: Q) {
    setScoreMessage(null);
    setSelected((old) => [
      ...old,
      { questionId: item.id, title: item.title, type: item.type, points: 10 },
    ]);
  }
  /** 列表里直接“移出”，不用滚到下方题序区删除。 */
  function remove(questionId: string) {
    const item = selected.find((row) => row.questionId === questionId);
    if (
      item &&
      !selected.some(
        (row) => row.questionId !== questionId && row.type === item.type,
      )
    ) {
      setTypeSubtotals((old) => {
        if (!old) return old;
        const next = { ...old };
        delete next[item.type];
        return next;
      });
    }
    setScoreMessage(null);
    setSelected((old) => old.filter((row) => row.questionId !== questionId));
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
    setScoreMessage(null);
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
    setOrderAdjusted(true);
    setSelected((old) => {
      const next = [...old];
      const target = index + offset;
      if (target < 0 || target >= next.length) return old;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function fieldError(name: string) {
    const message = fieldErrors[name];
    if (!message) return null;
    return (
      <span
        id={`exam-error-${name}`}
        role="alert"
        className="text-xs font-normal text-red-700"
      >
        {message}
      </span>
    );
  }
  function clearFieldError(name: string) {
    setFieldErrors((old) => {
      if (!(name in old)) return old;
      const next = { ...old };
      delete next[name];
      return next;
    });
  }
  function focusFirstError(field: string) {
    const target = FIELD_ANCHORS[field];
    if (!target) return;
    window.requestAnimationFrame(() => {
      const element = document.getElementById(target);
      if (!element) return;
      element.scrollIntoView({ block: "center", behavior: "smooth" });
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement
      )
        element.focus({ preventScroll: true });
    });
  }
  /** 切换课程会重置 9 组状态，所以先确认再执行（见 requestCourseChange）。 */
  function applyCourse(nextCourseId: string) {
    setCourseId(nextCourseId);
    setClassroomIds([]);
    setQuestions([]);
    setBankLoaded(false);
    setSelected([]);
    setObjectiveCode("");
    setConceptId("");
    setConceptIds([]);
    setConceptSelectionMessage("");
    setAutoCounts(emptyCounts());
    setShortages([]);
    setAutoMode(false);
    setScoresEdited(false);
    setTypeSubtotals(null);
    setScoreMode("weights");
    setScoreMessage(null);
    clearFieldError("classroomIds");
    clearFieldError("questions");
  }
  function requestCourseChange(nextCourseId: string) {
    if (nextCourseId === courseId) return;
    const hasWork =
      selected.length > 0 || conceptIds.length > 0 || classroomIds.length > 0;
    if (hasWork) {
      setPendingCourseId(nextCourseId);
      return;
    }
    applyCourse(nextCourseId);
  }
  function previewPublication() {
    if ((autoMode || typeSubtotals) && needsScoring) {
      const message = `试卷总分须为 ${targetPoints} 分，且每题分值大于零。请重新配分。`;
      setError(message);
      setFieldErrors({ questions: message });
      focusFirstError("questions");
      return;
    }
    const payload = {
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
    };
    const issues = collectExamPublicationIssues(
      payload,
      availableClassrooms.map(({ id }) => id),
    );
    if (issues.length) {
      setFieldErrors(
        Object.fromEntries(issues.map((item) => [item.field, item.message])),
      );
      setError(issues[0]!.message);
      focusFirstError(issues[0]!.field);
      return;
    }
    const result = checkExamPublication(
      payload,
      availableClassrooms.map(({ id }) => id),
    );
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    setFieldErrors({});
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
      // 带标题回列表，由列表页给出一次性的成功提示（否则发布完直接跳走，没有任何确认感）
      window.location.replace(
        `/teacher/exams?created=${encodeURIComponent(publication.title)}`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "发布失败");
    } finally {
      setBusy(false);
    }
  }
  const availableClassrooms = classrooms.filter(
    (item) => item.courseId === courseId,
  );
  const courseLabel =
    courses.find((item) => item.id === courseId)?.name ?? "未选择课程";
  const timeLabel =
    startsAt && endsAt
      ? `${startsAt.replace("T", " ")} → ${endsAt.replace("T", " ")}`
      : "未设置";
  const capacity = classroomIds.length * selected.length;
  const capacityFull = capacity > 400;
  const step1Done = Boolean(
    title.trim() && courseId && startsAt && endsAt && classroomIds.length,
  );
  const step2Done = selected.length > 0;
  const issueCount = Object.keys(fieldErrors).length;
  return (
    <>
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-5">
          <ol
            aria-label="创建考试步骤"
            className="border-border bg-card divide-border grid divide-y rounded-xl border sm:grid-cols-3 sm:divide-x sm:divide-y-0"
          >
            {[
              {
                id: "exam-schedule",
                label: "考试安排",
                hint: "课程、时间与班级",
                done: step1Done,
              },
              {
                id: "exam-questions",
                label: "试卷选题",
                hint: `已选 ${selected.length} 题`,
                done: step2Done,
              },
              {
                id: "exam-publish",
                label: "核对并发布",
                hint: "右侧概要可随时核对",
                done: false,
              },
            ].map((step, index) => (
              <li key={step.id} className="min-w-0">
                <a
                  href={`#${step.id}`}
                  className={`hover:bg-muted/60 flex min-h-14 items-center gap-3 px-3 py-2.5 transition-colors ${
                    step.done ? "bg-emerald-50/60 hover:bg-emerald-50" : ""
                  }`}
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                      step.done
                        ? "bg-emerald-600 text-white"
                        : "bg-sky-100 text-sky-800"
                    }`}
                  >
                    {step.done ? (
                      <Check aria-hidden="true" className="size-4" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {step.label}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {step.hint}
                    </span>
                  </span>
                  {index < 2 ? (
                    <ChevronRight
                      aria-hidden="true"
                      className="text-muted-foreground/60 ms-auto size-4 shrink-0"
                    />
                  ) : null}
                </a>
              </li>
            ))}
          </ol>
          <section
            id="exam-schedule"
            className="border-border bg-card grid scroll-mt-24 gap-4 rounded-xl border p-5 sm:grid-cols-2 xl:grid-cols-3"
          >
            <div className="flex items-start gap-3 sm:col-span-2 xl:col-span-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sky-50 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200">
                1
              </span>
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-950">考试安排</h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  名称、课程与时间窗口；参加班级决定谁能看到这场考试。
                </p>
              </div>
            </div>
            <label className="grid min-w-0 content-start gap-1.5 text-sm font-medium">
              考试名称
              <input
                id="exam-field-title"
                className={`${examField} ${fieldErrors.title ? examFieldInvalid : ""}`}
                value={title}
                aria-invalid={fieldErrors.title ? true : undefined}
                aria-describedby={
                  fieldErrors.title ? "exam-error-title" : undefined
                }
                onChange={(e) => {
                  setTitle(e.target.value);
                  clearFieldError("title");
                }}
              />
              {fieldError("title")}
            </label>
            <label className="grid min-w-0 content-start gap-1.5 text-sm font-medium">
              课程
              <select
                id="exam-field-course"
                className={`${examField} ${fieldErrors.courseId ? examFieldInvalid : ""}`}
                value={courseId}
                aria-invalid={fieldErrors.courseId ? true : undefined}
                aria-describedby={
                  fieldErrors.courseId ? "exam-error-courseId" : undefined
                }
                disabled={assembling || busy || courses.length === 0}
                onChange={(e) => requestCourseChange(e.target.value)}
              >
                {courses.length === 0 && <option value="">暂无可选课程</option>}
                {courses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.term}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 content-start gap-1.5 text-sm font-medium">
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
            <label className="grid min-w-0 content-start gap-1.5 text-sm font-medium">
              开考时间
              <input
                id="exam-field-starts"
                className={`${examField} ${fieldErrors.startsAt ? examFieldInvalid : ""}`}
                type="datetime-local"
                value={startsAt}
                aria-invalid={fieldErrors.startsAt ? true : undefined}
                aria-describedby={
                  fieldErrors.startsAt ? "exam-error-startsAt" : undefined
                }
                onChange={(e) => {
                  const next = e.target.value;
                  setStartsAt(next);
                  clearFieldError("startsAt");
                  // 开考时间后移导致窗口失效时，按 2 小时自动补齐截止时间
                  if (next && endsAt && new Date(endsAt) <= new Date(next)) {
                    setEndsAt(
                      toDateTimeInput(
                        new Date(new Date(next).getTime() + EXAM_DURATION_MS),
                      ),
                    );
                    clearFieldError("endsAt");
                    setTimeHint("已按 2 小时自动补齐截止时间");
                  } else {
                    setTimeHint("");
                  }
                }}
              />
              {fieldError("startsAt")}
            </label>
            <label className="grid min-w-0 content-start gap-1.5 text-sm font-medium">
              截止时间
              <input
                id="exam-field-ends"
                className={`${examField} ${fieldErrors.endsAt ? examFieldInvalid : ""}`}
                type="datetime-local"
                value={endsAt}
                aria-invalid={fieldErrors.endsAt ? true : undefined}
                aria-describedby={
                  fieldErrors.endsAt ? "exam-error-endsAt" : undefined
                }
                min={startsAt || undefined}
                onChange={(e) => {
                  const next = e.target.value;
                  setEndsAt(next);
                  setTimeHint("");
                  if (
                    next &&
                    startsAt &&
                    new Date(next) <= new Date(startsAt)
                  ) {
                    setFieldErrors((old) => ({
                      ...old,
                      endsAt: "截止时间必须晚于开考时间",
                    }));
                  } else {
                    clearFieldError("endsAt");
                  }
                }}
              />
              {fieldError("endsAt")}
              {timeHint ? (
                <span
                  role="status"
                  className="text-xs font-normal text-emerald-700"
                >
                  {timeHint}
                </span>
              ) : durationLabel ? (
                <span className="text-muted-foreground text-xs font-normal">
                  考试时长 {durationLabel}
                </span>
              ) : null}
            </label>
            <div className="min-w-0 space-y-2">
              <label className="grid min-w-0 content-start gap-1.5 text-sm font-medium">
                允许切屏次数
                <input
                  id="exam-field-switches"
                  className={`${examField} ${fieldErrors.allowedSwitches ? examFieldInvalid : ""}`}
                  type="number"
                  min="0"
                  max="20"
                  value={allowedSwitches}
                  aria-invalid={fieldErrors.allowedSwitches ? true : undefined}
                  onChange={(e) => {
                    setAllowedSwitches(Number(e.target.value));
                    clearFieldError("allowedSwitches");
                  }}
                />
              </label>
              <ExamRulePresets
                switches={allowedSwitches}
                onChange={setAllowedSwitches}
              />
            </div>
            <div className="border-border border-t sm:col-span-2 xl:col-span-3" />
            <fieldset
              id="exam-field-classrooms"
              aria-describedby={
                fieldErrors.classroomIds ? "exam-error-classroomIds" : undefined
              }
              className={`min-w-0 scroll-mt-24 sm:col-span-2 xl:col-span-3 ${
                fieldErrors.classroomIds
                  ? "rounded-lg border border-red-300 p-2"
                  : ""
              }`}
            >
              <legend className="text-sm font-medium">
                参加班级（已选 {classroomIds.length} 个，上限 20）
              </legend>
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
              {fieldErrors.classroomIds ? (
                <p
                  id="exam-error-classroomIds"
                  role="alert"
                  className="mt-2 text-xs font-normal text-red-700"
                >
                  {fieldErrors.classroomIds}
                </p>
              ) : null}
            </fieldset>
          </section>
          <section
            id="exam-questions"
            className="border-border bg-card scroll-mt-24 space-y-4 rounded-xl border p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sky-50 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200">
                  2
                </span>
                <div className="min-w-0">
                  <h2 className="font-semibold">试卷选题</h2>
                  <p className="mt-0.5 text-xs text-slate-600">
                    两种方式可混用：自动组一份底稿，再逐题补充。
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                已选 {selected.length} 题
              </span>
            </div>
            <div
              role="tablist"
              aria-label="选题方式"
              className="inline-flex rounded-lg border bg-slate-50 p-1"
            >
              {[
                ["auto", "按知识点自动组卷"],
                ["bank", "从题库逐题挑选"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={pickMode === value}
                  onClick={() => setPickMode(value as "auto" | "bank")}
                  className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                    pickMode === value
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {pickMode === "auto" ? (
              <div className="border-border bg-muted/30 space-y-4 rounded-lg border p-4">
                <fieldset>
                  <legend className="text-sm font-medium">
                    知识点（可多选，最多 20 个，已选 {conceptIds.length} 个）
                  </legend>
                  {chapters.length ? (
                    <div className="mt-2 max-h-52 space-y-3 overflow-y-auto rounded border bg-white p-3">
                      {chapters.map((chapter) => {
                        const chapterIds = [
                          ...new Set(
                            chapter.nodes.map((node) => node.conceptId),
                          ),
                        ];
                        const selectedCount = chapterIds.filter((id) =>
                          conceptIds.includes(id),
                        ).length;
                        return (
                          <div key={chapter.id}>
                            <label className="inline-flex min-h-8 items-center gap-2 text-sm font-semibold text-slate-800">
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
                              {chapter.name}（{selectedCount}/
                              {chapterIds.length}）
                            </label>
                            <div className="border-border mt-1.5 grid gap-1.5 border-l pl-3 sm:grid-cols-2">
                              {chapter.nodes.map((node) => (
                                <label
                                  key={node.conceptId}
                                  className="flex min-h-7 items-center gap-2 text-sm text-slate-700"
                                >
                                  <input
                                    type="checkbox"
                                    checked={conceptIds.includes(
                                      node.conceptId,
                                    )}
                                    disabled={
                                      conceptIds.length >= 20 &&
                                      !conceptIds.includes(node.conceptId)
                                    }
                                    onChange={(event) => {
                                      setConceptIds((old) =>
                                        event.target.checked
                                          ? [
                                              ...new Set([
                                                ...old,
                                                node.conceptId,
                                              ]),
                                            ]
                                          : old.filter(
                                              (id) => id !== node.conceptId,
                                            ),
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
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {Object.values(QuestionType).map((questionType) => (
                      <div
                        key={questionType}
                        className="rounded border bg-white p-2 text-sm"
                      >
                        <span className="block font-medium">
                          {QUESTION_TYPE_LABELS[questionType]}
                        </span>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
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
                                      Math.trunc(
                                        Number(event.target.value) || 0,
                                      ),
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
                                      Math.trunc(
                                        Number(event.target.value) || 1,
                                      ),
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
                  className="min-h-10 rounded-lg bg-sky-700 px-3 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50"
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
                    if (currentCourseRef.current === courseId)
                      addConfirmed(item);
                  }}
                />
              </div>
            ) : (
              <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-10 rounded-lg border px-2"
                    value={questionType}
                    aria-label="题型筛选"
                    onChange={(event) => {
                      setQuestionType(event.target.value);
                      void load({ questionType: event.target.value });
                    }}
                  >
                    <option value="">全部题型</option>
                    {Object.entries(QUESTION_TYPE_LABELS).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                  <select
                    className="h-10 min-w-0 rounded-lg border px-2"
                    value={conceptId}
                    aria-label="章节与知识点筛选"
                    onChange={(event) => {
                      setConceptId(event.target.value);
                      void load({ conceptId: event.target.value });
                    }}
                  >
                    <option value="">全部章节 / 知识点</option>
                    {filterChapters.map((chapter) => (
                      <optgroup key={chapter.id} label={chapter.name}>
                        {chapter.nodes.map((node) => (
                          <option key={node.conceptId} value={node.conceptId}>
                            {formatPointCode(node.code, node.name)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <select
                    className="h-10 rounded-lg border px-2"
                    value={objectiveCode}
                    onChange={(event) => {
                      setObjectiveCode(event.target.value);
                      void load({ objectiveCode: event.target.value });
                    }}
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
                  <span
                    role="status"
                    className="text-xs text-slate-600 tabular-nums"
                  >
                    {busy
                      ? "正在查询…"
                      : bankLoaded
                        ? `共 ${questions.length} 道`
                        : ""}
                  </span>
                  <input
                    aria-label="一键选题数量"
                    className="h-10 w-20 rounded-lg border px-2"
                    type="number"
                    min="1"
                    max="200"
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                  <button
                    className="min-h-10 rounded-lg bg-sky-700 px-3 font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                    onClick={randomPick}
                  >
                    一键选题
                  </button>
                </div>
                {questions.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                    {busy
                      ? "正在加载题库…"
                      : bankLoaded
                        ? "没有符合条件的题目。调整上方筛选会自动重新查询。"
                        : "尚未加载题库，选择上方筛选条件即可查询。"}
                  </p>
                ) : null}
                <ul className="max-h-64 overflow-auto">
                  {questions.map((item) => {
                    const added = selected.some(
                      (row) => row.questionId === item.id,
                    );
                    return (
                      <li
                        key={item.id}
                        className={`relative flex items-start justify-between gap-3 border-b py-2 text-sm focus-within:bg-sky-50/40 hover:bg-sky-50/40 ${
                          added ? "bg-sky-50/50" : ""
                        }`}
                      >
                        <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">
                          <Link
                            href={`/teacher/questions/${item.id}?from=exam-create`}
                            prefetch={false}
                            className="underline decoration-slate-300 underline-offset-2 after:absolute after:inset-0 after:rounded-md hover:text-sky-800 hover:decoration-sky-500 focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-sky-700"
                          >
                            {item.title}
                          </Link>
                          {item.blocked ? " · 三年禁重" : ""}
                        </span>
                        <button
                          type="button"
                          aria-pressed={added}
                          aria-label={
                            added
                              ? `从试卷移出：${item.title}`
                              : `加入试卷：${item.title}`
                          }
                          className={`relative z-10 min-h-10 shrink-0 rounded-lg border px-3 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 ${
                            added
                              ? "border-red-200 bg-white text-red-700 hover:bg-red-50 focus-visible:outline-red-600"
                              : "border-transparent text-sky-700 hover:bg-sky-50 focus-visible:outline-sky-700"
                          } disabled:text-slate-400 disabled:hover:bg-transparent`}
                          disabled={item.blocked && !added}
                          onClick={() => (added ? remove(item.id) : add(item))}
                        >
                          {added ? "移出" : "加入"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
          <section
            id="exam-field-questions"
            className={`bg-card scroll-mt-24 rounded-xl border p-5 ${
              fieldErrors.questions ? "border-red-300" : "border-border"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sky-50 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200">
                  3
                </span>
                <div className="min-w-0">
                  <h2 className="font-semibold">题目顺序与分值</h2>
                  <p className="mt-0.5 text-xs text-slate-600">
                    共 {selected.length} 题 · 总分 {totalPoints}{" "}
                    分；点标题看详情，返回会恢复本次编辑。
                  </p>
                </div>
              </div>
            </div>
            {capacity ? (
              <p
                className={`mt-2 text-xs ${
                  capacityFull ? "font-medium text-red-700" : "text-slate-600"
                }`}
              >
                {classroomIds.length} 班 × {selected.length} 题 = {capacity}，
                上限 400{capacityFull ? "，请减少班级或题目" : ""}
              </p>
            ) : null}
            <ExamScoreToolbar
              questionCount={selected.length}
              busy={assembling}
              totalPoints={totalPoints}
              targetPoints={targetPoints}
              fixedTarget={autoMode}
              mode={scoreMode}
              message={scoreMessage}
              onTargetChange={(value) => {
                setManualTarget(Number.isFinite(value) ? value : 0);
                setScoreMessage(null);
              }}
              onOrganize={requestOrganize}
              onDistribute={requestScoreMode}
              onClear={() => setPendingClear(true)}
            />
            {fieldError("questions")}
            {(autoMode || typeSubtotals) &&
            selected.length > 0 &&
            needsScoring ? (
              <p role="status" className="mt-2 text-sm text-amber-700">
                {totalPoints < targetPoints &&
                  `待分配 ${formatPoints(targetPoints - totalPoints)} 分。`}
                {totalPoints > targetPoints &&
                  `超出目标 ${formatPoints(totalPoints - targetPoints)} 分。`}
                {selected.some((item) => item.points <= 0) &&
                  "有题目尚未配分。"}
                请核对配分后发布。
              </p>
            ) : null}
            {selected.length === 0 ? (
              <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                还没有选题。可在上方按知识点自动组卷，或从题库列表逐题「加入」。
              </p>
            ) : null}
            <ol className="mt-3 max-h-[28rem] overflow-y-auto pr-1">
              {selected.map((item, index) => (
                <li
                  key={item.questionId}
                  className="relative flex flex-wrap items-center gap-2 border-b py-2 focus-within:bg-sky-50/40 hover:bg-sky-50/40"
                >
                  <span className="min-w-0 flex-1 basis-48 [overflow-wrap:anywhere]">
                    {index + 1}.{" "}
                    <Link
                      href={`/teacher/questions/${item.questionId}?from=exam-create`}
                      prefetch={false}
                      className="underline decoration-slate-300 underline-offset-2 after:absolute after:inset-0 after:rounded-md hover:text-sky-800 hover:decoration-sky-500 focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-sky-700"
                    >
                      {item.title}
                    </Link>
                  </span>
                  <input
                    aria-label={`第 ${index + 1} 题分值`}
                    className="relative z-10 h-10 w-20 rounded-lg border bg-white px-2 text-sm"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={item.points}
                    onChange={(e) => {
                      setScoresEdited(true);
                      setTypeSubtotals(null);
                      setScoreMode("custom");
                      setScoreMessage(null);
                      setSelected(
                        selected.map((row, i) =>
                          i === index
                            ? { ...row, points: Number(e.target.value) }
                            : row,
                        ),
                      );
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`上移第 ${index + 1} 题`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="relative z-10 inline-grid size-10 place-items-center rounded-lg border text-slate-600 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronUp aria-hidden="true" className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`下移第 ${index + 1} 题`}
                    disabled={index === selected.length - 1}
                    onClick={() => move(index, 1)}
                    className="relative z-10 inline-grid size-10 place-items-center rounded-lg border text-slate-600 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronDown aria-hidden="true" className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`移除第 ${index + 1} 题`}
                    onClick={() => remove(item.questionId)}
                    className="relative z-10 inline-grid size-10 place-items-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside
          id="exam-publish"
          className="min-w-0 scroll-mt-24 xl:sticky xl:top-16"
        >
          <div className="border-border bg-muted/40 space-y-3 rounded-xl border p-4">
            <div>
              <h2 className="text-sm font-semibold">考试概要</h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                发布前核对这四项
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium [overflow-wrap:anywhere]">
                {courseLabel}
              </p>
              <p className="text-muted-foreground text-xs leading-5">
                {type === "FINAL" ? "期末考试" : "期中考试"} · {timeLabel}
              </p>
              <p className="text-muted-foreground text-xs leading-5">
                参加班级 {classroomIds.length} 个 · {selected.length} 题 ·{" "}
                {totalPoints} 分
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  题量上限（班级 × 题目）
                </span>
                <span
                  className={
                    capacityFull
                      ? "font-semibold text-red-700"
                      : "text-muted-foreground"
                  }
                >
                  {capacity} / 400
                </span>
              </div>
              <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full ${
                    capacityFull ? "bg-red-500" : "bg-sky-600"
                  }`}
                  style={{ width: `${Math.min(100, capacity / 4)}%` }}
                />
              </div>
            </div>
            {issueCount ? (
              <p
                role="alert"
                className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
              >
                有 {issueCount} 处需要修正，已定位到第一处标红项。
              </p>
            ) : error ? (
              <p
                role="alert"
                className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
              >
                {error}
              </p>
            ) : step1Done && step2Done ? (
              <p
                role="status"
                className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
              >
                信息齐备，可以核对发布。
              </p>
            ) : (
              <p className="bg-muted/70 text-muted-foreground rounded-lg px-3 py-2 text-xs leading-5">
                还差：{!step1Done ? "考试安排" : ""}
                {!step1Done && !step2Done ? "、" : ""}
                {!step2Done ? "试卷选题" : ""}
                ，补齐后即可发布。
              </p>
            )}
            <button
              type="button"
              className="tt-btn-cta inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50"
              disabled={busy || assembling}
              onClick={previewPublication}
            >
              核对并发布
            </button>
          </div>
        </aside>
      </div>
      {scoreDialog && (
        <TypedScoreDialog
          questions={selected.map((row) => ({
            id: row.questionId,
            title: row.title,
            type: row.type,
            points: row.points,
          }))}
          target={targetPoints}
          initiallyLocked={[]}
          exam={{
            fixedTarget: autoMode,
            preset: scoreDialog,
            initialSubtotals: typeSubtotals ?? undefined,
            recommend: (goal) =>
              sumExamPointsByType(
                distributeExamPoints(selected, weights, goal),
              ),
          }}
          onApply={(points, goal) => {
            applyScores(points, goal, "typed");
            closeScoreDialog();
          }}
          onClose={closeScoreDialog}
        />
      )}
      <ConfirmDialog
        open={evenPreview !== null}
        title="预览全卷均分"
        busy={false}
        confirmLabel="应用分值"
        onCancel={() => setEvenPreview(null)}
        onConfirm={() => {
          if (evenPreview) applyScores(evenPreview, targetPoints, "even");
          setEvenPreview(null);
        }}
      >
        {evenPreview && (
          <p>
            共 {evenPreview.length} 题，
            {evenPreview[0] === evenPreview.at(-1)
              ? `每题 ${evenPreview[0]} 分`
              : `每题 ${evenPreview.at(-1)}–${evenPreview[0]} 分，尾差按题序分配`}
            ，合计 {targetPoints} 分。
          </p>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingCourseId !== null}
        title="切换课程会清空当前试卷"
        busy={false}
        confirmLabel="清空并切换"
        onCancel={() => setPendingCourseId(null)}
        onConfirm={() => {
          const next = pendingCourseId;
          setPendingCourseId(null);
          if (next) applyCourse(next);
        }}
      >
        <p>
          当前已选 {selected.length} 道题、{classroomIds.length} 个教学班
          {conceptIds.length ? `、${conceptIds.length} 个知识点` : ""}
          。切换课程后这些内容会清空，且无法撤销。
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingOrganize}
        title="按题型重新排列题目"
        busy={false}
        confirmLabel="重新排列"
        onCancel={() => setPendingOrganize(false)}
        onConfirm={() => {
          setPendingOrganize(false);
          organizeOrder();
        }}
      >
        <p>
          将按「单选 → 多选 → 判断 → 填空 → 编程 → 简答」重排 {selected.length}{" "}
          道题，同题型内保持当前顺序；你手动调整过的位置会被覆盖。
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={pendingClear}
        title="清空本次选题"
        busy={false}
        confirmLabel="清空"
        onCancel={() => setPendingClear(false)}
        onConfirm={() => {
          setSelected([]);
          setTypeSubtotals(null);
          setAutoMode(false);
          setScoresEdited(false);
          setPendingClear(false);
          setScoreMode("weights");
          setOrderAdjusted(false);
          setScoreMessage({
            text: "已清空本次选题，题库原题不受影响",
            tone: "info",
          });
        }}
      >
        <p>
          将移除本次选题的 {selected.length} 道题及已配分值，题库原题不受影响。
        </p>
      </ConfirmDialog>
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
    </>
  );
}
