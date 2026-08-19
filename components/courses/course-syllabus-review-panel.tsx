"use client";

import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { requestApi } from "@/components/courses/request-api";
import {
  shouldPollSyllabusParse,
  syllabusParseFailureMessage,
} from "@/components/courses/syllabus-parse-presenter";
import type {
  SyllabusParseOutput,
  SyllabusParseOutputV1,
} from "@/services/syllabus-parsing/schemas";

interface DraftView {
  id: string;
  status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  parserVersion: string;
  errorCode: string | null;
  hasFieldSourceRefs: boolean;
  isCurrentSyllabusVersion: boolean;
  syllabus: { id: string; versionNumber: number; originalName: string };
  result: SyllabusParseOutput | SyllabusParseOutputV1 | null;
  updatedAt: string;
}

interface ReviewView {
  id: string;
  revisionNumber: number;
  structure: SyllabusParseOutput;
  updatedAt: string;
}

interface PublishedView {
  id: string;
  versionNumber: number;
  syllabusId: string;
  sourceReviewRevisionId: string;
  isFromCurrentSyllabus: boolean;
  publishedAt: string;
  syllabus: { versionNumber: number; originalName: string };
  structure: SyllabusParseOutput;
}

interface ParseState {
  current: DraftView | null;
  history: DraftView[];
  review: ReviewView | null;
  published: {
    currentPublishedStructure: PublishedView | null;
    currentPublishedSyllabusStructureId: string | null;
    sourceReviewRevisionId: string | null;
    currentReviewRevisionId: string | null;
    isCurrentReviewRevisionPublished: boolean;
    isCurrentPublishedStructureStale: boolean;
    current: PublishedView | null;
    history: PublishedView[];
  };
}

