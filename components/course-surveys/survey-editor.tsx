"use client";

import {
  CourseSurveyDimension,
  CourseSurveyMode,
  CourseSurveyQuestionType,
  CourseSurveyStatus,
} from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestCourseSurveyApi } from "@/components/course-surveys/request";

interface EditorQuestion {
  id?: string;
  type: CourseSurveyQuestionType;
  dimension: CourseSurveyDimension;
  prompt: string;
  required: boolean;
  sortOrder: number;
  outcomeCode: string | null;
  outcomeTitle: string | null;
  sourceRefsJson: unknown;
}

interface SurveyEditorValue {
  id: string;
  title: string;
  description: string | null;
  instructions: string;
  status: CourseSurveyStatus;
  mode: CourseSurveyMode;
  opensAt: string | Date;
  dueAt: string | Date;
  version: number;
  questions: EditorQuestion[];
  _count: { participations: number; responses: number };
  summaryRevisions: Array<{
    revisionNumber: number;
    responseCount: number;
    eligibleCount: number;
    isSuppressed: boolean;
    statisticsJson: unknown;
    themesJson: unknown;
  }>;
}

function localInput(value: string | Date) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

const DIMENSION_LABELS: Record<CourseSurveyDimension, string> = {
  OUTCOME_SELF_ASSESSMENT: "课程目标自评",
  CONTENT: "教学内容",
  TEACHING_METHOD: "教学方法",
  ASSESSMENT: "考核方式",
  LEARNING_SUPPORT: "学习支持",
  PRACTICE: "实践能力",
  OPEN_FEEDBACK: "意见建议",
};

