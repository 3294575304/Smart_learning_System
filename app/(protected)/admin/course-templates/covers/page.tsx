import { Role } from "@prisma/client";
import { ArrowLeft, Layers } from "lucide-react";
import Link from "next/link";

import { CourseCover } from "@/components/courses/course-cover";
import { PageHeader } from "@/components/dashboard/page-header";
import { COURSE_COVER_LIST } from "@/lib/course-covers";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listAdminCourseTemplates } from "@/services/courses/service";

export default async function AdminCourseCoversPage() {
  const admin = await requirePageRole(Role.ADMIN);
  const templates = await listAdminCourseTemplates(admin.id);

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="flex items-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-medium transition hover:bg-sky-50/70"
            href="/admin/course-templates"
          >
            <ArrowLeft className="h-4 w-4" />
            返回模板列表
          </Link>
        }
        description="四款封面按学科划分，统一采用柔彩浅封：浅色底、柔光、学科色侧带与图标。课程模板绑定其中一款后，教师端和学生端的课程卡会直接使用它。"
        title="课程封面库"
      />

      <div className="grid gap-4 md:grid-cols-2">
        {COURSE_COVER_LIST.map((cover) => {
          const usedBy = templates.filter(
            (template) => template.coverKey === cover.key,
          );
          return (
            <article
              className="bg-card overflow-hidden rounded-xl border"
              key={cover.key}
            >
              <CourseCover
                action="进入课程"
                courseNo="11001827"
                coverKey={cover.key}
                height={64}
              />
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{cover.name}</h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {cover.summary}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-xs text-sky-700">
                    {cover.subject}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { label: "底色", value: cover.palette.deep },
                    { label: "主色", value: cover.palette.s1 },
                    { label: "渐止", value: cover.palette.s2 },
                  ].map((token) => (
                    <span
                      className="text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]"
                      key={token.label}
                    >
                      <span
                        aria-hidden="true"
                        className="size-2.5 rounded-full border border-black/5"
                        style={{ background: token.value }}
                      />
                      {token.label}
                      <code className="text-[11px]">{token.value}</code>
                    </span>
                  ))}
                </div>

                <div className="rounded-lg border bg-sky-50/40 p-3">
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <Layers aria-hidden="true" className="size-3.5" />
                    已绑定 {usedBy.length} 个课程模板
                  </p>
                  {usedBy.length ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      {usedBy.map((template) => (
                        <li
                          className="flex items-center justify-between gap-2"
                          key={template.id}
                        >
                          <span className="min-w-0 truncate">
                            {template.name}
                          </span>
                          <span className="text-muted-foreground shrink-0 text-xs">
                            {template.courseCount} 门课程
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground mt-1 text-xs">
                      还没有模板使用这版封面。
                    </p>
                  )}
                </div>

                <Link
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:underline"
                  href="/admin/course-templates/new"
                >
                  用它创建课程模板
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <p className="text-muted-foreground rounded-xl border bg-sky-50/40 p-4 text-sm leading-6">
        封面绑定在<b>课程模板</b>上，而不是单门课程：模板创建时选定封面，之后可在「编辑课程模板」里更换；
        更换后该模板下的所有课程会同步更新，教师端与学生端都不需要单独设置。
        封面只有图标与配色两个信息，课堂上不出现「工科 / 理科」字样。
      </p>
    </section>
  );
}
