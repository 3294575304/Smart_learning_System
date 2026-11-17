import { Role } from "@prisma/client";

import { PageHeader } from "@/components/dashboard/page-header";
import { TeacherSettingsPanel } from "@/components/dashboard/teacher-settings-panel";
import { requirePageRole } from "@/services/auth/page-authorization";
import { teacherEvaluationAssistantEnabled } from "@/services/course-analytics/evaluation-assistant";
import {
  getTeacherTeachingPreferences,
  getTeacherWorkbenchPreferences,
} from "@/services/dashboard/teacher-settings";
import { getSystemConfigValue } from "@/services/system-config/service";

export default async function TeacherSettingsPage() {
  const teacher = await requirePageRole(Role.TEACHER);
  const [preferences, teachingPreferences, platformDueDays] = await Promise.all(
    [
      getTeacherWorkbenchPreferences(teacher.id),
      getTeacherTeachingPreferences(teacher.id),
      getSystemConfigValue("assignmentDefaultDueDays"),
    ],
  );
  const account = [
    { label: "姓名", value: teacher.displayName ?? "未填写" },
    { label: "登录邮箱", value: teacher.email ?? "未绑定邮箱" },
    { label: "学校", value: teacher.schoolName ?? "未绑定学校" },
    { label: "身份", value: "教师" },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <PageHeader title="设置" description="管理账号安全、工作台和教学偏好。" />
      <TeacherSettingsPanel
        account={account}
        courses={preferences.courses}
        initialCourseId={preferences.defaultCourseId}
        teachingPreferences={teachingPreferences}
        platformDueDays={platformDueDays}
        teacherId={teacher.id}
        assistantEnabled={teacherEvaluationAssistantEnabled()}
      />
    </div>
  );
}
