"use client";

import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { useState } from "react";

import { requestQuestionApi } from "@/components/questions/request-api";

const TEMPLATE = [
  {
    title: "Python 中列表的下标从几开始？",
    content: "请填写题干。",
    type: "SINGLE_CHOICE",
    difficulty: 1,
    options: [
      { label: "A", content: "0", sortOrder: 1 },
      { label: "B", content: "1", sortOrder: 2 },
    ],
    answer: { kind: "CHOICE", correctOptionLabels: ["A"] },
    explanation: "Python 序列下标从 0 开始。",
    tags: ["Python", "基础"],
  },
];

export function QuestionBulkImport({
  knowledgePoints,
}: {
  knowledgePoints: Array<{ id: string; code: string; name: string }>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [knowledgePointIds, setKnowledgePointIds] = useState<string[]>([]);
  const [questions, setQuestions] = useState<unknown[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function readFile(selected: File | null) {
    setFile(selected);
    setQuestions([]);
    setMessage(null);
    if (!selected) return;
    if (selected.size > 5 * 1024 * 1024) {
      setIsError(true);
      setMessage("文件不能超过 5 MB。");
      return;
    }
    try {
      const content: unknown = JSON.parse(await selected.text());
      const rows = Array.isArray(content)
        ? content
        : content && typeof content === "object" && "questions" in content
          ? content.questions
          : null;
      if (!Array.isArray(rows) || !rows.length || rows.length > 100) {
        throw new Error("文件需包含 1–100 道题，可直接使用题目模板格式。");
      }
      setQuestions(rows);
      setIsError(false);
      setMessage(`已读取 ${rows.length} 道题，请确认默认知识点后导入。`);
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error ? error.message : "JSON 文件无法读取。",
      );
    }
  }

  async function submit() {
    if (!questions.length || !knowledgePointIds.length || busy) return;
    setBusy(true);
    setMessage(null);
    const result = await requestQuestionApi<{ createdCount: number }>(
      "/api/teacher/questions/bulk-import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions, knowledgePointIds }),
      },
    );
    setBusy(false);
    setIsError(!result.success);
    setMessage(
      result.success
        ? `成功导入 ${result.data.createdCount} 道题。导入题目保存为“我的题目”，之后可在课程知识图谱中使用 AI 一键关联知识点。`
        : result.error,
    );
    if (result.success) {
      setQuestions([]);
      setFile(null);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([JSON.stringify(TEMPLATE, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "题目批量导入模板.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="max-w-3xl space-y-5 rounded-xl border bg-white p-5">
      <div>
        <h2 className="font-semibold">导入流程</h2>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-600">
          <li>下载 JSON 模板，按示例字段填写题目、答案、解析和教师标签。</li>
          <li>选择一个或多个旧题库知识点，作为本批题目的兼容分类。</li>
          <li>上传预览后导入；导入会一次性校验，任一题错误则整批不写入。</li>
        </ol>
      </div>
      <button
        className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
        onClick={downloadTemplate}
        type="button"
      >
        下载 JSON 模板
      </button>
      <fieldset className="space-y-2 text-sm">
        <legend className="font-medium">默认旧题库知识点（可多选）</legend>
        <div className="grid max-h-48 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
          {knowledgePoints.map((item) => (
            <label className="flex items-start gap-2" key={item.id}>
              <input
                checked={knowledgePointIds.includes(item.id)}
                onChange={(event) =>
                  setKnowledgePointIds((current) =>
                    event.target.checked
                      ? [...current, item.id]
                      : current.filter((id) => id !== item.id),
                  )
                }
                type="checkbox"
              />
              <span>
                {item.code} · {item.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-2 text-sm">
        <span className="font-medium">
          选择填写完成的 JSON 文件（最多 100 题）
        </span>
        <input
          accept=".json,application/json"
          className="block w-full rounded-md border p-2"
          onChange={(event) => void readFile(event.target.files?.[0] ?? null)}
          type="file"
        />
      </label>
      {message ? (
        <p
          className={`rounded-md p-3 text-sm ${isError ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-800"}`}
          role={isError ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
      {questions.length ? (
        <div className="rounded-md border bg-slate-50 p-3 text-sm">
          待导入：<strong>{questions.length}</strong> 道题
          {file ? ` · ${file.name}` : ""}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy || !questions.length || !knowledgePointIds.length}
          onClick={() => void submit()}
          type="button"
        >
          {busy ? "正在导入…" : `确认导入（${questions.length} 道）`}
        </button>
        <TeacherBackLink href="/teacher/questions">返回题库</TeacherBackLink>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        当前批量导入支持单选、多选、判断、填空和简答题。Python
        编程题需要单独配置沙箱测试用例，请从创建/编辑页面维护。题目将设为私有；教师标签会保留，课程知识点由课程内的
        AI 关联审核另行添加。
      </p>
    </section>
  );
}
