import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { extractForwardAssessmentTable } from "@/services/syllabus-parsing/docx-assessment-table";
import { buildAssessmentSchemeFromSyllabus } from "@/services/assessment-schemes/source-extractor";
import { publishableAssessmentSchemeSchema } from "@/services/assessment-schemes/schemas";
import type { SyllabusParseOutput } from "@/services/syllabus-parsing/schemas";
import { GradeSourceType, GradeValueStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { zipSync } from "fflate";
import { calculateStudentOutcome } from "@/services/outcome-attainment/calculation";
import { calculateCourseGrade } from "@/services/gradebook/calculation";
import { extractTextFromPdf } from "@/services/syllabus-parsing/pdf-extractor";
import { extractObjectiveAssessmentMatrix } from "@/services/syllabus-parsing/objective-assessment-matrix";

const sample = process.env.SYLLABUS_FORWARD_SAMPLE_DOCX;
const pdfSample = process.env.SYLLABUS_REVERSE_SAMPLE_PDF;

test("DOCX 网格缺项或合计错误时不生成确定性分解表", () => {
  const cell = (value: string) =>
    `<w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:tc>`;
  const row = (values: string[]) => `<w:tr>${values.map(cell).join("")}</w:tr>`;
  const build = (last: string) =>
    Buffer.from(
      zipSync({
        "word/document.xml": new TextEncoder().encode(
          `<w:document><w:body><w:tbl>${[
            row([
              "课程目标序号",
              "课程目标内容",
              "毕业要求指标点",
              "评分方式及成绩",
              "",
              "成绩比例",
            ]),
            row(["", "", "", "平时成绩", "期末考试", ""]),
            row(["", "", "", "作业50%", "考试50%", ""]),
            row(["", "", "", "作业50%", "考试50%", ""]),
            row(["1", "目标1", "", "50", "", "50"]),
            row(["2", "目标2", "", "", "50", "50"]),
            row(["合计", "", "", "50", "50", last]),
          ].join("")}</w:tbl></w:body></w:document>`,
        ),
      }),
    );
  const valid = extractForwardAssessmentTable(build("100"));
  assert.ok(valid);
  assert.deepEqual(valid.objectiveTotals, [50, 50]);
  assert.equal(extractForwardAssessmentTable(build("90")), null);
});

test("真实 Python PDF 逐列提取逆向矩阵", { skip: !pdfSample }, async () => {
  const source = await extractTextFromPdf(readFileSync(pdfSample!));
  const matrix = extractObjectiveAssessmentMatrix(source.pages, 3, 5);
  assert.ok(matrix);
  assert.deepEqual(
    matrix.values,
    [50, 60, 60, 50, 60, 25, 20, 30, 25, 30, 25, 20, 10, 25, 10],
  );
});

test("真实 DOCX 正向分解表保留九项和四项目标分值", { skip: !sample }, () => {
  const table = extractForwardAssessmentTable(readFileSync(sample!));
  assert.ok(table);
  assert.equal(table.items.length, 9);
  assert.deepEqual(table.objectiveTotals, [24, 30, 28.5, 17.5]);
  assert.deepEqual(
    table.items.slice(-3).map((item) => item.points),
    [10, 20, 20],
  );
  assert.equal(table.totalPoints, 100);
  assert.equal(table.warnings.length, 2); // 原文合计行两列颠倒，必须提示教师。

  const syllabus = {
    objectives: table.objectiveTotals.map((_, index) => ({
      code: `OBJ-${index + 1}`,
      title: `课程目标 ${index + 1}`,
      description: `课程目标 ${index + 1}`,
      sourceRefs: table.sourceRefs,
    })),
    assessments: [],
    objectiveAssessmentMappings: [],
    warnings: [],
    assessmentMethod: "FORWARD_DECOMPOSITION",
    forwardAssessmentTable: table,
  } as unknown as SyllabusParseOutput;
  const draft = buildAssessmentSchemeFromSyllabus(syllabus, []);
  assert.equal(draft.components.length, 9);
  assert.ok(draft.components.every((component) => component.fullScore === 100));
  assert.deepEqual(
    draft.components.map((component) => component.weight),
    table.items.map((item) => item.points),
  );
  assert.deepEqual(
    draft.outcomes.map((outcome) => outcome.attainmentThreshold),
    [60, 60, 60, 60],
  );
  assert.equal(
    publishableAssessmentSchemeSchema.safeParse(draft).success,
    false,
  );
  const confirmed = structuredClone(draft);
  confirmed.thresholdConfirmed = true;
  confirmed.components.forEach((component) => {
    component.sourceType = GradeSourceType.MANUAL;
  });
  assert.equal(
    publishableAssessmentSchemeSchema.safeParse(confirmed).success,
    true,
  );

  const objectiveOne = confirmed.outcomes[0]!;
  const mapped = confirmed.components.flatMap((component) => {
    const allocation =
      component.mappings.find(
        (item) => item.objectiveCode === objectiveOne.code,
      )?.allocationRate ?? 0;
    return allocation > 0
      ? [
          {
            componentId: component.code,
            componentWeight: new Prisma.Decimal(component.weight!),
            allocationRate: new Prisma.Decimal(allocation),
          },
        ]
      : [];
  });
  const scored = calculateStudentOutcome(
    mapped.map((item) => ({
      componentId: item.componentId,
      status: "COMPLETE" as const,
      score: "75",
    })),
    mapped,
    new Prisma.Decimal(60),
  );
  assert.equal(scored.score?.toFixed(4), "75.0000");
  assert.equal(scored.attained, true);
  const total = calculateCourseGrade(
    confirmed.components.map((component, index) => ({
      componentId: component.code,
      code: component.code,
      name: component.name,
      weight: new Prisma.Decimal(component.weight!),
      entries: [
        {
          revisionId: `revision-${index}`,
          gradeItemId: `item-${index}`,
          itemName: component.name,
          itemWeight: new Prisma.Decimal(1),
          maxScore: new Prisma.Decimal(component.fullScore!),
          status: GradeValueStatus.SCORED,
          score: new Prisma.Decimal(index === 0 ? 100 : 0),
        },
      ],
    })),
    null,
  );
  assert.equal(total.calculatedScore?.toFixed(4), "17.5000");
});
