import { ArrowRight } from "lucide-react";
// 组件同时被服务端页面与单元测试（经典 JSX runtime）渲染，显式引入 React。
import React from "react";

import { courseCoverOf, type CourseCoverKey } from "@/lib/course-covers";
import { cn } from "@/lib/utils";

/**
 * 应用内的课程封面顶部条（设计稿「柔彩浅封」）。
 *
 * 只负责视觉：浅色底 + 右上柔光 + 左下学科色暗角、左侧 3px 色带、
 * 图标徽章、课程号，右侧可选一个「进入课程」提示。
 * 点击行为由外层卡片提供，这里不渲染链接，避免和卡片的整块点击区打架。
 *
 * 样式全部走内联值：主题 CSS 里已有针对 `st-course-cover` /
 * `tt-course-cover` 的背景覆盖，换用独立类名可以避免学科色被主题吃掉。
 */

function CoverIcon({ coverKey }: { coverKey: CourseCoverKey }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="19"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.1"
      viewBox="0 0 24 24"
      width="19"
    >
      {coverKey === "engineering" ? (
        <g
          transform="rotate(45 12 12) matrix(1.1,0,0,1.1,-1.2,-1.2)"
          strokeWidth="1.9"
        >
          <rect height="4.3" rx="1.3" width="9.4" x="7.3" y="4" />
          <path d="M12 8.3v11.5" />
        </g>
      ) : null}
      {coverKey === "science" ? (
        <>
          <circle cx="10.5" cy="10.5" r="6.9" strokeWidth="2.4" />
          <path d="M15.6 15.6 20.9 20.9" strokeWidth="2.8" />
        </>
      ) : null}
      {coverKey === "humanities" ? (
        <>
          <path d="M12 5.6C10.3 4.5 8 4.1 5.4 4.5v12.6c2.6-.4 4.9 0 6.6 1.1 1.7-1.1 4-1.5 6.6-1.1V4.5C16 4.1 13.7 4.5 12 5.6z" />
          <path d="M12 5.6v12.6" />
        </>
      ) : null}
      {coverKey === "general" ? (
        <>
          <circle cx="12" cy="12" r="8.2" />
          <path d="M3.8 12h16.4" />
          <ellipse cx="12" cy="12" rx="3.6" ry="8.2" />
        </>
      ) : null}
    </svg>
  );
}

export interface CourseCoverProps {
  coverKey: string | null | undefined;
  /** 封面右侧显示的课程号；为空时显示「课程号未设置」 */
  courseNo?: string | null;
  /** 双行文案的主行（管理员端用来显示模板名），传了就不显示课程号 */
  title?: string | null;
  /** 双行文案的副行（模板编码） */
  subtitle?: string | null;
  /** 右侧操作提示文案，传 null 表示不显示（教师端） */
  action?: string | null;
  /** 是否显示「课程号」小标签，独立预览时可关掉 */
  showLabel?: boolean;
  height?: number;
  className?: string;
}

export function CourseCover({
  coverKey,
  courseNo,
  title,
  subtitle,
  action = null,
  showLabel = true,
  height = 58,
  className,
}: CourseCoverProps) {
  const cover = courseCoverOf(coverKey);
  const { s1, s2, deep, ink, rgb } = cover.palette;
  const twoLine = Boolean(title);

  return (
    <div
      className={cn(
        "relative flex items-center justify-between gap-2.5 overflow-hidden border-b",
        className,
      )}
      data-cover={cover.key}
      style={{
        height,
        paddingInline: "16px 14px",
        backgroundColor: deep,
        backgroundImage: [
          // 右上偏白的柔光，制造「一张封面图」的明暗
          "radial-gradient(125% 210% at 86% -40%, rgba(255,255,255,.78), rgba(255,255,255,0) 62%)",
          // 左下学科色暗角，压住浅底，避免整条发白
          `radial-gradient(110% 190% at 0% 145%, rgba(${rgb},.20), rgba(${rgb},0) 58%)`,
        ].join(", "),
        color: ink,
        borderBottomColor: `rgba(${rgb},.13)`,
      }}
    >
      {/* 左侧 3px 学科色带 */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: `linear-gradient(180deg, ${s1}, ${s2})` }}
      />

      <span className="relative flex min-w-0 items-center gap-2.5">
        <span
          className="grid size-[30px] shrink-0 place-items-center rounded-[9px]"
          style={{
            background: "rgba(255,255,255,.82)",
            color: s1,
            boxShadow: `0 1px 2px rgba(${rgb},.12)`,
          }}
        >
          <CoverIcon coverKey={cover.key} />
        </span>
        <span
          className="min-w-0 truncate"
          style={{ fontSize: 11.5, letterSpacing: ".015em", color: ink }}
        >
          {twoLine ? (
            <>
              <span
                className="block truncate"
                style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}
              >
                {title}
              </span>
              <span
                className="block truncate"
                style={{
                  marginTop: 2,
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: 11,
                  letterSpacing: ".03em",
                  opacity: 0.62,
                  lineHeight: 1.3,
                }}
              >
                {subtitle}
              </span>
            </>
          ) : (
            <>
              {showLabel ? (
                <span style={{ marginRight: 6, fontSize: 11, opacity: 0.6 }}>
                  课程号
                </span>
              ) : null}
              <span
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: 12.5,
                  fontWeight: 600,
                  letterSpacing: ".03em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {courseNo?.trim() ? courseNo : "未设置"}
              </span>
            </>
          )}
        </span>
      </span>

      {action ? (
        <span
          aria-hidden="true"
          className="relative inline-flex shrink-0 items-center gap-1 whitespace-nowrap"
          style={{
            color: s1,
            fontSize: 12.5,
            fontWeight: 500,
            letterSpacing: "normal",
          }}
        >
          {action}
          <ArrowRight className="size-3" strokeWidth={2} />
        </span>
      ) : null}
    </div>
  );
}
