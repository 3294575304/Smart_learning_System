import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("报告接口强制教师身份、课程归属和私有无缓存下载", async () => {
  const [collectionRoute, downloadRoute, service] = await Promise.all([
    readFile(
      "app/api/teacher/courses/[courseId]/quality-reports/route.ts",
      "utf8",
    ),
    readFile(
      "app/api/teacher/courses/[courseId]/quality-reports/[reportId]/download/route.ts",
      "utf8",
    ),
    readFile("services/quality-reports/service.ts", "utf8"),
  ]);
  assert.match(
    collectionRoute,
    /requireAuthenticatedUser\(\[Role\.TEACHER\]\)/u,
  );
  assert.ok(downloadRoute.includes('"Cache-Control": "private, no-store"'));
  assert.match(
    service,
    /where: \{ id: reportId, courseId, course: \{ teacherId \} \}/u,
  );
  assert.match(service, /isolatedFromFormalGradebook: true/u);
  assert.match(service, /QUALITY_REPORT_DOWNLOADED/u);
});

test("教师界面提供双来源、任务进度、失败恢复和双文件下载", async () => {
  const source = await readFile(
    "components/quality-reports/quality-report-workspace.tsx",
    "utf8",
  );
  for (const token of [
    "平台正式数据",
    "上传成绩文件",
    "上传成绩不会写入正式成绩台账",
    "progress",
    "生成失败",
    "下载 DOCX",
    "下载成绩工作簿",
  ])
    assert.ok(source.includes(token), token);
});
