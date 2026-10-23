import { CLASSROOM_STATUS_LABELS } from "@/services/classrooms/presentation";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { PageIndex } from "@/components/dashboard/page-index";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { ClassroomForm } from "@/components/classrooms/classroom-form";
import { RemoveStudentButton } from "@/components/classrooms/remove-student-button";
import { TeacherClassroomControls } from "@/components/classrooms/teacher-classroom-controls";
import { ResourceNotFoundError } from "@/services/auth/authorization";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  classroomIdSchema,
  classroomStudentPageSchema,
} from "@/services/classrooms/schemas";
import { getTeacherClassroom } from "@/services/classrooms/service";

interface TeacherClassroomPageProps {
  params: Promise<{ classroomId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TeacherClassroomPage({
  params,
  searchParams,
}: TeacherClassroomPageProps) {
  const teacher = await requirePageRole(Role.TEACHER);
  const { classroomId } = await params;
  const parsedId = classroomIdSchema.safeParse(classroomId);

  if (!parsedId.success) {
    notFound();
  }

  const raw = await searchParams;
  const pageQuery = classroomStudentPageSchema.safeParse({ page: raw.page });
  if (!pageQuery.success) notFound();
  try {
    const classroom = await getTeacherClassroom(
      teacher.id,
      parsedId.data,
      pageQuery.data.page,
    );
    return (
      <section className="space-y-6">
        <div>
          <TeacherBackLink href="/teacher/classrooms">
            返回班级列表
          </TeacherBackLink>
          <h1 className="mt-3 text-2xl font-semibold">{classroom.name}</h1>
          <p className="text-muted-foreground mt-2">
            {classroom.description ?? "暂无班级说明"}
          </p>
        </div>
        <dl className="bg-card mt-6 grid gap-4 rounded-xl border p-6 sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-sm">班级状态</dt>
            <dd className="mt-1 font-medium">
              {CLASSROOM_STATUS_LABELS[classroom.status]}
            </dd>
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
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 font-semibold">编辑班级信息</h2>
            <ClassroomForm
              classroomId={classroom.id}
              defaultValues={{
                name: classroom.name,
                description: classroom.description ?? "",
                allowStudentLeave: classroom.allowStudentLeave,
              }}
              mode="edit"
            />
          </div>
          <TeacherClassroomControls
            classroomId={classroom.id}
            initialJoinCode={classroom.joinCode}
            isClosed={classroom.status !== "ACTIVE"}
          />
        </div>
        <section className="bg-card rounded-xl border p-5">
          <h2 className="font-semibold">
            学生名单{" "}
            <span className="text-sm font-normal text-slate-500">
              共 {classroom.studentCount} 人 · 每页 20 人
            </span>
          </h2>
          {classroom.students.length === 0 ? (
            <div className="text-muted-foreground mt-4 rounded-lg border border-dashed p-8 text-center text-sm">
              {classroom.studentCount
                ? "当前页没有学生，请返回上一页。"
                : "暂无学生加入该班级。"}
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground border-b">
                  <tr>
                    <th className="py-3 pr-4 font-medium">学生</th>
                    <th className="py-3 pr-4 font-medium">学号</th>
                    <th className="py-3 pr-4 font-medium">加入时间</th>
                    <th className="py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {classroom.students.map((student) => (
                    <tr
                      className="border-b last:border-0"
                      key={student.membershipId}
                    >
                      <td className="py-3 pr-4">
                        <p className="font-medium">{student.displayName}</p>
                        <p className="text-muted-foreground">{student.email}</p>
                      </td>
                      <td className="py-3 pr-4">{student.studentNo ?? "—"}</td>
                      <td className="py-3 pr-4">
                        {student.joinedAt.toLocaleDateString("zh-CN")}
                      </td>
                      <td className="py-3">
                        {classroom.status === "ACTIVE" ? (
                          <RemoveStudentButton
                            classroomId={classroom.id}
                            membershipId={student.membershipId}
                            studentName={
                              student.displayName ??
                              student.email ??
                              student.studentNo ??
                              student.studentId
                            }
                          />
                        ) : (
                          <span className="text-xs text-slate-500">
                            历史名单
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {classroom.studentPage && classroom.studentPage.totalPages > 1 && (
            <div className="mt-4">
              <PageIndex
                page={classroom.studentPage.page}
                ariaLabel="学生名单分页"
                totalPages={classroom.studentPage.totalPages}
                hrefForPage={(page) =>
                  `/teacher/classrooms/${classroom.id}?page=${page}`
                }
              />
            </div>
          )}
        </section>
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) {
      notFound();
    }
    throw error;
  }
}
