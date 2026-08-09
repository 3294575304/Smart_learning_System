import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LearnerProfileDetail } from "@/components/learner-profiles/profile-detail";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { teacherProfilePathSchema } from "@/services/learner-profiles/schemas";
import { getTeacherStudentLearnerProfile } from "@/services/learner-profiles/service";

type Props = { params: Promise<{ courseId: string; studentId: string }> };

export default async function TeacherStudentProfilePage({ params }: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const path = teacherProfilePathSchema.safeParse(await params);
  if (!path.success) notFound();
  try {
    const profile = await getTeacherStudentLearnerProfile(
      teacher.id,
      path.data.courseId,
      path.data.studentId,
    );
    return (
      <section className="space-y-6">
        <header>
          <Link
            className="text-muted-foreground text-sm underline"
            href={`/teacher/courses/${path.data.courseId}/profiles`}
          >
            返回班级画像
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">
            {profile.student.displayName} · 课程画像
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {profile.course.name} · {profile.student.studentNo ?? "无学号"} ·{" "}
            {profile.student.email}
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
