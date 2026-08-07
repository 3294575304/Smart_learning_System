"use client";
import { RouteError } from "@/components/feedback/route-error";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <RouteError reset={reset} />;
}
