"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { QuestionType } from "@prisma/client";
import { ArrowDown, ArrowUp, ListOrdered, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { requestAssignmentApi } from "@/components/assignments/request-api";
import { markTeacherWorkspaceDirty } from "@/components/dashboard/teacher-workspace-refresh";
import {
  distributeAssignmentPoints,
  selectAssignmentQuestions,
} from "@/services/assignments/editor-helpers";
import type { AssignmentUpsertData } from "@/services/assignments/schemas";
import {
  validateEditorAction,
  courseSwitchImpact,
} from "@/services/assignments/editor-review";
import { EditorDialog } from "./editor-dialog";
import type { TeacherAssignmentView } from "@/services/assignments/types";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import {
  ASSIGNMENT_QUESTION_ORDER_LABEL,
  isAssignmentQuestionOrderOrganized,
  organizeAssignmentQuestions,
} from "@/services/assignments/question-order";

const formSchema = z.object({
  title: z.string().trim().min(2, "作业名称至少需要 2 个字符").max(120),
  description: z.string().trim().max(5000),
  classroomId: z.string().min(1, "请选择发布班级"),
  publishedAt: z.string().min(1, "请选择发布时间"),
  dueAt: z.string().min(1, "请选择截止时间"),
  allowResubmission: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface EditorQuestion {
  id: string;
  title: string;
  content?: string;
  type: QuestionType;
  difficulty: number;
  questionCategoryId: string | null;
  questionCategory?: { name: string } | null;
  graphBindings?: Array<{ courseId: string; conceptId: string }>;
}

interface SelectedQuestion extends EditorQuestion {
  points: number;
}

interface AssignmentFormProps {
  mode: "create" | "edit";
  publicationCourses?: Array<{ id: string; name: string; term: string }>;
  classrooms: Array<{
    id: string;
    name: string;
    courseId?: string | null;
    questionCategoryId?: string | null;
  }>;
  courses?: Array<{
    id: string;
    name: string;
    term?: string;
    courseNo?: string;
    courseIds?: string[];
    chapters: Array<{
      id: string;
      name: string;
      nodes: Array<{ conceptId: string; code?: string; name?: string }>;
    }>;
  }>;
  questions: EditorQuestion[];
  assignment?: TeacherAssignmentView;
  defaultDueDays?: number;
  initialClassroomId?: string;
}

interface PreparedAction {
  input: AssignmentUpsertData;
  classroomIds: string[];
  courseLabel: string;
  classroomNames: string[];
  resourceNames: string[];
  scoreMode: string;
  publish: boolean;
}

function datetimeLocal(date: Date | null | undefined): string {
  if (!date) return "";
  const value = new Date(date);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function AssignmentForm({
  mode,
  classrooms,
  questions,
  courses = [],
  publicationCourses = [],
  assignment,
  defaultDueDays = 7,
  initialClassroomId,
}: AssignmentFormProps) {
  const [confirmation, setConfirmation] = useState<PreparedAction | null>(null);
  const [retryAction, setRetryAction] = useState<PreparedAction | null>(null);
  const [switchTarget, setSwitchTarget] = useState<{
    courseId: string;
    classroomId: string;
  } | null>(null);
  const [result, setResult] = useState<{
    assignments: TeacherAssignmentView[];
    publish: boolean;
    reused: boolean;
  } | null>(null);
  const savedPublication = useRef<string | null>(null);
  const inFlight = useRef(false);
  const initialClassroom =
    assignment?.classroom.id ?? initialClassroomId ?? classrooms[0]?.id ?? "";
  const [selectedClassroomIds, setSelectedClassroomIds] = useState<string[]>(
    initialClassroom ? [initialClassroom] : [],
  );
  const [publishCourseId, setPublishCourseId] = useState(
    classrooms.find((item) => item.id === initialClassroom)?.courseId ?? "",
  );
  const [resourceFiles, setResourceFiles] = useState(
    assignment?.resourceFiles ?? [],
  );
  const [uploading, setUploading] = useState<string | null>(null);
  const [pickCount, setPickCount] = useState(10);
  const [targetPoints, setTargetPoints] = useState(100);
  const [defaultHundredPoints, setDefaultHundredPoints] = useState(
    mode === "create",
  );
  const requestVersion = useRef<{ signature: string; id: string } | null>(null);

  const [assignmentType, setAssignmentType] = useState(
    assignment?.submissionTask ? "task" : "bank",
  );
  const [task, setTask] = useState(
    assignment?.submissionTask ?? {
      prompt: "",
      referenceAnswer: "",
      points: 100,
    },
  );
  const [allowAttachments, setAllowAttachments] = useState(
    assignment?.allowAttachments ?? true,
  );
  function courseForClassroom(classroomId: string) {
    const courseId = classrooms.find(
      (item) => item.id === classroomId,
    )?.courseId;
    return (
      courses.find(
        (item) =>
          item.id === courseId || item.courseIds?.includes(courseId ?? ""),
      )?.id ?? ""
    );
  }
  const defaultClassroomId =
    assignment?.classroom.id ?? initialClassroomId ?? classrooms[0]?.id ?? "";
  const [filterCourse, setFilterCourse] = useState(() =>
    courseForClassroom(defaultClassroomId),
  );
  const [filterCategory, setFilterCategory] = useState(
    () =>
      classrooms.find((item) => item.id === initialClassroom)
        ?.questionCategoryId ?? null,
  );
  const [filterChapter, setFilterChapter] = useState("");
  const [filterConcept, setFilterConcept] = useState("");
  const [keyword, setKeyword] = useState("");
  const [filterType, setFilterType] = useState("");
  const [page, setPage] = useState(1);
  const course = courses.find((item) => item.id === filterCourse);
  const chapter = course?.chapters.find((item) => item.id === filterChapter);
  const conceptOptions = [
    ...new Map(
      (chapter?.nodes ?? []).map((node) => [node.code ?? node.conceptId, node]),
    ).values(),
  ].sort((a, b) =>
    (a.code ?? a.conceptId).localeCompare(b.code ?? b.conceptId, "zh-CN", {
      numeric: true,
    }),
  );
  const available = questions.filter(
    (question) =>
      (!filterCategory || question.questionCategoryId === filterCategory) &&
      (!keyword ||
        `${question.title} ${question.content ?? ""}`
          .toLowerCase()
          .includes(keyword.trim().toLowerCase())) &&
      (!filterType || question.type === filterType) &&
      (!filterCourse ||
        question.graphBindings?.some(
          (binding) =>
            (course?.courseIds ?? [filterCourse]).includes(binding.courseId) &&
            (!chapter ||
              chapter.nodes.some(
                (node) =>
                  node.conceptId === binding.conceptId &&
                  (!filterConcept ||
                    (node.code ?? node.conceptId) === filterConcept),
              )),
        )),
  );
  const [selected, setSelected] = useState<SelectedQuestion[]>(() =>
    (assignment?.questions ?? []).flatMap((item) => {
      const source = questions.find(
        (question) => question.id === item.questionId,
      );
      if (assignment?.submissionTask) return [];
      return [
        {
          ...(source ?? {
            id: item.questionId,
            title: item.title,
            type: item.type,
            difficulty: 1,
            questionCategoryId: null,
          }),
          points: item.points,
        },
      ];
    }),
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [autoOrganize, setAutoOrganize] = useState(
    () => mode === "create" || isAssignmentQuestionOrderOrganized(selected),
  );
  const [orderFeedback, setOrderFeedback] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<
    "save" | "publish" | null
  >(null);
  const defaultPublishedAt = assignment?.publishedAt ?? new Date();
  const defaultDueAt =
    assignment?.dueAt ??
    new Date(defaultPublishedAt.getTime() + defaultDueDays * 86_400_000);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: assignment?.title ?? "",
      description: assignment?.description ?? "",
      classroomId: defaultClassroomId,
      publishedAt: datetimeLocal(defaultPublishedAt),
      dueAt: datetimeLocal(defaultDueAt),
      allowResubmission: assignment?.allowResubmission ?? false,
    },
  });

  useEffect(() => {
    if (!defaultHundredPoints || selected.length === 0) return;
    setSelected((items) => {
      const points = distributeAssignmentPoints(items.length, 100);
      return items.map((item, index) => ({ ...item, points: points[index] }));
    });
  }, [defaultHundredPoints, selected.length]);

  function addQuestion(question: EditorQuestion) {
    if (selected.some((item) => item.id === question.id)) return;
    setOrderFeedback(null);
    setSelected((items) => {
      const next = [...items, { ...question, points: 10 }];
      return autoOrganize ? organizeAssignmentQuestions(next) : next;
    });
  }

  function organizeQuestions() {
    setSelected((items) => organizeAssignmentQuestions(items));
    setAutoOrganize(true);
    setOrderFeedback("题序已整理，同类题保留当前顺序。新增题目也会自动归类。");
  }

  function clearQuestions() {
    if (selected.length === 0) return;
    setSelected([]);
    setConfirmClear(false);
    setOrderFeedback(
      "已清空作业题目，可从题库重新添加。请保存草稿以保留修改。",
    );
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selected.length) return;
    setAutoOrganize(false);
    setOrderFeedback("已切换为手动排序，保存和发布均采用当前题序。");
    setSelected((items) => {
      const copy = [...items];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  }

  async function uploadResourceFiles(files: FileList | null) {
    if (!files) return;
    const courseId = classrooms.find(
      (item) => item.id === form.getValues("classroomId"),
    )?.courseId;
    if (!courseId) {
      setServerError("请先选择已关联课程的班级，再上传教师附件");
      return;
    }
    if (resourceFiles.length + files.length > 5) {
      setServerError("教师任务附件最多5个");
      return;
    }
    setServerError(null);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          setServerError(`${file.name} 超过5MB，请压缩后重试`);
          return;
        }
        setUploading(file.name);
        const data = new FormData();
        data.set("courseId", courseId);
        data.set("file", file);
        const response = await requestAssignmentApi<{
          id: string;
          name: string;
          sizeBytes: number;
        }>("/api/teacher/assignment-resources", { method: "POST", body: data });
        if (!response.success) {
          setServerError(response.error);
          return;
        }
        setResourceFiles((items) => [...items, response.data]);
      }
    } finally {
      setUploading(null);
    }
  }
  function autoPickQuestions() {
    try {
      if (selected.length + pickCount > 200)
        throw new Error("每份作业最多200题");
      const chosen = selectAssignmentQuestions(
        available,
        selected.map((item) => item.id),
        pickCount,
      ).map((item) => ({ ...item, points: 10 }));
      setSelected((items) =>
        autoOrganize
          ? organizeAssignmentQuestions([...items, ...chosen])
          : [...items, ...chosen],
      );
      setOrderFeedback(
        `已按当前筛选条件加入${chosen.length}道题，请核对题目和分值后发布。`,
      );
    } catch (error) {
      setOrderFeedback(
        error instanceof Error ? error.message : "选题失败，请调整条件",
      );
    }
  }
  function organizePoints() {
    try {
      const points = distributeAssignmentPoints(selected.length, targetPoints);
      setDefaultHundredPoints(false);
      setSelected((items) =>
        items.map((item, index) => ({ ...item, points: points[index] })),
      );
      setOrderFeedback(
        `已将总分整理为${targetPoints}分，按题序均分至0.01分；仍可逐题修改。`,
      );
    } catch (error) {
      setOrderFeedback(
        error instanceof Error ? error.message : "请检查目标总分",
      );
    }
  }
  function courseLabelFor(classroomId: string) {
    const id = classrooms.find((item) => item.id === classroomId)?.courseId;
    const value =
      publicationCourses.find((item) => item.id === id) ??
      courses.find(
        (item) => item.id === id || item.courseIds?.includes(id ?? ""),
      );
    return value
      ? `${value.name}${value.term ? ` · ${value.term}` : ""}`
      : "未关联课程";
  }
  function applyCourseChange(target: {
    courseId: string;
    classroomId: string;
  }) {
    const nextClass = classrooms.find((item) => item.id === target.classroomId);
    const oldCourse =
      classrooms.find((item) => item.id === form.getValues("classroomId"))
        ?.courseId ?? "";
    const impact = courseSwitchImpact(
      selected,
      nextClass?.questionCategoryId ?? null,
      resourceFiles.length,
      oldCourse !== target.courseId,
    );
    setSelected(impact.retained);
    if (impact.removedAttachments) setResourceFiles([]);
    setPublishCourseId(target.courseId);
    setSelectedClassroomIds(target.classroomId ? [target.classroomId] : []);
    form.setValue("classroomId", target.classroomId, { shouldValidate: true });
    setFilterCourse(courseForClassroom(target.classroomId));
    setFilterCategory(nextClass?.questionCategoryId ?? null);
    setFilterChapter("");
    setFilterConcept("");
    setPage(1);
    setOrderFeedback(
      `已更新课程和班级范围${impact.removedCount ? `，移除${impact.removedCount}道不适用题目` : ""}${impact.removedAttachments ? `，解除${impact.removedAttachments}个课程附件引用（原文件保留）` : ""}。`,
    );
    setSwitchTarget(null);
    setRetryAction(null);
  }
  function requestCourseChange(courseId: string, classroomId: string) {
    const oldCourse =
      classrooms.find((item) => item.id === form.getValues("classroomId"))
        ?.courseId ?? "";
    const category =
      classrooms.find((item) => item.id === classroomId)?.questionCategoryId ??
      null;
    const impact = courseSwitchImpact(
      selected,
      category,
      resourceFiles.length,
      oldCourse !== courseId,
    );
    if (impact.removedCount || impact.removedAttachments)
      setSwitchTarget({ courseId, classroomId });
    else applyCourseChange({ courseId, classroomId });
  }
  function persist(values: FormValues, publish: boolean) {
    if (inFlight.current) return;
    setServerError(null);
    try {
      const input = validateEditorAction(
        {
          ...values,
          publishedAt: new Date(values.publishedAt),
          dueAt: new Date(values.dueAt),
          allowAttachments: assignmentType === "task" && allowAttachments,
          submissionTask:
            assignmentType === "task"
              ? {
                  ...task,
                  resourceFileIds: resourceFiles.map((file) => file.id),
                }
              : undefined,
          questions: (assignmentType === "task"
            ? []
            : autoOrganize
              ? organizeAssignmentQuestions(selected)
              : selected
          ).map((q, index) => ({
            questionId: q.id,
            sortOrder: index + 1,
            points: q.points,
          })),
        },
        publish,
      );
      const classroomIds =
        mode === "create" ? [...selectedClassroomIds] : [input.classroomId];
      if (!classroomIds.length) throw new Error("请至少选择一个班级");
      if (classroomIds.length * Math.max(1, input.questions.length) > 400)
        throw new Error("单次最多复制400题次，请减少班级或题目后分批发布");
      const action: PreparedAction = {
        input,
        classroomIds,
        publish,
        courseLabel: courseLabelFor(input.classroomId),
        classroomNames: classroomIds.map(
          (id) =>
            classrooms.find((item) => item.id === id)?.name ?? "班级不可用",
        ),
        resourceNames:
          assignmentType === "task"
            ? resourceFiles.map((file) => file.name)
            : [],
        scoreMode:
          assignmentType === "task"
            ? task.points === 100
              ? "百分制"
              : "自定义总分"
            : defaultHundredPoints
              ? "默认百分制"
              : "自定义总分",
      };
      setRetryAction(null);
      if (publish) setConfirmation(action);
      else void execute(action);
    } catch (error) {
      setServerError(
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "请检查作业信息")
          : error instanceof Error
            ? error.message
            : "请检查作业信息",
      );
    }
  }
  async function execute(action: PreparedAction) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmittingAction(action.publish ? "publish" : "save");
    setServerError(null);
    const fail = (message: string) => {
      setServerError(message);
      setRetryAction(action);
      setConfirmation(null);
    };
    try {
      const signature = JSON.stringify({
        assignment: action.input,
        classroomIds: [...action.classroomIds].sort(),
        publish: action.publish,
      });
      if (mode === "create") {
        if (requestVersion.current?.signature !== signature)
          requestVersion.current = { signature, id: crypto.randomUUID() };
        const response = await requestAssignmentApi<{
          assignments: TeacherAssignmentView[];
          reused: boolean;
        }>("/api/teacher/assignments/batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requestId: requestVersion.current.id,
            classroomIds: action.classroomIds,
            publish: action.publish,
            assignment: action.input,
          }),
        });
        if (!response.success) {
          fail(response.error);
          return;
        }
        setResult({ ...response.data, publish: action.publish });
      } else {
        let saved: TeacherAssignmentView | undefined;
        if (!(action.publish && savedPublication.current === signature)) {
          const response = await requestAssignmentApi<TeacherAssignmentView>(
            `/api/teacher/assignments/${assignment?.id}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(action.input),
            },
          );
          if (!response.success) {
            fail(response.error);
            return;
          }
          saved = response.data;
          savedPublication.current = action.publish ? signature : null;
        }
        if (action.publish) {
          const response = await requestAssignmentApi<TeacherAssignmentView>(
            `/api/teacher/assignments/${assignment?.id}/publish`,
            { method: "POST" },
          );
          if (!response.success) {
            fail(`草稿已保存，但发布失败：${response.error}。可重试本次发布。`);
            return;
          }
          saved = response.data;
        }
        if (saved)
          setResult({
            assignments: [saved],
            publish: action.publish,
            reused: false,
          });
      }
      setConfirmation(null);
      setRetryAction(null);
      markTeacherWorkspaceDirty();
    } finally {
      inFlight.current = false;
      setSubmittingAction(null);
    }
  }

  const busy = submittingAction !== null || uploading !== null;
  const effectiveClassroomIds =
    mode === "create" ? selectedClassroomIds : [form.watch("classroomId")];
  const totalPoints =
    assignmentType === "task"
      ? task.points
      : Math.round(selected.reduce((sum, q) => sum + q.points, 0) * 100) / 100;
  const switchImpact = switchTarget
    ? courseSwitchImpact(
        selected,
        classrooms.find((item) => item.id === switchTarget.classroomId)
          ?.questionCategoryId ?? null,
        resourceFiles.length,
        (classrooms.find((item) => item.id === form.getValues("classroomId"))
          ?.courseId ?? "") !== switchTarget.courseId,
      )
    : null;
  if (result)
    return (
      <section
        aria-live="polite"
        className="space-y-4 rounded-2xl border bg-white p-5 sm:p-6"
      >
        <h2 className="text-xl font-semibold text-emerald-800">
          {result.publish ? "作业已发布" : "草稿已保存"}
        </h2>
        <p className="text-sm text-slate-600">
          已为 {result.assignments.length} 个班级
          {result.publish ? "发布" : "保存"} {result.assignments.length}{" "}
          份独立作业，各班分别管理。
          {result.reused ? "本次复用了已成功的请求，没有重复创建。" : ""}
        </p>
        <ul className="divide-y rounded-xl border">
          {result.assignments.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3"
            >
              <span className="min-w-0 text-sm break-words">
                {item.classroom.name} · {item.title}
              </span>
              <Link
                className="inline-flex h-10 shrink-0 items-center rounded-lg border px-3 text-sm text-sky-700"
                href={`/teacher/assignments/${item.id}${result.publish ? "" : "/edit"}`}
              >
                {result.publish ? "查看作业" : "继续编辑草稿"}
              </Link>
            </li>
          ))}
        </ul>
        <Link
          className="inline-flex h-10 items-center rounded-lg bg-sky-700 px-4 text-sm text-white"
          href={`/teacher/assignments${publishCourseId ? `?courseId=${publishCourseId}` : ""}`}
        >
          返回作业管理
        </Link>
      </section>
    );
  return (
    <form
      className="space-y-5 [&_input:not([type=checkbox]):not([type=radio]):not([type=file])]:h-10 [&_select]:h-10"
      onSubmit={form.handleSubmit((v) => persist(v, false))}
    >
      <fieldset disabled={busy} className="min-w-0 space-y-6">
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <section
            aria-labelledby="assignment-basic-heading"
            className="min-w-0 space-y-4 rounded-xl border bg-white p-4 sm:p-5"
          >
            <h2 id="assignment-basic-heading" className="font-semibold">
              基本信息
            </h2>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">作业名称</span>
              <input
                className="w-full rounded-lg border px-3"
                {...form.register("title")}
              />
              <span className="text-xs text-red-600">
                {form.formState.errors.title?.message}
              </span>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">作业说明</span>
              <textarea
                className="min-h-32 w-full rounded-lg border p-3"
                {...form.register("description")}
              />
            </label>
            <label className="flex items-start gap-2 text-sm leading-6">
              <input
                className="mt-1"
                type="checkbox"
                {...form.register("allowResubmission")}
              />
              允许学生在截止时间前重复提交（每次结果独立保留）
            </label>
          </section>
          <section
            aria-labelledby="assignment-publish-heading"
            className="min-w-0 space-y-4 rounded-xl border bg-white p-4 sm:p-5"
          >
            <h2 id="assignment-publish-heading" className="font-semibold">
              发布设置
            </h2>
            {mode === "create" ? (
              <>
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">课程</span>
                  <select
                    aria-label="发布所属课程"
                    className="w-full rounded-lg border px-3"
                    value={publishCourseId}
                    onChange={(event) => {
                      const id = event.target.value;
                      requestCourseChange(
                        id,
                        classrooms.find((item) => (item.courseId ?? "") === id)
                          ?.id ?? "",
                      );
                    }}
                  >
                    {[
                      ...new Set(classrooms.map((item) => item.courseId ?? "")),
                    ].map((id) => (
                      <option key={id || "unassigned"} value={id}>
                        {courseLabelFor(
                          classrooms.find(
                            (item) => (item.courseId ?? "") === id,
                          )?.id ?? "",
                        )}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="min-w-0">
                  <legend className="mb-2 text-sm font-medium">
                    班级（可多选）{" "}
                    <span className="font-normal text-slate-500">
                      已选{selectedClassroomIds.length}个
                    </span>
                  </legend>
                  <input type="hidden" {...form.register("classroomId")} />
                  <div className="grid max-h-36 gap-2 overflow-y-auto sm:grid-cols-2">
                    {classrooms
                      .filter(
                        (item) => (item.courseId ?? "") === publishCourseId,
                      )
                      .map((item) => (
                        <label
                          key={item.id}
                          className="flex min-w-0 items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        >
                          <input
                            className="mt-1"
                            type="checkbox"
                            checked={selectedClassroomIds.includes(item.id)}
                            disabled={
                              !publishCourseId &&
                              selectedClassroomIds.length > 0 &&
                              !selectedClassroomIds.includes(item.id)
                            }
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...selectedClassroomIds, item.id]
                                : selectedClassroomIds.filter(
                                    (id) => id !== item.id,
                                  );
                              setSelectedClassroomIds(next);
                              form.setValue("classroomId", next[0] ?? "", {
                                shouldValidate: true,
                              });
                            }}
                          />
                          <span
                            className="min-w-0 break-words"
                            title={item.name}
                          >
                            {item.name}
                          </span>
                        </label>
                      ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    每班生成独立作业，分别批改和公布成绩。
                  </p>
                </fieldset>
              </>
            ) : (
              <label className="block space-y-1 text-sm">
                <span className="font-medium">教学班（单班草稿）</span>
                <select
                  aria-label="发布班级"
                  className="w-full rounded-lg border px-3"
                  value={form.watch("classroomId")}
                  onChange={(event) => {
                    const item = classrooms.find(
                      (c) => c.id === event.target.value,
                    );
                    requestCourseChange(
                      item?.courseId ?? "",
                      event.target.value,
                    );
                  }}
                >
                  {classrooms.map((item) => (
                    <option key={item.id} value={item.id}>
                      {courseLabelFor(item.id)} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-xs text-red-600">
              {form.formState.errors.classroomId?.message}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="min-w-0 space-y-1 text-sm">
                <span className="font-medium">发布时间</span>
                <input
                  className="w-full min-w-0 rounded-lg border px-2"
                  type="datetime-local"
                  {...form.register("publishedAt")}
                />
                <span className="text-xs text-red-600">
                  {form.formState.errors.publishedAt?.message}
                </span>
              </label>
              <label className="min-w-0 space-y-1 text-sm">
                <span className="font-medium">截止时间</span>
                <input
                  className="w-full min-w-0 rounded-lg border px-2"
                  type="datetime-local"
                  {...form.register("dueAt")}
                />
                <span className="text-xs text-red-600">
                  {form.formState.errors.dueAt?.message}
                </span>
              </label>
            </div>
          </section>
        </div>
        <div
          className="space-y-4"
          role="group"
          aria-labelledby="assignment-content-heading"
        >
          <h2 id="assignment-content-heading" className="font-semibold">
            作业内容
          </h2>
          <fieldset className="bg-card rounded-xl border p-5">
            <legend className="sr-only">作业形式</legend>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <span className="font-medium">作业形式</span>
              {[
                ["bank", "从题库选择题目"],
                ["task", "直接布置任务"],
              ].map(([value, label]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <input
                    type="radio"
                    name="assignmentType"
                    checked={assignmentType === value}
                    onChange={() => setAssignmentType(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              直接任务可提交文字、截图或 PDF，由教师单独评分。
            </p>
          </fieldset>
          {assignmentType === "task" ? (
            <section className="space-y-4 rounded-xl border bg-white p-5">
              <h2 className="font-semibold">任务要求与评分</h2>
              <label className="block text-sm">
                任务内容
                <textarea
                  className="mt-2 min-h-40 w-full rounded-lg border p-3"
                  maxLength={10000}
                  value={task.prompt}
                  onChange={(event) =>
                    setTask({ ...task, prompt: event.target.value })
                  }
                  placeholder="例如：完成实验，说明分析过程，并提交结果截图。"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
                <label className="block text-sm">
                  评分参考（仅教师可见）
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-lg border p-3"
                    maxLength={10000}
                    value={task.referenceAnswer}
                    onChange={(event) =>
                      setTask({ ...task, referenceAnswer: event.target.value })
                    }
                  />
                </label>
                <label className="block text-sm">
                  总分
                  <input
                    className="mt-2 w-full rounded-lg border p-3"
                    type="number"
                    min="0.01"
                    max="10000"
                    step="0.01"
                    value={task.points}
                    onChange={(event) =>
                      setTask({ ...task, points: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <label className="block text-sm font-medium">
                  教师任务附件（发给学生的材料）
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,.png,.jpg,.jpeg,.txt,.py"
                    className="mt-2 block w-full text-xs"
                    onChange={(event) => {
                      void uploadResourceFiles(event.target.files);
                      event.target.value = "";
                    }}
                    disabled={busy || resourceFiles.length >= 5}
                  />
                </label>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  支持PDF、Word(docx)、图片、UTF-8文本及Python文件，最多5个，每个5MB。发布后学生可下载，附件内容随作业冻结。
                </p>
                {uploading ? (
                  <p role="status" className="mt-2 text-xs text-sky-700">
                    正在上传：{uploading}
                  </p>
                ) : null}
                <ul className="mt-2 space-y-2">
                  {resourceFiles.map((file) => (
                    <li
                      key={file.id}
                      className="flex min-w-0 items-center gap-2 rounded-md bg-white px-2 py-2 text-xs"
                    >
                      <a
                        className="min-w-0 flex-1 truncate text-sky-700 underline"
                        href={`/api/teacher/course-files/${file.id}/download`}
                        title={file.name}
                      >
                        {file.name}
                      </a>
                      <span className="shrink-0 text-slate-500">
                        {Math.ceil(file.sizeBytes / 1024)}KB
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-red-600"
                        onClick={() =>
                          setResourceFiles((items) =>
                            items.filter((item) => item.id !== file.id),
                          )
                        }
                      >
                        移除
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allowAttachments}
                  onChange={(e) => setAllowAttachments(e.target.checked)}
                />
                允许学生上传作答附件：截图与 PDF（每题最多 5 个，每个 5 MB）
              </label>
              <p className="text-xs text-slate-500">
                学生可填写文字答案并附材料；提交后进入人工批改，成绩发布后学生可见。
              </p>
            </section>
          ) : (
            <div className="grid items-start gap-6 xl:grid-cols-2">
              <section className="min-w-0 rounded-xl border bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">从题库选择题目</h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                    筛选结果 {available.length} 道
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-sky-50 p-3">
                  <label className="text-xs text-slate-600">
                    新增题量
                    <input
                      aria-label="一键出题数量"
                      className="mt-1 block w-20 rounded-md border bg-white px-2 py-2"
                      type="number"
                      min="1"
                      max="200"
                      value={pickCount}
                      onChange={(event) =>
                        setPickCount(Number(event.target.value))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-sky-700"
                    onClick={autoPickQuestions}
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    一键添加题目
                  </button>
                  <p className="w-full text-xs leading-5 text-slate-500">
                    按下方筛选条件从可用题库中随机加入未选题；请核对后发布。
                  </p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 [&>input]:min-w-0 [&>select]:min-w-0">
                  <select
                    aria-label="按课程选题"
                    className="rounded-lg border p-2.5 text-sm"
                    value={filterCourse}
                    onChange={(e) => {
                      setFilterCourse(e.target.value);
                      setFilterChapter("");
                      setFilterConcept("");
                      setPage(1);
                    }}
                  >
                    <option value="">全部课程题目</option>
                    {courses.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.term ? ` · ${item.term}` : ""}
                        {item.courseNo ? ` · ${item.courseNo}` : ""}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="按章节选题"
                    disabled={!course?.chapters.length}
                    className="rounded-lg border p-2.5 text-sm"
                    value={filterChapter}
                    onChange={(e) => {
                      setFilterChapter(e.target.value);
                      setFilterConcept("");
                      setPage(1);
                    }}
                  >
                    <option value="">全部章节</option>
                    {course?.chapters.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="按知识点选题"
                    className="rounded-lg border p-2.5 text-sm"
                    value={filterConcept}
                    disabled={!chapter}
                    onChange={(event) => {
                      setFilterConcept(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">
                      {chapter ? "本章全部知识点" : "请先选择章节"}
                    </option>
                    {conceptOptions.map((node) => (
                      <option
                        key={node.code ?? node.conceptId}
                        value={node.code ?? node.conceptId}
                      >
                        {node.code} · {node.name ?? "知识点"}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="rounded-lg border p-2.5 text-sm"
                    onClick={() => {
                      setFilterCourse("");
                      setFilterChapter("");
                      setFilterConcept("");
                      setKeyword("");
                      setFilterType("");
                      setPage(1);
                    }}
                  >
                    重置筛选
                  </button>
                  <input
                    aria-label="搜索题目"
                    placeholder="搜索标题或题干"
                    className="rounded-lg border p-2.5 text-sm"
                    value={keyword}
                    onChange={(e) => {
                      setKeyword(e.target.value);
                      setPage(1);
                    }}
                  />
                  <select
                    aria-label="按题型选题"
                    className="rounded-lg border p-2.5 text-sm"
                    value={filterType}
                    onChange={(e) => {
                      setFilterType(e.target.value);
                      setPage(1);
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
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  课程与章节依据教师已确认的知识点关联筛选。未关联题目可在“全部课程题目”中查看。
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  当前筛选 {available.length} 道 · 已选 {selected.length}{" "}
                  道。课程列表仅显示有正式图谱且有可选关联题目的课程。
                </p>
                <div className="mt-4 max-h-[40rem] space-y-2 overflow-y-auto pr-1">
                  {available.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      没有符合条件的题目，请调整筛选。
                    </p>
                  ) : (
                    available
                      .slice((page - 1) * 12, page * 12)
                      .map((question) => {
                        const added = selected.some(
                          (item) => item.id === question.id,
                        );
                        return (
                          <div
                            className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${added ? "border-sky-200 bg-sky-50/50" : "hover:border-sky-200"}`}
                            key={question.id}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm leading-6 font-medium break-words">
                                {question.title}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                {question.questionCategory?.name ?? "课程题库"}{" "}
                                · {QUESTION_TYPE_LABELS[question.type]} · 难度{" "}
                                {question.difficulty}
                              </p>
                            </div>
                            <button
                              className="inline-flex h-9 w-16 shrink-0 items-center justify-center rounded-md border bg-white text-sm whitespace-nowrap text-sky-700 hover:bg-sky-50 disabled:text-slate-400"
                              disabled={added}
                              onClick={() => addQuestion(question)}
                              type="button"
                            >
                              {added ? "已添加" : "添加"}
                            </button>
                          </div>
                        );
                      })
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span>
                    {available.length} 道可选 · 已选 {selected.length} 道
                  </span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      上一页
                    </button>
                    <span>
                      {page} / {Math.max(1, Math.ceil(available.length / 12))}
                    </span>
                    <button
                      type="button"
                      disabled={page * 12 >= available.length}
                      onClick={() => setPage(page + 1)}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </section>

              <section className="min-w-0 rounded-xl border bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-semibold">已选作业题目</h2>
                  <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-800">
                    {selected.length} 道题 · 总分{" "}
                    {Math.round(
                      selected.reduce((sum, item) => sum + item.points, 0) *
                        100,
                    ) / 100}
                  </span>
                </div>
                <div className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
                      <input
                        type="checkbox"
                        className="size-4 accent-sky-600"
                        checked={autoOrganize}
                        onChange={(event) => {
                          if (event.target.checked) organizeQuestions();
                          else {
                            setAutoOrganize(false);
                            setOrderFeedback(
                              "已切换为手动排序，保存和发布均采用当前题序。",
                            );
                          }
                        }}
                      />
                      自动按题型排列
                    </label>
                    <button
                      type="button"
                      disabled={selected.length < 2}
                      onClick={organizeQuestions}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-medium whitespace-nowrap text-sky-800 transition hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none disabled:opacity-50"
                    >
                      <ListOrdered aria-hidden="true" className="size-4" />
                      一键整理题序
                    </button>
                  </div>
                  <p className="text-xs leading-5 text-slate-500">
                    {ASSIGNMENT_QUESTION_ORDER_LABEL}
                    。同类题保持原顺序，上移、下移可切换为手动排序。
                  </p>
                  <div className="space-y-3 border-t pt-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
                      <input
                        type="checkbox"
                        className="size-4 accent-sky-600"
                        checked={defaultHundredPoints}
                        onChange={(event) => {
                          setDefaultHundredPoints(event.target.checked);
                          setOrderFeedback(
                            event.target.checked
                              ? "已恢复默认百分制，当前题目自动均分至100分。"
                              : "已切换为自定义总分，保留当前分值。",
                          );
                        }}
                      />
                      总分固定 100 分，增减题目自动均分
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1 text-xs text-slate-600">
                        目标总分
                        <input
                          aria-label="整理分值目标总分"
                          className="w-20 rounded-md border bg-white px-2 py-2"
                          type="number"
                          min="0.01"
                          max="10000"
                          step="0.01"
                          value={targetPoints}
                          onChange={(event) =>
                            setTargetPoints(Number(event.target.value))
                          }
                        />
                      </label>
                      <button
                        type="button"
                        disabled={!selected.length}
                        onClick={organizePoints}
                        className="shrink-0 rounded-lg border bg-white px-3 py-2 text-xs whitespace-nowrap text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                      >
                        一键整理分值
                      </button>
                    </div>
                    <p className="text-xs leading-5 text-slate-500">
                      修改单题分值或整理目标总分后，切换为自定义分值。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <span className="text-xs text-slate-500">
                      清空仅移除本次选题，保留题库原题
                    </span>
                    <button
                      type="button"
                      disabled={selected.length === 0}
                      onClick={() => setConfirmClear(true)}
                      aria-expanded={confirmClear && selected.length > 0}
                      aria-controls="assignment-clear-confirmation"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs whitespace-nowrap text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                      一键清空题目
                    </button>
                  </div>
                  {confirmClear && selected.length > 0 ? (
                    <div
                      id="assignment-clear-confirmation"
                      role="group"
                      aria-label="确认清空作业题目"
                      className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3"
                    >
                      <p className="text-sm font-medium text-red-800">
                        确认清空当前作业的 {selected.length} 道题目？
                      </p>
                      <p className="text-xs leading-5 text-red-700">
                        不会删除题库原题。保存草稿后才会更新作业。
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmClear(false)}
                          className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                        >
                          取消清空
                        </button>
                        <button
                          type="button"
                          onClick={clearQuestions}
                          className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
                        >
                          确认清空 {selected.length} 道题目
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {orderFeedback ? (
                    <p
                      role="status"
                      className="rounded-md bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800"
                    >
                      {orderFeedback}
                    </p>
                  ) : null}
                </div>
                {selected.length === 0 ? (
                  <p className="mt-4 rounded-md border border-dashed p-8 text-center text-sm text-gray-500">
                    尚未选择题目。草稿可以保存，但发布前至少需要一道题。
                  </p>
                ) : (
                  <div className="mt-4 max-h-[52rem] space-y-3 overflow-y-auto pr-1">
                    {selected.map((question, index) => (
                      <div
                        className="rounded-lg border p-3 sm:p-4"
                        key={question.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm leading-6 font-medium break-words">
                              {index + 1}. {question.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {QUESTION_TYPE_LABELS[question.type]}
                            </p>
                          </div>
                          <button
                            className="shrink-0 rounded-md px-2 py-1 text-sm whitespace-nowrap text-red-600 hover:bg-red-50"
                            aria-label={`移除第 ${index + 1} 题`}
                            onClick={() => {
                              setOrderFeedback(null);
                              setSelected((items) =>
                                items.filter((item) => item.id !== question.id),
                              );
                            }}
                            type="button"
                          >
                            移除
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm">
                          <button
                            className="inline-flex shrink-0 items-center gap-1 rounded border px-2 py-1.5 whitespace-nowrap hover:bg-slate-50 disabled:opacity-40"
                            aria-label={`上移第 ${index + 1} 题`}
                            disabled={index === 0}
                            onClick={() => moveQuestion(index, -1)}
                            type="button"
                          >
                            <ArrowUp aria-hidden="true" className="size-3.5" />
                            上移
                          </button>
                          <button
                            className="inline-flex shrink-0 items-center gap-1 rounded border px-2 py-1.5 whitespace-nowrap hover:bg-slate-50 disabled:opacity-40"
                            aria-label={`下移第 ${index + 1} 题`}
                            disabled={index === selected.length - 1}
                            onClick={() => moveQuestion(index, 1)}
                            type="button"
                          >
                            <ArrowDown
                              aria-hidden="true"
                              className="size-3.5"
                            />
                            下移
                          </button>
                          <label className="ml-auto flex items-center gap-2 whitespace-nowrap">
                            分值
                            <input
                              aria-label={`第 ${index + 1} 题分值`}
                              className="w-20 rounded border px-2 py-1.5"
                              min="0.01"
                              onChange={(event) => {
                                setDefaultHundredPoints(false);
                                setSelected((items) =>
                                  items.map((item) =>
                                    item.id === question.id
                                      ? {
                                          ...item,
                                          points: Number(event.target.value),
                                        }
                                      : item,
                                  ),
                                );
                              }}
                              step="0.01"
                              type="number"
                              value={question.points}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
        {serverError ? (
          <div
            role="alert"
            className="space-y-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            <p>{serverError}</p>
            {retryAction ? (
              <button
                type="button"
                disabled={busy}
                className="h-10 rounded-lg border border-red-200 bg-white px-3"
                onClick={() =>
                  retryAction.publish
                    ? setConfirmation(retryAction)
                    : void execute(retryAction)
                }
              >
                重试上次{retryAction.publish ? "发布" : "保存"}内容
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
          <p className="text-sm text-slate-600">
            {assignmentType === "task" ? "直接任务" : `${selected.length}道题`}{" "}
            · 总分{" "}
            <strong>{Number.isFinite(totalPoints) ? totalPoints : "—"}</strong>{" "}
            ·{" "}
            {assignmentType === "task"
              ? task.points === 100
                ? "百分制"
                : "自定义总分"
              : defaultHundredPoints
                ? "默认百分制"
                : "自定义总分"}{" "}
            · 已选 {effectiveClassroomIds.filter(Boolean).length} 个班级
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="h-10 rounded-lg border px-4 text-sm disabled:opacity-50"
              disabled={busy}
              type="submit"
            >
              {submittingAction === "save" ? "保存中…" : "保存草稿"}
            </button>
            <button
              className="h-10 rounded-lg bg-sky-700 px-4 text-sm text-white disabled:opacity-50"
              disabled={busy}
              onClick={form.handleSubmit((v) => persist(v, true))}
              type="button"
            >
              {submittingAction === "publish"
                ? "发布中…"
                : mode === "create" && selectedClassroomIds.length > 1
                  ? `发布到${selectedClassroomIds.length}个班级`
                  : "发布作业"}
            </button>
          </div>
        </div>
      </fieldset>
      <EditorDialog
        open={Boolean(confirmation)}
        title="确认发布作业"
        busy={busy}
        onClose={() => setConfirmation(null)}
      >
        {confirmation ? (
          <>
            <dl className="mt-4 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
              <dt className="text-slate-500">作业名称</dt>
              <dd className="break-words">{confirmation.input.title}</dd>
              <dt className="text-slate-500">课程</dt>
              <dd className="break-words">{confirmation.courseLabel}</dd>
              <dt className="text-slate-500">发布班级</dt>
              <dd>
                <ul className="max-h-32 space-y-1 overflow-y-auto">
                  {confirmation.classroomNames.map((name, i) => (
                    <li
                      className="break-words"
                      key={confirmation.classroomIds[i]}
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              </dd>
              <dt className="text-slate-500">开放方式</dt>
              <dd>
                {confirmation.input.publishedAt &&
                confirmation.input.publishedAt.getTime() > Date.now()
                  ? "预约开放"
                  : "确认后立即开放"}
              </dd>
              <dt className="text-slate-500">发布时间</dt>
              <dd>{confirmation.input.publishedAt?.toLocaleString("zh-CN")}</dd>
              <dt className="text-slate-500">截止时间</dt>
              <dd>{confirmation.input.dueAt?.toLocaleString("zh-CN")}</dd>
              <dt className="text-slate-500">作业内容</dt>
              <dd>
                {confirmation.input.submissionTask
                  ? `直接任务 · ${confirmation.resourceNames.length}个教师附件`
                  : `题库组卷 · ${confirmation.input.questions.length}道题`}
              </dd>
              <dt className="text-slate-500">总分</dt>
              <dd>
                {confirmation.input.submissionTask?.points ??
                  Math.round(
                    confirmation.input.questions.reduce(
                      (sum, q) => sum + q.points,
                      0,
                    ) * 100,
                  ) / 100}{" "}
                分 · {confirmation.scoreMode}
              </dd>
              <dt className="text-slate-500">重复提交</dt>
              <dd>
                {confirmation.input.allowResubmission
                  ? "允许截止前重复提交"
                  : "仅允许提交一次"}
              </dd>
            </dl>
            {confirmation.resourceNames.length ? (
              <ul className="mt-3 space-y-1 rounded-lg bg-slate-50 p-3 text-xs">
                {confirmation.resourceNames.map((name, index) => (
                  <li className="break-all" key={index}>
                    {name}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-4 rounded-lg bg-sky-50 p-3 text-xs leading-6 text-sky-900">
              发布后题目、题序、分值和教师附件冻结，各班独立记录提交及成绩。
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="h-10 rounded-lg border px-4 text-sm"
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                返回修改
              </button>
              <button
                type="button"
                className="h-10 rounded-lg bg-sky-700 px-4 text-sm text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => void execute(confirmation)}
              >
                {busy
                  ? "发布中…"
                  : `确认发布到${confirmation.classroomIds.length}个班级`}
              </button>
            </div>
          </>
        ) : null}
      </EditorDialog>
      <EditorDialog
        open={Boolean(switchTarget)}
        title="确认切换课程范围"
        onClose={() => setSwitchTarget(null)}
      >
        <p className="mt-4 text-sm leading-7">
          将移除 {switchImpact?.removedCount ?? 0} 道不适用题目，并解除{" "}
          {switchImpact?.removedAttachments ?? 0}{" "}
          个课程附件引用。已上传文件保留，不会被删除。
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            className="h-10 rounded-lg border px-4 text-sm"
            onClick={() => setSwitchTarget(null)}
          >
            取消切换
          </button>
          <button
            type="button"
            className="h-10 rounded-lg bg-sky-700 px-4 text-sm text-white"
            onClick={() => {
              if (switchTarget) applyCourseChange(switchTarget);
            }}
          >
            确认切换
          </button>
        </div>
      </EditorDialog>
    </form>
  );
}
