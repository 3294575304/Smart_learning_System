"use client";

import { KeyRound, UserPlus } from "lucide-react";
import { useState } from "react";

import { ChangePasswordDialog } from "@/components/auth/change-password-dialog";
import { JoinClassroomForm } from "@/components/classrooms/join-classroom-form";
import { FOCUS_RING } from "./ui-focus";

/**
 * 设置页只放三件学生真的能改的事：密码、班级、消息偏好。
 * 消息偏好（邮件通知）目前没有后端开关，先不画假开关，
 * 留一段说明，避免出现点了没反应的控件。
 */
export function StudentSettingsPanel() {
  const [passwordOpen, setPasswordOpen] = useState(false);
  return (
    <div className="workspace-settings grid gap-5 @min-[48rem]:grid-cols-2">
      <section className="workspace-panel border-border bg-card flex min-w-0 flex-col rounded-lg border p-4">
        <h2 className="text-[13px] font-semibold text-neutral-900">账号安全</h2>
        <p className="mt-1 text-xs leading-5 text-neutral-600">
          修改后立即生效，其他设备需要重新登录。
        </p>
        <div className="mt-3">
          <button
            className={`border-border bg-card hover:bg-muted inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-xs font-medium text-neutral-800 ${FOCUS_RING}`}
            onClick={() => setPasswordOpen(true)}
            type="button"
          >
            <KeyRound aria-hidden="true" className="size-4" />
            修改密码
          </button>
        </div>
      </section>

      <section className="workspace-panel border-border bg-card flex min-w-0 flex-col rounded-lg border p-4">
        <h2 className="text-[13px] font-semibold text-neutral-900">加入班级</h2>
        <p className="mt-1 text-xs leading-5 text-neutral-600">
          输入教师提供的班级邀请码，加入后即可看到对应课程与作业。
        </p>
        <div className="mt-3">
          <JoinClassroomForm compact inputId="settings-join-code" />
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-neutral-500">
          <UserPlus aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          已加入的班级在「我的课程」里可以查看课程、教学班与任课教师。
        </p>
      </section>

      <ChangePasswordDialog
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
      />
    </div>
  );
}
