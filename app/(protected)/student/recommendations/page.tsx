import { StudentCourseReturnLink } from "@/components/dashboard/student-course-return-link";
import { StudentPageHeader } from "@/components/dashboard/student-page-header";
import { practiceSetQuerySchema } from "@/services/practice-sets/types";
import { notFound, redirect } from "next/navigation";
import { ClassroomStatus, Role } from "@prisma/client";
import { PracticeCenterTabs } from "@/components/recommendations/practice-center-tabs";
import { GenerateRecommendationsForm } from "@/components/recommendations/generate-recommendations-form";
import { PracticeSetCenter } from "@/components/recommendations/practice-set-center";
import { listPracticeSets } from "@/services/practice-sets/service";
import { CoursePracticeCenter } from "@/components/recommendations/course-practice-center";
import { LearningAssistantPanel } from "@/components/recommendations/learning-assistant-panel";
import { SelfReflectionPanel } from "@/components/recommendations/self-reflection-panel";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listStudentClassrooms } from "@/services/classrooms/service";
import { listStudentPracticeCourses } from "@/services/course-recommendations/service";
import { listSelfReflections } from "@/services/self-reflections/service";

interface Props {
  searchParams: Promise<{
    section?: string | string[];
    page?: string | string[];
    keyword?: string | string[];
    cursor?: string | string[];
    status?: string | string[];
    courseId?: string | string[];
    classroomId?: string | string[];
    conceptId?: string | string[];
    chapterId?: string | string[];
    difficulty?: string | string[];
    template?: string | string[];
    mode?: string | string[];
    view?: string | string[];
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
  if (firstQueryValue(query.view) === "favorites") {
    const params = new URLSearchParams({ view: "favorites" });
    const courseId = firstQueryValue(query.courseId);
    if (courseId) params.set("courseId", courseId);
    redirect(`/student/wrong-questions?${params}`);
  }
  const initialClassroomId = firstQueryValue(query.classroomId);
  const initialCourseId = firstQueryValue(query.courseId);
  const initialConceptId = firstQueryValue(query.conceptId);
  const initialChapterId = firstQueryValue(query.chapterId);
  const initialChapterIds = Array.isArray(query.chapterId)
    ? query.chapterId
    : [];
  const rawDifficulty = Number(firstQueryValue(query.difficulty));
  const initialDifficulty =
    Number.isInteger(rawDifficulty) && rawDifficulty >= 1 && rawDifficulty <= 5
      ? rawDifficulty
      : 3;
  const template = firstQueryValue(query.template);
  const initialTemplate =
    template === "TRUE_FALSE10" || template === "PYTHON5"
      ? template
      : "CHOICE20";
  const initialMode =
    firstQueryValue(query.mode) === "TEST" ? "TEST" : "PRACTICE";
  const activeView =
    firstQueryValue(query.view) === "generate"
      ? "generate"
      : firstQueryValue(query.view) === "assistant"
        ? "assistant"
        : "recommended";
  const listQuery = practiceSetQuerySchema.parse({
    courseId: initialCourseId,
    section: firstQueryValue(query.section),
    page: firstQueryValue(query.page),
    keyword: firstQueryValue(query.keyword),
    status: firstQueryValue(query.status),
  });
  const [result, classrooms, practiceCourses] = await Promise.all([
    activeView === "recommended" ? listPracticeSets(student, listQuery) : null,
    activeView === "generate" ? listStudentClassrooms(student.id) : [],
    activeView !== "recommended" ? listStudentPracticeCourses(student.id) : [],
  ]);
  if (
    activeView !== "recommended" &&
    (initialCourseId || initialClassroomId) &&
    !practiceCourses.some(
      (item) =>
        (!initialCourseId || item.courseId === initialCourseId) &&
        (!initialClassroomId || item.classroomId === initialClassroomId),
    )
  )
    notFound();
  const reflectionOption =
    practiceCourses.find(
      (item) =>
        (!initialCourseId || item.courseId === initialCourseId) &&
        (!initialClassroomId || item.classroomId === initialClassroomId),
    ) ?? practiceCourses[0];
  const reflectionCourse = reflectionOption?.courseId ?? null;
  const reflections =
    activeView === "assistant" && reflectionCourse
      ? await listSelfReflections(student.id, reflectionCourse)
      : [];
  const activeClassrooms = classrooms
    .filter((classroom) => classroom.status === ClassroomStatus.ACTIVE)
    .map((classroom) => ({ id: classroom.id, name: classroom.name }));

  return (
    <section className="mx-auto max-w-[1440px] min-w-0 space-y-5">
      <StudentPageHeader
        actions={
          <StudentCourseReturnLink
            courseId={initialCourseId}
            classroomId={initialClassroomId}
          />
        }
        title="练习中心"
        description="按课程生成与完成练习，或与 AI 梳理学习疑问。"
      />

      <PracticeCenterTabs
        initialView={activeView}
        assistant={
          activeView === "assistant" ? (
            <LearningAssistantPanel
              key={`${initialCourseId}:${initialConceptId}`}
              courses={practiceCourses}
              initialCourseId={initialCourseId}
              initialConceptId={initialConceptId}
              reflectionHistory={
                reflectionOption ? (
                  <SelfReflectionPanel
                    historyOnly
                    classroomId={reflectionOption.classroomId}
                    courseId={reflectionOption.courseId}
                    initialReflections={reflections}
                  />
                ) : undefined
              }
            />
          ) : null
        }
        practice={
          result ? (
            <PracticeSetCenter
              key={JSON.stringify(result)}
              initialResult={result}
              initialQuery={{ ...listQuery, section: result.section }}
            />
          ) : null
        }
        generation={
          activeView === "generate" ? (
            <section
              aria-labelledby="generate-practice-heading"
              className="space-y-4"
            >
              <header>
                <h2 className="font-semibold" id="generate-practice-heading">
                  生成练习
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  选择课程和练习范围，确认条件后开始。也可以根据近期答题获取推荐。
                </p>
              </header>
              <CoursePracticeCenter
                key={`${initialClassroomId}:${initialCourseId}:${initialConceptId}:${JSON.stringify(initialChapterIds)}:${initialChapterId}:${initialMode}:${initialDifficulty}:${initialTemplate}`}
                courses={practiceCourses}
                initialClassroomId={initialClassroomId}
                initialChapterId={initialChapterId}
                initialChapterIds={initialChapterIds}
                initialDifficulty={initialDifficulty}
                initialTemplate={initialTemplate}
                initialMode={initialMode}
                initialConceptId={initialConceptId}
                initialCourseId={initialCourseId}
              />
              <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <summary className="cursor-pointer font-medium text-sky-800">
                  根据近期答题生成推荐
                </summary>
                <p className="mt-1 text-sm text-gray-500">
                  系统结合班级课程范围和近期答题情况，为你挑选待练题目。
                </p>
                <div className="mt-4">
                  <GenerateRecommendationsForm
                    key={initialClassroomId}
                    initialClassroomId={initialClassroomId}
                    classrooms={activeClassrooms}
                    studentId={student.id}
                  />
                </div>
              </details>
            </section>
          ) : null
        }
      />
    </section>
  );
}
