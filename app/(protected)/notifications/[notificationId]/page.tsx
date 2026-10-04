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

interface NotificationPageProps {
  params: Promise<{ notificationId: string }>;
}

const TYPE_LABELS: Record<NotificationType, string> = {
  ASSIGNMENT_PUBLISHED: "作业发布",
  ASSIGNMENT_DUE_SOON: "截止提醒",
  ASSIGNMENT_GRADED: "批改完成",
  LEARNING_ANALYSIS_READY: "学情分析",
  RECOMMENDATION_READY: "推荐更新",
  SYSTEM_ANNOUNCEMENT: "系统公告",
  COURSE_SURVEY_PUBLISHED: "课程问卷",
  CLASSROOM_DISSOLVED: "班级解散",
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
    const destination = expired
      ? null
      : resolveNotificationDestination(
          notification.type,
          notification.actionUrl,
        );

    return (
      <section className="mx-auto max-w-3xl space-y-5">
        <Link
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-50"
          href="/notifications"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          返回通知中心
        </Link>

        <article className="rounded-xl border bg-white p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">
              {TYPE_LABELS[notification.type]}
            </span>
            {notification.priority !== NotificationPriority.NORMAL ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
                {PRIORITY_LABELS[notification.priority]}
              </span>
            ) : null}
            <time className="text-gray-500">
              {formatTime(notification.createdAt)}
            </time>
            <NotificationReadStatus
              id={notification.id}
              alreadyRead={!!notification.readAt}
            />
          </div>

          <h1 className="mt-5 text-xl font-semibold text-gray-950">
            {notification.title}
          </h1>
          <p className="mt-3 text-sm leading-7 whitespace-pre-wrap text-gray-700">
            {notification.content}
          </p>
        </article>

        {expired && (
          <p className="rounded-lg border bg-amber-50 p-4 text-sm text-amber-800">
            该通知已过期，内容仅供回顾。请从课程或作业列表查看最新状态。
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {destination && destination !== "/notifications" ? (
            <NotificationLink href={destination} label="打开相关内容" />
          ) : null}
          <Link
            className="inline-flex items-center rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            href="/notifications"
          >
            返回通知列表
          </Link>
        </div>
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
