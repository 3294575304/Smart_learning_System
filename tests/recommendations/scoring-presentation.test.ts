import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudentSubmissionHistory } from "../../components/assignment-results/student-submission-history";
import { studentResultsQuerySchema } from "../../services/assignments/schemas";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
Object.assign(globalThis, { React });
const router: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};
function renderMarkup(element: React.ReactNode) {
  return renderToStaticMarkup(
    React.createElement(AppRouterContext.Provider, { value: router }, element),
  );
}
type Props = React.ComponentProps<typeof StudentSubmissionHistory>;
function render(
  status: Props["results"]["items"][number]["status"],
  score: number | null,
  maxScore: number | null,
) {
  return renderMarkup(
    React.createElement(StudentSubmissionHistory, {
      query: studentResultsQuerySchema.parse({}),
      results: {
        items: [
          {
            id: "synthetic",
            assignmentId: "assignment",
            assignmentTitle: "Test",
            classroomName: "Class",
            isHistorical: false,
            attemptNumber: 1,
            status,
            submittedAt: null,
            score,
            maxScore,
            percentage: null,
          },
        ],
        pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
      },
    }),
  );
}
test("published legacy scores show percentages and retain the raw denominator", () => {
  assert.match(render("PUBLISHED", 18, 20), /90 分｜原始得分 18／20/);
  assert.match(render("PUBLISHED", 0, 50), /0 分｜原始得分 0／50/);
  assert.match(render("PUBLISHED", null, null), /缺少完整成绩/);
});
test("unpublished records do not render score even if a stale value is supplied", () => {
  const html = render("GRADED", 18, 20);
  assert.match(html, /待发布/);
  assert.doesNotMatch(html, /90 分|18／20|原始得分/);
});
