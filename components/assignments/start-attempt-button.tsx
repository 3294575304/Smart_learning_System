"use client";

import {
  studentTaskHref,
  type StudentTaskScope,
} from "@/services/student-experience/task-scope";

import { useRef, useState } from "react";

import { requestAssignmentApi } from "@/components/assignments/request-api";

interface Props {
  assignmentId: string;
  disabled?: boolean;
  scope?: StudentTaskScope;
  label?: string;
  className?: string;
}

export function StartAttemptButton({
  assignmentId,
  disabled = false,
  scope = {},
  label = "开始作答",
  className,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const requestId = useRef<string | null>(null);

  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    requestId.current ??= crypto.randomUUID();
    setPending(true);
    setError(null);
    const response = await requestAssignmentApi<{ id: string }>(
      `/api/student/assignments/${assignmentId}/attempts`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: requestId.current }),
      },
    );
    if (!response.success) {
      setError(response.error);
      setPending(false);
      inFlight.current = false;
      return;
    }
    window.location.assign(
      studentTaskHref(`/student/submissions/${response.data.id}/answer`, scope),
    );
  }

  return (
    <div>
      <button
        className={
          className ??
          "inline-flex min-h-11 items-center rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50"
        }
        disabled={disabled || pending}
        onClick={start}
        type="button"
      >
        {pending ? "正在开始…" : label}
      </button>
      {error ? (
        <p role="alert" className="mt-2 max-w-xs text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
