"use client";

import { RecommendationStatus } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  recommendationPracticePath,
  runStartRecommendation,
} from "@/components/recommendations/recommendation-actions";
import { startRecommendationRequest } from "@/lib/api/recommendations";

interface Props {
  recommendationId: string;
  status: RecommendationStatus;
}

export function isStartRecommendationDisabled(pending: boolean): boolean {
  return pending;
}

export function StartRecommendationButton({ recommendationId, status }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (
    status === RecommendationStatus.STARTED ||
    status === RecommendationStatus.COMPLETED
  ) {
    return (
      <Link
        className="inline-flex min-h-10 items-center justify-center rounded-md bg-black px-4 text-sm font-medium text-white"
        href={recommendationPracticePath(recommendationId)}
      >
        {status === RecommendationStatus.COMPLETED ? "查看结果" : "继续练习"}
      </Link>
    );
  }

  if (status !== RecommendationStatus.PENDING) return null;

  async function start() {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await runStartRecommendation(recommendationId, {
      start: startRecommendationRequest,
      navigate: (path) => router.push(path),
      refresh: () => router.refresh(),
    });
    if (result.kind === "error") {
      setError(result.message);
      setPending(false);
    }
  }

  return (
    <div>
      <button
        aria-busy={pending}
        className="min-h-10 rounded-md bg-black px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isStartRecommendationDisabled(pending)}
        onClick={() => void start()}
        type="button"
      >
        {pending ? "正在开始…" : "开始练习"}
      </button>
      {error ? (
        <p className="mt-2 max-w-sm text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
