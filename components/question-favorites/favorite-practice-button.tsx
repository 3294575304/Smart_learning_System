"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestApi } from "@/components/courses/request-api";
export function FavoritePracticeButton({
  questionId,
  disabled = false,
}: {
  questionId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  async function start() {
    if (pending) return;
    setPending(true);
    setError("");
    const response = await requestApi<{ practiceUrl: string }>(
      `/api/student/question-favorites/${encodeURIComponent(questionId)}/practice`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId }),
      },
    );
    if (response.success) {
      router.push(response.data.practiceUrl);
      return;
    }
    setPending(false);
    setError(response.error);
  }
  return (
    <div>
      <button
        type="button"
        disabled={pending || disabled}
        onClick={() => void start()}
        className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
      >
        {pending ? "准备练习…" : "练习这道题"}
      </button>
      {error && (
        <p role="alert" className="mt-1 max-w-64 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
