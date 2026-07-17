interface Props {
  status: "generating" | "pending";
  onRetry?: () => void;
}

export function LearningAnalysisStatus({ status, onRetry }: Props) {
  const pending = status === "pending";
  return (
    <div
      aria-live="polite"
      className="rounded-xl border bg-white p-6"
      role="status"
    >
      <h2 className="text-lg font-semibold">学情分析</h2>
      <p className="mt-2 text-sm text-gray-600">
        {pending
          ? "分析正在处理中，成绩内容不受影响。"
          : "正在生成分析，成绩内容可继续查看。"}
      </p>
      {pending && onRetry ? (
        <button
          className="mt-4 rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
          onClick={onRetry}
          type="button"
        >
          重新查询分析
        </button>
      ) : null}
    </div>
  );
}
