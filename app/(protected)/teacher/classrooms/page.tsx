import { ClassroomStatus, Role } from "@prisma/client";
import { School, Users } from "lucide-react";
import Link from "next/link";

import { ClassroomForm } from "@/components/classrooms/classroom-form";
import { EmptyState } from "@/components/dashboard/empty-state";
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
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold">全部班级</h2>
            <span className="text-muted-foreground text-sm">共 {classrooms.length} 个</span>
          </div>
          {classrooms.length === 0 ? (
            <EmptyState
              description="使用右侧表单创建第一个班级，之后即可邀请学生加入。"
              icon={School}
              title="暂无班级"
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {classrooms.map((classroom) => (
                <Link
                  className="bg-card rounded-xl border p-5 transition-colors hover:bg-gray-50"
                  href={`/teacher/classrooms/${classroom.id}`}
                  key={classroom.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{classroom.name}</h3>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                        {classroom.description ?? "暂无班级说明"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                        classroom.status === ClassroomStatus.ACTIVE
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {classroom.status === ClassroomStatus.ACTIVE ? "开放" : "已关闭"}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-5 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {classroom.studentCount} 名学生
                    </span>
                    <span>邀请码 {classroom.joinCode}</span>
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs">
                    创建于 {classroom.createdAt.toLocaleDateString("zh-CN")}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

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
