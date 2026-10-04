import { ClassroomStatus, Role } from "@prisma/client";
import { ArrowDown } from "lucide-react";
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
    courseId?: string | string[];
    conceptId?: string | string[];
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
  const initialCourseId = firstQueryValue(query.courseId);
  const initialConceptId = firstQueryValue(query.conceptId);
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
      <header className="min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">练习中心</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            按课程与知识点自主练习，或根据近期答题情况完成推荐练习。
          </p>
          {latestGeneratedAt ? (
            <p className="mt-1 text-xs text-gray-500">
              当前列表最近推荐于 {formatRecommendationTime(latestGeneratedAt)}
            </p>
          ) : null}
        </div>
      </header>

      <section
        aria-labelledby="recommendation-results-heading"
        className="space-y-4"
      >
        <header>
          <h2 className="font-semibold" id="recommendation-results-heading">
            推荐练习
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            查看系统根据近期学习情况整理的练习，并按状态筛选。
          </p>
        </header>
        <RecommendationFilters activeStatus={status} />

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
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              href={`/student/recommendations?${nextQuery.toString()}`}
            >
              查看更多推荐
              <ArrowDown aria-hidden="true" className="size-4" />
            </Link>
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="generate-practice-heading"
        className="space-y-4"
      >
        <header>
          <h2 className="font-semibold" id="generate-practice-heading">
            生成练习
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            先查看上方已有练习；需要新的练习时，可以按近期答题情况获取推荐，或按课程知识点自主选择。
          </p>
        </header>
        <div className="rounded-xl border bg-white p-5">
          <h3 className="font-medium">根据近期答题生成推荐</h3>
          <p className="mt-1 text-sm text-gray-500">
            系统结合班级课程范围和近期答题情况，为你挑选待练题目。
          </p>
          <div className="mt-4">
            <GenerateRecommendationsForm
              classrooms={activeClassrooms}
              studentId={student.id}
            />
          </div>
        </div>
        <CoursePracticeCenter
          courses={practiceCourses}
          initialConceptId={initialConceptId}
          initialCourseId={initialCourseId}
        />
      </section>

      {reflectionCourse ? (
        <SelfReflectionPanel
          classroomId={practiceCourses[0]!.classroomId}
          courseId={reflectionCourse}
          initialReflections={reflections}
        />
      ) : null}
    </section>
  );
}
