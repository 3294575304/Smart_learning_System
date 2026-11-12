import { Role } from "@prisma/client";
import { Archive } from "lucide-react";
import Link from "next/link";

import { ClassroomForm } from "@/components/classrooms/classroom-form";
import { TeacherClassroomList } from "@/components/classrooms/teacher-classroom-list";
import {
  CreateEntry,
  CreateEntryProvider,
} from "@/components/dashboard/create-entry";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { readAllowedParam, readTextParam } from "@/lib/list-filter";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  listTeacherClassrooms,
  listTeacherHistoricalClassrooms,
} from "@/services/classrooms/service";

const CLASSROOM_STATUS_VALUES = ["ACTIVE", "COMPLETED", "CLOSED"] as const;
const CLASSROOM_VIEWS = [
  { history: false, href: "/teacher/classrooms", label: "班级列表" },
  {
    history: true,
    href: "/teacher/classrooms?view=history",
    label: "历史班级",
  },
];

async function HistoricalClassrooms({ teacherId }: { teacherId: string }) {
  const classrooms = await listTeacherHistoricalClassrooms(teacherId);
  if (classrooms.length === 0)
    return (
      <EmptyState
        description="删除或解散后保留的班级记录会显示在这里。"
        icon={Archive}
        title="暂无历史班级"
      />
    );

  return (
    <div className="bg-card overflow-x-auto rounded-xl border">
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">历史班级记录</caption>
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 font-medium" scope="col">
              班级名称
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              关联课程
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              移除时间
            </th>
          </tr>
        </thead>
        <tbody>
          {classrooms.map((classroom) => (
            <tr className="border-t" key={classroom.id}>
              <th className="px-4 py-3 font-medium wrap-anywhere" scope="row">
                {classroom.name}
              </th>
              <td className="px-4 py-3 wrap-anywhere">
                {classroom.course?.name ?? "无关联课程"}
              </td>
              <td className="px-4 py-3">
                {classroom.dissolvedAt ? (
                  <time dateTime={classroom.dissolvedAt.toISOString()}>
                    {classroom.dissolvedAt.toLocaleString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                      hour12: false,
                    })}
                  </time>
                ) : (
                  "未记录"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function TeacherClassroomsPage({
  searchParams,
}: {
  searchParams: Promise<{
    deleted?: string;
    keyword?: string;
    status?: string;
    courseId?: string;
    view?: string;
  }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const params = await searchParams;
  const history = params.view === "history";
  const deleted = !history && params.deleted === "1";

  // 筛选条件从链接读回，保证刷新和分享链接能还原同一份结果
  const initialFilters = {
    keyword: readTextParam(params.keyword),
    status: readAllowedParam(params.status, CLASSROOM_STATUS_VALUES),
    courseId: readTextParam(params.courseId, 64),
  };

  const page = (
    <section className="mx-auto max-w-6xl space-y-6">
      {deleted && (
        <p
          role="status"
          className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          班级已删除，列表已更新。学生账号及历史教学记录已保留。
        </p>
      )}
      <PageHeader
        description={
          history
            ? "查看已删除或解散的班级记录。"
            : "查看班级、管理成员及入班邀请。"
        }
        title="班级管理"
        actions={history ? undefined : <CreateEntry />}
      />
      <nav aria-label="班级管理视图" className="flex gap-1 border-b">
        {CLASSROOM_VIEWS.map((view) => (
          <Link
            aria-current={view.history === history ? "page" : undefined}
            className="border-b-2 border-transparent px-4 py-3 text-sm text-slate-600 hover:text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-700 aria-[current=page]:border-sky-700 aria-[current=page]:font-medium aria-[current=page]:text-sky-800"
            href={view.href}
            key={view.href}
          >
            {view.label}
          </Link>
        ))}
      </nav>

      {history ? (
        <HistoricalClassrooms teacherId={teacher.id} />
      ) : (
        <TeacherClassroomList
          initialClassrooms={await listTeacherClassrooms(teacher.id)}
          initialFilters={initialFilters}
          createEntry={<CreateEntry card />}
        />
      )}
    </section>
  );
  return history ? (
    page
  ) : (
    <CreateEntryProvider
      title="创建班级"
      form={<ClassroomForm mode="create" />}
    >
      {page}
    </CreateEntryProvider>
  );
}
