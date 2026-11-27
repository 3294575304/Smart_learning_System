import type { KnowledgeStatus } from "@/services/learner-profiles/knowledge-status";

/**
 * 知识点五态的颜色与形状。
 *
 * 抽成共享模块的原因：章节掌握用了"色 + 形"双重编码，而学习路径只写了
 * 状态文字，同一门课里同一个状态出现两种呈现。两份定义各写各的，
 * 迟早继续漂移，所以统一放这里，两处都从这里取。
 *
 * 形状不是装饰。色弱用户、灰度打印、以及截图降采样之后，
 * "已掌握（绿）"和"巩固中（蓝）"会退化成同一个灰点，形状是唯一的区分手段：
 *   已掌握 = 实心圆 · 巩固中 = 半实心圆 · 需加强 = 菱形
 *   待进一步评估 = 粗环 · 尚未评估 = 虚线环
 * 分布条高度只有 8px，承载不了形状，仍只用颜色；形状用在图例与概念行上，
 * 而那两处本来就紧挨着状态文字，形状是冗余提示而非唯一信息。
 */
export const knowledgeStateColor: Record<KnowledgeStatus, string> = {
  MASTERED: "bg-emerald-600",
  /*
   * 「巩固中」原本用 brand-strong（深品牌蓝），亮度高于已掌握的翠绿，
   * 在 8px 分布条上反而最抢眼，与「过渡态应弱于已掌握」的语义相反。
   * 改为天蓝，恢复「深绿=好 / 浅蓝=过渡 / 玫红=差」的强弱顺序。
   */
  DEVELOPING: "bg-sky-500",
  NEEDS_SUPPORT: "bg-rose-600",
  INSUFFICIENT: "bg-amber-500",
  NO_EVIDENCE: "bg-neutral-400",
};

export const knowledgeStateDot: Record<KnowledgeStatus, string> = {
  MASTERED: "rounded-full bg-emerald-600",
  DEVELOPING:
    "rounded-full border border-sky-500 bg-gradient-to-r from-sky-500 from-50% to-transparent to-50%",
  NEEDS_SUPPORT: "rotate-45 rounded-[1px] bg-rose-600",
  INSUFFICIENT: "rounded-full border-2 border-amber-500 bg-transparent",
  NO_EVIDENCE:
    "rounded-full border border-dashed border-neutral-400 bg-transparent",
};
