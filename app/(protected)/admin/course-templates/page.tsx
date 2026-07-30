import { Role } from "@prisma/client";
import { BookOpenCheck, Plus } from "lucide-react";
import Link from "next/link";

import { CourseTemplateActions } from "@/components/courses/course-template-actions";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listAdminCourseTemplates } from "@/services/courses/service";

const STATUS_LABELS = {
  true: "启用",
  false: "停用",
} as const;

export default async function AdminCourseTemplatesPage() {
  await requirePageRole(Role.ADMIN);
  const templates = await listAdminCourseTemplates();

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            href="/admin/course-templates/new"
          >
            <Plus className="h-4 w-4" />
            创建模板
          </Link>
        }
        description="管理课程模板的基础信息和可用状态。教师只能使用已启用模板创建课程。"
        title="课程模板管理"
      />

      {templates.length === 0 ? (
        <EmptyState
          description="先创建一个课程模板，教师才能基于它创建课程。"
          icon={BookOpenCheck}
          title="暂无课程模板"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((template) => (
            <article
              className="bg-card rounded-xl border p-5"
              key={template.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{template.name}</h3>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                    {template.description ?? "暂无模板说明"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      template.isActive
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {
                      STATUS_LABELS[
                        String(template.isActive) as "true" | "false"
                      ]
                    }
                  </span>
                  {template.isBuiltin ? (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                      内置
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground text-xs">编码</p>
                  <p className="mt-1 font-medium">{template.code}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">版本</p>
                  <p className="mt-1 font-medium">{template.version}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">课程数</p>
                  <p className="mt-1 font-medium">{template.courseCount}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <Link
                  className="text-sm font-medium underline underline-offset-4"
                  href={`/admin/course-templates/${template.id}/edit`}
                >
                  编辑
                </Link>
                <CourseTemplateActions
                  isActive={template.isActive}
                  templateId={template.id}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
