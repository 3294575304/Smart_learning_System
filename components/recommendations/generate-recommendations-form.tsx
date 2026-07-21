"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { runGenerateRecommendations } from "@/components/recommendations/recommendation-actions";
import { generateRecommendations } from "@/lib/api/recommendations";

export interface RecommendationClassroomOption {
  id: string;
  name: string;
}

interface Props {
  classrooms: RecommendationClassroomOption[];
  studentId: string;
}

export function isGenerateRecommendationDisabled(
  pending: boolean,
  classroomCount: number,
): boolean {
  return pending || classroomCount === 0;
}

export function GenerateRecommendationsForm({ classrooms, studentId }: Props) {
  const router = useRouter();
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  async function generate() {
    if (pending || !classroomId) return;
    setPending(true);
    setFeedback(null);
    const result = await runGenerateRecommendations(
      {
        studentId,
        classroomId,
        recommendedDifficulty: 3,
        limit: 10,
      },
      { generate: generateRecommendations, refresh: () => router.refresh() },
    );
    setFeedback(result);
    setPending(false);
  }

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
        {classrooms.length > 1 ? (
          <div className="min-w-0 sm:min-w-48">
            <label
              className="mb-1 block text-sm font-medium"
              htmlFor="classroom"
            >
              推荐范围
            </label>
            <select
              className="h-10 w-full max-w-full rounded-md border bg-white px-3 text-sm"
              disabled={pending}
              id="classroom"
              onChange={(event) => setClassroomId(event.target.value)}
              value={classroomId}
            >
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button
          aria-busy={pending}
          className="h-10 rounded-md bg-black px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isGenerateRecommendationDisabled(
            pending,
            classrooms.length,
          )}
          onClick={() => void generate()}
          type="button"
        >
          {pending ? "正在生成…" : "生成新推荐"}
        </button>
      </div>
      {classrooms.length === 0 ? (
        <p className="mt-2 text-sm text-amber-700" role="status">
          加入开放中的班级后才能生成推荐练习。
        </p>
      ) : null}
      {feedback ? (
        <p
          aria-live="polite"
          className={`mt-2 max-w-xl text-sm ${feedback.kind === "error" ? "text-red-600" : "text-green-700"}`}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
