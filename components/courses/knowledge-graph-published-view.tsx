"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Focus, RotateCcw } from "lucide-react";
import { KnowledgeGraphCanvas } from "@/components/courses/knowledge-graph-canvas";
import { KnowledgeGraphDirectory } from "@/components/courses/knowledge-graph-directory";
import { filterKnowledgeGraph } from "@/components/courses/knowledge-graph-filter";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

const NO_QUESTION_COUNTS = new Map<string, number>();

export function KnowledgeGraphPublishedView({
  graph,
  courseId,
  classroomId,
  mastery,
}: {
  graph: KnowledgeGraphStructure;
  courseId: string;
  classroomId?: string;
  mastery: Array<{
    stableKey: string;
    conceptId: string;
    evidenceState: "NO_EVIDENCE" | "INSUFFICIENT_EVIDENCE" | "CONCLUSIVE";
    evidenceCount: number;
    confidence: number;
    masteryScore: number | null;
    evidenceUpdatedAt: string | null;
  }>;
}) {
  const [query, setQuery] = useState("");
  const [chapterKey, setChapterKey] = useState("ALL");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { nodes, edges } = useMemo(
    () =>
      filterKnowledgeGraph(graph, {
        query,
        chapterKey,
        nodeType: "ALL",
        edgeType: "ALL",
      }),
    [graph, query, chapterKey],
  );
  const selectedNode = nodes.find((node) => node.key === selectedKey) ?? null;
  const masteryByStableKey = useMemo(
    () => new Map(mastery.map((item) => [item.stableKey, item])),
    [mastery],
  );
  const nodeColorByKey = useMemo(
    () =>
      new Map(
        graph.nodes
          .filter((node) => node.type === "KNOWLEDGE_POINT")
          .map((node) => {
            const item = masteryByStableKey.get(node.conceptKey);
            const color =
              item?.evidenceState !== "CONCLUSIVE" || item.masteryScore === null
                ? "#64748b"
                : item.masteryScore >= 80
                  ? "#059669"
                  : item.masteryScore >= 60
                    ? "#d97706"
                    : "#dc2626";
            return [node.key, color] as const;
          }),
      ),
    [graph.nodes, masteryByStableKey],
  );
  const selectedMastery = selectedNode
    ? masteryByStableKey.get(selectedNode.conceptKey)
    : undefined;
  function handleSelectNode(key: string) {
    if (!nodes.some((node) => node.key === key)) {
      setQuery("");
      setChapterKey("ALL");
    }
    setSelectedKey(key);
  }
  const chapters = graph.nodes
    .filter((node) => node.type === "CHAPTER")
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.code.localeCompare(b.code, "zh-CN", { numeric: true }),
    );

  return (
    <div className="space-y-4">
      <section
        aria-label="知识图谱筛选"
        className="grid gap-3 rounded-2xl border border-sky-100 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.6fr)_auto]"
      >
        <label className="min-w-0 text-xs font-medium text-slate-600">
          搜索知识点
          <input
            className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入知识点名称或编码"
            value={query}
          />
        </label>
        <label className="min-w-0 text-xs font-medium text-slate-600">
          章节
          <select
            className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            onChange={(event) => setChapterKey(event.target.value)}
            value={chapterKey}
          >
            <option value="ALL">全部章节</option>
            {chapters.map((chapter) => (
              <option key={chapter.key} value={chapter.key}>
                {chapter.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 self-end rounded-md border px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-default disabled:opacity-40"
          disabled={!query && chapterKey === "ALL"}
          onClick={() => {
            setQuery("");
            setChapterKey("ALL");
          }}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          重置
        </button>
      </section>

      <section
        aria-label="个人掌握度图例"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-100 bg-white/80 px-4 py-3 text-xs"
      >
        <span className="font-medium">我的掌握度：</span>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">
          熟练掌握
        </span>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
          基本掌握
        </span>
        <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-800">
          需要巩固
        </span>
        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-gray-700">
          暂未评估
        </span>
      </section>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="min-w-0 space-y-3" aria-label="课程知识图谱浏览">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">探索知识图谱</h2>
            <p className="text-xs text-slate-500">
              当前显示 {nodes.length} 个节点 · {edges.length} 条关系
            </p>
          </div>
          <div className="grid min-w-0 gap-3 md:grid-cols-[12rem_minmax(0,1fr)]">
            <KnowledgeGraphDirectory
              compact
              counts={NO_QUESTION_COUNTS}
              graph={graph}
              nodes={nodes}
              onSelect={handleSelectNode}
              selectedKey={selectedKey}
              showQuestionCounts={false}
            />
            <KnowledgeGraphCanvas
              compact
              edges={edges}
              nodeColorByKey={nodeColorByKey}
              nodeColorHelp="知识点球颜色表示我的掌握度；课程与章节仍按结构着色"
              nodes={nodes}
              onSelect={handleSelectNode}
              selectedKey={selectedKey}
              structure={graph}
            />
          </div>
          <p className="text-xs leading-5 text-slate-500">
            点击目录或图谱节点，在学习面板查看详情并开始相关练习。
          </p>
        </section>
        <aside
          className="min-w-0 rounded-2xl border border-sky-100 bg-white shadow-sm xl:sticky xl:top-24"
          aria-label="知识点学习与练习"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <BookOpen className="size-4 text-sky-600" aria-hidden="true" />
            <h2 className="font-semibold text-slate-900">知识点学习与练习</h2>
          </div>
          {selectedNode ? (
            <section
              aria-live="polite"
              className="space-y-4 p-5"
              aria-label="节点详情"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-lg leading-7 font-semibold text-slate-900">
                  {selectedNode.name}
                </h2>
                <span className="w-full text-xs text-slate-500">
                  {selectedNode.code} ·
                  {selectedNode.type === "COURSE"
                    ? "课程"
                    : selectedNode.type === "CHAPTER"
                      ? "章节"
                      : "知识点"}
                </span>
              </div>
              {selectedNode.description ? (
                <p className="text-muted-foreground mt-2 text-sm leading-6">
                  {selectedNode.description}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {selectedNode.isKeyTopic ? (
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                    重点
                  </span>
                ) : null}
                {selectedNode.isDifficultTopic ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                    难点
                  </span>
                ) : null}
                {selectedNode.importance ? (
                  <span className="rounded border px-2 py-1">
                    重要程度：
                    {
                      { CORE: "核心", NORMAL: "常规", EXTENDED: "拓展" }[
                        selectedNode.importance
                      ]
                    }
                  </span>
                ) : null}
              </div>
              {selectedNode.type === "KNOWLEDGE_POINT" ? (
                <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">我的学习状态</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {selectedMastery?.evidenceState === "CONCLUSIVE"
                          ? `根据 ${selectedMastery.evidenceCount} 次已评分作答评估，完成新练习后会更新`
                          : selectedMastery?.evidenceState ===
                              "INSUFFICIENT_EVIDENCE"
                            ? "已开始练习，完成更多作答后即可评估掌握情况"
                            : "还没有可用于评估的作答记录，完成作业或练习后即可了解掌握情况"}
                      </p>
                    </div>
                    <strong className="text-xl text-sky-800">
                      {selectedMastery?.evidenceState === "CONCLUSIVE" &&
                      selectedMastery.masteryScore !== null
                        ? selectedMastery.masteryScore >= 80
                          ? "熟练掌握"
                          : selectedMastery.masteryScore >= 60
                            ? "基本掌握"
                            : "需要巩固"
                        : "暂未评估"}
                    </strong>
                  </div>
                  {selectedMastery?.evidenceUpdatedAt ? (
                    <p className="mt-3 text-xs text-slate-500">
                      更新于{" "}
                      {new Date(
                        selectedMastery.evidenceUpdatedAt,
                      ).toLocaleDateString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                      })}
                    </p>
                  ) : null}
                  <Link
                    className="mt-3 inline-flex text-xs font-medium text-sky-700 underline underline-offset-4"
                    href={`/student/courses/${courseId}/profile${classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : ""}`}
                  >
                    查看学习记录
                  </Link>
                </div>
              ) : null}
              {selectedNode.type !== "KNOWLEDGE_POINT" ? (
                <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-500">
                  请选择该课程或章节下的具体知识点，查看学习状态和相关练习。
                </p>
              ) : null}
              {selectedNode.type === "KNOWLEDGE_POINT" ? (
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">
                    相关练习
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    围绕当前知识点生成针对性练习，前往练习中心确认练习条件。自主练习不计入正式课程成绩。
                  </p>
                  {selectedMastery ? (
                    <Link
                      className="mt-4 flex w-full items-center justify-center rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                      href={`/student/recommendations?view=generate&courseId=${encodeURIComponent(courseId)}&conceptId=${encodeURIComponent(selectedMastery.conceptId)}${classroomId ? `&classroomId=${encodeURIComponent(classroomId)}` : ""}`}
                    >
                      练习此知识点
                    </Link>
                  ) : (
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      当前节点暂无可用的练习入口，请选择其他知识点。
                    </p>
                  )}
                </div>
              ) : null}
            </section>
          ) : (
            <div className="px-5 py-12 text-center">
              <Focus
                className="mx-auto size-9 text-sky-300"
                aria-hidden="true"
              />
              <h3 className="mt-4 text-sm font-semibold text-slate-900">
                选择一个知识点
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                点击左侧目录或图谱节点，查看知识点介绍、学习状态和相关练习。
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
