import { maxExamAttempts } from "@/services/exams/attempt-policy";

export function ExamAttemptFields({
  allowedAttempts,
  autoSubmitOnExit,
  setAllowedAttempts,
  setAutoSubmitOnExit,
  fieldClass,
  attemptsError,
}: {
  allowedAttempts: number;
  autoSubmitOnExit: boolean;
  setAllowedAttempts: (value: number) => void;
  setAutoSubmitOnExit: (value: boolean) => void;
  fieldClass: string;
  attemptsError?: string;
}) {
  return (
    <>
      <label className="grid min-w-0 content-start gap-1.5 text-sm font-medium">
        允许考试次数
        <input
          id="exam-field-attempts"
          className={fieldClass}
          type="number"
          min={1}
          max={maxExamAttempts}
          step={1}
          value={allowedAttempts}
          aria-invalid={attemptsError ? true : undefined}
          onChange={(event) => setAllowedAttempts(Number(event.target.value))}
        />
        {attemptsError && (
          <span className="text-xs text-red-700">{attemptsError}</span>
        )}
      </label>
      <label className="grid min-w-0 content-start gap-1.5 text-sm font-medium">
        考试期间退出
        <select
          id="exam-field-exit-policy"
          className={fieldClass}
          value={autoSubmitOnExit ? "submit" : "resume"}
          onChange={(event) =>
            setAutoSubmitOnExit(event.target.value === "submit")
          }
        >
          <option value="submit">自动交卷并计 1 次</option>
          <option value="resume">保留作答，可继续考试</option>
        </select>
      </label>
    </>
  );
}
