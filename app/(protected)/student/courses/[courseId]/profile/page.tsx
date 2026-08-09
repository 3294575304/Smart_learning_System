import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LearnerProfileDetail } from "@/components/learner-profiles/profile-detail";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { studentProfilePathSchema } from "@/services/learner-profiles/schemas";
import { getStudentLearnerProfile } from "@/services/learner-profiles/service";

type Props = { params: Promise<{ courseId: string }> };

export default async function StudentLearnerProfilePage({ params }: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const path = studentProfilePathSchema.safeParse(await params);
  if (!path.success) notFound();
  try {
    const profile = await getStudentLearnerProfile(
      student.id,
      path.data.courseId,
    );
    return (
      <section className="space-y-6">
        <header>
          <Link
            className="text-muted-foreground text-sm underline"
            href="/student/analytics"
          >
            返回学情分析
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">
            {profile.course.name} · 我的课程画像
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            画像只使用可追溯的确定性数据，并明确区分无证据、证据不足与可形成结论。
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
