"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function TeacherCoursesError({ reset }: { reset: () => void }) {
  return <RouteError reset={reset} />;
}
