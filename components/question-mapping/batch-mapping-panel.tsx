"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { requestAssignmentApi } from "@/components/assignments/request-api";

interface QuestionItem {
  id: string;
  title: string;
  type: string;
  difficulty: number;
}

interface Candidate {
  id: string;
  questionId: string;
  conceptId: string;
  publishedNodeId: string;
  confidence: number;
  reason: string;
  rank: number;
  question: { id: string; title: string; content: string; type: string };
  publishedNode: { id: string; code: string; name: string };
}

interface Batch {
  id: string;
  status: string;
  provider: string | null;
  model: string | null;
  promptVersion: string;
  ruleVersion: string;
  failureCode: string | null;
  failureSummary: string | null;
  candidates: Candidate[];
}

export function BatchMappingPanel({
  courseId,
  questions,
}: {
  courseId: string;
  questions: QuestionItem[];
}) {
  const router = useRouter();
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<
    Record<string, "PRIMARY" | "SECONDARY">
  >({});
  const [pending, setPending] = useState<"generate" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const grouped = useMemo(() => {
    const map = new Map<string, Candidate[]>();
    for (const candidate of batch?.candidates ?? []) {
      const values = map.get(candidate.questionId) ?? [];
      values.push(candidate);
      map.set(candidate.questionId, values);
    }
    return [...map.values()];
  }, [batch]);

  async function generate() {
    if (!selectedQuestions.length) {
      setError("请至少选择一道尚未人工绑定的题目");
      return;
    }
    setPending("generate");
    setError(null);
    const result = await requestAssignmentApi<Batch>(
      `/api/teacher/courses/${courseId}/question-mapping-batches`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionIds: selectedQuestions,
          idempotencyKey: crypto.randomUUID(),
        }),
      },
    );
    setPending(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setBatch(result.data);
    const defaults: Record<string, "PRIMARY"> = {};
    for (const candidate of result.data.candidates) {
      if (candidate.rank === 1) defaults[candidate.id] = "PRIMARY";
    }
    setSelectedCandidates(defaults);
  }

  async function confirm() {
    if (!batch) return;
    setPending("confirm");
    setError(null);
    const candidateById = new Map(
      batch.candidates.map((item) => [item.id, item]),
    );
    const selections = Object.entries(selectedCandidates).map(([id, type]) => {
      const candidate = candidateById.get(id)!;
      return {
        questionId: candidate.questionId,
        conceptId: candidate.conceptId,
        publishedNodeId: candidate.publishedNodeId,
        type,
      };
    });
    const result = await requestAssignmentApi<{
      confirmedQuestionCount: number;
      skippedExistingQuestionCount: number;
    }>(`/api/teacher/question-mapping-batches/${batch.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selections }),
    });
    setPending(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setBatch(null);
    setSelectedQuestions([]);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">1. 选择未绑定题目</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          生成时只向已配置的外部 AI 发送所选题目的题干和当前图谱 Concept
          元数据；答案、测试用例和学生数据不会发送。任何候选在教师确认前都不会写入正式绑定。
        </p>
        {questions.length ? (
          <div className="mt-4 max-h-80 space-y-2 overflow-auto">
            {questions.map((question) => (
              <label
                className="flex items-start gap-3 rounded-md border p-3"
                key={question.id}
              >
                <input
                  checked={selectedQuestions.includes(question.id)}
                  disabled={pending !== null || batch !== null}
                  onChange={(event) =>
                    setSelectedQuestions((current) =>
                      event.target.checked
                        ? [...current, question.id]
                        : current.filter((id) => id !== question.id),
                    )
                  }
                  type="checkbox"
                />
                <span className="text-sm">
                  <strong>{question.title}</strong> · {question.type} · 难度{" "}
                  {question.difficulty}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground mt-4 text-sm">
            没有可生成候选的未绑定题目。
          </p>
        )}
        <button
          className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={pending !== null || batch !== null || !questions.length}
          onClick={() => void generate()}
          type="button"
        >
          {pending === "generate" ? "正在生成…" : "生成候选"}
        </button>
      </section>

      {batch ? (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">2. 预览、修改并确认</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Provider {batch.provider ?? "—"} · Model {batch.model ?? "—"} ·
            Prompt {batch.promptVersion} · Rule {batch.ruleVersion}
          </p>
          {batch.failureSummary ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {batch.failureSummary}（{batch.failureCode}）
            </p>
          ) : (
            <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              外部 AI 候选已通过严格结构和 ID 范围校验；仍须由教师确认。
            </p>
          )}
          <div className="mt-5 space-y-5">
            {grouped.map((candidates) => (
              <article
                className="rounded-lg border p-4"
                key={candidates[0]!.questionId}
              >
                <h3 className="font-medium">{candidates[0]!.question.title}</h3>
                <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                  {candidates[0]!.question.content}
                </p>
                <div className="mt-3 space-y-2">
                  {candidates.map((candidate) => {
                    const selected = selectedCandidates[candidate.id];
                    return (
                      <div
                        className="flex flex-wrap items-center gap-3 rounded bg-slate-50 p-3 text-sm"
                        key={candidate.id}
                      >
                        <input
                          checked={Boolean(selected)}
                          onChange={(event) =>
                            setSelectedCandidates((current) => {
                              const next = { ...current };
                              if (event.target.checked)
                                next[candidate.id] = "SECONDARY";
                              else delete next[candidate.id];
                              return next;
                            })
                          }
                          type="checkbox"
                        />
                        <span className="min-w-48 font-medium">
                          {candidate.publishedNode.code} ·{" "}
                          {candidate.publishedNode.name}
                        </span>
                        <span className="text-muted-foreground">
                          置信度 {Math.round(candidate.confidence * 100)}% ·{" "}
                          {candidate.reason}
                        </span>
                        {selected ? (
                          <select
                            className="ml-auto rounded border bg-white px-2 py-1"
                            onChange={(event) =>
                              setSelectedCandidates((current) => ({
                                ...current,
                                [candidate.id]: event.target.value as
                                  "PRIMARY" | "SECONDARY",
                              }))
                            }
                            value={selected}
                          >
                            <option value="PRIMARY">主 Concept</option>
                            <option value="SECONDARY">次 Concept</option>
                          </select>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
          <button
            className="mt-5 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={pending !== null}
            onClick={() => void confirm()}
            type="button"
          >
            {pending === "confirm" ? "正在确认…" : "确认所选绑定"}
          </button>
        </section>
      ) : null}
      {error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
