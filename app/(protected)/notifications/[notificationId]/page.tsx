import { NotificationPriority, NotificationType } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAuthenticatedPageUser } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { notificationIdSchema } from "@/services/notifications/schemas";
import { getUserNotification } from "@/services/notifications/service";
import { resolveNotificationDestination } from "@/components/notifications/presenters";

import { NotificationLink } from "@/components/notifications/notification-link";
import { NotificationReadStatus } from "@/components/notifications/notification-read-status";
import { StudentNotificationAction } from "@/components/notifications/student-notification-action";

interface NotificationPageProps {
  params: Promise<{ notificationId: string }>;
}

const TYPE_LABELS: Record<NotificationType, string> = {
  ATTENDANCE_PUBLISHED: "课堂签到",
  ASSIGNMENT_PUBLISHED: "作业发布",
  ASSIGNMENT_REVOKED: "作业撤销",
  ASSIGNMENT_DUE_SOON: "截止提醒",
  ASSIGNMENT_GRADED: "批改完成",
  LEARNING_ANALYSIS_READY: "学情分析",
  RECOMMENDATION_READY: "推荐更新",
  SYSTEM_ANNOUNCEMENT: "系统公告",
  COURSE_SURVEY_PUBLISHED: "课程问卷",
  CLASSROOM_DISSOLVED: "班级变更",
  COURSE_ANNOUNCEMENT: "课程通知",
  QUALITY_REPORT_RESULT: "教学质量报告",
};

const PRIORITY_LABELS: Record<NotificationPriority, string> = {
  NORMAL: "普通",
  IMPORTANT: "重要",
  URGENT: "紧急",
};

function formatTime(value: Date): string {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
  });
}

export default async function NotificationDetailPage({
  params,
}: NotificationPageProps) {
  const user = await requireAuthenticatedPageUser();
  const parsedId = notificationIdSchema.safeParse(
    (await params).notificationId,
  );
  if (!parsedId.success) notFound();

  try {
    const notification = await getUserNotification(user.id, parsedId.data);

    const expired =
      notification.expiresAt !== null && notification.expiresAt <= new Date();
    const destination =
      expired || user.role === "STUDENT"
        ? null
        : resolveNotificationDestination(
            notification.type,
            notification.actionUrl,
          );

    return (
      <section className="w-full min-w-0 space-y-4 sm:space-y-6">
        <Link
          className="border-line bg-card inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-sky-800 transition hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          href="/notifications"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          返回通知中心
        </Link>

        <article className="border-line bg-card overflow-hidden rounded-xl border shadow-[var(--shadow-card)]">
          <div className="min-w-0 p-4 sm:p-6 lg:p-8">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <span className="bg-brand-soft text-brand-strong rounded-full px-3 py-1 font-medium">
                {TYPE_LABELS[notification.type]}
              </span>
              {notification.priority !== NotificationPriority.NORMAL ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
                  {PRIORITY_LABELS[notification.priority]}
                </span>
              ) : null}
              <time
                className="text-ink-soft tabular-nums"
                dateTime={notification.createdAt.toISOString()}
              >
                {formatTime(notification.createdAt)}
              </time>
              <NotificationReadStatus
                id={notification.id}
                alreadyRead={!!notification.readAt}
              />
            </div>

            <h1 className="text-ink mt-4 text-2xl leading-tight font-semibold [overflow-wrap:anywhere] sm:mt-6 sm:text-3xl">
              {notification.title}
            </h1>
            <p className="text-ink-body mt-3 max-w-[68ch] text-base leading-7 [overflow-wrap:anywhere] whitespace-pre-wrap sm:mt-4">
              {notification.content}
            </p>
          </div>
          {(expired ||
            notification.action ||
            notification.actionMessage ||
            (destination && destination !== "/notifications")) && (
            <div className="border-line flex flex-wrap items-center gap-3 border-t bg-sky-50/40 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
              {!expired && notification.action && (
                <StudentNotificationAction
                  action={notification.action}
                  title={notification.title}
                />
              )}
              {(expired || notification.actionMessage) && (
                <p className="text-ink-body min-w-0 text-sm leading-6 [overflow-wrap:anywhere]">
                  {expired
                    ? "通知已过期。请从课程记录查看最新状态。"
                    : notification.actionMessage}
                </p>
              )}
              {destination && destination !== "/notifications" ? (
                <NotificationLink href={destination} label="打开相关内容" />
              ) : null}
            </div>
          )}
        </article>
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
