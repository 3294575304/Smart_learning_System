import { Role } from "@prisma/client";

import { ClassroomForm } from "@/components/classrooms/classroom-form";
import { TeacherClassroomList } from "@/components/classrooms/teacher-classroom-list";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listTeacherClassrooms } from "@/services/classrooms/service";

export default async function TeacherClassroomsPage() {
  const teacher = await requirePageRole(Role.TEACHER);
  const classrooms = await listTeacherClassrooms(teacher.id);

  return (
    <section className="space-y-7">
      <PageHeader
        description="查看班级状态、学生人数和邀请码，并进入班级详情管理成员。"
        title="班级管理"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <TeacherClassroomList initialClassrooms={classrooms} />

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
