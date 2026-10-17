import assert from "node:assert/strict";
import test from "node:test";
import {
  groupCourseGradebooks,
  type GradebookClassroomSummary,
  type CourseGradebookSummary,
} from "../../services/gradebook/overview";
const classroom: GradebookClassroomSummary = {
  id: "class-a",
  name: "Python 1班",
  status: "ACTIVE",
  studentCount: 96,
};
function book(
  id: string,
  versionNumber: number,
  published = false,
): CourseGradebookSummary {
  return {
    id,
    classroom,
    scheme: { id: `scheme-${versionNumber}`, versionNumber },
    currentPublication: published
      ? { versionNumber: 1, publishedAt: "2026-10-09T00:00:00Z" }
      : null,
  };
}
test("按班级合并台账，当前方案优先，历史发布不冒充当前方案已发布", () => {
  const rows = groupCourseGradebooks(
    [classroom],
    [book("old", 1, true), book("current", 2)],
    "scheme-2",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].primary?.id, "current");
  assert.equal(rows[0].status, "pending");
  assert.equal(rows[0].canCreate, false);
  assert.deepEqual(
    rows[0].history.map((item) => item.id),
    ["old"],
  );
});
test("方案升级可建立新台账，但旧台账保留独立入口", () => {
  const [row] = groupCourseGradebooks(
    [classroom],
    [book("old", 1, true)],
    "scheme-2",
  );
  assert.equal(row.canCreate, true);
  assert.equal(row.usesPreviousScheme, true);
  assert.equal(row.primary?.id, "old");
});
test("缺少正式方案或班级已停用时不提供创建入口", () => {
  assert.equal(
    groupCourseGradebooks([classroom], [], null)[0].canCreate,
    false,
  );
  assert.equal(
    groupCourseGradebooks(
      [{ ...classroom, status: "ARCHIVED" }],
      [],
      "scheme-2",
    ).length,
    0,
  );
  assert.equal(
    groupCourseGradebooks([classroom], [], "scheme-2")[0].canCreate,
    true,
  );
});
test("解除关联的班级仍可回看历史，但不能从课程入口新建", () => {
  const [row] = groupCourseGradebooks([], [book("old", 1)], "scheme-2");
  assert.equal(row.linked, false);
  assert.equal(row.canCreate, false);
  assert.equal(row.primary?.id, "old");
});
