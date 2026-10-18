"use client";
import { editQuestionKnowledgeTag } from "@/services/questions/knowledge-tags";

import { zodResolver } from "@hookform/resolvers/zod";
import { QuestionType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  defaultAnswerDraft,
  removeChoiceOption,
  questionValidationMessages,
  type QuestionAnswerDraft,
} from "@/services/questions/form-draft";
import { useFieldArray, useForm } from "react-hook-form";

import { requestQuestionApi } from "@/components/questions/request-api";
import {
  QUESTION_TYPE_DESCRIPTIONS,
  QUESTION_TYPE_GROUPS,
  QUESTION_TYPE_LABELS,
} from "@/services/questions/constants";
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
  categories: Array<{ id: string; name: string }>;
  knowledgePoints: KnowledgePointOption[];
  question?: QuestionDetail;
}

function emptyQuestion(categoryId: string): QuestionUpsertData {
  return {
    title: "",
    content: "",
    type: QuestionType.SINGLE_CHOICE,
    difficulty: 3,
    questionCategoryId: categoryId,
    ...defaultAnswerDraft(QuestionType.SINGLE_CHOICE),
    explanation: "",
    knowledgePointIds: [],
    tags: [],
  };
}

function initialQuestion(
  question: QuestionDetail | undefined,
  categories: Array<{ id: string; name: string }>,
): QuestionUpsertData {
  if (!question) {
    return emptyQuestion(categories[0]?.id ?? "");
  }
  return {
    title: question.title,
    content: question.content,
    type: question.type,
    difficulty: question.difficulty,
    questionCategoryId: question.questionCategoryId ?? "",
    revision: question.revision,
    options: question.options.map(({ label, content, sortOrder }) => ({
      label,
      content,
      sortOrder,
    })),
    answer: question.answer,
    explanation: question.explanation,
    knowledgePointIds: question.knowledgePoints.map(({ id }) => id),
    tags: question.tags,
  };
}

