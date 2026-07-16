import Link from "next/link";

interface ResultsPaginationProps {
  assignmentId: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function pageHref(
  assignmentId: string,
  page: number,
  pageSize: number,
): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return `/teacher/assignments/${assignmentId}/results?${params.toString()}`;
}

export function ResultsPagination({
  assignmentId,
  page,
  pageSize,
  total,
  totalPages,
}: ResultsPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4"
      aria-label="学生成绩分页"
    >
      <p className="text-muted-foreground text-sm">
        共 {total} 名学生，第 {page} / {totalPages} 页
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
            href={pageHref(assignmentId, page - 1, pageSize)}
          >
            上一页
          </Link>
        ) : (
          <span className="text-muted-foreground rounded-md border px-3 py-1.5 text-sm opacity-50">
            上一页
          </span>
        )}
        {page < totalPages ? (
          <Link
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
            href={pageHref(assignmentId, page + 1, pageSize)}
          >
            下一页
          </Link>
        ) : (
          <span className="text-muted-foreground rounded-md border px-3 py-1.5 text-sm opacity-50">
            下一页
          </span>
        )}
      </div>
    </nav>
  );
}
