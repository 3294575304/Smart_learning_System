import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AssignmentForm } from "@/components/assignments/assignment-form";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import {
  getTeacherAssignment,
  getTeacherAssignmentEditorOptions,
} from "@/services/assignments/service";

interface Props {
  params: Promise<{ assignmentId: string }>;
}

export default async function EditAssignmentPage({ params }: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const { assignmentId } = await params;
  try {
    const [assignment, options] = await Promise.all([
      getTeacherAssignment(teacher.id, assignmentId),
      getTeacherAssignmentEditorOptions(teacher.id),
    ]);
    if (assignment.status !== "DRAFT") notFound();
    return (
      <section className="space-y-6">
        <div>
          <Link
            className="text-sm text-gray-500 hover:underline"
            href="/teacher/assignments"
          >
            ← 返回作业管理
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">编辑作业草稿</h1>
        </div>
        <AssignmentForm assignment={assignment} mode="edit" {...options} />
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
