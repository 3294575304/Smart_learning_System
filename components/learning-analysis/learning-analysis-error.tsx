interface Props {
  message: string;
  onRetry: () => void;
}

export function LearningAnalysisError({ message, onRetry }: Props) {
  return (
    <div
      aria-live="polite"
      className="rounded-xl border bg-white p-6"
      role="status"
    >
      <h2 className="text-lg font-semibold">学情分析</h2>
      <p className="mt-2 text-sm break-words text-gray-600">{message}</p>
      <button
        className="mt-4 rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
        onClick={onRetry}
        type="button"
      >
        重新加载分析
      </button>
    </div>
  );
}
