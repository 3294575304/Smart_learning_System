import React from "react";
import { getStudentHomeKnowledge } from "@/services/dashboard/student-home-knowledge";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { HomeKnowledgeMatrix } from "./home-knowledge-matrix";
import { StudentSectionRetry } from "./student-section-retry";
import { StudentPageLink } from "./student-page-link";
import { FOCUS_RING } from "./ui-focus";

export function StudentHomeKnowledgeLoading() {
  return (
    <div role="status" aria-busy="true" className="mt-4 space-y-3">
      <p className="text-sm text-neutral-600">正在加载我的知识掌握…</p>
      <div aria-hidden="true" className="space-y-3 motion-safe:animate-pulse">
        <div className="bg-muted h-12 rounded-md" />
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="bg-muted h-8 rounded-md" />
        ))}
      </div>
    </div>
  );
}

export async function StudentHomeKnowledge({
  studentId,
  courseId,
  classroomId,
}: {
  studentId: string;
  courseId: string;
  classroomId: string;
}) {
  let knowledge;
  try {
    knowledge = await getStudentHomeKnowledge(studentId, courseId, classroomId);
  } catch (error) {
    if (error instanceof ResourceNotFoundError)
      return (
        <div className="mt-4 space-y-3 text-sm text-neutral-700">
          <p role="alert">当前课程不可查看，请重新选择课程。</p>
          <StudentPageLink
            href="/student/courses"
            className={`text-brand-strong bg-muted inline-flex min-h-11 items-center rounded-md px-3 font-medium ${FOCUS_RING}`}
          >
            返回我的课程
          </StudentPageLink>
        </div>
      );
    console.error("student_home_knowledge_failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return (
      <StudentSectionRetry message="知识掌握暂时无法加载，其他内容可以继续查看。" />
    );
  }
  return (
    <>
      <HomeKnowledgeMatrix
        chapters={knowledge.heatmap}
        profileHref={`/student/courses/${courseId}/profile?${new URLSearchParams({ classroomId })}`}
        generatedAt={knowledge.generatedAt.toISOString()}
        profileRevision={knowledge.profileRevision}
        dashboard
      />
      <p className="mt-3 text-xs leading-5 text-neutral-600">
        当前教学班已授 {knowledge.taughtCount}/{knowledge.totalCount}{" "}
        个知识点。知识画像汇总我在这门课的评分记录。
      </p>
    </>
  );
}
