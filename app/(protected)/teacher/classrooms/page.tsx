import { Role } from "@prisma/client";
import { Archive } from "lucide-react";

import { ClassroomForm } from "@/components/classrooms/classroom-form";
import { TeacherClassroomList } from "@/components/classrooms/teacher-classroom-list";
import { TeacherClassroomListNavigation } from "@/components/classrooms/teacher-classroom-list-navigation";
import {
  CreateEntry,
  CreateEntryProvider,
} from "@/components/dashboard/create-entry";
import { EmptyState } from "@/components/dashboard/empty-state";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import {
  readTeacherClassroomListFilters,
  teacherClassroomListHref,
} from "@/lib/teacher-classroom-list-route";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  listTeacherClassrooms,
  listTeacherHistoricalClassrooms,
} from "@/services/classrooms/service";

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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const params = await searchParams;
  const history = params.view === "history";
  const deleted = !history && params.deleted === "1";

  // 筛选条件从链接读回，保证刷新和分享链接能还原同一份结果
  const initialFilters = readTeacherClassroomListFilters(params);

  const classrooms = history ? [] : await listTeacherClassrooms(teacher.id);
  const activeClassrooms = classrooms.filter(
    (classroom) => classroom.status === "ACTIVE",
  ).length;
  const totalStudents = classrooms.reduce(
    (sum, classroom) => sum + classroom.studentCount,
    0,
  );

  const page = (
    <section className="mx-auto max-w-6xl space-y-5">
      {deleted && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
        >
          班级已删除，列表已更新。学生账号及历史教学记录已保留。
        </p>
      )}
      {history && (
        <TeacherBackLink href={teacherClassroomListHref(initialFilters)}>
          返回班级管理
        </TeacherBackLink>
      )}
      <header className="tt-phead">
        <div className="min-w-0">
          <h1 className="tt-h1">{history ? "历史班级" : "班级管理"}</h1>
          <p className="tt-sub">
            {history
              ? "已删除或解散的班级记录，仅作追溯用途"
              : `共 ${classrooms.length} 个班级 · ${activeClassrooms} 个进行中 · 合计 ${totalStudents} 名学生`}
          </p>
        </div>
        {!history && (
          <div className="tt-phead-act">
            <CreateEntry tone="cta" />
          </div>
        )}
      </header>
      {history ? (
        <>
          <TeacherClassroomListNavigation filters={initialFilters} history />
          <HistoricalClassrooms teacherId={teacher.id} />
        </>
      ) : (
        <TeacherClassroomList
          initialClassrooms={classrooms}
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
