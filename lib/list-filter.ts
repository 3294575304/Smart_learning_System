/**
 * 列表页「关键词 + 筛选条件」的纯函数工具。
 *
 * 班级管理、课程管理两处的搜索必须完全一致（同一套大小写、全角半角、多关键词
 * 的处理规则），所以规则集中在这里，由 tests/lists/list-filter.test.ts 覆盖。
 * 这里不引入任何 React 或数据库依赖，方便被客户端组件与服务端测试共用。
 */

/** 统一全角半角与大小写，避免「ＰＹＴＨＯＮ」搜不到「Python」。 */
export function normalizeFilterText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").toLowerCase();
}

/**
 * 关键词按空白（含全角空格、连续空格）切分。
 * 只有一个词时等价于模糊包含；多个词时要求「全部命中」，例如
 * 「python 2班」既能匹配「python 2班」也能匹配「Python 2班 演示」。
 */
export function tokenizeFilterKeyword(keyword: string): string[] {
  return normalizeFilterText(keyword)
    .split(/\s+/u)
    .filter((token) => token.length > 0);
}

/**
 * 多字段关键词匹配：每个词都要在任意一个字段中出现（字段间 AND，词间 AND）。
 *
 * 字段之间用空格拼接，避免相邻字段拼出原本不存在的词而误命中。
 */
export function matchesFilterKeyword(
  keyword: string,
  fields: ReadonlyArray<string | null | undefined>,
): boolean {
  const tokens = tokenizeFilterKeyword(keyword);
  if (tokens.length === 0) return true;
  const haystack = fields
    .map(normalizeFilterText)
    .filter((field) => field.length > 0)
    .join(" ");
  return tokens.every((token) => haystack.includes(token));
}

/**
 * 生成筛选结果摘要文案，供 aria-live 播报和界面提示共用。
 *
 * - 没有任何条件时：`共 12 个班级 · 可按班级名称、邀请码、关联课程搜索`
 * - 有条件且有结果时：`找到 3 / 12 个班级 · 当前条件：状态「已结课」、关键词「python」`
 * - 有条件且无结果时：交给空状态组件展示详情，这里只说「没有匹配的班级」
 */
export function describeFilterSummary(input: {
  visibleCount: number;
  totalCount: number;
  /** 量词 + 名词，例如「个班级」「门课程」 */
  unit: string;
  /** 已生效条件的说明，例如 `状态「已结课」` */
  conditions: ReadonlyArray<string>;
  /** 未筛选时的操作提示 */
  idleHint?: string;
}): string {
  const { visibleCount, totalCount, unit, conditions, idleHint } = input;

  if (conditions.length === 0) {
    return `共 ${totalCount} ${unit}${idleHint ? ` · ${idleHint}` : ""}`;
  }
  if (visibleCount === 0) {
    return `共 ${totalCount} ${unit}中没有匹配项 · 当前条件：${conditions.join("、")}`;
  }
  return `找到 ${visibleCount} / ${totalCount} ${unit} · 当前条件：${conditions.join("、")}`;
}

/** 是否已有筛选条件生效（决定「重置」按钮可用性与空结果提示）。 */
export function hasActiveFilterCondition(input: {
  keyword: string;
  values: ReadonlyArray<string>;
}): boolean {
  return (
    tokenizeFilterKeyword(input.keyword).length > 0 ||
    input.values.some((value) => value !== "")
  );
}

/**
 * 从 searchParams 取一个受白名单约束的值。
 *
 * 分享链接可能被手改成任意字符串，非法值一律回退为空（= 不筛选），
 * 既不报错也不会让用户面对「0 条结果却看不出原因」的界面。
 */
export function readAllowedParam(
  value: string | undefined,
  allowed: ReadonlyArray<string>,
): string {
  if (!value) return "";
  return allowed.includes(value) ? value : "";
}

/** 从 searchParams 取一个长度受控的文本值，避免超长链接被回填进搜索框。 */
export function readTextParam(
  value: string | undefined,
  maxLength = 80,
): string {
  return (value ?? "").trim().slice(0, maxLength);
}
