import { Role } from "@prisma/client";

import { StudentPageHeader } from "@/components/dashboard/student-page-header";
import { StudentSettingsPanel } from "@/components/dashboard/student-settings-panel";
import { requirePageRole } from "@/services/auth/page-authorization";

const rows = [
  { key: "name", label: "姓名" },
  { key: "email", label: "登录邮箱" },
  { key: "school", label: "学校" },
  { key: "role", label: "身份" },
] as const;

export default async function StudentSettingsPage() {
  const student = await requirePageRole(Role.STUDENT);
  const values: Record<(typeof rows)[number]["key"], string> = {
    name: student.displayName ?? "未填写",
    email: student.email ?? "未绑定邮箱",
    school: student.schoolName ?? "未绑定学校",
    role: "学生",
  };
  return (
    <section className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
      <StudentPageHeader
        title="设置"
        description="账号信息由学校统一维护；密码、班级在这里自助处理。"
      />
      <section className="workspace-panel border-border bg-card rounded-lg border p-4">
        <h2 className="text-[13px] font-semibold text-neutral-900">账号信息</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs @min-[32rem]:grid-cols-2">
          {rows.map((row) => (
            <div
              className="border-border/70 flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0"
              key={row.key}
            >
              <dt className="text-neutral-500">{row.label}</dt>
              <dd className="truncate font-medium text-neutral-900">
                {values[row.key]}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] leading-5 text-neutral-500">
          姓名、学号与学校信息如需更正，请联系任课教师或学校管理员。
        </p>
      </section>
      <StudentSettingsPanel />
    </section>
  );
}
