"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { QuestionType } from "@prisma/client";
import { ListOrdered } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { requestAssignmentApi } from "@/components/assignments/request-api";
import { markTeacherWorkspaceDirty } from "@/components/dashboard/teacher-workspace-refresh";
import {
  distributeAssignmentPoints,
  selectAssignmentQuestions,
} from "@/services/assignments/editor-helpers";
import { assignmentUpsertSchema } from "@/services/assignments/schemas";
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
  isOwned: boolean;
  graphBindings?: Array<{ courseId: string; conceptId: string }>;
}

interface SelectedQuestion extends EditorQuestion {
  points: number;
}

interface AssignmentFormProps {
  mode: "create" | "edit";
  classrooms: Array<{ id: string; name: string; courseId?: string | null }>;
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
  assignment,
  defaultDueDays = 7,
}: AssignmentFormProps) {
  const router = useRouter();
  const initialClassroom = assignment?.classroom.id ?? classrooms[0]?.id ?? "";
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
  const [filterCourse, setFilterCourse] = useState(() =>
    courseForClassroom(assignment?.classroom.id ?? classrooms[0]?.id ?? ""),
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
            isOwned: true,
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
      classroomId: assignment?.classroom.id ?? classrooms[0]?.id ?? "",
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
      setDefaultHundredPoints(false);
      const points = distributeAssignmentPoints(selected.length, targetPoints);
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
  async function persist(values: FormValues, publish: boolean) {
    if (
      publish &&
      !window.confirm(
        `确认向${mode === "create" ? selectedClassroomIds.length : 1}个班级发布？发布后题目、分值及教师附件冻结，各班分别记录提交和成绩。`,
      )
    )
      return;

    setServerError(null);
    setSubmittingAction(publish ? "publish" : "save");
    const parsed = assignmentUpsertSchema.safeParse({
      ...values,
      publishedAt: new Date(values.publishedAt),
      dueAt: new Date(values.dueAt),
      allowAttachments: assignmentType === "task" && allowAttachments,
      submissionTask:
        assignmentType === "task"
          ? { ...task, resourceFileIds: resourceFiles.map((file) => file.id) }
          : undefined,
      questions: (assignmentType === "task"
        ? []
        : autoOrganize
          ? organizeAssignmentQuestions(selected)
          : selected
      ).map((question, index) => ({
        questionId: question.id,
        sortOrder: index + 1,
        points: question.points,
      })),
    });
    if (!parsed.success) {
      setServerError(parsed.error.issues[0]?.message ?? "请检查作业信息");
      setSubmittingAction(null);
      return;
    }

    if (mode === "create") {
      const signature = JSON.stringify({
        assignment: parsed.data,
        classroomIds: [...selectedClassroomIds].sort(),
        publish,
      });
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
          classroomIds: selectedClassroomIds,
          publish,
          assignment: parsed.data,
        }),
      });
      if (!response.success) {
        setServerError(response.error);
        setSubmittingAction(null);
        return;
      }
      markTeacherWorkspaceDirty();
      router.push(
        publishCourseId
          ? `/teacher/assignments?courseId=${publishCourseId}`
          : "/teacher/assignments",
      );
      router.refresh();
      return;
    }
    const response = await requestAssignmentApi<TeacherAssignmentView>(
      `/api/teacher/assignments/${assignment?.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      },
    );
    if (!response.success) {
      setServerError(response.error);
      setSubmittingAction(null);
      return;
    }

    if (publish) {
      const published = await requestAssignmentApi<TeacherAssignmentView>(
        `/api/teacher/assignments/${response.data.id}/publish`,
        { method: "POST" },
      );
      if (!published.success) {
        setServerError(`草稿已保存，但发布失败：${published.error}`);
        setSubmittingAction(null);
        return;
      }
    }

    markTeacherWorkspaceDirty();
    router.push("/teacher/assignments");
    router.refresh();
  }

  const busy = submittingAction !== null || uploading !== null;
  return (
    <form
      className="space-y-6"
      onSubmit={form.handleSubmit((v) => persist(v, false))}
    >
      <fieldset disabled={busy} className="min-w-0 space-y-6">
        <div className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">作业名称</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              {...form.register("title")}
            />
            <span className="text-red-600">
              {form.formState.errors.title?.message}
            </span>
          </label>
          {mode === "create" ? (
            <fieldset className="min-w-0 rounded-lg border border-slate-200 p-3 md:row-span-2">
              <legend className="px-1 text-sm font-medium">
                发布班级（可多选）
              </legend>
              <input type="hidden" {...form.register("classroomId")} />
              <select
                aria-label="发布所属课程"
                className="mb-2 w-full rounded-lg border px-2 py-2 text-sm"
                value={publishCourseId}
                onChange={(event) => {
                  const nextCourseId = event.target.value;
                  setPublishCourseId(nextCourseId);
                  const first =
                    classrooms.find(
                      (item) => (item.courseId ?? "") === nextCourseId,
                    )?.id ?? "";
                  setSelectedClassroomIds(first ? [first] : []);
                  form.setValue("classroomId", first, { shouldValidate: true });
                  setFilterCourse(courseForClassroom(first));
                  setFilterChapter("");
                  setFilterConcept("");
                  setPage(1);
                  if (resourceFiles.length) {
                    setResourceFiles([]);
                    setOrderFeedback(
                      "已切换课程，请重新上传本课程的教师附件。",
                    );
                  }
                }}
              >
                {[
                  ...new Set(classrooms.map((item) => item.courseId ?? "")),
                ].map((id) => (
                  <option key={id || "unassigned"} value={id}>
                    {courses.find(
                      (item) => item.id === id || item.courseIds?.includes(id),
                    )?.name ?? "未关联课程"}
                    {courses.find(
                      (item) => item.id === id || item.courseIds?.includes(id),
                    )?.term
                      ? ` · ${courses.find((item) => item.id === id || item.courseIds?.includes(id))?.term}`
                      : ""}
                  </option>
                ))}
              </select>
              <div className="grid max-h-36 gap-2 overflow-y-auto sm:grid-cols-2">
                {classrooms
                  .filter((item) => (item.courseId ?? "") === publishCourseId)
                  .map((item) => (
                    <label
                      key={item.id}
                      className="flex min-w-0 items-center gap-2 rounded-md border border-slate-100 px-2 py-2 text-xs"
                    >
                      <input
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
                      <span className="truncate" title={item.name}>
                        {item.name}
                      </span>
                    </label>
                  ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                已选{selectedClassroomIds.length}
                个班级；分别生成作业，各班独立批改和公布成绩。
              </p>
              <span className="text-xs text-red-600">
                {form.formState.errors.classroomId?.message}
              </span>
            </fieldset>
          ) : (
            <>
              {" "}
              <label className="space-y-1 text-sm">
                <span className="font-medium">发布班级</span>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  {...form.register("classroomId", {
                    onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
                      setFilterCourse(courseForClassroom(event.target.value));
                      setFilterChapter("");
                      setFilterConcept("");
                      setPage(1);
                    },
                  })}
                >
                  {classrooms.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name}
                    </option>
                  ))}
                </select>
                <span className="text-red-600">
                  {form.formState.errors.classroomId?.message}
                </span>
              </label>
            </>
          )}
          <label
            className={`space-y-1 text-sm ${mode === "create" ? "md:col-start-1 md:row-start-2" : "md:col-span-2"}`}
          >
            <span className="font-medium">作业说明</span>
            <textarea
              className="min-h-24 w-full rounded-md border px-3 py-2"
              {...form.register("description")}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">发布时间</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              type="datetime-local"
              {...form.register("publishedAt")}
            />
            <span className="text-red-600">
              {form.formState.errors.publishedAt?.message}
            </span>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">截止时间</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              type="datetime-local"
              {...form.register("dueAt")}
            />
            <span className="text-red-600">
              {form.formState.errors.dueAt?.message}
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" {...form.register("allowResubmission")} />
            允许学生在截止时间前重复提交（每次结果独立保留）
          </label>
        </div>

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
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border bg-white p-5">
              <h2 className="font-semibold">从题库选择题目</h2>
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
                  className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-700"
                  onClick={autoPickQuestions}
                >
                  一键出题（题库组卷）
                </button>
                <p className="w-full text-xs leading-5 text-slate-500">
                  按下方筛选条件从可用题库中随机加入未选题；请核对后发布。
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
              <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto">
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
                          className="flex items-center justify-between gap-3 rounded-md border p-3"
                          key={question.id}
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {question.title}
                            </p>
                            <p className="text-xs text-gray-500">
                              {QUESTION_TYPE_LABELS[question.type]} · 难度{" "}
                              {question.difficulty} ·{" "}
                              {question.isOwned ? "我的题目" : "公共题目"}
                            </p>
                          </div>
                          <button
                            className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
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

            <section className="rounded-xl border bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">作业题目与顺序</h2>
                <span className="text-sm text-gray-500">
                  {selected.length} 道题 · 总分{" "}
                  {Math.round(
                    selected.reduce((sum, item) => sum + item.points, 0) * 100,
                  ) / 100}
                </span>
              </div>
              <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-600">
                <input
                  type="checkbox"
                  className="mt-1 accent-sky-600"
                  checked={defaultHundredPoints}
                  onChange={(event) =>
                    setDefaultHundredPoints(event.target.checked)
                  }
                />
                默认总分100分：增减题目时自动均分。修改单题分值或整理其他总分后，切换为自定义分值。
              </label>
              <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/60 p-3">
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
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-800 transition hover:bg-sky-100 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none disabled:opacity-50"
                  >
                    <ListOrdered aria-hidden="true" className="size-4" />
                    一键整理题序
                  </button>
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
                    className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs text-sky-700 disabled:opacity-50"
                  >
                    一键整理分值
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {ASSIGNMENT_QUESTION_ORDER_LABEL}
                  。同类题保持原顺序，使用上移、下移后切换为手动排列。
                </p>
                {orderFeedback ? (
                  <p
                    role="status"
                    className="mt-2 text-xs leading-5 text-sky-800"
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
                <div className="mt-4 space-y-3">
                  {selected.map((question, index) => (
                    <div className="rounded-md border p-3" key={question.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">
                            {index + 1}. {question.title}
                          </p>
                          <p className="text-xs text-gray-500">
                            {QUESTION_TYPE_LABELS[question.type]}
                          </p>
                        </div>
                        <button
                          className="text-sm text-red-600"
                          onClick={() =>
                            setSelected((items) =>
                              items.filter((item) => item.id !== question.id),
                            )
                          }
                          type="button"
                        >
                          移除
                        </button>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <button
                          className="rounded border px-2 py-1 disabled:opacity-40"
                          disabled={index === 0}
                          onClick={() => moveQuestion(index, -1)}
                          type="button"
                        >
                          上移
                        </button>
                        <button
                          className="rounded border px-2 py-1 disabled:opacity-40"
                          disabled={index === selected.length - 1}
                          onClick={() => moveQuestion(index, 1)}
                          type="button"
                        >
                          下移
                        </button>
                        <label className="ml-auto flex items-center gap-2">
                          分值
                          <input
                            className="w-20 rounded border px-2 py-1"
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

        {serverError ? (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {serverError}
          </p>
        ) : null}
        <div className="flex justify-end gap-3">
          <button
            className="rounded-md border px-4 py-2 disabled:opacity-50"
            disabled={busy}
            type="submit"
          >
            {submittingAction === "save" ? "保存中…" : "保存草稿"}
          </button>
          <button
            className="rounded-md bg-sky-600 px-4 py-2 text-white disabled:opacity-50"
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
      </fieldset>
    </form>
  );
}
