import { ArrowRight } from "lucide-react";
import { StartAttemptButton } from "@/components/assignments/start-attempt-button";
import type { StudentNotificationAction as Action } from "@/services/notifications/types";

export function StudentNotificationAction({
  action,
  title,
}: {
  action: Action;
  title: string;
}) {
  const className =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-sky-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50";
  if (action.kind === "START_ASSIGNMENT")
    return (
      <StartAttemptButton
        assignmentId={action.assignmentId}
        label={action.label}
        className={className}
        scope={{ courseId: action.courseId, classroomId: action.classroomId }}
      />
    );
  return (
    <a
      href={action.href}
      className={className}
      aria-label={`${action.label}：${title}`}
    >
      {action.label}
      <ArrowRight aria-hidden="true" className="size-4" />
    </a>
  );
}
