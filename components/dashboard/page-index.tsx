import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

interface PageIndexProps {
  page: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
  ariaLabel: string;
  summary?: string;
}

function visiblePageNumbers(page: number, totalPages: number): number[] {
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const pages = new Set([1, totalPages]);
  for (
    let candidate = Math.max(1, currentPage - 1);
    candidate <= Math.min(totalPages, currentPage + 1);
    candidate += 1
  ) {
    pages.add(candidate);
  }
  return [...pages].sort((left, right) => left - right);
}

const iconLinkClassName =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export function PageIndex({
  page,
  totalPages,
  hrefForPage,
  ariaLabel,
  summary,
}: PageIndexProps) {
  if (totalPages <= 1) return null;

  const pages = visiblePageNumbers(page, totalPages);

  return (
    <nav
      aria-label={ariaLabel}
      className="flex flex-wrap items-center justify-center gap-1.5"
    >
      {summary ? (
        <span className="mr-2 text-sm text-gray-500">{summary}</span>
      ) : null}
      {page > 1 ? (
        <Link
          aria-label="上一页"
          className={iconLinkClassName}
          href={hrefForPage(page - 1)}
          title="上一页"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
      {pages.map((pageNumber, index) => {
        const previousPage = pages[index - 1];
        const hasGap =
          previousPage !== undefined && pageNumber - previousPage > 1;

        return (
          <span className="contents" key={pageNumber}>
            {hasGap ? (
              <span
                aria-hidden="true"
                className="inline-flex size-9 items-center justify-center text-sm text-gray-400"
              >
                …
              </span>
            ) : null}
            <Link
              aria-current={pageNumber === page ? "page" : undefined}
              aria-label={`第 ${pageNumber} 页`}
              className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                pageNumber === page
                  ? "border-sky-600 bg-sky-600 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
              href={hrefForPage(pageNumber)}
            >
              {pageNumber}
            </Link>
          </span>
        );
      })}
      {page < totalPages ? (
        <Link
          aria-label="下一页"
          className={iconLinkClassName}
          href={hrefForPage(page + 1)}
          title="下一页"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
    </nav>
  );
}
