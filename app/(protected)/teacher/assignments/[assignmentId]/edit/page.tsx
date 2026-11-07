import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { AssignmentForm } from "@/components/assignments/assignment-form";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import {
  getAssignmentBatchDrafts,
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
    const [options, batch] = await Promise.all([
      getTeacherAssignmentEditorOptions(teacher.id),
      getAssignmentBatchDrafts(teacher.id, assignmentId),
    ]);
    const draftMembers = batch.members.filter(
      (member) => member.status === "DRAFT",
    );
    const isBatch = draftMembers.length > 1;
    return (
      <section className="space-y-6">
        <div>
          <TeacherBackLink href="/teacher/assignments">
            返回作业管理
          </TeacherBackLink>
          <h1 className="mt-2 text-2xl font-semibold">编辑作业草稿</h1>
        </div>
        {isBatch ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm text-sky-900">
            <p className="font-medium">
              这份草稿同时属于 {draftMembers.length} 个班级
            </p>
            <p className="mt-1 text-sky-800/90">
              {draftMembers.map((member) => member.classroomName).join("、")}
              。保存或发布时会对以上班级一次生效，只需编辑这一次。
            </p>
          </div>
        ) : null}
        <AssignmentForm
          assignment={assignment}
          mode="edit"
          {...options}
          {...(isBatch && batch.batchId
            ? {
                batch: {
                  batchId: batch.batchId,
                  members: draftMembers.map((member) => ({
                    id: member.id,
                    classroomId: member.classroomId,
                    classroomName: member.classroomName,
                    status: member.status,
                  })),
                },
              }
            : {})}
        />
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
