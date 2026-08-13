import { ClassroomStatus, Role } from "@prisma/client";
import Link from "next/link";

import { GenerateRecommendationsForm } from "@/components/recommendations/generate-recommendations-form";
import { RecommendationCard } from "@/components/recommendations/recommendation-card";
import { RecommendationEmptyState } from "@/components/recommendations/recommendation-empty-state";
import { RecommendationFilters } from "@/components/recommendations/recommendation-filters";
import {
  formatRecommendationTime,
  parseRecommendationFilter,
} from "@/components/recommendations/recommendation-presenters";
import { StartRecommendationButton } from "@/components/recommendations/start-recommendation-button";
import { CoursePracticeCenter } from "@/components/recommendations/course-practice-center";
import { SelfReflectionPanel } from "@/components/recommendations/self-reflection-panel";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listStudentClassrooms } from "@/services/classrooms/service";
import { listRecommendations } from "@/services/recommendations/service";
import { listStudentPracticeCourses } from "@/services/course-recommendations/service";
import { listSelfReflections } from "@/services/self-reflections/service";

interface Props {
  searchParams: Promise<{
    cursor?: string | string[];
    status?: string | string[];
  }>;
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StudentRecommendationsPage({
  searchParams,
}: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const query = await searchParams;
  const status = parseRecommendationFilter(query.status);
  const cursor = firstQueryValue(query.cursor);
  const [result, classrooms, practiceCourses] = await Promise.all([
    listRecommendations(student, {
      ...(status ? { status } : {}),
      ...(cursor ? { cursor } : {}),
      limit: 12,
    }),
    listStudentClassrooms(student.id),
    listStudentPracticeCourses(student.id),
  ]);
  const reflectionCourse = practiceCourses[0]?.courseId ?? null;
  const reflections = reflectionCourse
    ? await listSelfReflections(student.id, reflectionCourse)
    : [];
  const activeClassrooms = classrooms
    .filter((classroom) => classroom.status === ClassroomStatus.ACTIVE)
    .map((classroom) => ({ id: classroom.id, name: classroom.name }));
  const latestGeneratedAt = result.items[0]?.createdAt;
  const nextQuery = new URLSearchParams();
  if (status) nextQuery.set("status", status);
  if (result.pagination.nextCursor) {
    nextQuery.set("cursor", result.pagination.nextCursor);
  }

  return (
    <section className="min-w-0 space-y-6">
      <header className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link
            className="text-sm text-gray-500 hover:underline"
            href="/student"
          >
            ← 返回学生工作台
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">推荐练习</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            根据近期答题情况、知识点掌握度和题目难度生成。
          </p>
          {latestGeneratedAt ? (
            <p className="mt-1 text-xs text-gray-500">
              当前列表最近推荐于 {formatRecommendationTime(latestGeneratedAt)}
            </p>
          ) : null}
        </div>
        <GenerateRecommendationsForm
          classrooms={activeClassrooms}
          studentId={student.id}
        />
      </header>

      <RecommendationFilters activeStatus={status} />

      <CoursePracticeCenter courses={practiceCourses} />
      {reflectionCourse ? (
        <SelfReflectionPanel
          classroomId={practiceCourses[0]!.classroomId}
          courseId={reflectionCourse}
          initialReflections={reflections}
        />
      ) : null}

      {result.items.length === 0 ? (
        <RecommendationEmptyState
          kind={
            status || cursor
              ? "filtered"
              : activeClassrooms.length === 0
                ? "insufficient"
                : "none"
          }
        />
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          {result.items.map((item) => (
            <RecommendationCard
              action={
                <StartRecommendationButton
                  recommendationId={item.id}
                  status={item.status}
                />
              }
              item={item}
              key={item.id}
            />
          ))}
        </div>
      )}

      {result.pagination.nextCursor ? (
        <div className="flex justify-center">
          <Link
            className="rounded-md border bg-white px-4 py-2 text-sm hover:bg-gray-50"
            href={`/student/recommendations?${nextQuery.toString()}`}
          >
            查看更多推荐
          </Link>
        </div>
      ) : null}
    </section>
  );
}
