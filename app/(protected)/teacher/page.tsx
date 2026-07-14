import Link from "next/link";

import { ClassroomForm } from "@/components/classrooms/classroom-form";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listTeacherClassrooms } from "@/services/classrooms/service";
import { Role } from "@prisma/client";

export default async function TeacherPage() {
  const teacher = await requirePageRole(Role.TEACHER);
  const classrooms = await listTeacherClassrooms(teacher.id);

  return (
    <section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <h1 className="text-2xl font-semibold">我的班级</h1>
          <p className="text-muted-foreground mt-2">
            创建班级、管理学生并控制班级开放状态。
          </p>
        </div>
        <div>
          <h2 className="mb-3 font-semibold">创建新班级</h2>
          <ClassroomForm mode="create" />
        </div>
      </div>
      {classrooms.length === 0 ? (
        <div className="bg-card text-muted-foreground mt-6 rounded-xl border border-dashed p-10 text-center">
          暂无班级，请使用上方表单创建第一个班级。
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {classrooms.map((classroom) => (
            <Link
              className="bg-card hover:bg-accent rounded-xl border p-5 transition-colors"
              href={`/teacher/classrooms/${classroom.id}`}
              key={classroom.id}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{classroom.name}</h2>
                <span className="text-muted-foreground text-xs">
                  {classroom.status === "ACTIVE" ? "开放" : "已关闭"}
                </span>
              </div>
              <p className="text-muted-foreground mt-3 text-sm">
                {classroom.studentCount} 名学生
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
