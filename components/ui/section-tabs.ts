/**
 * 内容区分段导航的统一外观。
 *
 * 练习中心、我的题库、课程学习中心此前各写了一套页签样式，视觉与点击高度都不一致。
 * 这里只统一「外观」，不改变语义：页内切换仍是 button + role="tab"，
 * 跨 URL 导航仍是 a + aria-current="page"，各自的键盘行为不变。
 */
export const SECTION_TABS_LIST =
  "flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-sky-100 bg-white p-1";

/** 关键控件按 44px 点击高度（min-h-11）设计，未选中态用 slate-600 满足小字对比度。 */
export function sectionTabClass(active: boolean) {
  return [
    "flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700",
    active
      ? "bg-sky-50 text-sky-800 ring-1 ring-sky-200 ring-inset"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-800",
  ].join(" ");
}
