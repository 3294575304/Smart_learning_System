"use client";

import { StudentPageError } from "@/components/feedback/student-page-error";

export default function Error() {
  return (
    <StudentPageError
      title="学习分析暂时无法加载"
      returnHref="/student"
      returnLabel="返回学习主页"
    />
  );
}
