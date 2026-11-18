"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { CourseWorkspaceTabLink } from "./course-workspace-tab-link";
import { SECTION_TABS_LIST } from "@/components/ui/section-tabs";
import {
  parseStudentCourseLocation,
  STUDENT_GROWTH_SECTIONS,
  studentCourseTabHref,
  type StudentGrowthSection,
} from "@/services/courses/student-workspace";

function isKnowledgeSection(section: StudentGrowthSection) {
  return section === "knowledge" || section === "path";
}

export function GrowthSectionNavigation({
  courseId,
  classroomId,
  initialSection,
}: {
  courseId: string;
  classroomId: string;
  initialSection: StudentGrowthSection;
}) {
  const query = useSearchParams();
  const location = parseStudentCourseLocation(
    query.get("tab") ?? undefined,
    query.get("section") ?? undefined,
  );
  const activeSection =
    isKnowledgeSection(initialSection) &&
    location?.tab === "growth" &&
    isKnowledgeSection(location.section)
      ? location.section
      : initialSection;
  return (
    <nav aria-label="知识与成长内容" className={SECTION_TABS_LIST}>
      {STUDENT_GROWTH_SECTIONS.map(({ id, label }) => (
        <CourseWorkspaceTabLink
          key={id}
          href={studentCourseTabHref(courseId, classroomId, "growth", id)}
          active={activeSection === id}
          onNavigate={
            isKnowledgeSection(initialSection) && isKnowledgeSection(id)
              ? (href) => {
                  if (id !== activeSection)
                    window.history.pushState(null, "", href);
                }
              : undefined
          }
        >
          {label}
        </CourseWorkspaceTabLink>
      ))}
    </nav>
  );
}

export function GrowthKnowledgeSections({
  knowledge,
  path,
}: {
  knowledge: ReactNode;
  path: ReactNode;
}) {
  const showPath = useSearchParams().get("section") === "path";
  return (
    <>
      <div hidden={showPath}>{knowledge}</div>
      <div hidden={!showPath}>{path}</div>
    </>
  );
}
