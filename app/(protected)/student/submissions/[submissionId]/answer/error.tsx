"use client";

import { StudentPageError } from "@/components/feedback/student-page-error";

export default function Error() {
  return (
    <StudentPageError
      title="作业作答暂时无法加载"
      returnHref="/student/assignments"
      returnLabel="返回我的作业"
    />
  );
}
