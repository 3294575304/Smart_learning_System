import { NotificationPriority, NotificationType } from "@prisma/client";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAuthenticatedPageUser } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { notificationIdSchema } from "@/services/notifications/schemas";
import {
  getUserNotification,
  markNotificationRead,
} from "@/services/notifications/service";
import { resolveNotificationDestination } from "@/components/notifications/presenters";

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
    let notification = await getUserNotification(user.id, parsedId.data);
    if (!notification.readAt) {
      const readResult = await markNotificationRead(user.id, notification.id);
      notification = { ...notification, readAt: readResult.readAt };
    }

    const destination = resolveNotificationDestination(
      notification.type,
      notification.actionUrl,
    );

    return (
      <section className="mx-auto max-w-3xl space-y-5">
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition hover:text-gray-950"
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
            <span className="ml-auto font-medium text-gray-600">已读</span>
          </div>

          <h1 className="mt-5 text-xl font-semibold text-gray-950">
            {notification.title}
          </h1>
          <p className="mt-3 text-sm leading-7 whitespace-pre-wrap text-gray-700">
            {notification.content}
          </p>
        </article>

        <div className="flex flex-wrap gap-2">
          {destination && destination !== "/notifications" ? (
            <Link
              className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
              href={destination}
            >
              打开相关内容
              <ExternalLink aria-hidden="true" className="size-4" />
            </Link>
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
