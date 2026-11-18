import { Download } from "lucide-react";

export function AssignmentResourceList({
  assignmentId,
  files,
}: {
  assignmentId: string;
  files: readonly { id: string; name: string; sizeBytes: number }[];
}) {
  if (!files.length) return null;

  return (
    <section
      aria-label="教师任务附件"
      className="border-line bg-card rounded-xl border p-4"
    >
      <h2 className="text-ink text-[15px] font-semibold">教师任务附件</h2>
      <ul className="mt-2 space-y-2">
        {files.map((file) => (
          <li key={file.id} className="flex flex-wrap items-center gap-2">
            <a
              aria-label={`下载 ${file.name}`}
              className="text-brand-strong inline-flex min-w-0 items-center gap-1.5 text-sm underline"
              href={`/api/assignments/${assignmentId}/resources/${file.id}`}
            >
              <Download aria-hidden="true" className="size-4 shrink-0" />
              <span className="break-all">{file.name}</span>
            </a>
            <span className="text-ink-soft text-xs">
              {Math.ceil(file.sizeBytes / 1024)} KB
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