export function SurveyEditor({
  courseId,
  initialSurvey,
}: {
  courseId: string;
  initialSurvey: SurveyEditorValue;
}) {
  const router = useRouter();
  const [survey, setSurvey] = useState(initialSurvey);
  const [questions, setQuestions] = useState(initialSurvey.questions);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = survey.status === CourseSurveyStatus.DRAFT;

  function updateQuestion(index: number, patch: Partial<EditorQuestion>) {
    setQuestions((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  async function action(
    name: string,
    callback: () => Promise<SurveyEditorValue | unknown>,
  ) {
    setBusy(name);
    setError(null);
    setMessage(null);
    try {
      const result = await callback();
      if (
        result &&
        typeof result === "object" &&
        "id" in result &&
        "questions" in result
      ) {
        const next = result as SurveyEditorValue;
        setSurvey(next);
        setQuestions(next.questions);
      }
      setMessage(
        name === "save"
          ? "草稿已保存。"
          : name === "publish"
            ? "问卷已发布并通知目标班级。"
            : name === "close"
              ? "问卷已关闭并生成汇总。"
              : "汇总已更新。",
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败，请重试。");
    } finally {
      setBusy(null);
    }
  }

  const endpoint = `/api/teacher/courses/${courseId}/surveys/${survey.id}`;
  const statistics = survey.summaryRevisions[0]?.statisticsJson as
    | {
        responseRate?: number;
        overallMean?: number | null;
        outcomes?: Array<{ code: string; title: string; mean: number }>;
        dimensions?: Array<{ code: string; mean: number }>;
      }
    | undefined;
  const themes = survey.summaryRevisions[0]?.themesJson as
    { narrative?: string } | undefined;

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">问卷设置</h2>
            <p className="mt-1 text-sm text-gray-600">
              问卷明确不计入成绩；匿名模式下回答记录不保存学生标识。
            </p>
          </div>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm">
            {survey.status === "DRAFT"
              ? "草稿"
              : survey.status === "PUBLISHED"
                ? "已发布"
                : "已关闭"}
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm md:col-span-2">
            <span>名称</span>
            <input
              className="w-full rounded-md border px-3 py-2 disabled:bg-gray-50"
              disabled={!editable}
              value={survey.title}
              onChange={(event) =>
                setSurvey({ ...survey, title: event.target.value })
              }
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span>说明</span>
            <textarea
              className="min-h-20 w-full rounded-md border px-3 py-2 disabled:bg-gray-50"
              disabled={!editable}
              value={survey.description ?? ""}
              onChange={(event) =>
                setSurvey({ ...survey, description: event.target.value })
              }
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>模式</span>
            <select
              className="w-full rounded-md border px-3 py-2 disabled:bg-gray-50"
              disabled={!editable}
              value={survey.mode}
              onChange={(event) =>
                setSurvey({
                  ...survey,
                  mode: event.target.value as CourseSurveyMode,
                })
              }
            >
              <option value="ANONYMOUS">匿名</option>
              <option value="IDENTIFIED">实名</option>
            </select>
          </label>
          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            发布后模式、题目和时间冻结；匿名回答无法按学生反查。
          </div>
          <label className="space-y-1 text-sm">
            <span>开放时间</span>
            <input
              className="w-full rounded-md border px-3 py-2 disabled:bg-gray-50"
              disabled={!editable}
              type="datetime-local"
              value={localInput(survey.opensAt)}
              onChange={(event) =>
                setSurvey({ ...survey, opensAt: event.target.value })
              }
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>截止时间</span>
            <input
              className="w-full rounded-md border px-3 py-2 disabled:bg-gray-50"
              disabled={!editable}
              type="datetime-local"
              value={localInput(survey.dueAt)}
              onChange={(event) =>
                setSurvey({ ...survey, dueAt: event.target.value })
              }
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">题目审核</h2>
            <p className="text-sm text-gray-600">
              五级量表：非常不同意至非常同意。
            </p>
          </div>
          {editable ? (
            <button
              className="rounded-md border px-3 py-2 text-sm"
              type="button"
              onClick={() =>
                setQuestions([
                  ...questions,
                  {
                    type: CourseSurveyQuestionType.OPEN_TEXT,
                    dimension: CourseSurveyDimension.OPEN_FEEDBACK,
                    prompt: "",
                    required: false,
                    sortOrder: questions.length + 1,
                    outcomeCode: null,
                    outcomeTitle: null,
                    sourceRefsJson: [],
                  },
                ])
              }
            >
              增加开放题
            </button>
          ) : null}
        </div>
        {questions.map((question, index) => (
          <div
            className="space-y-2 rounded-lg border p-4"
            key={question.id ?? `new-${index}`}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>第 {index + 1} 题</span>
              <span>
                {question.type === "LIKERT_5" ? "五级量表" : "开放题"}
              </span>
              <span>{DIMENSION_LABELS[question.dimension]}</span>
              {question.outcomeCode ? (
                <span>
                  {question.outcomeCode} · {question.outcomeTitle}
                </span>
              ) : null}
            </div>
            <textarea
              className="min-h-20 w-full rounded-md border px-3 py-2 disabled:bg-gray-50"
              disabled={!editable}
              value={question.prompt}
              onChange={(event) =>
                updateQuestion(index, { prompt: event.target.value })
              }
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={question.required}
                  disabled={!editable}
                  type="checkbox"
                  onChange={(event) =>
                    updateQuestion(index, { required: event.target.checked })
                  }
                />
                必答
              </label>
              {editable && !question.outcomeCode ? (
                <button
                  className="text-sm text-red-700"
                  type="button"
                  onClick={() =>
                    setQuestions(
                      questions
                        .filter((_, itemIndex) => itemIndex !== index)
                        .map((item, itemIndex) => ({
                          ...item,
                          sortOrder: itemIndex + 1,
                        })),
                    )
                  }
                >
                  删除
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      {error ? (
        <p
          className="rounded-md bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {editable ? (
          <>
            <button
              className="rounded-md border bg-white px-4 py-2 text-sm disabled:opacity-50"
              disabled={busy !== null}
              onClick={() =>
                void action("save", () =>
                  requestCourseSurveyApi<SurveyEditorValue>(endpoint, {
                    method: "PUT",
                    body: JSON.stringify({
                      expectedVersion: survey.version,
                      title: survey.title,
                      description: survey.description ?? "",
                      instructions: survey.instructions,
                      mode: survey.mode,
                      opensAt: survey.opensAt,
                      dueAt: survey.dueAt,
                      questions: questions.map((item, index) => ({
                        ...item,
                        sortOrder: index + 1,
                        sourceRefs: Array.isArray(item.sourceRefsJson)
                          ? item.sourceRefsJson
                          : [],
                      })),
                    }),
                  }),
                )
              }
            >
              {busy === "save" ? "保存中…" : "保存草稿"}
            </button>
            <button
              className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={busy !== null}
              onClick={() => {
                if (
                  window.confirm(
                    "发布后题目、匿名模式和时间将冻结，确认发布吗？",
                  )
                )
                  void action("publish", () =>
                    requestCourseSurveyApi<SurveyEditorValue>(
                      `${endpoint}/publish`,
                      {
                        method: "POST",
                        body: JSON.stringify({
                          expectedVersion: survey.version,
                        }),
                      },
                    ),
                  );
              }}
            >
              {busy === "publish" ? "发布中…" : "发布问卷"}
            </button>
          </>
        ) : null}
        {survey.status === CourseSurveyStatus.PUBLISHED ? (
          <button
            className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm text-red-700 disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => {
              if (
                window.confirm("关闭后学生将不能继续提交，确认关闭并汇总吗？")
              )
                void action("close", () =>
                  requestCourseSurveyApi(`${endpoint}/close`, {
                    method: "POST",
                  }).then(() =>
                    requestCourseSurveyApi<SurveyEditorValue>(endpoint),
                  ),
                );
            }}
          >
            {busy === "close" ? "关闭中…" : "关闭并汇总"}
          </button>
        ) : null}
        {survey.status !== CourseSurveyStatus.DRAFT ? (
          <button
            className="rounded-md border bg-white px-4 py-2 text-sm disabled:opacity-50"
            disabled={busy !== null}
            onClick={() =>
              void action("summary", async () => {
                await requestCourseSurveyApi(`${endpoint}/summary`, {
                  method: "POST",
                });
                const next =
                  await requestCourseSurveyApi<SurveyEditorValue>(endpoint);
                setSurvey(next);
                return next;
              })
            }
          >
            {busy === "summary" ? "汇总中…" : "刷新聚合统计"}
          </button>
        ) : null}
      </div>

      {survey.summaryRevisions[0] ? (
        <section className="space-y-4 rounded-xl border bg-white p-6">
          <div>
            <h2 className="font-semibold">问卷聚合结果</h2>
            <p className="mt-1 text-sm text-gray-600">
              {survey.summaryRevisions[0].responseCount}/
              {survey.summaryRevisions[0].eligibleCount} 份，响应率{" "}
              {((statistics?.responseRate ?? 0) * 100).toFixed(1)}
              %。学生自评与客观成绩分开呈现。
            </p>
          </div>
          {survey.summaryRevisions[0].isSuppressed ? (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              回答数低于 5 份，已隐藏量表细分和开放题主题，防止小样本重新识别。
            </p>
          ) : (
            <>
              <p className="text-sm">
                量表总体均值：{statistics?.overallMean?.toFixed(2) ?? "暂无"} /
                5
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {statistics?.outcomes?.map((item) => (
                  <div
                    className="rounded-md bg-gray-50 p-3 text-sm"
                    key={item.code}
                  >
                    <strong>
                      {item.code} {item.title}
                    </strong>
                    <p className="mt-1">
                      学生自评均值 {item.mean.toFixed(2)} / 5
                    </p>
                  </div>
                ))}
              </div>
              <p className="rounded-md bg-gray-50 p-3 text-sm">
                {themes?.narrative}
              </p>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
