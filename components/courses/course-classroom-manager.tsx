"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { CourseRosterImportWizard } from "@/components/courses/course-roster-import-wizard";
import { requestApi } from "@/components/courses/request-api";
import { EmptyState } from "@/components/dashboard/empty-state";
import { CLASSROOM_STATUS_LABELS } from "@/services/classrooms/presentation";
import {
  createClassroomSchema,
  type CreateClassroomData,
  type CreateClassroomInput,
} from "@/services/classrooms/schemas";
import type { TeacherCourseClassroomView } from "@/services/courses/types";
import { School } from "lucide-react";
import type { CourseStatus } from "@prisma/client";

export function parseClassroomCount(input: string): number | null {
  const count = Number(input);
  return /^\d+$/u.test(input) && Number.isSafeInteger(count) && count >= 1
    ? count
    : null;
}

export function CourseClassroomManager({
  courseId,
  courseName,
  courseNo,
  term,
  courseStatus,
  linkedClassrooms,
}: {
  courseId: string;
  courseName: string;
  courseNo: string;
  term: string;
  courseStatus: CourseStatus;
  linkedClassrooms: TeacherCourseClassroomView[];
}) {
  const router = useRouter();
  const [countInput, setCountInput] = useState("1");
  const [countError, setCountError] = useState<string | null>(null);
  const [targetCount, setTargetCount] = useState<number | null>(null);
  const [created, setCreated] = useState<TeacherCourseClassroomView[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"create" | "import" | "done">("create");
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateClassroomInput, unknown, CreateClassroomData>({
    resolver: zodResolver(createClassroomSchema),
    defaultValues: { name: "", description: "", allowStudentLeave: true },
  });

  const classrooms = [
    ...linkedClassrooms,
    ...created.filter(
      (item) => !linkedClassrooms.some((linked) => linked.id === item.id),
    ),
  ];
  const current = classrooms.find((item) => item.id === currentId);

  function start() {
    const count = parseClassroomCount(countInput);
    if (count === null) {
      setCountError("请输入不小于 1 的整数。");
      return;
    }
    setCountError(null);
    setCreated([]);
    setCurrentId(null);
    setPhase("create");
    setTargetCount(count);
  }

  const submit = handleSubmit(async (input) => {
    setServerError(null);
    const result = await requestApi<{ id: string; name: string }>(
      `/api/teacher/courses/${courseId}/classrooms`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    if (!result.success) {
      setServerError(result.error);
      for (const field of [
        "name",
        "description",
        "allowStudentLeave",
      ] as const) {
        const message = result.fieldErrors?.[field]?.[0];
        if (message) setError(field, { message });
      }
      router.refresh();
      return;
    }

    const now = new Date();
    setCreated((items) => [
      ...items,
      {
        id: result.data.id,
        name: result.data.name,
        description: input.description,
        allowStudentLeave: input.allowStudentLeave,
        status: "ACTIVE",
        studentCount: 0,
        currentCourse: {
          id: courseId,
          name: courseName,
          courseNo,
          term,
          status: "ACTIVE",
        },
        createdAt: now,
        updatedAt: now,
      },
    ]);
    setCurrentId(result.data.id);
    setPhase("import");
    router.refresh();
  });

  function next() {
    setCurrentId(null);
    setServerError(null);
    if (targetCount !== null && created.length >= targetCount) {
      setPhase("done");
    } else {
      reset({ name: "", description: "", allowStudentLeave: true });
      setPhase("create");
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-xl border p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">课程班级</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              每个班级独立管理名单和教学记录。
            </p>
          </div>
          <span className="text-muted-foreground text-sm">
            {classrooms.length} 个
          </span>
        </div>
        {classrooms.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              compact
              description="在下方创建第一个课程班级。"
              icon={School}
              title="暂无课程班级"
            />
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {classrooms.map((classroom) => (
              <article className="rounded-lg border p-4" key={classroom.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{classroom.name}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {classroom.description ?? "暂无班级说明"}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
                    {CLASSROOM_STATUS_LABELS[classroom.status]}
                  </span>
                </div>
                <p className="text-muted-foreground mt-3 text-xs">
                  班级成员 {classroom.studentCount} 名
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-sky-700">
                  <Link
                    href={`/teacher/courses/${courseId}/teaching-progress?classroomId=${classroom.id}`}
                  >
                    本班进度
                  </Link>
                  <Link
                    href={`/teacher/courses/${courseId}/profiles?classroomId=${classroom.id}`}
                  >
                    学生画像
                  </Link>
                  <Link
                    href={`/teacher/assignments?courseId=${courseId}&classroomId=${classroom.id}&section=${classroom.status === "ACTIVE" ? "CURRENT" : "HISTORY"}`}
                  >
                    班级作业
                  </Link>
                  <Link href={`/teacher/classrooms/${classroom.id}`}>
                    {classroom.status === "ACTIVE"
                      ? "管理 / 确认结课"
                      : "查看班级记录"}
                  </Link>
                  <Link
                    href={`/teacher/courses/${courseId}/students?classroomId=${classroom.id}`}
                  >
                    管理名单
                  </Link>
                  {courseStatus === "ACTIVE" &&
                    classroom.status === "ACTIVE" && (
                      <Link
                        href={`/teacher/courses/${courseId}/students/import?classroomId=${classroom.id}`}
                      >
                        补导名单
                      </Link>
                    )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bg-card space-y-4 rounded-xl border p-5">
        <h2 className="font-semibold">创建课程班级</h2>
        {courseStatus !== "ACTIVE" ? (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            当前课程状态不能创建班级。
          </p>
        ) : targetCount === null || phase === "done" ? (
          <>
            {phase === "done" && (
              <p
                className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800"
                role="status"
              >
                本轮已创建 {created.length} 个班级，可继续创建下一批。
              </p>
            )}
            <label
              className="block max-w-56 text-sm font-medium"
              htmlFor="course-classroom-count"
            >
              要创建的班级个数
              <input
                className="border-input mt-2 w-full rounded-md border px-3 py-2"
                id="course-classroom-count"
                inputMode="numeric"
                min="1"
                onChange={(event) => {
                  setCountInput(event.target.value);
                  setCountError(null);
                }}
                type="number"
                value={countInput}
              />
            </label>
            {countError && (
              <p className="text-destructive text-sm" role="alert">
                {countError}
              </p>
            )}
            <button
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium"
              onClick={start}
              type="button"
            >
              开始逐个创建
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">
              第 {phase === "create" ? created.length + 1 : created.length}{" "}
              个／共 {targetCount} 个
            </p>
            {phase === "create" ? (
              <form className="space-y-4" noValidate onSubmit={submit}>
                <div>
                  <label
                    className="text-sm font-medium"
                    htmlFor="new-course-classroom-name"
                  >
                    班级名称
                  </label>
                  <input
                    {...register("name")}
                    className="border-input mt-2 w-full rounded-md border px-3 py-2"
                    id="new-course-classroom-name"
                  />
                  {errors.name && (
                    <p className="text-destructive mt-1 text-sm">
                      {errors.name.message}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    className="text-sm font-medium"
                    htmlFor="new-course-classroom-description"
                  >
                    班级描述
                  </label>
                  <textarea
                    {...register("description")}
                    className="border-input mt-2 min-h-24 w-full rounded-md border px-3 py-2"
                    id="new-course-classroom-description"
                  />
                  {errors.description && (
                    <p className="text-destructive mt-1 text-sm">
                      {errors.description.message}
                    </p>
                  )}
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    {...register("allowStudentLeave")}
                    className="mt-1 size-4"
                    type="checkbox"
                  />
                  <span>允许学生主动退出</span>
                </label>
                {serverError && (
                  <p
                    className="text-destructive rounded-md bg-red-50 p-3 text-sm"
                    role="alert"
                  >
                    {serverError} 请核对后重试。
                  </p>
                )}
                <button
                  className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "正在创建..." : "创建班级并绑定课程"}
                </button>
              </form>
            ) : current ? (
              <div className="space-y-4">
                <p
                  className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800"
                  role="status"
                >
                  班级“{current.name}”已创建并绑定课程。现在可为该班导入名单。
                </p>
                <CourseRosterImportWizard
                  key={current.id}
                  courseId={courseId}
                  courseName={courseName}
                  courseNo={courseNo}
                  term={term}
                  initialClassroomId={current.id}
                  lockedClassroomId={current.id}
                  linkedClassrooms={[current]}
                  onContinue={next}
                />
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
