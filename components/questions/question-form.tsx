"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { QuestionType, QuestionVisibility } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";

import { requestQuestionApi } from "@/components/questions/request-api";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import {
  questionUpsertSchema,
  type QuestionUpsertData,
} from "@/services/questions/schemas";
import type {
  KnowledgePointOption,
  QuestionDetail,
} from "@/services/questions/types";

interface QuestionFormProps {
  mode: "create" | "edit";
  knowledgePoints: KnowledgePointOption[];
  question?: QuestionDetail;
}

function emptyQuestion(): QuestionUpsertData {
  return {
    title: "",
    content: "",
    type: QuestionType.SINGLE_CHOICE,
    difficulty: 3,
    options: [
      { label: "A", content: "", sortOrder: 1 },
      { label: "B", content: "", sortOrder: 2 },
    ],
    answer: { kind: "CHOICE", correctOptionLabels: ["A"] },
    explanation: "",
    knowledgePointIds: [],
    tags: [],
    visibility: QuestionVisibility.PRIVATE,
  };
}

function initialQuestion(question?: QuestionDetail): QuestionUpsertData {
  if (!question) {
    return emptyQuestion();
  }
  return {
    title: question.title,
    content: question.content,
    type: question.type,
    difficulty: question.difficulty,
    options: question.options.map(({ label, content, sortOrder }) => ({
      label,
      content,
      sortOrder,
    })),
    answer: question.answer,
    explanation: question.explanation,
    knowledgePointIds: question.knowledgePoints.map(({ id }) => id),
    tags: question.tags,
    visibility: QuestionVisibility.PRIVATE,
  };
}

