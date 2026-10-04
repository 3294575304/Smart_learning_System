import { Role } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KnowledgeGraphPublishedView } from "@/components/courses/knowledge-graph-published-view";
import { PageHeader } from "@/components/dashboard/page-header";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { listStudentPracticeCourses } from "@/services/course-recommendations/service";
import { getStudentPublishedKnowledgeGraph } from "@/services/knowledge-graph/service";
import { getStudentLearnerProfile } from "@/services/learner-profiles/service";

export default async function StudentCourseKnowledgeGraphPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const parsed = courseIdSchema.safeParse((await params).courseId);
  if (!parsed.success) notFound();

  let result;
  let profile;
  let practiceCourses;
  try {
    [result, profile, practiceCourses] = await Promise.all([
      getStudentPublishedKnowledgeGraph(student.id, parsed.data),
      getStudentLearnerProfile(student.id, parsed.data),
      listStudentPracticeCourses(student.id),
    ]);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  const practiceConceptIds = new Set(
    practiceCourses
      .filter((course) => course.courseId === parsed.data)
      .flatMap((course) => course.concepts.map((concept) => concept.id)),
  );

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="inline-flex items-center gap-2 rounded-md border bg-white px-4 py-2 text-sm"
            href="/student/analytics"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            返回学习分析
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
              practiceAvailable: practiceConceptIds.has(concept.conceptId),
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