export function QuestionForm({
  mode,
  categories,
  knowledgePoints,
  question,
}: QuestionFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [editingTag, setEditingTag] = useState<number | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const form = useForm<QuestionUpsertData>({
    resolver: zodResolver(questionUpsertSchema),
    defaultValues: initialQuestion(question, categories),
  });
  const { fields, append, replace } = useFieldArray({
    control: form.control,
    name: "options",
  });
  const answerDrafts = useRef<
    Partial<Record<QuestionType, QuestionAnswerDraft>>
  >({});
  const validationRef = useRef<HTMLDivElement>(null);
  const type = form.watch("type");
  const validationMessages = questionValidationMessages(form.formState.errors);
  const answer = form.watch("answer");
  const tags = form.watch("tags");
  const selectedKnowledgePoints = form.watch("knowledgePointIds");
  function saveKnowledgeTag() {
    const result = editQuestionKnowledgeTag(
      form.getValues("tags"),
      tagDraft,
      editingTag,
    );
    if (result.error) {
      setTagError(result.error);
      return false;
    }
    if (!result.tags) return false;
    form.setValue("tags", result.tags, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setTagDraft("");
    setEditingTag(null);
    setTagError(null);
    return true;
  }
  const isChoice =
    type === QuestionType.SINGLE_CHOICE ||
    type === QuestionType.MULTIPLE_CHOICE;

  function changeType(nextType: QuestionType) {
    if (nextType === type) return;
    answerDrafts.current[type] = structuredClone({
      options: form.getValues("options"),
      answer: form.getValues("answer"),
    });
    const next = answerDrafts.current[nextType] ?? defaultAnswerDraft(nextType);
    form.clearErrors();
    form.setValue("type", nextType, { shouldDirty: true });
    replace(next.options);
    form.setValue("answer", next.answer, { shouldDirty: true });
  }

  function removeOption(index: number) {
    const next = removeChoiceOption(
      { options: form.getValues("options"), answer: form.getValues("answer") },
      index,
    );
    replace(next.options);
    form.setValue("answer", next.answer, {
      shouldDirty: true,
      shouldValidate: true,
    });
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
      body: JSON.stringify({
        ...input,
        ...(mode === "edit" && question ? { revision: question.revision } : {}),
      }),
    });
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    router.push(
      input.type === QuestionType.PYTHON_PROGRAMMING && mode === "create"
        ? `/teacher/questions/${result.data.id}/edit#programming-config`
        : `/teacher/questions/${result.data.id}`,
    );
    router.refresh();
  }

  return (
    <form
      className="space-y-5 rounded-2xl border bg-white p-4 shadow-sm sm:p-6"
      onSubmit={(event) => {
        if (tagDraft.trim() && !saveKnowledgeTag()) {
          event.preventDefault();
          return;
        }
        void form.handleSubmit(submit, () => {
          requestAnimationFrame(() => validationRef.current?.focus());
        })(event);
      }}
    >
      <fieldset disabled={form.formState.isSubmitting} className="space-y-3">
        <legend className="text-base font-semibold">1. 选择题型</legend>
        <p className="text-xs text-slate-500">
          六类题型均可创建；切换题型会保留本次填写的答案草稿。
        </p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {QUESTION_TYPE_GROUPS.flatMap((group) => group.types).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={type === value}
              onClick={() => changeType(value)}
              className={`rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-sky-600 ${type === value ? "border-sky-500 bg-sky-50 text-sky-800 ring-1 ring-sky-500" : "border-slate-200 hover:border-sky-300 hover:bg-slate-50"}`}
            >
              <span className="block text-sm font-semibold">
                {QUESTION_TYPE_LABELS[value]}
                {type === value ? " ✓" : ""}
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                {value === "PYTHON_PROGRAMMING"
                  ? "Python · 样例与隐藏用例判题"
                  : value === "SHORT_ANSWER"
                    ? "参考答案与评分要点 · 人工批改"
                    : "标准答案 · 自动判分"}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      {validationMessages.length ? (
        <div
          ref={validationRef}
          tabIndex={-1}
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <p className="font-medium">请完善以下内容后保存：</p>
          <ul className="mt-1 list-inside list-disc">
            {validationMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <h2 className="border-t pt-4 text-base font-semibold">
        2. 题目内容与答案
      </h2>
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
          <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800">
            {QUESTION_TYPE_LABELS[type]}
          </p>
          <p
            id="question-type-description"
            className="text-xs leading-5 text-gray-500"
          >
            {QUESTION_TYPE_DESCRIPTIONS[type]}
          </p>
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

      <label className="block space-y-2">
        <span className="font-medium">课程分类</span>
        <select
          className="w-full rounded-md border px-3 py-2"
          {...form.register("questionCategoryId")}
        >
          <option value="">请选择课程分类</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {form.formState.errors.questionCategoryId?.message ? (
          <p className="text-sm text-red-600">
            {form.formState.errors.questionCategoryId.message}
          </p>
        ) : null}
        {categories.length === 0 ? (
          <p className="text-sm text-amber-700">
            暂无可用课程分类，请联系管理员维护目录。
          </p>
        ) : null}
      </label>

      {isChoice ? (
        <fieldset className="space-y-3 rounded-lg border p-4">
          <legend className="px-2 font-medium">选项与正确答案</legend>
          <p className="text-xs text-slate-500">
            {type === QuestionType.SINGLE_CHOICE
              ? "勾选一个正确答案。"
              : "至少勾选两个正确答案，全部选对才计为正确。"}{" "}
            支持 2–20 个选项。
          </p>
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
                  aria-label={`将选项 ${label} 设为正确答案`}
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
                <textarea
                  rows={2}
                  className="min-w-0 flex-1 rounded-md border px-3 py-2"
                  placeholder={`选项 ${label}`}
                  {...form.register(`options.${index}.content`)}
                />
                {fields.length > 2 ? (
                  <button
                    className="text-sm text-red-600"
                    type="button"
                    onClick={() => removeOption(index)}
                  >
                    移除
                  </button>
                ) : null}
              </div>
            );
          })}
          {fields.length < 20 ? (
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
            <p className="text-xs text-slate-500">
              每行是同一道填空题的等价答案，不代表多个独立空格。最多 20 个答案。
            </p>
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
            placeholder="填写参考答案与评分要点，例如数学解题步骤、英语写作要点或代码分析过程。"
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
          <p className="mt-2">
            当前自动判题执行语言为 Python。C、Java
            等课程的代码分析题可使用简答与解答题，填写参考答案后人工批改。
          </p>
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
        <legend className="px-2 font-medium">自定义知识点与标签</legend>
        <p className="text-sm text-gray-500">
          直接填写本题考查的知识点，可随时修改。最多 10 个，每个最多 30 字。
        </p>
        <div className="flex gap-2">
          <input
            aria-label="自定义知识点名称"
            className="min-w-0 flex-1 rounded-md border px-3 py-2"
            placeholder="例如：列表切片、异常处理、函数参数"
            value={tagDraft}
            maxLength={30}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveKnowledgeTag();
              }
            }}
          />
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sky-700"
            onClick={saveKnowledgeTag}
          >
            {editingTag === null ? "添加知识点" : "保存知识点"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, index) => (
            <span
              key={`${tag}-${index}`}
              className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-sm text-sky-800"
            >
              <button
                type="button"
                title="点击编辑"
                aria-label={`编辑知识点 ${tag}`}
                onClick={() => {
                  setTagDraft(tag);
                  setEditingTag(index);
                  setTagError(null);
                }}
              >
                {tag}
              </button>
              <button
                type="button"
                aria-label={`删除知识点 ${tag}`}
                onClick={() => {
                  form.setValue(
                    "tags",
                    tags.filter((_, i) => i !== index),
                    { shouldValidate: true, shouldDirty: true },
                  );
                  setEditingTag(null);
                  setTagDraft("");
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {tagError || form.formState.errors.tags?.message ? (
          <p role="alert" className="text-sm text-red-600">
            {tagError ?? form.formState.errors.tags?.message}
          </p>
        ) : null}
        <p className="text-xs text-gray-500">
          正式课程知识点用于画像与推荐，可在课程知识图谱中新增、编辑并审核发布；保存题目后再确认课程关联。
        </p>
      </fieldset>
      <details className="space-y-3 rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          已有题库分类（可选）
        </summary>
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
      </details>

      {serverError ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {serverError}
        </p>
      ) : null}
      <div className="flex gap-3">
        <button
          className="rounded-md bg-sky-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={form.formState.isSubmitting}
          type="submit"
        >
          {form.formState.isSubmitting
            ? "保存中…"
            : mode === "create"
              ? type === QuestionType.PYTHON_PROGRAMMING
                ? "保存并配置判题 →"
                : "创建题目"
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
