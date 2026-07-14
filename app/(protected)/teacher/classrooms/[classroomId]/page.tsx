import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { ResourceNotFoundError } from "@/services/auth/authorization";
import { requirePageRole } from "@/services/auth/page-authorization";
import { classroomIdSchema } from "@/services/auth/schemas";
import { getTeacherOwnedClassroom } from "@/services/classrooms/authorization";

interface TeacherClassroomPageProps {
  params: Promise<{ classroomId: string }>;
}

export default async function TeacherClassroomPage({
  params,
}: TeacherClassroomPageProps) {
  const teacher = await requirePageRole(Role.TEACHER);
  const { classroomId } = await params;
  const parsedId = classroomIdSchema.safeParse(classroomId);

  if (!parsedId.success) {
    notFound();
  }

  try {
    const classroom = await getTeacherOwnedClassroom(teacher.id, parsedId.data);
    return (
      <section>
        <h1 className="text-2xl font-semibold">{classroom.name}</h1>
        <p className="text-muted-foreground mt-2">
          {classroom.description ?? "暂无班级说明"}
        </p>
        <dl className="bg-card mt-6 grid gap-4 rounded-xl border p-6 sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-sm">班级状态</dt>
            <dd className="mt-1 font-medium">{classroom.status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm">加入码</dt>
            <dd className="mt-1 font-medium">{classroom.joinCode}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm">学生人数</dt>
            <dd className="mt-1 font-medium">{classroom.studentCount}</dd>
          </div>
        </dl>
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) {
      notFound();
    }
    throw error;
  }
}
