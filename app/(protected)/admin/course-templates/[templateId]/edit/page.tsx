import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseTemplateActions } from "@/components/courses/course-template-actions";
import { CourseTemplateForm } from "@/components/courses/course-template-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { ResourceNotFoundError } from "@/services/auth/authorization";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseTemplateIdSchema } from "@/services/courses/schemas";
import { getAdminCourseTemplate } from "@/services/courses/service";

interface PageProps {
  params: Promise<{ templateId: string }>;
}

export default async function AdminCourseTemplateEditPage({
  params,
}: PageProps) {
  await requirePageRole(Role.ADMIN);
  const { templateId } = await params;
  const parsedId = courseTemplateIdSchema.safeParse(templateId);
  if (!parsedId.success) {
    notFound();
  }

  let template;
  try {
    template = await getAdminCourseTemplate(parsedId.data);
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <>
            <Link
              className="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
              href="/admin/course-templates"
            >
              返回列表
            </Link>
            <CourseTemplateActions
              isActive={template.isActive}
              templateId={template.id}
            />
          </>
        }
        description="编辑课程模板的基础信息，并控制教师是否还能继续使用它创建课程。"
        title="编辑课程模板"
      />
      <div className="max-w-2xl">
        <div className="bg-card rounded-xl border p-5">
          <CourseTemplateForm
            code={template.code}
            defaultValues={{
              name: template.name,
              description: template.description ?? "",
              version: template.version,
            }}
            isActive={template.isActive}
            isBuiltin={template.isBuiltin}
            mode="edit"
            templateId={template.id}
          />
        </div>
      </div>
    </section>
  );
}
