"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function AdminQuestionsError({ reset }: { reset: () => void }) {
  return <RouteError reset={reset} />;
}
