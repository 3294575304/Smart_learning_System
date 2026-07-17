"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { LearningAnalysisContent } from "@/components/learning-analysis/learning-analysis-content";
import { LearningAnalysisError } from "@/components/learning-analysis/learning-analysis-error";
import { loadLearningAnalysis } from "@/components/learning-analysis/learning-analysis-loader";
import { LearningAnalysisSkeleton } from "@/components/learning-analysis/learning-analysis-skeleton";
import { LearningAnalysisStatus } from "@/components/learning-analysis/learning-analysis-status";
import type {
  LearningAnalysis,
  LearningAnalysisMetadata,
} from "@/components/learning-analysis/learning-analysis-types";

interface Props {
  submissionId: string;
}

type ViewState =
  | { status: "loading" }
  | { status: "generating" }
  | { status: "pending" }
  | {
      status: "success";
      analysis: LearningAnalysis;
      metadata: LearningAnalysisMetadata | null;
    }
  | { status: "failed"; message: string };

export function LearningAnalysisCard({ submissionId }: Props) {
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const runIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const runId = ++runIdRef.current;
    setState({ status: "loading" });
    const result = await loadLearningAnalysis(
      submissionId,
      controller.signal,
      undefined,
      () => {
        if (runIdRef.current === runId && !controller.signal.aborted) {
          setState({ status: "generating" });
        }
      },
    );
    if (runIdRef.current !== runId || controller.signal.aborted) return;
    if (result.status === "success") {
      setState(result);
    } else if (result.status === "pending") {
      setState({ status: "pending" });
    } else if (result.status === "failed") {
      setState(result);
    } else {
      setState({
        status: "failed",
        message: "尚未生成学情分析，请稍后重试",
      });
    }
  }, [submissionId]);

  useEffect(() => {
    void load();
    return () => {
      runIdRef.current += 1;
      abortRef.current?.abort();
    };
  }, [load]);

  if (state.status === "loading") return <LearningAnalysisSkeleton />;
  if (state.status === "generating") {
    return <LearningAnalysisStatus status="generating" />;
  }
  if (state.status === "pending") {
    return (
      <LearningAnalysisStatus onRetry={() => void load()} status="pending" />
    );
  }
  if (state.status === "failed") {
    return (
      <LearningAnalysisError
        message={state.message}
        onRetry={() => void load()}
      />
    );
  }
  return (
    <LearningAnalysisContent
      analysis={state.analysis}
      metadata={state.metadata}
    />
  );
}
