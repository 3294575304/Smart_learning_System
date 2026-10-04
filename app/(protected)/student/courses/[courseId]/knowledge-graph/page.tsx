import { getStudentClassroomContext } from "@/services/courses/student-access";
import { Role } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KnowledgeGraphPublishedView } from "@/components/courses/knowledge-graph-published-view";
import { StudentPageHeader as PageHeader } from "@/components/dashboard/student-page-header";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getStudentPublishedKnowledgeGraph } from "@/services/knowledge-graph/service";
import { getStudentLearnerProfile } from "@/services/learner-profiles/service";

export default async function StudentCourseKnowledgeGraphPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const parsed = courseIdSchema.safeParse((await params).courseId);
  if (!parsed.success) notFound();

  const query = await searchParams;
  if (query.classroomId !== undefined && typeof query.classroomId !== "string")
    notFound();
  const classroomId = query.classroomId;
  let result;
  let profile;
  try {
    if (classroomId)
      await getStudentClassroomContext(student.id, classroomId, parsed.data);
    [result, profile] = await Promise.all([
      getStudentPublishedKnowledgeGraph(student.id, parsed.data),
      getStudentLearnerProfile(student.id, parsed.data),
    ]);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="inline-flex items-center gap-2 rounded-md border bg-white px-4 py-2 text-sm"
            href={`/student/courses/${parsed.data}/learning-center${classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : ""}`}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            返回课程学习中心
          </Link>
        }
        description={
          result.published
            ? `正式图谱第 ${result.published.versionNumber} 版 · 发布于 ${result.published.publishedAt.toLocaleDateString("zh-CN")}`
            : "教师发布课程知识图谱后，可在此查看课程知识结构。"
        }
        title={`${result.course.name} · 知识图谱`}
      />
      {result.published ? (
        <KnowledgeGraphPublishedView
          classroomId={classroomId}
          courseId={result.course.id}
          graph={result.published.structure}
          mastery={result.published.concepts.map((concept) => {
            const item = profile.concepts.find(
              (entry) => entry.conceptId === concept.conceptId,
            );
            return {
              stableKey: concept.stableKey,
              conceptId: concept.conceptId,
              evidenceState: item?.evidenceState ?? "NO_EVIDENCE",
              evidenceCount: item?.evidenceCount ?? 0,
              confidence: item?.confidence ?? 0,
              masteryScore: item?.masteryScore ?? null,
              evidenceUpdatedAt: item?.evidenceUpdatedAt?.toISOString() ?? null,
            };
          })}
        />
      ) : (
        <p className="border-t py-8 text-center text-sm text-gray-500">
          当前课程还没有已发布的知识图谱。
        </p>
      )}
    </section>
  );
}
