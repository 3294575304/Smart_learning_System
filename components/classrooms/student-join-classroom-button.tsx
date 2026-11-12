"use client";

export const studentJoinClassroomEvent = "student:join-classroom";

export function StudentJoinClassroomButton({
  card = false,
}: {
  card?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(studentJoinClassroomEvent))}
      className={
        card
          ? "border-border bg-card/50 text-brand-strong hover:bg-muted focus-visible:outline-brand-strong grid min-h-40 place-content-center gap-2 rounded-lg border border-dashed text-sm font-medium focus-visible:outline-2"
          : "border-border bg-card text-brand-strong hover:bg-muted focus-visible:outline-brand-strong min-h-11 rounded-md border px-4 text-sm font-medium focus-visible:outline-2"
      }
    >
      {card && (
        <span aria-hidden="true" className="text-xl">
          +
        </span>
      )}
      {card ? "加入新班级" : "加入班级"}
    </button>
  );
}