function SourceRefs({
  refs,
}: {
  refs: SyllabusParseOutput["courseInfo"]["sourceRefs"];
}) {
  if (refs.length === 0) {
    return <span className="text-xs text-amber-700">无字段级来源</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {refs.map((ref, index) => (
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${ref.verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
          key={`${ref.page}-${index}`}
          title={ref.quote ?? "未提供原文片段"}
        >
          第 {ref.page} 页{ref.verified ? " · 已核验" : " · 待核验"}
        </span>
      ))}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "w-full rounded-md border bg-white px-3 py-2 text-sm";

export function CourseSyllabusReviewPanel({ courseId }: { courseId: string }) {
  const [state, setState] = useState<ParseState | null>(null);
  const [structure, setStructure] = useState<SyllabusParseOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await requestApi<ParseState>(
      `/api/teacher/courses/${courseId}/syllabus/parse`,
    );
    setLoading(false);
    if (!result.success) {
      setState(null);
      setStructure(null);
      setError(result.error);
      return null;
    }
    setState(result.data);
    const editable =
      result.data.review?.structure ??
      (result.data.current?.hasFieldSourceRefs
        ? (result.data.current.result as SyllabusParseOutput | null)
        : null);
    setStructure(editable ? structuredClone(editable) : null);
    setDirty(false);
    return result.data;
  }, [courseId]);

  useEffect(() => {
    void load();
    const reload = () => void load();
    window.addEventListener("course-syllabus-updated", reload);
    return () => window.removeEventListener("course-syllabus-updated", reload);
  }, [load]);

  useEffect(() => {
    const status = state?.current?.status;
    if (!shouldPollSyllabusParse(status)) return;
    const timer = window.setInterval(() => void load(), 2_000);
    return () => window.clearInterval(timer);
  }, [load, state]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const current = state?.current ?? null;
  const statusLabel = useMemo(() => {
    if (!current) return "未解析";
    return {
      PENDING: "等待解析",
      PROCESSING: "解析中",
      SUCCEEDED: "解析成功",
      FAILED: "解析失败",
    }[current.status];
  }, [current]);

  function change(mutator: (draft: SyllabusParseOutput) => void) {
    setStructure((value) => {
      if (!value) return value;
      const next = structuredClone(value);
      mutator(next);
      return next;
    });
    setDirty(true);
    setNotice(null);
  }

  async function parse() {
    setParsing(true);
    setError(null);
    const result = await requestApi<unknown>(
      `/api/teacher/courses/${courseId}/syllabus/parse`,
      { method: "POST" },
    );
    setParsing(false);
    if (!result.success) return setError(result.error);
    setNotice("教学大纲解析完成，请审核后保存。 ");
    await load();
  }

  async function save() {
    if (!current || !structure) return;
    setSaving(true);
    setError(null);
    const result = await requestApi<ReviewView>(
      `/api/teacher/courses/${courseId}/syllabus/parse/${current.id}/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevisionNumber: state?.review?.revisionNumber ?? 0,
          structure,
        }),
      },
    );
    setSaving(false);
    if (!result.success) {
      setError(
        result.status === 409
          ? `${result.error} 本地修改仍保留，请复制必要内容后重新加载。`
          : result.error,
      );
      return;
    }
    setNotice(`审核稿第 ${result.data.revisionNumber} 版已保存。`);
    await load();
  }

  async function publish() {
    if (!current || !state?.review || dirty) return;
    if (
      !window.confirm(
        "发布后将生成新的不可变课程大纲结构版本。此操作不会生成知识图谱，也不会修改现有题目、作业或成绩。确认发布吗？",
      )
    )
      return;
    setPublishing(true);
    setError(null);
    const result = await requestApi<PublishedView>(
      `/api/teacher/courses/${courseId}/syllabus/parse/${current.id}/publish`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewRevisionId: state.review.id }),
      },
    );
    setPublishing(false);
    if (!result.success) return setError(result.error);
    const refreshed = await load();
    if (
      refreshed?.published.currentPublishedSyllabusStructureId !==
      result.data.id
    ) {
      setError("发布结果未能从服务端恢复，请重试发布以修复课程正式大纲指针。");
      return;
    }
    setNotice(`课程大纲结构第 ${result.data.versionNumber} 版已发布。`);
  }

  const isCurrentReviewPublished = Boolean(
    state?.review &&
    state.published.currentPublishedStructure &&
    state.published.sourceReviewRevisionId === state.review.id &&
    !state.published.isCurrentPublishedStructureStale,
  );

  return (
    <section className="bg-card rounded-xl border p-5" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">教学大纲解析与审核</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            AI 解析结果需由教师审核并显式发布，发布不会生成知识图谱。
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">
          {isCurrentReviewPublished ? "已发布" : statusLabel}
        </span>
      </div>

      {loading ? (
        <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-gray-500">
          正在读取解析、审核和发布状态...
        </p>
      ) : null}
      {!loading && !current ? (
        <div className="mt-4 rounded-lg border border-dashed p-4 text-sm">
          <p>当前教学大纲尚未解析。</p>
          <button
            className="mt-3 rounded-md bg-gray-900 px-3 py-2 text-white disabled:opacity-60"
            disabled={parsing}
            onClick={() => void parse()}
            type="button"
          >
            {parsing ? "解析中..." : "开始解析"}
          </button>
        </div>
      ) : null}
      {current?.status === "FAILED" ? (
        <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <p>
            解析失败：
            {syllabusParseFailureMessage(current.errorCode)}
          </p>
          <button
            aria-label="重新解析教学大纲"
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-red-600 bg-white px-3 py-2 font-medium text-red-700 shadow-sm transition-colors hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            disabled={parsing}
            onClick={() => void parse()}
            type="button"
          >
            <RefreshCw className={`h-4 w-4 ${parsing ? "animate-spin" : ""}`} />
            {parsing ? "重新解析中..." : "重新解析"}
          </button>
        </div>
      ) : null}
      {current?.status === "PROCESSING" || current?.status === "PENDING" ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-blue-50 p-4 text-sm text-blue-700">
          <RefreshCw className="h-4 w-4 animate-spin" />
          解析正在进行，请稍后刷新。
        </p>
      ) : null}

      {state?.published.currentPublishedStructure &&
      state.published.isCurrentPublishedStructureStale ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4" />
          当前正式版本来自旧教学大纲文件。新文件需重新解析、审核并显式发布。
        </p>
      ) : null}

      {structure && current?.status === "SUCCEEDED" ? (
        <div className="mt-5 space-y-5">
          <div className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium">课程基本信息</h3>
              <SourceRefs refs={structure.courseInfo.sourceRefs} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="课程名称">
                <input
                  className={inputClass}
                  value={structure.courseInfo.courseName ?? ""}
                  onChange={(e) =>
                    change((d) => {
                      d.courseInfo.courseName = e.target.value || null;
                    })
                  }
                />
              </Field>
              <Field label="课程代码">
                <input
                  className={inputClass}
                  value={structure.courseInfo.courseCode ?? ""}
                  onChange={(e) =>
                    change((d) => {
                      d.courseInfo.courseCode = e.target.value || null;
                    })
                  }
                />
              </Field>
              <Field label="学分">
                <input
                  className={inputClass}
                  min="0"
                  step="0.5"
                  type="number"
                  value={structure.courseInfo.credits ?? ""}
                  onChange={(e) =>
                    change((d) => {
                      d.courseInfo.credits = e.target.value
                        ? Number(e.target.value)
                        : null;
                    })
                  }
                />
              </Field>
              <Field label="课程类别">
                <input
                  className={inputClass}
                  value={structure.courseInfo.courseCategory ?? ""}
                  onChange={(e) =>
                    change((d) => {
                      d.courseInfo.courseCategory = e.target.value || null;
                    })
                  }
                />
              </Field>
              <Field label="课程性质">
                <input
                  className={inputClass}
                  value={structure.courseInfo.courseNature ?? ""}
                  onChange={(e) =>
                    change((d) => {
                      d.courseInfo.courseNature = e.target.value || null;
                    })
                  }
                />
              </Field>
              <Field label="授课语言">
                <input
                  className={inputClass}
                  value={structure.courseInfo.teachingLanguage ?? ""}
                  onChange={(e) =>
                    change((d) => {
                      d.courseInfo.teachingLanguage = e.target.value || null;
                    })
                  }
                />
              </Field>
              <Field label="授课学期">
                <input
                  className={inputClass}
                  value={structure.courseInfo.offeredTerm ?? ""}
                  onChange={(e) =>
                    change((d) => {
                      d.courseInfo.offeredTerm = e.target.value || null;
                    })
                  }
                />
              </Field>
              <Field label="适用专业">
                <input
                  className={inputClass}
                  value={structure.courseInfo.applicableMajors ?? ""}
                  onChange={(e) =>
                    change((d) => {
                      d.courseInfo.applicableMajors = e.target.value || null;
                    })
                  }
                />
              </Field>
              <Field label="授课学院">
                <input
                  className={inputClass}
                  value={structure.courseInfo.teachingCollege ?? ""}
                  onChange={(e) =>
                    change((d) => {
                      d.courseInfo.teachingCollege = e.target.value || null;
                    })
                  }
                />
              </Field>
              <Field label="总学时">
                <input
                  className={inputClass}
                  type="number"
                  value={structure.courseInfo.totalHours ?? ""}
                  onChange={(e) =>
                    change((d) => {
                      d.courseInfo.totalHours = e.target.value
                        ? Number(e.target.value)
                        : null;
                    })
                  }
                />
              </Field>
              <Field label="理论 / 实践学时">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    aria-label="理论学时"
                    className={inputClass}
                    type="number"
                    value={structure.courseInfo.theoryHours ?? ""}
                    onChange={(e) =>
                      change((d) => {
                        d.courseInfo.theoryHours = e.target.value
                          ? Number(e.target.value)
                          : null;
                      })
                    }
                  />
                  <input
                    aria-label="实践学时"
                    className={inputClass}
                    type="number"
                    value={structure.courseInfo.practiceHours ?? ""}
                    onChange={(e) =>
                      change((d) => {
                        d.courseInfo.practiceHours = e.target.value
                          ? Number(e.target.value)
                          : null;
                      })
                    }
                  />
                </div>
              </Field>
            </div>
            <Field label="课程简介">
              <textarea
                className={`${inputClass} mt-3 min-h-20`}
                value={structure.courseInfo.description ?? ""}
                onChange={(e) =>
                  change((d) => {
                    d.courseInfo.description = e.target.value || null;
                  })
                }
              />
            </Field>
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="font-medium">课程目标</h3>
            <div className="mt-3 space-y-3">
              {structure.objectives.map((objective, index) => (
                <div
                  className="rounded-md bg-slate-50 p-3"
                  key={`${objective.code}-${index}`}
                >
                  <div className="mb-2 flex justify-end">
                    <SourceRefs refs={objective.sourceRefs} />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                    <input
                      aria-label={`目标 ${index + 1} 编码`}
                      className={inputClass}
                      value={objective.code}
                      onChange={(e) =>
                        change((d) => {
                          const previous = d.objectives[index]!.code;
                          d.objectives[index]!.code = e.target.value;
                          d.objectiveAssessmentMappings.forEach((mapping) => {
                            if (mapping.objectiveCode === previous) {
                              mapping.objectiveCode = e.target.value;
                            }
                          });
                        })
                      }
                    />
                    <input
                      aria-label={`目标 ${index + 1} 标题`}
                      className={inputClass}
                      value={objective.title}
                      onChange={(e) =>
                        change((d) => {
                          d.objectives[index]!.title = e.target.value;
                        })
                      }
                    />
                  </div>
                  <textarea
                    aria-label={`目标 ${index + 1} 描述`}
                    className={`${inputClass} mt-2 min-h-20`}
                    value={objective.description}
                    onChange={(e) =>
                      change((d) => {
                        d.objectives[index]!.description = e.target.value;
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="font-medium">章节、知识点、重点与难点</h3>
            <div className="mt-3 space-y-4">
              {structure.chapters.map((chapter, chapterIndex) => (
                <div
                  className="rounded-md bg-slate-50 p-3"
                  key={`${chapter.code}-${chapterIndex}`}
                >
                  <div className="mb-2 flex justify-end">
                    <SourceRefs refs={chapter.sourceRefs} />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[120px_1fr_90px]">
                    <input
                      aria-label="章节编码"
                      className={inputClass}
                      value={chapter.code}
                      onChange={(e) =>
                        change((d) => {
                          d.chapters[chapterIndex]!.code = e.target.value;
                        })
                      }
                    />
                    <input
                      aria-label="章节标题"
                      className={inputClass}
                      value={chapter.title}
                      onChange={(e) =>
                        change((d) => {
                          d.chapters[chapterIndex]!.title = e.target.value;
                        })
                      }
                    />
                    <input
                      aria-label="章节顺序"
                      className={inputClass}
                      type="number"
                      value={chapter.order}
                      onChange={(e) =>
                        change((d) => {
                          d.chapters[chapterIndex]!.order = Number(
                            e.target.value,
                          );
                        })
                      }
                    />
                  </div>
                  <div className="mt-3 space-y-2">
                    {chapter.knowledgePoints.map((point, pointIndex) => (
                      <div
                        className="grid gap-2 rounded border bg-white p-2 sm:grid-cols-[120px_1fr_auto]"
                        key={`${point.code}-${pointIndex}`}
                      >
                        <input
                          aria-label="知识点编码"
                          className={inputClass}
                          value={point.code}
                          onChange={(e) =>
                            change((d) => {
                              d.chapters[chapterIndex]!.knowledgePoints[
                                pointIndex
                              ]!.code = e.target.value;
                            })
                          }
                        />
                        <input
                          aria-label="知识点名称"
                          className={inputClass}
                          value={point.name}
                          onChange={(e) =>
                            change((d) => {
                              d.chapters[chapterIndex]!.knowledgePoints[
                                pointIndex
                              ]!.name = e.target.value;
                            })
                          }
                        />
                        <SourceRefs refs={point.sourceRefs} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground mt-3 text-sm">
              重点 {structure.keyTopics.length} 项 · 难点{" "}
              {structure.difficultTopics.length} 项 · 先修关系{" "}
              {structure.prerequisites.length} 条
            </p>
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">实践教学项目</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  实验、实训和课程设计与理论章节分开审核。
                </p>
              </div>
              <span className="text-sm text-gray-500">
                {structure.practiceItems.length} 项 · 共{" "}
                {structure.practiceItems.reduce(
                  (sum, item) => sum + (item.suggestedHours ?? 0),
                  0,
                )}{" "}
                学时
              </span>
            </div>
            {structure.practiceItems.length ? (
              <div className="mt-3 space-y-2">
                {structure.practiceItems.map((item, index) => (
                  <div
                    className="grid gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-[120px_1fr_100px_1fr_auto]"
                    key={item.code + "-" + index}
                  >
                    <input
                      aria-label="实践项目编码"
                      className={inputClass}
                      value={item.code}
                      onChange={(event) =>
                        change((draft) => {
                          draft.practiceItems[index]!.code = event.target.value;
                        })
                      }
                    />
                    <input
                      aria-label="实践项目名称"
                      className={inputClass}
                      value={item.title}
                      onChange={(event) =>
                        change((draft) => {
                          draft.practiceItems[index]!.title =
                            event.target.value;
                        })
                      }
                    />
                    <input
                      aria-label="实践项目学时"
                      className={inputClass}
                      min="0"
                      type="number"
                      value={item.suggestedHours ?? ""}
                      onChange={(event) =>
                        change((draft) => {
                          draft.practiceItems[index]!.suggestedHours = event
                            .target.value
                            ? Number(event.target.value)
                            : null;
                        })
                      }
                    />
                    <input
                      aria-label="关联章节编码"
                      className={inputClass}
                      placeholder="CH-1, CH-2"
                      value={item.relatedChapterCodes.join(", ")}
                      onChange={(event) =>
                        change((draft) => {
                          draft.practiceItems[index]!.relatedChapterCodes =
                            event.target.value
                              .split(",")
                              .map((value) => value.trim())
                              .filter(Boolean);
                        })
                      }
                    />
                    <SourceRefs refs={item.sourceRefs} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground mt-3 text-sm">
                未解析到实践教学项目；如大纲包含实验，请重新解析或人工补充。
              </p>
            )}
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="font-medium">考核项目与课程目标映射</h3>
            <div className="mt-3 space-y-2">
              {structure.assessments.map((assessment, index) => (
                <div
                  className="grid gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-[120px_1fr_120px_100px_auto]"
                  key={`${assessment.code}-${index}`}
                >
                  <input
                    aria-label="考核编码"
                    className={inputClass}
                    value={assessment.code}
                    onChange={(e) =>
                      change((d) => {
                        const previous = d.assessments[index]!.code;
                        d.assessments[index]!.code = e.target.value;
                        d.objectiveAssessmentMappings.forEach((mapping) => {
                          if (mapping.assessmentCode === previous) {
                            mapping.assessmentCode = e.target.value;
                          }
                        });
                      })
                    }
                  />
                  <input
                    aria-label="考核名称"
                    className={inputClass}
                    value={assessment.name}
                    onChange={(e) =>
                      change((d) => {
                        d.assessments[index]!.name = e.target.value;
                      })
                    }
                  />
                  <input
                    aria-label="考核类型"
                    className={inputClass}
                    value={assessment.type}
                    onChange={(e) =>
                      change((d) => {
                        d.assessments[index]!.type = e.target.value;
                      })
                    }
                  />
                  <input
                    aria-label="考核权重"
                    className={inputClass}
                    type="number"
                    value={assessment.weight ?? ""}
                    onChange={(e) =>
                      change((d) => {
                        d.assessments[index]!.weight = e.target.value
                          ? Number(e.target.value)
                          : null;
                      })
                    }
                  />
                  <SourceRefs refs={assessment.sourceRefs} />
                </div>
              ))}
            </div>
            {structure.objectives.length && structure.assessments.length ? (
              <div className="mt-5 overflow-x-auto rounded-md border">
                <table className="min-w-full border-collapse text-sm">
                  <caption className="bg-slate-50 px-3 py-2 text-left font-medium">
                    课程目标在各考核方式中占比（%）
                  </caption>
                  <thead>
                    <tr className="border-t bg-slate-50">
                      <th className="min-w-44 border-r px-3 py-2 text-left">
                        课程目标
                      </th>
                      {structure.assessments.map((assessment) => (
                        <th
                          className="min-w-32 border-r px-3 py-2 text-center last:border-r-0"
                          key={assessment.code}
                        >
                          {assessment.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {structure.objectives.map((objective) => (
                      <tr className="border-t" key={objective.code}>
                        <th className="border-r px-3 py-2 text-left font-medium">
                          {objective.code} · {objective.title}
                        </th>
                        {structure.assessments.map((assessment) => {
                          const mapping =
                            structure.objectiveAssessmentMappings.find(
                              (item) =>
                                item.objectiveCode === objective.code &&
                                item.assessmentCode === assessment.code,
                            );
                          return (
                            <td
                              className="border-r p-2 text-center last:border-r-0"
                              key={`${objective.code}-${assessment.code}`}
                            >
                              <input
                                aria-label={`${objective.title}在${assessment.name}中占比`}
                                className="w-24 rounded-md border bg-white px-2 py-1.5 text-center"
                                min="0"
                                max="100"
                                step="0.01"
                                type="number"
                                value={mapping?.allocationRate ?? ""}
                                onChange={(event) =>
                                  change((draft) => {
                                    let target =
                                      draft.objectiveAssessmentMappings.find(
                                        (item) =>
                                          item.objectiveCode ===
                                            objective.code &&
                                          item.assessmentCode ===
                                            assessment.code,
                                      );
                                    if (!target) {
                                      target = {
                                        objectiveCode: objective.code,
                                        assessmentCode: assessment.code,
                                        allocationRate: null,
                                        sourceRefs: [],
                                      };
                                      draft.objectiveAssessmentMappings.push(
                                        target,
                                      );
                                    }
                                    target.allocationRate = event.target.value
                                      ? Number(event.target.value)
                                      : null;
                                  })
                                }
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="border-t bg-slate-50 font-medium">
                      <th className="border-r px-3 py-2 text-left">列合计</th>
                      {structure.assessments.map((assessment) => {
                        const total = structure.objectives.reduce(
                          (sum, objective) =>
                            sum +
                            (structure.objectiveAssessmentMappings.find(
                              (item) =>
                                item.objectiveCode === objective.code &&
                                item.assessmentCode === assessment.code,
                            )?.allocationRate ?? 0),
                          0,
                        );
                        return (
                          <td
                            className={`border-r px-3 py-2 text-center last:border-r-0 ${Math.abs(total - 100) < 0.000001 ? "text-emerald-700" : "text-red-700"}`}
                            key={assessment.code}
                          >
                            {total}%
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
            <p className="text-muted-foreground mt-3 text-sm">
              每种考核方式下的课程目标占比必须合计
              100%。这些数值将进入正式考核方案和课程目标达成度计算；空白表示尚未确认。
            </p>
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="font-medium">教材与参考资料</h3>
            {structure.materials.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {structure.materials.map((item) => (
                  <li
                    className="flex justify-between gap-3 rounded bg-slate-50 p-3"
                    key={item.code}
                  >
                    <span>
                      {item.title} · {item.type}
                    </span>
                    <SourceRefs refs={item.sourceRefs} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground mt-2 text-sm">
                未解析到教材或参考资料。
              </p>
            )}
          </div>

          <div className="rounded-lg bg-amber-50 p-4">
            <h3 className="font-medium text-amber-900">解析提示</h3>
            {structure.warnings.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                {structure.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-amber-800">
                暂无 warning。正式发布仍会执行完整服务端校验。
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded-md border bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              disabled={
                saving || publishing || (!dirty && Boolean(state?.review))
              }
              onClick={() => void save()}
              type="button"
            >
              {saving ? "保存中..." : "保存审核稿"}
            </button>
            <button
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={publishing || saving || dirty || !state?.review}
              onClick={() => void publish()}
              type="button"
            >
              {publishing ? "发布中..." : "发布课程大纲结构"}
            </button>
            {dirty ? (
              <span className="text-sm text-amber-700">有未保存修改</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {current &&
      !current.hasFieldSourceRefs &&
      current.status === "SUCCEEDED" ? (
        <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
          此旧解析版本没有字段级来源，只能查看。请使用当前解析器重新解析当前教学大纲后审核。
        </p>
      ) : null}

      {state &&
      (state.history.length > 1 || state.published.history.length > 0) ? (
        <details className="mt-5 rounded-lg border p-4">
          <summary className="cursor-pointer font-medium">
            历史解析稿与正式版本
          </summary>
          <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <h4 className="font-medium">解析历史</h4>
              <ul className="mt-2 space-y-1">
                {state.history.map((item) => (
                  <li key={item.id}>
                    文件 v{item.syllabus.versionNumber} · {item.status} ·{" "}
                    {item.isCurrentSyllabusVersion ? "当前" : "只读"}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-medium">正式版本历史</h4>
              <ul className="mt-2 space-y-1">
                {state.published.history.map((item) => (
                  <li key={item.id}>
                    正式 v{item.versionNumber} · 文件 v
                    {item.syllabus.versionNumber} ·{" "}
                    {item.isFromCurrentSyllabus ? "当前文件" : "历史文件"}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      ) : null}
      {notice ? (
        <p className="mt-4 flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {notice}
        </p>
      ) : null}
      {error ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </span>
          <button
            className="flex items-center gap-1 font-medium"
            onClick={() => void load()}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            重新加载
          </button>
        </div>
      ) : null}
    </section>
  );
}
