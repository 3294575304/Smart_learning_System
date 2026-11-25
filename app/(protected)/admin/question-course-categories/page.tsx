import { Role } from "@prisma/client";

import { CourseCategoryWorkspace } from "@/components/admin/course-category-workspace";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listQuestionCourseCategories } from "@/services/question-course-categories/service";

export default async function QuestionCourseCategoriesPage() {
  const admin = await requirePageRole(Role.ADMIN);
  const categories = await listQuestionCourseCategories(admin.id, false);
  return <CourseCategoryWorkspace initialCategories={categories} />;
}
