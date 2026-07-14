import { MembershipStatus, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requirePageRole } from "@/services/auth/page-authorization";

export default async function StudentPage() {
  const student = await requirePageRole(Role.STUDENT);
  const memberships = await prisma.classMembership.findMany({
    where: { studentId: student.id, status: MembershipStatus.ACTIVE },
    orderBy: { joinedAt: "desc" },
    select: {
      classroom: {
        select: {
          id: true,
          name: true,
          status: true,
          teacher: {
            select: { profile: { select: { displayName: true } } },
          },
        },
      },
    },
  });

  return (
    <section>
      <h1 className="text-2xl font-semibold">我的学习空间</h1>
      <p className="text-muted-foreground mt-2">只展示当前学生已加入的班级。</p>
      {memberships.length === 0 ? (
        <div className="bg-card text-muted-foreground mt-6 rounded-xl border border-dashed p-10 text-center">
          尚未加入班级。
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {memberships.map(({ classroom }) => (
            <article
              className="bg-card rounded-xl border p-5"
              key={classroom.id}
            >
              <h2 className="font-semibold">{classroom.name}</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                授课教师：{classroom.teacher.profile?.displayName ?? "未设置"}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                状态：{classroom.status}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
