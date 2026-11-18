import { notFound, redirect } from "next/navigation";

import { studentCourseTabHref } from "@/services/courses/student-workspace";
import { studentProfilePathSchema } from "@/services/learner-profiles/schemas";
import { requirePageRole } from "@/services/auth/page-authorization";
import { Role } from "@prisma/client";

type Props = {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * 兼容旧链接的跳转层。
 *
 * 完整画像现在只有一个入口：学习中心 → 知识与成长 → 我的画像。
 * 这个独立地址曾经同时渲染一份完整画像 + 证据钻取，造成两份入口、
 * 两份「快照修订」说明，且返回链接会来回打架。现在统一收敛为 deep-link：
 *   - 带 `conceptId` → 跳到成长页并定位到该知识点的证据明细；
 *   - 不带参数 → 直接跳到成长页画像。
 * 目标页自己完成鉴权、班级上下文校验与证据聚焦，这里不再重复查询。
 */
export default async function StudentLearnerProfilePage({
  params,
  searchParams,
}: Props) {
  await requirePageRole(Role.STUDENT);
  const path = studentProfilePathSchema.safeParse(await params);
  if (!path.success) notFound();
  const query = await searchParams;
  const classroomId =
    typeof query.classroomId === "string" ? query.classroomId : undefined;
  const conceptId =
    typeof query.conceptId === "string" && query.conceptId
      ? query.conceptId
      : undefined;
  const href = classroomId
    ? studentCourseTabHref(path.data.courseId, classroomId, "growth", "profile")
    : `/student/courses/${encodeURIComponent(path.data.courseId)}/learning-center?${new URLSearchParams({ tab: "growth", section: "profile" })}`;
  redirect(
    conceptId
      ? `${href}&conceptId=${encodeURIComponent(conceptId)}#profile-concept-${encodeURIComponent(conceptId)}`
      : href,
  );
}
