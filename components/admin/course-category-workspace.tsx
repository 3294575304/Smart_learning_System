"use client";

import { useState } from "react";

import { CourseCategoryImportDialog } from "@/components/admin/course-category-import-dialog";
import {
  QuestionCourseCategoryManager,
  type AdminCourseCategory,
} from "@/components/admin/question-course-category-manager";
import { PageHeader } from "@/components/dashboard/page-header";

interface Props {
  initialCategories: AdminCourseCategory[];
}

function sortCategories(items: AdminCourseCategory[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function mergeCategories(
  items: AdminCourseCategory[],
  incoming: AdminCourseCategory[],
) {
  const incomingIds = new Set(incoming.map((item) => item.id));
  return sortCategories([
    ...items.filter((item) => !incomingIds.has(item.id)),
    ...incoming,
  ]);
}

export function CourseCategoryWorkspace({ initialCategories }: Props) {
  const [categories, setCategories] = useState(initialCategories);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        description="维护本校课程目录，课程名称与课程号一一对应；教师开课时按课程号或名称选择课程。"
        title="课程分类"
        actions={
          <button
            className="bg-brand hover:bg-brand-strong min-h-11 rounded-lg px-4 text-sm font-medium text-white"
            onClick={() => setImportOpen(true)}
            type="button"
          >
            一键添加课程分类
          </button>
        }
      />
      <QuestionCourseCategoryManager
        categories={categories}
        onChange={setCategories}
      />
      <CourseCategoryImportDialog
        onClose={() => setImportOpen(false)}
        onCompleted={({ created, backfilled }) => {
          const backfilledById = new Map(
            backfilled.map((item) => [item.id, item] as const),
          );
          setCategories((items) =>
            mergeCategories(
              items.map((item) => {
                const patched = backfilledById.get(item.id);
                return patched ? { ...item, courseNo: patched.courseNo } : item;
              }),
              created,
            ),
          );
        }}
        open={importOpen}
      />
    </section>
  );
}
