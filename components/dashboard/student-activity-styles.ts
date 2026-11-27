/** 学生活动列表共用的样式，拆出来避免客户端筛选组件把服务端页面拖进客户端包。 */

export const activityCardClass =
  "st-activity-card min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5";

/** 次要动作：白底描边 + 品牌色文字，不与「进入考试」这类主操作抢权重。 */
export const activityActionClass =
  "inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-brand-strong hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";

/** 主操作：实心品牌色，全页只应出现一次（进入/继续/再次作答）。 */
export const activityPrimaryClass =
  "inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";

export const activityControlClass =
  "min-h-10 w-full min-w-0 rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-700";
