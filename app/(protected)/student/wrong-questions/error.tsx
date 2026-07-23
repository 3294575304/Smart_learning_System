"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function WrongQuestionsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError reset={reset} />;
}
