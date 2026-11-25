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

function mergeCategories(
  items: AdminCourseCategory[],
  incoming: AdminCourseCategory[],
) {
  const incomingIds = new Set(incoming.map((item) => item.id));
  return [
    ...items.filter((item) => !incomingIds.has(item.id)),
    ...incoming,
  ].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export function CourseCategoryWorkspace({ initialCategories }: Props) {
  const [categories, setCategories] = useState(initialCategories);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        description="管理本校教师开课和题库使用的课程分类。"
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
        onCreated={(created) =>
          setCategories((items) => mergeCategories(items, created))
        }
        open={importOpen}
      />
    </section>
  );
}
