"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { updateWrongQuestionMasteryRequest } from "@/lib/api/wrong-questions";

interface Props {
  wrongQuestionId: string;
  initialIsMastered: boolean;
  compact?: boolean;
}

export function MasteryToggleButton({
  wrongQuestionId,
  initialIsMastered,
  compact = false,
}: Props) {
  const router = useRouter();
  const [isMastered, setIsMastered] = useState(initialIsMastered);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsMastered(initialIsMastered);
  }, [initialIsMastered]);

  async function toggleMastery() {
    setError(null);
    setIsSubmitting(true);
    const response = await updateWrongQuestionMasteryRequest(
      wrongQuestionId,
      !isMastered,
    );
    setIsSubmitting(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    setIsMastered(response.data.isMastered);
    router.refresh();
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <button
        className={
          isMastered
            ? "rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            : "rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        }
        disabled={isSubmitting}
        onClick={() => void toggleMastery()}
        type="button"
      >
        {isSubmitting
          ? "正在更新..."
          : isMastered
            ? "取消已掌握"
            : "标记为已掌握"}
      </button>
      {error ? (
        <p className="max-w-56 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
