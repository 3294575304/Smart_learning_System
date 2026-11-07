"use client";

import { StudentPageError } from "@/components/feedback/student-page-error";

export default function Error() {
  return (
    <StudentPageError
      title="课程问卷暂时无法加载"
      returnHref="/student/tasks"
      returnLabel="返回学习任务"
    />
  );
}
