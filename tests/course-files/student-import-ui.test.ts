import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ClassroomStatus } from "@prisma/client";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CourseStudentRosterImportCard } from "../../components/courses/course-student-roster-import-card";
import {
  EXECUTION_ACTION_LABELS,
  PREVIEW_STATUS_LABELS,
  ROSTER_IMPORT_STEPS,
  executionSummaryItems,
  previewBlockingReason,
} from "../../components/courses/roster-import-presenters";
import { studentImportMappingFormSchema } from "../../services/student-imports/schemas";

test("名单管理入口沿用课程详情卡片并展示明确安全说明", () => {
  const markup = renderToStaticMarkup(
    React.createElement(CourseStudentRosterImportCard, {
      courseId: "course-1",
      linkedClassrooms: [
        {
          id: "classroom-1",
          name: "Python 1 班",
          description: null,
          status: ClassroomStatus.ACTIVE,
          allowStudentLeave: false,
          studentCount: 42,
          currentCourse: null,
          createdAt: new Date("2026-07-30T00:00:00.000Z"),
          updatedAt: new Date("2026-07-30T00:00:00.000Z"),
        },
      ],
    }),
  );

  assert.match(markup, /学生名单管理/u);
  assert.match(markup, /分步向导/u);
  assert.match(markup, /一次性账号表单次下载/u);
  assert.match(markup, /\/teacher\/courses\/course-1\/students\/import/u);
  assert.match(markup, /1 个班级 · 42 名学生/u);
});

test("字段映射表单校验必填字段并禁止复用源列", () => {
  const valid = studentImportMappingFormSchema.parse({
    academicTerm: "0",
    courseNo: "1",
    studentNo: "2",
    studentName: "3",
    className: "4",
    email: "",
    phone: "",
    gradeMark: "5",
    finalGrade: "6",
    specialReason: "7",
    gradeType: "8",
    remark: "9",
  });
  assert.deepEqual(valid.fieldMappings, {
    academicTerm: 0,
    courseNo: 1,
    studentNo: 2,
    studentName: 3,
    className: 4,
    gradeMark: 5,
    finalGrade: 6,
    specialReason: 7,
    gradeType: 8,
    remark: 9,
  });

  const missingRequired = studentImportMappingFormSchema.safeParse({
    academicTerm: "",
    courseNo: "1",
    studentNo: "2",
    studentName: "3",
    className: "4",
    email: "",
    phone: "",
    gradeMark: "",
    finalGrade: "",
    specialReason: "",
    gradeType: "",
    remark: "",
  });
  assert.equal(missingRequired.success, false);

  const reusedColumn = studentImportMappingFormSchema.safeParse({
    academicTerm: "0",
    courseNo: "0",
    studentNo: "2",
    studentName: "3",
    className: "4",
    email: "",
    phone: "",
    gradeMark: "",
    finalGrade: "",
    specialReason: "",
    gradeType: "",
    remark: "",
  });
  assert.equal(reusedColumn.success, false);
});

test("导入向导覆盖四步、阻断理由与完整结果分类", () => {
  assert.deepEqual(
    ROSTER_IMPORT_STEPS.map((step) => step.label),
    ["上传文件", "字段映射", "数据预览", "确认导入"],
  );
  assert.equal(PREVIEW_STATUS_LABELS.EXISTING_USER, "已有账号，将加入班级");
  assert.equal(PREVIEW_STATUS_LABELS.ALREADY_ENROLLED, "已在班级");
  assert.equal(EXECUTION_ACTION_LABELS.SKIPPED, "已跳过");
  assert.equal(EXECUTION_ACTION_LABELS.FAILED, "导入失败");

  assert.equal(
    previewBlockingReason({
      totalRows: 3,
      previewRows: 3,
      validRows: 2,
      warningRows: 0,
      errorRows: 1,
      warningCount: 0,
      errorCount: 2,
      emptyRows: 0,
      newUserRows: 1,
      existingUserRows: 1,
      alreadyEnrolledRows: 0,
      courseMismatchRows: 0,
      invalidRows: 1,
      duplicateRows: 0,
      canImport: false,
    }),
    "存在 1 条错误记录、2 个阻断问题。请修正源文件或字段映射后重新预览。",
  );

  assert.deepEqual(
    executionSummaryItems({
      totalRows: 10,
      createdUserRows: 3,
      matchedExistingUserRows: 2,
      alreadyEnrolledRows: 1,
      skippedRows: 3,
      failedRows: 1,
      importedRows: 6,
    }),
    [
      { label: "新建账号", value: 3 },
      { label: "已有账号入班", value: 2 },
      { label: "原本已在班级", value: 1 },
      { label: "跳过", value: 3 },
      { label: "失败", value: 1 },
    ],
  );
});

test("向导源码保留离页保护、明确处理中状态与禁止自动发送说明", async () => {
  const source = await readFile(
    new URL(
      "../../components/courses/course-roster-import-wizard.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /beforeunload/u);
  assert.match(source, /一次性账号表尚未下载/u);
  assert.match(source, /正在正式导入学生名单/u);
  assert.match(source, /disabled=\{\s*isExecuting/u);
  assert.match(source, /平台不提供邮件、短信、微信或其他自动发送功能/u);
  assert.match(source, /preview\.batch\.summary\.canImport/u);
});
