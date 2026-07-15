"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { requestAssignmentApi } from "@/components/assignments/request-api";

interface Props {
  assignmentId: string;
  disabled?: boolean;
}

export function StartAttemptButton({ assignmentId, disabled = false }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    const response = await requestAssignmentApi<{ id: string }>(
      `/api/student/assignments/${assignmentId}/attempts`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      },
    );
    if (!response.success) {
      setError(response.error);
      setPending(false);
      return;
    }
    router.push(`/student/submissions/${response.data.id}/answer`);
    router.refresh();
  }

  return (
    <div>
      <button
        className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
        disabled={disabled || pending}
        onClick={start}
        type="button"
      >
        {pending ? "正在开始…" : "开始作答"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
