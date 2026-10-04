import { getStudentClassroomContext } from "@/services/courses/student-access";
import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LearnerProfileDetail } from "@/components/learner-profiles/profile-detail";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { studentProfilePathSchema } from "@/services/learner-profiles/schemas";
import { getStudentLearnerProfile } from "@/services/learner-profiles/service";

type Props = {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StudentLearnerProfilePage({
  params,
  searchParams,
}: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const path = studentProfilePathSchema.safeParse(await params);
  if (!path.success) notFound();
  const query = await searchParams;
  if (query.classroomId !== undefined && typeof query.classroomId !== "string")
    notFound();
  const classroomId = query.classroomId;
  try {
    if (classroomId)
      await getStudentClassroomContext(
        student.id,
        classroomId,
        path.data.courseId,
      );
    const profile = await getStudentLearnerProfile(
      student.id,
      path.data.courseId,
    );
    return (
      <section className="space-y-6">
        <header>
          <Link
            className="text-muted-foreground text-sm underline"
            href={`/student/courses/${profile.course.id}/learning-center${classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : ""}`}
          >
            返回课程学习中心
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">
            {profile.course.name} · 我的课程画像
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            基于已完成作答查看学习状态。尚未评估或待进一步评估的知识点，需要更多练习后才能形成可靠判断。
          </p>
        </header>
        <LearnerProfileDetail profile={profile} />
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
