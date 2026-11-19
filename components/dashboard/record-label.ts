import { examTypeLabel } from "@/services/exams/exam-types";

/**
 * 成绩记录的类别文案。
 *
 * kind 来自两处：在线任务的 examSession.type 或
 * 成绩台账条目的 type，作业统一为 ASSIGNMENT。
 * 图表横轴、记录表、成绩详情共用同一套说法，避免三处各写一遍。
 */
export function isExamKind(kind: string) {
  return kind !== "ASSIGNMENT";
}

export function shortKindLabel(kind: string) {
  if (!isExamKind(kind)) return "作业";
  return examTypeLabel(kind);
}

export function recordLabel(kind: string, href: string) {
  if (!isExamKind(kind)) return "作业";
  return `${shortKindLabel(kind)} · ${
    href.startsWith("/student/results") ? "成绩台账" : "在线考试"
  }`;
}

/**
 * 任务名本身常包含类别词（例如标题就叫「期中考试」），
 * 直接拼接会出现「期末考试 · 期中考试」这类叠词，这里先做一次去重。
 */
export function withKind(kind: string, title: string) {
  const label = shortKindLabel(kind);
  return title.includes(label) ? title : `${label} · ${title}`;
}
