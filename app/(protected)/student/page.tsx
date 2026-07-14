import { Role } from "@prisma/client";

import { JoinClassroomForm } from "@/components/classrooms/join-classroom-form";
import { LeaveClassroomButton } from "@/components/classrooms/leave-classroom-button";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listStudentClassrooms } from "@/services/classrooms/service";

export default async function StudentPage() {
  const student = await requirePageRole(Role.STUDENT);
  const classrooms = await listStudentClassrooms(student.id);

  return (
    <section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <h1 className="text-2xl font-semibold">我的班级</h1>
          <p className="text-muted-foreground mt-2">
            查看已加入的班级，或使用教师提供的邀请码加入新班级。
          </p>
        </div>
        <JoinClassroomForm />
      </div>
      {classrooms.length === 0 ? (
        <div className="bg-card text-muted-foreground mt-6 rounded-xl border border-dashed p-10 text-center">
          尚未加入班级，请在上方输入邀请码。
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {classrooms.map((classroom) => (
            <article
              className="bg-card rounded-xl border p-5"
              key={classroom.id}
            >
              <h2 className="font-semibold">{classroom.name}</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                {classroom.description ?? "暂无班级说明"}
              </p>
              <p className="text-muted-foreground mt-2 text-sm">
                授课教师：{classroom.teacherName}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                状态：{classroom.status === "ACTIVE" ? "开放" : "已关闭"}
              </p>
              {classroom.allowStudentLeave ? (
                <LeaveClassroomButton
                  classroomId={classroom.id}
                  classroomName={classroom.name}
                />
              ) : (
                <p className="text-muted-foreground mt-4 text-xs">
                  此班级不允许学生主动退出。
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
