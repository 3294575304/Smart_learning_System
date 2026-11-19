"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ArrowUpRight } from "lucide-react";

import { Panel, SectionHeading } from "@/components/ui/panel";
import { STUDENT_KNOWLEDGE_STATES } from "@/services/learner-profiles/knowledge-status";
import { isoWeekKey } from "@/services/learner-profiles/weekly-plan-key";

/**
 * 本周计划：把学习路径里「优先巩固」的前几项变成可勾选的清单。
 *
 * 刻意用 localStorage 而不是新建数据库表：
 *   - 这只是一个学生自己看的短期清单，不是学业评价证据；
 *   - 不写库就不会污染画像指纹、不需要迁移、也不会让教师误以为是完成率；
 *   - 每周一自动换 key，旧清单自然归档，无需清理任务。
 * 界面里明确标注「仅本机保存」，避免学生以为勾选会同步。
 */

export interface WeeklyPlanItem {
  key: string;
  name: string;
  code?: string;
  conceptId?: string | null;
  masteryScore?: number | null;
  evidenceCount?: number;
  status?: keyof typeof STUDENT_KNOWLEDGE_STATES;
  /** 前置知识点缺口：先补哪些，再练这一项。 */
  prerequisiteGaps?: string[];
}

const STORAGE_PREFIX = "growth-weekly-plan";

function readDone(storageKey: string, week: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { week?: string; done?: unknown };
    return parsed.week === week && Array.isArray(parsed.done)
      ? parsed.done.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function WeeklyPlan({
  items,
  courseId,
  classroomId,
  readOnly = false,
}: {
  items: WeeklyPlanItem[];
  courseId: string;
  classroomId?: string;
  readOnly?: boolean;
}) {
  const storageKey = `${STORAGE_PREFIX}:${courseId}:${classroomId ?? "all"}`;
  const [week, setWeek] = useState<string>("");
  const [done, setDone] = useState<string[]>([]);

  useEffect(() => {
    const currentWeek = isoWeekKey();
    setWeek(currentWeek);
    setDone(readDone(storageKey, currentWeek));
  }, [storageKey]);

  function toggle(key: string) {
    setDone((previous) => {
      const next = previous.includes(key)
        ? previous.filter((item) => item !== key)
        : [...previous, key];
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ week, done: next }),
        );
      } catch {
        // 隐私模式或存储配额不足：仍保持当前会话内的勾选状态。
      }
      return next;
    });
  }

  const activeItems = items.slice(0, 6);
  const completed = activeItems.filter((item) =>
    done.includes(item.key),
  ).length;
  const progress = activeItems.length
    ? Math.round((completed / activeItems.length) * 100)
    : 0;

  return (
    /*
     * 与右侧「我的学习路径」等高：外层固定高度的 flex 列，
     * 头部与进度条固定，只有清单区滚动。条目变多时框体不抖，页面也不出现双层滚动。
     */
    <Panel className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0">
        <SectionHeading
          actions={
            activeItems.length ? (
              <span className="text-ink-soft text-xs tabular-nums">
                {readOnly
                  ? `${activeItems.length} 项`
                  : `${completed}/${activeItems.length} 已完成`}
              </span>
            ) : undefined
          }
          description="按薄弱程度排好的前 6 个知识点，挑这周要练的勾上即可。勾选只保存在这台设备，每周一自动重置，不会同步到教师端，也不计入成绩。"
          title="本周计划"
        />
      </div>
      {activeItems.length ? (
        <>
          <div
            aria-hidden="true"
            className="bg-muted mt-4 h-1.5 shrink-0 overflow-hidden rounded-full"
          >
            <div
              className="h-full rounded-full bg-sky-600 transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <ul className="mt-3 min-h-0 flex-1 [scrollbar-gutter:stable] divide-y overflow-y-auto pr-1">
            {activeItems.map((item, index) => {
              const checked = done.includes(item.key);
              const practiceHref =
                !readOnly && item.conceptId
                  ? `/student/recommendations?${new URLSearchParams({
                      view: "generate",
                      courseId,
                      ...(classroomId ? { classroomId } : {}),
                      conceptId: item.conceptId,
                    }).toString()}`
                  : null;
              /*
               * 合并「优先巩固」后，这里要承接原来那一列的状态与前置缺口信息，
               * 否则学生只看到一个知识点名，不知道它为什么排第一、还差什么。
               */
              const meta = [
                item.status
                  ? STUDENT_KNOWLEDGE_STATES[item.status].label
                  : null,
                typeof item.evidenceCount === "number"
                  ? `${item.evidenceCount} 条评分记录`
                  : null,
                item.prerequisiteGaps?.length
                  ? `先补：${item.prerequisiteGaps.join("、")}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  className="flex min-h-11 items-start gap-3 py-2"
                  key={item.key}
                >
                  <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                    <input
                      aria-label={`完成 ${item.name}`}
                      checked={checked}
                      className="mt-1 size-4 shrink-0 accent-sky-600 disabled:cursor-not-allowed"
                      disabled={readOnly}
                      onChange={() => toggle(item.key)}
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="text-ink-soft shrink-0 text-xs tabular-nums">
                          {index + 1}.
                        </span>
                        <span
                          className={`min-w-0 truncate text-sm ${
                            checked
                              ? "text-ink-soft line-through"
                              : "text-ink-body"
                          }`}
                        >
                          {item.name}
                        </span>
                        {item.masteryScore !== null &&
                        item.masteryScore !== undefined ? (
                          <span className="text-ink-soft shrink-0 text-xs tabular-nums">
                            {item.masteryScore}%
                          </span>
                        ) : null}
                      </span>
                      {meta ? (
                        <span className="text-ink-soft mt-0.5 block text-xs">
                          {meta}
                        </span>
                      ) : null}
                    </span>
                  </label>
                  {practiceHref ? (
                    <Link
                      aria-label={`练习${item.name}`}
                      className="text-brand-strong border-line hover:bg-muted mt-0.5 inline-flex min-h-9 shrink-0 items-center gap-0.5 rounded-md border px-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                      href={practiceHref}
                    >
                      去练
                      <ArrowUpRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {completed === activeItems.length ? (
            <p className="mt-3 flex shrink-0 items-center gap-1.5 text-xs font-medium text-emerald-800">
              <Check aria-hidden="true" className="size-3.5" />
              本周清单已全部完成，可以去学习路径继续挑新的知识点。
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-ink-soft mt-3 text-sm leading-6">
          目前没有需要优先巩固的知识点。完成作业或练习后，这里会自动列出最该补的内容。
        </p>
      )}
    </Panel>
  );
}
