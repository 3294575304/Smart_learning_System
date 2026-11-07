"use client";

import { StudentPageError } from "@/components/feedback/student-page-error";

export default function Error() {
  return (
    <StudentPageError
      title="提交结果暂时无法加载"
      returnHref="/student/assignments"
      returnLabel="返回我的作业"
    />
  );
}
