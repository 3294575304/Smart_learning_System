import { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export default async function AdminPage() {
  const [userCount, teacherCount, studentCount, classroomCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: Role.TEACHER } }),
      prisma.user.count({ where: { role: Role.STUDENT } }),
      prisma.classroom.count(),
    ]);

  const metrics = [
    ["全部用户", userCount],
    ["教师", teacherCount],
    ["学生", studentCount],
    ["班级", classroomCount],
  ] as const;

  return (
    <section>
      <h1 className="text-2xl font-semibold">平台概览</h1>
      <p className="text-muted-foreground mt-2">查看平台当前基础数据。</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value]) => (
          <article className="bg-card rounded-xl border p-5" key={label}>
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
