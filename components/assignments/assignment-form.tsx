"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { QuestionType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { requestAssignmentApi } from "@/components/assignments/request-api";
import { assignmentUpsertSchema } from "@/services/assignments/schemas";
import type { TeacherAssignmentView } from "@/services/assignments/types";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";

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
  type: QuestionType;
  difficulty: number;
  isOwned: boolean;
}

interface SelectedQuestion extends EditorQuestion {
  points: number;
}

interface AssignmentFormProps {
  mode: "create" | "edit";
  classrooms: Array<{ id: string; name: string }>;
  questions: EditorQuestion[];
  assignment?: TeacherAssignmentView;
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
  assignment,
}: AssignmentFormProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedQuestion[]>(() =>
    (assignment?.questions ?? []).flatMap((item) => {
      const source = questions.find(
        (question) => question.id === item.questionId,
      );
      return source ? [{ ...source, points: item.points }] : [];
    }),
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<
    "save" | "publish" | null
  >(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: assignment?.title ?? "",
      description: assignment?.description ?? "",
      classroomId: assignment?.classroom.id ?? classrooms[0]?.id ?? "",
      publishedAt: datetimeLocal(assignment?.publishedAt),
      dueAt: datetimeLocal(assignment?.dueAt),
      allowResubmission: assignment?.allowResubmission ?? false,
    },
  });

  function addQuestion(question: EditorQuestion) {
    if (selected.some((item) => item.id === question.id)) return;
    setSelected((items) => [...items, { ...question, points: 10 }]);
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selected.length) return;
    setSelected((items) => {
      const copy = [...items];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  }

  async function persist(values: FormValues, publish: boolean) {
    setServerError(null);
    setSubmittingAction(publish ? "publish" : "save");
    const parsed = assignmentUpsertSchema.safeParse({
      ...values,
      publishedAt: new Date(values.publishedAt),
      dueAt: new Date(values.dueAt),
      questions: selected.map((question, index) => ({
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

    const response = await requestAssignmentApi<TeacherAssignmentView>(
      mode === "create"
        ? "/api/teacher/assignments"
        : `/api/teacher/assignments/${assignment?.id}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
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
        if (mode === "create") {
          router.replace(`/teacher/assignments/${response.data.id}/edit`);
        }
        return;
      }
    }

    router.push("/teacher/assignments");
    router.refresh();
  }

  const busy = submittingAction !== null;
  return (
    <form
      className="space-y-6"
      onSubmit={form.handleSubmit((v) => persist(v, false))}
    >
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
        <label className="space-y-1 text-sm">
          <span className="font-medium">发布班级</span>
          <select
            className="w-full rounded-md border px-3 py-2"
            {...form.register("classroomId")}
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
        <label className="space-y-1 text-sm md:col-span-2">
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

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">从题库选择题目</h2>
          <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto">
            {questions.length === 0 ? (
              <p className="text-sm text-gray-500">暂无可用题目。</p>
            ) : (
              questions.map((question) => {
                const added = selected.some((item) => item.id === question.id);
                return (
                  <div
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                    key={question.id}
                  >
                    <div>
                      <p className="text-sm font-medium">{question.title}</p>
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
        </section>

        <section className="rounded-xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">作业题目与顺序</h2>
            <span className="text-sm text-gray-500">
              总分 {selected.reduce((sum, item) => sum + item.points, 0)}
            </span>
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
                        onChange={(event) =>
                          setSelected((items) =>
                            items.map((item) =>
                              item.id === question.id
                                ? {
                                    ...item,
                                    points: Number(event.target.value),
                                  }
                                : item,
                            ),
                          )
                        }
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
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
          disabled={busy}
          onClick={form.handleSubmit((v) => persist(v, true))}
          type="button"
        >
          {submittingAction === "publish" ? "发布中…" : "发布作业"}
        </button>
      </div>
    </form>
  );
}
