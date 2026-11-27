import { Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { CourseContentCoverage } from "@/components/courses/course-content-coverage";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getTeacherCourseContentCoverage } from "@/services/courses/content-coverage";
import { courseIdSchema } from "@/services/courses/schemas";

type CoverageOpen = "gaps" | "evidence" | "all";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseOpen(value: string | undefined): CoverageOpen | undefined {
  return value === "gaps" || value === "evidence" || value === "all"
    ? value
    : undefined;
}

export default async function CourseCoveragePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{
    open?: string | string[];
    limit?: string | string[];
    created?: string | string[];
  }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const scope = courseIdSchema.safeParse((await params).courseId);
  if (!scope.success) notFound();
  const courseId = scope.data;
  const search = await searchParams;
  const open = parseOpen(firstValue(search.open));
  const createdName = firstValue(search.created)?.slice(0, 40);
  const coverage = await getTeacherCourseContentCoverage(
    teacher.id,
    courseId,
  ).catch((error: unknown) => {
    if (error instanceof ResourceNotFoundError) notFound();
    console.error("Course content coverage query failed", {
      courseId,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  });

  return (
    <section className="space-y-5">
      <header className="space-y-3">
        <TeacherBackLink
          href={`/teacher/courses/${courseId}#course-content-coverage`}
        >
          返回课程
        </TeacherBackLink>
        <h1 className="text-foreground text-2xl font-semibold [overflow-wrap:anywhere]">
          {coverage?.course.name ?? "课程"}
        </h1>
      </header>
      <CourseContentCoverage
        courseId={courseId}
        coverage={coverage}
        notice={
          createdName
            ? `已创建题目并绑定到「${createdName}」，该知识点已计入覆盖。可继续补下一个。`
            : null
        }
        open={open}
        showAllGaps={
          open === "gaps" ||
          open === "all" ||
          firstValue(search.limit) === "all"
        }
      />
    </section>
  );
}
