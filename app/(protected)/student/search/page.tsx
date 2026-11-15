import { Role } from "@prisma/client";
import { Search } from "lucide-react";

import { StudentPageHeader } from "@/components/dashboard/student-page-header";
import { StudentPageLink } from "@/components/dashboard/student-page-link";
import { FOCUS_RING } from "@/components/dashboard/ui-focus";
import { requirePageRole } from "@/services/auth/page-authorization";
import { prisma } from "@/lib/prisma";
import { studentTaskDate } from "@/services/dashboard/student-task-overview";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * 顶栏搜索只覆盖学生能看到的三个范围：课程（教学班）、作业与考试、题库。
 * 不做跨权限的全站搜索，也不返回其他人的题目——搜索框不是越权入口。
 */
export default async function StudentSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const keyword = (firstValue((await searchParams).q) ?? "").trim();
  const now = new Date();
  const membership = { studentId: student.id, status: "ACTIVE" as const };

  if (!keyword) {
    return (
      <section className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
        <StudentPageHeader
          title="搜索"
          description="输入课程、作业标题或题目关键词，再按回车。"
        />
        <p className="workspace-panel border-border bg-card rounded-lg border p-6 text-center text-xs text-neutral-500">
          支持搜索：我加入的课程与教学班、已发布的作业与考试、题库里的题目。
        </p>
      </section>
    );
  }

  const [rooms, assignments, questions] = await Promise.all([
    prisma.classroom.findMany({
      where: {
        status: "ACTIVE",
        memberships: { some: membership },
        OR: [
          { name: { contains: keyword, mode: "insensitive" } },
          { course: { name: { contains: keyword, mode: "insensitive" } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        course: { select: { id: true, name: true, term: true } },
      },
    }),
    prisma.assignment.findMany({
      where: {
        status: "PUBLISHED",
        publishedAt: { lte: now },
        classroom: { status: "ACTIVE", memberships: { some: membership } },
        OR: [
          { title: { contains: keyword, mode: "insensitive" } },
          {
            classroom: {
              course: { name: { contains: keyword, mode: "insensitive" } },
            },
          },
        ],
      },
      orderBy: { dueAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        dueAt: true,
        classroomId: true,
        classroom: {
          select: { name: true, course: { select: { name: true } } },
        },
      },
    }),
    prisma.wrongQuestion.findMany({
      where: {
        studentId: student.id,
        isResolved: false,
        OR: [
          {
            sourceQuestion: {
              title: { contains: keyword, mode: "insensitive" },
            },
          },
          {
            sourceQuestion: {
              content: { contains: keyword, mode: "insensitive" },
            },
          },
        ],
      },
      take: 5,
      select: {
        id: true,
        questionId: true,
        sourceQuestion: { select: { title: true } },
      },
    }),
  ]);

  const total = rooms.length + assignments.length + questions.length;

  return (
    <section className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
      <StudentPageHeader
        title="搜索结果"
        description={`关键词「${keyword}」命中 ${total} 条：课程 ${rooms.length} · 作业与考试 ${assignments.length} · 题库 ${questions.length}。`}
      />

      {total === 0 && (
        <p className="workspace-panel border-border bg-card flex items-center gap-2 rounded-lg border p-6 text-xs text-neutral-600">
          <Search aria-hidden="true" className="size-4 shrink-0" />
          没找到相关内容。换一个更短的关键词，或从侧栏进入课程与题库继续查找。
        </p>
      )}

      {rooms.length > 0 && (
        <section className="workspace-panel border-border bg-card rounded-lg border p-4">
          <h2 className="text-[13px] font-semibold text-neutral-900">课程</h2>
          <ul className="mt-2 divide-y divide-neutral-100">
            {rooms.map((room) => {
              const course = room.course;
              return (
                <li key={room.id} className="py-2">
                  {course ? (
                    <StudentPageLink
                      className={`text-[13px] font-medium hover:underline ${FOCUS_RING}`}
                      href={`/student/courses/${course.id}/learning-center?${new URLSearchParams({ classroomId: room.id })}`}
                    >
                      {course.name}
                    </StudentPageLink>
                  ) : (
                    <span className="text-[13px] font-medium">{room.name}</span>
                  )}
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    {room.name}
                    {course?.term ? ` · ${course.term}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {assignments.length > 0 && (
        <section className="workspace-panel border-border bg-card rounded-lg border p-4">
          <h2 className="text-[13px] font-semibold text-neutral-900">
            作业与考试
          </h2>
          <ul className="mt-2 divide-y divide-neutral-100">
            {assignments.map((item) => (
              <li key={item.id} className="py-2">
                <StudentPageLink
                  className={`text-[13px] font-medium hover:underline ${FOCUS_RING}`}
                  href={`/student/assignments/${encodeURIComponent(item.id)}?${new URLSearchParams({ classroomId: item.classroomId })}`}
                >
                  {item.title}
                </StudentPageLink>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  {[item.classroom.course?.name, item.classroom.name]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  {item.dueAt ? `· 截止 ${studentTaskDate(item.dueAt)}` : null}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {questions.length > 0 && (
        <section className="workspace-panel border-border bg-card rounded-lg border p-4">
          <h2 className="text-[13px] font-semibold text-neutral-900">题库</h2>
          <ul className="mt-2 divide-y divide-neutral-100">
            {questions.map((item) => (
              <li key={item.id} className="py-2">
                <StudentPageLink
                  className={`text-[13px] font-medium hover:underline ${FOCUS_RING}`}
                  href={`/student/wrong-questions/${encodeURIComponent(item.id)}`}
                >
                  {item.sourceQuestion?.title ?? "错题"}
                </StudentPageLink>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  在「我的题库」中，未订正
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
