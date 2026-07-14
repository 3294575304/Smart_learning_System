import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requirePageRole } from "@/services/auth/page-authorization";
import { Role } from "@prisma/client";

export default async function TeacherPage() {
  const teacher = await requirePageRole(Role.TEACHER);
  const classrooms = await prisma.classroom.findMany({
    where: { teacherId: teacher.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      _count: { select: { memberships: true } },
    },
  });

  return (
    <section>
      <h1 className="text-2xl font-semibold">我的班级</h1>
      <p className="text-muted-foreground mt-2">
        这里只展示当前教师拥有的班级。
      </p>
      {classrooms.length === 0 ? (
        <div className="bg-card text-muted-foreground mt-6 rounded-xl border border-dashed p-10 text-center">
          暂无班级。
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
                  {classroom.status}
                </span>
              </div>
              <p className="text-muted-foreground mt-3 text-sm">
                {classroom._count.memberships} 名学生
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
