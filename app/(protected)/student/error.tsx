"use client";

import { RouteError } from "@/components/feedback/route-error";

export default function StudentRouteError() {
  return <RouteError reset={() => window.location.reload()} />;
}
