"use client";

import { StudentPageError } from "@/components/feedback/student-page-error";

export default function ExamsRouteError({ reset }: { reset: () => void }) {
  return (
    <StudentPageError
      title="考试记录暂时打不开"
      returnHref="/student/exams"
      returnLabel="返回我的考试"
      onRetry={reset}
    />
  );
}
