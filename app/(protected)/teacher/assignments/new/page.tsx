import { Role } from "@prisma/client";
import Link from "next/link";

import { AssignmentForm } from "@/components/assignments/assignment-form";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getTeacherAssignmentEditorOptions } from "@/services/assignments/service";

export default async function NewAssignmentPage() {
  const teacher = await requirePageRole(Role.TEACHER);
  const options = await getTeacherAssignmentEditorOptions(teacher.id);
  return (
    <section className="space-y-6">
      <div>
        <Link
          className="text-sm text-gray-500 hover:underline"
          href="/teacher/assignments"
        >
          ← 返回作业管理
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">创建作业</h1>
      </div>
      {options.classrooms.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-gray-500">
          请先创建一个有效班级，再创建作业。
        </div>
      ) : (
        <AssignmentForm mode="create" {...options} />
      )}
    </section>
  );
}
