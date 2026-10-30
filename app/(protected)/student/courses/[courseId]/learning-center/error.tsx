"use client";

import { StudentPageError } from "@/components/feedback/student-page-error";

export default function Error() {
  return (
    <StudentPageError
      title="课程学习中心暂时无法加载"
      returnHref="/student/courses"
      returnLabel="返回我的课程"
    />
  );
}
