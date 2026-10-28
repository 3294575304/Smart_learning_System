import {
  StudentClassroomFilter,
  type StudentClassroomOption,
} from "./student-classroom-filter";

export function StudentTaskScope({
  classrooms,
  courseId,
  selectedId,
  summary,
}: {
  classrooms: StudentClassroomOption[];
  courseId?: string;
  selectedId?: string;
  summary: string;
}) {
  const classroom = classrooms.find((item) => item.id === selectedId);
  if (courseId && selectedId) {
    return (
      <section
        aria-label="当前教学班"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3"
      >
        <p className="text-sm font-medium text-slate-700">
          {classroom
            ? [classroom.courseName, classroom.name, classroom.term]
                .filter(Boolean)
                .join(" · ")
            : "当前教学班不可用，请返回我的课程重新进入。"}
        </p>
        <p aria-live="polite" className="text-xs text-slate-500">
          {summary}
        </p>
      </section>
    );
  }
  return (
    <StudentClassroomFilter
      classrooms={classrooms}
      selectedId={selectedId}
      summary={summary}
    />
  );
}
