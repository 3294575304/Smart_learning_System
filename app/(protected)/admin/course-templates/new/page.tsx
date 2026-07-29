import { Role } from "@prisma/client";

import { CourseTemplateForm } from "@/components/courses/course-template-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";

export default async function AdminCourseTemplateNewPage() {
  await requirePageRole(Role.ADMIN);

  return (
    <section className="space-y-6">
      <PageHeader
        description="创建新的课程模板后，教师就可以基于它建立自己的课程。"
        title="创建课程模板"
      />
      <div className="max-w-2xl">
        <div className="bg-card rounded-xl border p-5">
          <CourseTemplateForm mode="create" />
        </div>
      </div>
    </section>
  );
}
