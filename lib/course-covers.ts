/**
 * 课程封面库。
 *
 * 封面按学科分为四款（工科 / 理科 / 文科 / 公共课），视觉统一采用
 * 设计稿里的「柔彩浅封」：浅色底 + 右上柔光 + 左下学科色暗角 + 图标徽章，
 * 学生端、教师端课程卡与管理员端的封面库预览共用同一份数据与组件。
 *
 * 新增封面只需在这里追加一项（并同步 CourseCoverKey 的联合类型），
 * 数据库里存的是 key 字符串，无需迁移。
 */

export const COURSE_COVER_KEYS = [
  "engineering",
  "science",
  "humanities",
  "general",
] as const;

export type CourseCoverKey = (typeof COURSE_COVER_KEYS)[number];

export const DEFAULT_COURSE_COVER_KEY: CourseCoverKey = "engineering";

export interface CourseCoverPalette {
  /** 主色，用于编号、操作链接 */
  s1: string;
  /** 主色渐变止点，用于左侧色带 */
  s2: string;
  /** 封面色底，比浅色版深一档，才能压出光感 */
  deep: string;
  /** 更浅一档的底，用于图标徽章等小面积填充 */
  soft: string;
  /** 封面上正文的字色 */
  ink: string;
  /** 主色的 RGB 三元组，用于 rgba() 叠加柔光与暗角 */
  rgb: string;
}

export interface CourseCoverDefinition {
  key: CourseCoverKey;
  /** 封面名，管理员在封面库和选择器里看到的名字 */
  name: string;
  /** 对应学科 */
  subject: string;
  /** 一句话说明适用范围 */
  summary: string;
  palette: CourseCoverPalette;
}

export const COURSE_COVERS: Record<CourseCoverKey, CourseCoverDefinition> = {
  engineering: {
    key: "engineering",
    name: "工科 · 深钢蓝",
    subject: "工科",
    summary: "程序设计、机械、电气、自动化等偏构造与实现的课程。",
    palette: {
      s1: "#124E78",
      s2: "#2378A8",
      deep: "#D3E2F0",
      soft: "#E9F0F8",
      ink: "#0B3757",
      rgb: "18,78,120",
    },
  },
  science: {
    key: "science",
    name: "理科 · 青绿",
    subject: "理科",
    summary: "数学、物理、化学、生物等偏推演与实验的课程。",
    palette: {
      s1: "#08624F",
      s2: "#0F8470",
      deep: "#CFE7DE",
      soft: "#E3F2ED",
      ink: "#05483B",
      rgb: "8,98,79",
    },
  },
  humanities: {
    key: "humanities",
    name: "文科 · 赭褐",
    subject: "文科",
    summary: "语文、历史、哲学、法学等以文本为主的课程。",
    palette: {
      s1: "#7B4325",
      s2: "#A2663A",
      deep: "#EFDEC9",
      soft: "#F7EFE3",
      ink: "#5B3017",
      rgb: "123,67,37",
    },
  },
  general: {
    key: "general",
    name: "公共课 · 靛紫",
    subject: "公共课",
    summary: "英语、思政、体育、通识等覆盖面广的课程。",
    palette: {
      s1: "#41357C",
      s2: "#6454A4",
      deep: "#DBD3F1",
      soft: "#EDE9F9",
      ink: "#322A61",
      rgb: "65,53,124",
    },
  },
};

export const COURSE_COVER_LIST: CourseCoverDefinition[] = COURSE_COVER_KEYS.map(
  (key) => COURSE_COVERS[key],
);

export function isCourseCoverKey(value: unknown): value is CourseCoverKey {
  return (
    typeof value === "string" &&
    (COURSE_COVER_KEYS as readonly string[]).includes(value)
  );
}

/** 数据库里存的是字符串；历史数据或脏值一律回落到默认封面。 */
export function courseCoverOf(key: string | null | undefined) {
  return isCourseCoverKey(key)
    ? COURSE_COVERS[key]
    : COURSE_COVERS[DEFAULT_COURSE_COVER_KEY];
}
