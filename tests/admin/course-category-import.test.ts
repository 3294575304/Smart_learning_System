import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { AuditAction, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { AIProvider } from "@/services/ai/provider";
import {
  buildCatalogAIInput,
  courseNameKey,
  extractWorkbookCatalog,
  mergeCatalogWithAI,
} from "@/services/question-course-categories/catalog-extractor";
import { previewCourseCategoryImport } from "@/services/question-course-categories/catalog-import-service";
import { createQuestionCourseCategoriesInBulk } from "@/services/question-course-categories/service";
import { parseSpreadsheetWorkbook } from "@/services/student-imports/spreadsheet-parser";

import {
  buildCsvFixture,
  buildXlsFixture,
  uploadBufferAsFile,
} from "../helpers/student-import-fixtures";

const TEACHING_PLAN_HEADERS = [
  "课程类别",
  "课程性质",
  "课程号",
  "课程名称",
  "总学时",
  "学分",
  "开课学期",
] as const;

function planRows() {
  return [
    ["通修课程", "必修", "15000001", "形势与政策", "64", "2", "各"],
    ["", "", "15000002", "体育（1）", "36", "1", "1"],
    ["合计", "", "", "", "100", "3", ""],
    ["通识课程", "选修", "", "四史教育", "16", "1", "2"],
    [
      "",
      "",
      "",
      "理工农类：选修6学分，其中必须选修公共艺术类和人文社科类各2学分",
      "",
      "6",
      "各",
    ],
    ["", "", "15000002", "体育（1）", "36", "1", "1"],
  ];
}

function fakeProvider(courses: unknown[]): AIProvider {
  return {
    name: "fake",
    model: "fake-model",
    extractCourseCatalog: async () => ({ courses }),
  } as unknown as AIProvider;
}

test("表格识别定位课程名称列并跳过合计与说明行", () => {
  const workbook = parseSpreadsheetWorkbook(
    "csv",
    buildCsvFixture({ headers: TEACHING_PLAN_HEADERS, rows: planRows() }),
  );
  const table = extractWorkbookCatalog(workbook);
  assert.ok(table);
  assert.equal(table.headerRowNumber, 1);
  assert.deepEqual(
    table.rows.map((row) => row.name),
    ["形势与政策", "体育（1）", "四史教育"],
  );
  assert.equal(table.duplicateCount, 1);
  const pe = table.rows.find((row) => row.name === "体育（1）");
  assert.equal(pe?.category, "通修课程");
  assert.equal(pe?.credits, "1");
  const history = table.rows.find((row) => row.name === "四史教育");
  assert.equal(history?.category, "通识课程");
  assert.equal(history?.courseNo, "");

  const aiInput = buildCatalogAIInput(table, "教学计划表.csv");
  assert.equal(aiInput.headerLabels.includes("课程名称"), true);
  assert.equal(aiInput.rows.length, 3);
});

test("AI 返回的课程名必须与表格原文一致，元数据缺失时回落到规则结果", () => {
  const workbook = parseSpreadsheetWorkbook(
    "csv",
    buildCsvFixture({ headers: TEACHING_PLAN_HEADERS, rows: planRows() }),
  );
  const table = extractWorkbookCatalog(workbook);
  assert.ok(table);
  const merged = mergeCatalogWithAI(
    table,
    [
      { name: "形势与政策", credits: "2", term: "各" },
      { name: "不存在的课程" },
    ],
    {
      namePool: new Set(table.rows.map((row) => courseNameKey(row.name))),
      existingKeys: new Set([courseNameKey("四史教育")]),
    },
  );
  assert.equal(merged.unverifiedCount, 1);
  assert.deepEqual(
    merged.candidates.map((row) => row.name),
    ["形势与政策"],
  );
  assert.equal(merged.candidates[0]?.courseNo, "15000001");

  const withHistory = mergeCatalogWithAI(table, [{ name: "四史教育" }], {
    namePool: new Set(table.rows.map((row) => courseNameKey(row.name))),
    existingKeys: new Set([courseNameKey("四史教育")]),
  });
  assert.equal(withHistory.candidates[0]?.exists, true);
});

test("上传教学计划表时按 AI 结果生成可编辑预览，并标注已存在分类", async () => {
  const admin = await prisma.user.findFirstOrThrow({
    where: { role: Role.ADMIN, schoolId: { not: null } },
    select: { id: true, schoolId: true },
  });
  const suffix = randomUUID().slice(0, 8);
  const existingName = `识别已存在课程-${suffix}`;
  await prisma.questionCourseCategory.create({
    data: {
      schoolId: admin.schoolId!,
      name: existingName,
      normalizedName: courseNameKey(existingName),
    },
  });

  const buffer = buildXlsFixture({
    name: "教学计划运行表",
    headers: TEACHING_PLAN_HEADERS,
    rows: [...planRows(), ["", "", "15000009", existingName, "32", "2", "1"]],
  });
  const file = uploadBufferAsFile(
    "教学计划运行表.xls",
    "application/vnd.ms-excel",
    buffer,
  ) as unknown as File;

  try {
    const preview = await previewCourseCategoryImport(admin.id, file, {
      provider: fakeProvider([
        { name: "形势与政策", courseNo: "15000001", credits: "2", term: "各" },
        { name: "体育（1）", courseNo: "15000002" },
        { name: existingName },
        { name: "模型臆造课程" },
      ]),
    });

    assert.equal(preview.extractor, "AI");
    assert.equal(preview.format, "xls");
    assert.deepEqual(
      preview.candidates.map((row) => row.name),
      ["形势与政策", "体育（1）", existingName],
    );
    assert.equal(
      preview.candidates.find((row) => row.name === existingName)?.exists,
      true,
    );
    assert.equal(preview.summary.existing, 1);
    assert.equal(
      preview.warnings.some((warning) =>
        warning.includes("未在表格中原样出现"),
      ),
      true,
    );
  } finally {
    await prisma.questionCourseCategory.deleteMany({
      where: { schoolId: admin.schoolId!, name: existingName },
    });
  }
});

test("一键添加课程分类在事务内去重、跳过已存在并写审计", async () => {
  const admin = await prisma.user.findFirstOrThrow({
    where: { role: Role.ADMIN, schoolId: { not: null } },
    select: { id: true },
  });
  const suffix = randomUUID().slice(0, 8);
  const first = `批量新增课程-${suffix}-A`;
  const second = `批量新增课程-${suffix}-B`;
  const context = { ipAddress: null, userAgent: null };
  const createdIds: string[] = [];

  try {
    const result = await createQuestionCourseCategoriesInBulk(
      admin.id,
      {
        names: [first, ` ${first} `, "", second],
        sourceFileName: `教学计划-${suffix}.xls`,
        extractor: "AI",
      },
      context,
    );
    assert.equal(result.created.length, 2);
    assert.deepEqual(
      result.skipped.map((item) => item.reason),
      ["DUPLICATE"],
    );
    createdIds.push(...result.created.map((item) => item.id));

    const audits = await prisma.auditLog.findMany({
      where: {
        action: AuditAction.QUESTION_COURSE_CATEGORY_CREATED,
        targetId: { in: createdIds },
      },
      select: { summary: true, afterData: true },
    });
    assert.equal(audits.length, 2);
    assert.equal(
      audits.every((log) => log.summary.includes(`教学计划-${suffix}.xls`)),
      true,
    );
    assert.equal(
      audits.every(
        (log) =>
          (log.afterData as { extractor?: string } | null)?.extractor === "AI",
      ),
      true,
    );

    const again = await createQuestionCourseCategoriesInBulk(
      admin.id,
      { names: [first, second] },
      context,
    );
    assert.equal(again.created.length, 0);
    assert.deepEqual(
      again.skipped.map((item) => item.reason),
      ["EXISTS", "EXISTS"],
    );
  } finally {
    await prisma.auditLog.deleteMany({
      where: { targetId: { in: createdIds } },
    });
    await prisma.questionCourseCategory.deleteMany({
      where: { name: { in: [first, second] } },
    });
  }
});
