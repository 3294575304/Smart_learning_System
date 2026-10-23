import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

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
    const assignment = await getTeacherAssignment(teacher.id, assignmentId);
    if (
      assignment.status !== "DRAFT" ||
      assignment.classroom.status !== "ACTIVE"
    )
      redirect(`/teacher/assignments/${assignment.id}`);
    const options = await getTeacherAssignmentEditorOptions(teacher.id);
    return (
      <section className="space-y-6">
        <div>
          <TeacherBackLink href="/teacher/assignments">
            返回作业管理
          </TeacherBackLink>
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
