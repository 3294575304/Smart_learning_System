import { redirect } from "next/navigation";
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
  const [result, classrooms, practiceCourses] = await Promise.all([
    listPracticeSets(student, {}),
    listStudentClassrooms(student.id),
    listStudentPracticeCourses(student.id),
  ]);
  const reflectionOption =
    practiceCourses.find(
      (item) =>
        (!initialCourseId || item.courseId === initialCourseId) &&
        (!initialClassroomId || item.classroomId === initialClassroomId),
    ) ?? practiceCourses[0];
  const reflectionCourse = reflectionOption?.courseId ?? null;
  const reflections = reflectionCourse
    ? await listSelfReflections(student.id, reflectionCourse)
    : [];
  const activeClassrooms = classrooms
    .filter((classroom) => classroom.status === ClassroomStatus.ACTIVE)
    .map((classroom) => ({ id: classroom.id, name: classroom.name }));

  return (
    <section className="mx-auto max-w-[1440px] min-w-0 space-y-5">
      <header className="min-w-0 rounded-2xl border border-sky-100 bg-white/80 px-5 py-5 sm:px-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">练习中心</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            按课程生成与完成练习，或与 AI 梳理学习疑问。
          </p>
        </div>
      </header>

      <PracticeCenterTabs
        initialView={activeView}
        assistant={
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
        }
        practice={
          <PracticeSetCenter
            key={JSON.stringify(result)}
            initialResult={result}
          />
        }
        generation={
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
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-medium">根据近期答题生成推荐</h3>
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
            </div>
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
          </section>
        }
      />
    </section>
  );
}
