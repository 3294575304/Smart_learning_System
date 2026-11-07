import { Role } from "@prisma/client";

import { QuestionCourseCategoryManager } from "@/components/admin/question-course-category-manager";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listQuestionCourseCategories } from "@/services/question-course-categories/service";

export default async function QuestionCourseCategoriesPage() {
  const admin = await requirePageRole(Role.ADMIN);
  const categories = await listQuestionCourseCategories(admin.id, false);
  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        description="管理本校教师开课和题库使用的课程分类。"
        title="题库课程分类"
      />
      <QuestionCourseCategoryManager initialCategories={categories} />
    </section>
  );
}
