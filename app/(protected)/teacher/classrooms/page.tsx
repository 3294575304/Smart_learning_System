import { ClassroomStatus, Role } from "@prisma/client";

import { ClassroomForm } from "@/components/classrooms/classroom-form";
import { TeacherClassroomList } from "@/components/classrooms/teacher-classroom-list";
import { PageHeader } from "@/components/dashboard/page-header";
import { readAllowedParam, readTextParam } from "@/lib/list-filter";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listTeacherClassrooms } from "@/services/classrooms/service";

const CLASSROOM_STATUS_VALUES = Object.values(ClassroomStatus);

export default async function TeacherClassroomsPage({
  searchParams,
}: {
  searchParams: Promise<{
    deleted?: string;
    keyword?: string;
    status?: string;
    courseId?: string;
  }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const params = await searchParams;
  const classrooms = await listTeacherClassrooms(teacher.id);
  const deleted = params.deleted === "1";

  // 筛选条件从链接读回，保证刷新和分享链接能还原同一份结果
  const initialFilters = {
    keyword: readTextParam(params.keyword),
    status: readAllowedParam(params.status, CLASSROOM_STATUS_VALUES),
    courseId: readTextParam(params.courseId, 64),
  };

  return (
    <section className="space-y-7">
      {deleted && (
        <p
          role="status"
          className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          班级已删除，列表已更新。学生账号及历史教学记录已保留。
        </p>
      )}
      <PageHeader
        description="查看班级状态、学生人数和邀请码，并进入班级详情管理成员。列表支持按名称、邀请码、关联课程搜索，并按班级状态筛选。"
        title="班级管理"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <TeacherClassroomList
          initialClassrooms={classrooms}
          initialFilters={initialFilters}
        />

        <aside className="scroll-mt-24" id="new-classroom">
          <div className="bg-card rounded-xl border p-5 sm:p-6">
            <h2 className="font-semibold">创建新班级</h2>
            <p className="text-muted-foreground mt-1 mb-5 text-sm">
              创建成功后会自动生成学生邀请码。
            </p>
            <ClassroomForm mode="create" />
          </div>
        </aside>
      </div>
    </section>
  );
}