export function QuestionForm({
  mode,
  knowledgePoints,
  question,
}: QuestionFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<QuestionUpsertData>({
    resolver: zodResolver(questionUpsertSchema),
    defaultValues: initialQuestion(question),
  });
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "options",
  });
  const type = form.watch("type");
  const answer = form.watch("answer");
  const tags = form.watch("tags");
  const selectedKnowledgePoints = form.watch("knowledgePointIds");
  const isChoice =
    type === QuestionType.SINGLE_CHOICE ||
    type === QuestionType.MULTIPLE_CHOICE;

  function changeType(nextType: QuestionType) {
    form.setValue("type", nextType, { shouldValidate: true });
    if (
      nextType === QuestionType.SINGLE_CHOICE ||
      nextType === QuestionType.MULTIPLE_CHOICE
    ) {
      if (fields.length < 2) {
        replace([
          { label: "A", content: "", sortOrder: 1 },
          { label: "B", content: "", sortOrder: 2 },
        ]);
      }
      form.setValue("answer", {
        kind: "CHOICE",
        correctOptionLabels:
          nextType === QuestionType.SINGLE_CHOICE ? ["A"] : ["A", "B"],
      });
      return;
    }
    replace([]);
    if (nextType === QuestionType.TRUE_FALSE) {
      form.setValue("answer", { kind: "BOOLEAN", value: true });
    } else if (nextType === QuestionType.FILL_BLANK) {
      form.setValue("answer", {
        kind: "TEXT",
        acceptableAnswers: [""],
        caseSensitive: false,
      });
    } else if (nextType === QuestionType.PYTHON_PROGRAMMING) {
      form.setValue("answer", { kind: "PROGRAMMING" });
    } else {
      form.setValue("answer", { kind: "REFERENCE", value: "" });
    }
  }

  function toggleCorrectLabel(label: string, checked: boolean) {
    const current = answer.kind === "CHOICE" ? answer.correctOptionLabels : [];
    const labels =
      type === QuestionType.SINGLE_CHOICE
        ? [label]
        : checked
          ? [...new Set([...current, label])]
          : current.filter((value) => value !== label);
    form.setValue(
      "answer",
      { kind: "CHOICE", correctOptionLabels: labels },
      { shouldValidate: true },
    );
  }

  function toggleKnowledgePoint(id: string, checked: boolean) {
    form.setValue(
      "knowledgePointIds",
      checked
        ? [...new Set([...selectedKnowledgePoints, id])]
        : selectedKnowledgePoints.filter((value) => value !== id),
      { shouldValidate: true },
    );
  }

  async function submit(input: QuestionUpsertData) {
    setServerError(null);
    const endpoint =
      mode === "create"
        ? "/api/teacher/questions"
        : `/api/teacher/questions/${question?.id}`;
    const result = await requestQuestionApi<QuestionDetail>(endpoint, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    router.push(`/teacher/questions/${result.data.id}`);
    router.refresh();
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(submit)}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium">题目标题</span>
          <input
            className="w-full rounded-md border px-3 py-2"
            {...form.register("title")}
          />
          {form.formState.errors.title?.message ? (
            <p className="text-sm text-red-600">
              {form.formState.errors.title.message}
            </p>
          ) : null}
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium">题干</span>
          <textarea
            className="min-h-28 w-full rounded-md border px-3 py-2"
            {...form.register("content")}
          />
          {form.formState.errors.content?.message ? (
            <p className="text-sm text-red-600">
              {form.formState.errors.content.message}
            </p>
          ) : null}
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">题型</span>
          <select
            className="w-full rounded-md border px-3 py-2"
            value={type}
            onChange={(event) => changeType(event.target.value as QuestionType)}
          >
            {Object.values(QuestionType).map((value) => (
              <option key={value} value={value}>
                {QUESTION_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">难度（1–5）</span>
          <select
            className="w-full rounded-md border px-3 py-2"
            {...form.register("difficulty", { valueAsNumber: true })}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isChoice ? (
        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-2 font-medium">选项与正确答案</legend>
          {fields.map((field, index) => {
            const label = String.fromCharCode(65 + index);
            const checked =
              answer.kind === "CHOICE" &&
              answer.correctOptionLabels.includes(label);
            return (
              <div className="flex items-center gap-3" key={field.id}>
                <input
                  type={
                    type === QuestionType.SINGLE_CHOICE ? "radio" : "checkbox"
                  }
                  name="correct-option"
                  checked={checked}
                  onChange={(event) =>
                    toggleCorrectLabel(label, event.target.checked)
                  }
                />
                <span className="w-6 font-medium">{label}</span>
                <input
                  type="hidden"
                  {...form.register(`options.${index}.label`)}
                  value={label}
                />
                <input
                  type="hidden"
                  {...form.register(`options.${index}.sortOrder`, {
                    valueAsNumber: true,
                  })}
                  value={index + 1}
                />
                <input
                  className="flex-1 rounded-md border px-3 py-2"
                  placeholder={`选项 ${label}`}
                  {...form.register(`options.${index}.content`)}
                />
                {fields.length > 2 ? (
                  <button
                    className="text-sm text-red-600"
                    type="button"
                    onClick={() => remove(index)}
                  >
                    移除
                  </button>
                ) : null}
              </div>
            );
          })}
          {fields.length < 8 ? (
            <button
              className="rounded-md border px-3 py-2 text-sm"
              type="button"
              onClick={() => {
                const index = fields.length;
                append({
                  label: String.fromCharCode(65 + index),
                  content: "",
                  sortOrder: index + 1,
                });
              }}
            >
              添加选项
            </button>
          ) : null}
        </fieldset>
      ) : null}

      {type === QuestionType.TRUE_FALSE && answer.kind === "BOOLEAN" ? (
        <fieldset className="space-y-2 rounded-lg border p-4">
          <legend className="px-2 font-medium">标准答案</legend>
          <label className="mr-6">
            <input
              className="mr-2"
              type="radio"
              checked={answer.value}
              onChange={() =>
                form.setValue("answer", { kind: "BOOLEAN", value: true })
              }
            />
            正确
          </label>
          <label>
            <input
              className="mr-2"
              type="radio"
              checked={!answer.value}
              onChange={() =>
                form.setValue("answer", { kind: "BOOLEAN", value: false })
              }
            />
            错误
          </label>
        </fieldset>
      ) : null}

      {type === QuestionType.FILL_BLANK && answer.kind === "TEXT" ? (
        <div className="space-y-3 rounded-lg border p-4">
          <label className="block space-y-2">
            <span className="font-medium">可接受答案（每行一个）</span>
            <textarea
              className="min-h-28 w-full rounded-md border px-3 py-2"
              value={answer.acceptableAnswers.join("\n")}
              onChange={(event) =>
                form.setValue(
                  "answer",
                  {
                    ...answer,
                    acceptableAnswers: event.target.value.split("\n"),
                  },
                  { shouldValidate: true },
                )
              }
            />
          </label>
          <label>
            <input
              className="mr-2"
              type="checkbox"
              checked={answer.caseSensitive}
              onChange={(event) =>
                form.setValue("answer", {
                  ...answer,
                  caseSensitive: event.target.checked,
                })
              }
            />
            区分大小写
          </label>
        </div>
      ) : null}

      {type === QuestionType.SHORT_ANSWER && answer.kind === "REFERENCE" ? (
        <label className="block space-y-2">
          <span className="font-medium">参考答案</span>
          <textarea
            className="min-h-32 w-full rounded-md border px-3 py-2"
            value={answer.value}
            onChange={(event) =>
              form.setValue(
                "answer",
                { kind: "REFERENCE", value: event.target.value },
                { shouldValidate: true },
              )
            }
          />
        </label>
      ) : null}

      {type === QuestionType.PYTHON_PROGRAMMING &&
      answer.kind === "PROGRAMMING" ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          保存题目基本信息后，请在编辑页继续维护标准代码、初始代码、公开样例、隐藏用例和资源限制。判题配置每次保存都会生成不可变修订。
        </div>
      ) : null}

      <label className="block space-y-2">
        <span className="font-medium">答案解析</span>
        <textarea
          className="min-h-28 w-full rounded-md border px-3 py-2"
          {...form.register("explanation")}
        />
        {form.formState.errors.explanation?.message ? (
          <p className="text-sm text-red-600">
            {form.formState.errors.explanation.message}
          </p>
        ) : null}
      </label>

      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-2 font-medium">知识点</legend>
        {knowledgePoints.length === 0 ? (
          <p className="text-muted-foreground text-sm">暂无可用知识点。</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {knowledgePoints.map((item) => (
              <label className="flex items-center gap-2" key={item.id}>
                <input
                  type="checkbox"
                  checked={selectedKnowledgePoints.includes(item.id)}
                  onChange={(event) =>
                    toggleKnowledgePoint(item.id, event.target.checked)
                  }
                />
                <span>
                  {item.name}{" "}
                  <span className="text-muted-foreground text-xs">
                    {item.code}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
        {form.formState.errors.knowledgePointIds?.message ? (
          <p className="text-sm text-red-600">
            {form.formState.errors.knowledgePointIds.message}
          </p>
        ) : null}
      </fieldset>

      <div>
        <label className="space-y-2">
          <span className="text-sm font-medium">标签（逗号分隔）</span>
          <input
            className="w-full rounded-md border px-3 py-2"
            value={tags.join(", ")}
            onChange={(event) =>
              form.setValue(
                "tags",
                event.target.value
                  .split(/[,，]/)
                  .map((tag) => tag.trim())
                  .filter(Boolean),
                { shouldValidate: true },
              )
            }
          />
        </label>
      </div>

      {serverError ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {serverError}
        </p>
      ) : null}
      <div className="flex gap-3">
        <button
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
          disabled={form.formState.isSubmitting}
          type="submit"
        >
          {form.formState.isSubmitting
            ? "保存中…"
            : mode === "create"
              ? "创建题目"
              : "保存修改"}
        </button>
        <button
          className="rounded-md border px-4 py-2"
          type="button"
          onClick={() => router.back()}
        >
          取消
        </button>
      </div>
    </form>
  );
}
