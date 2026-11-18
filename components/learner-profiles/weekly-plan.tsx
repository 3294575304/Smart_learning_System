"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ArrowUpRight } from "lucide-react";

import { Panel, SectionHeading } from "@/components/ui/panel";
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
    <Panel>
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
        description="从「优先巩固」里挑几项这周要练的知识点。勾选只保存在这台设备，每周一自动重置，不会同步到教师端，也不计入成绩。"
        title="本周计划"
      />
      {activeItems.length ? (
        <>
          <div
            aria-hidden="true"
            className="bg-muted mt-4 h-1.5 overflow-hidden rounded-full"
          >
            <div
              className="h-full rounded-full bg-sky-600 transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <ul className="mt-3 divide-y">
            {activeItems.map((item) => {
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
              return (
                <li
                  className="flex min-h-11 items-center gap-3 py-2"
                  key={item.key}
                >
                  <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      aria-label={`完成 ${item.name}`}
                      checked={checked}
                      className="size-4 shrink-0 accent-sky-600 disabled:cursor-not-allowed"
                      disabled={readOnly}
                      onChange={() => toggle(item.key)}
                      type="checkbox"
                    />
                    <span
                      className={`min-w-0 truncate text-sm ${
                        checked ? "text-ink-soft line-through" : "text-ink-body"
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
                  </label>
                  {practiceHref ? (
                    <Link
                      className="text-ink-soft hover:text-ink inline-flex min-h-10 shrink-0 items-center gap-0.5 text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
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
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-800">
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
