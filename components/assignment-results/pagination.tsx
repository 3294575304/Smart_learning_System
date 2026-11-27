import { PageIndex } from "@/components/dashboard/page-index";
import {
  examWorkspaceHref,
  teacherAssessmentHref,
} from "@/services/exams/classroom-navigation";

interface ResultsPaginationProps {
  assignmentId: string;
  examId?: string | null;
  listContext?: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function pageHref(base: string, page: number, pageSize: number): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return `${base}/results?${params.toString()}`;
}

export function ResultsPagination({
  assignmentId,
  examId,
  listContext,
  page,
  pageSize,
  total,
  totalPages,
}: ResultsPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-5 border-t pt-4">
      <PageIndex
        ariaLabel="学生成绩分页"
        hrefForPage={(targetPage) =>
          examWorkspaceHref(
            pageHref(
              teacherAssessmentHref(assignmentId, examId),
              targetPage,
              pageSize,
            ),
            listContext,
          )
        }
        page={page}
        summary={`共 ${total} 名学生，第 ${page} / ${totalPages} 页`}
        totalPages={totalPages}
      />
    </div>
  );
}
