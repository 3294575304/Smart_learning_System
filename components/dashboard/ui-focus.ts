/**
 * 统一焦点环。
 *
 * 改造前这些类名在首页 9 个文件里手写了 24 次，色值一律写 `outline-sky-700`，
 * 但 offset 时有时无，键盘 Tab 时会出现"有的环贴边、有的环留 2px"的抖动。
 * 收成常量后只需改这一处即可全站生效。
 *
 * 用三种而不是一种，是因为约束不同、不能强行合并：
 * - FOCUS_RING        常规浅底控件，留 2px 让环不贴边
 * - FOCUS_RING_ON_DARK 深色底（考试卡）上蓝色环几乎不可见，必须换白环
 * - FOCUS_RING_TIGHT  可滚动容器（tabIndex=0 的 region），offset 会被容器裁切
 */
export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export const FOCUS_RING_ON_DARK =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export const FOCUS_RING_TIGHT =
  "focus-visible:outline-2 focus-visible:outline-brand";
