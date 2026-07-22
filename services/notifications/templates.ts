import {
  NOTIFICATION_MAX_CONTENT_LENGTH,
  NOTIFICATION_MAX_TITLE_LENGTH,
  NOTIFICATION_TIME_ZONE,
} from "@/services/notifications/constants";

export interface NotificationTemplate {
  title: string;
  content: string;
}

function plainText(value: string, maxLength: number): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 1))}…`;
}

function template(title: string, content: string): NotificationTemplate {
  return {
    title: plainText(title, NOTIFICATION_MAX_TITLE_LENGTH),
    content: plainText(content, NOTIFICATION_MAX_CONTENT_LENGTH),
  };
}

export function formatNotificationTime(value: Date): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: NOTIFICATION_TIME_ZONE,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  return `${valueByType.get("month")}月${valueByType.get("day")}日 ${valueByType.get("hour")}:${valueByType.get("minute")}`;
}

export function assignmentPublishedTemplate(input: {
  assignmentTitle: string;
  teacherName: string;
  dueAt: Date;
}): NotificationTemplate {
  const assignmentTitle = plainText(input.assignmentTitle, 80);
  const teacherName = plainText(input.teacherName, 50);
  return template(
    "新作业已发布",
    `${teacherName}发布了作业《${assignmentTitle}》，请在 ${formatNotificationTime(input.dueAt)} 前完成。`,
  );
}

export function assignmentDueSoonTemplate(input: {
  assignmentTitle: string;
  dueAt: Date;
}): NotificationTemplate {
  return template(
    "作业即将截止",
    `作业《${plainText(input.assignmentTitle, 80)}》将在 ${formatNotificationTime(input.dueAt)} 截止，请及时完成并提交。`,
  );
}

export function assignmentGradedTemplate(input: {
  assignmentTitle: string;
}): NotificationTemplate {
  return template(
    "作业已批改",
    `作业《${plainText(input.assignmentTitle, 80)}》已完成批改，可前往成绩页面查看结果。`,
  );
}

export function learningAnalysisReadyTemplate(): NotificationTemplate {
  return template(
    "学情分析已生成",
    "新的学情分析已经生成，可前往学情分析页面查看学习表现与建议。",
  );
}

export function recommendationReadyTemplate(input: {
  count: number;
}): NotificationTemplate {
  return template(
    "个性化推荐已更新",
    `已生成 ${Math.max(0, Math.trunc(input.count))} 道新的个性化练习，可前往推荐练习页面查看。`,
  );
}

export function systemAnnouncementTemplate(input: {
  title: string;
  content: string;
}): NotificationTemplate {
  return template(input.title, input.content);
}
