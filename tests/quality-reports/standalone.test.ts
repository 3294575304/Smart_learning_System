import assert from "node:assert/strict";
import test from "node:test";
import {
  previewStandaloneWorkbook,
  standaloneInputSchema,
} from "@/services/quality-reports/standalone";
import { qualityReportSourceSnapshotSchema } from "@/services/quality-reports/schemas";

const valid = {
  courseName: "Python 程序设计",
  term: "2026 秋",
  teacherName: "教师",
  classroomName: "一班",
  grade: {
    components: [{ code: "C1", name: "考试", column: "考试成绩", weight: 1 }],
  },
  outcomes: [
    {
      code: "1",
      title: "目标 1",
      threshold: 0.6,
      allocations: [{ componentCode: "C1", rate: 1 }],
    },
  ],
  survey: {
    responseCount: 8,
    eligibleCount: 10,
    kindColumn: "类型",
    titleColumn: "指标",
    countColumn: "人数",
    meanColumn: "均值",
  },
};

test("独立报告要求总评权重和目标分配各为 100%", () => {
  assert.equal(standaloneInputSchema.safeParse(valid).success, true);
  assert.equal(
    standaloneInputSchema.safeParse({ ...valid, courseName: "其他课程" })
      .success,
    false,
  );
  assert.equal(
    standaloneInputSchema.safeParse({
      ...valid,
      grade: { components: [{ ...valid.grade.components[0], weight: 0.8 }] },
    }).success,
    false,
  );
  assert.equal(
    standaloneInputSchema.safeParse({
      ...valid,
      outcomes: [
        {
          ...valid.outcomes[0],
          allocations: [{ componentCode: "C1", rate: 0.5 }],
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    standaloneInputSchema.safeParse({
      ...valid,
      survey: { ...valid.survey, responseCount: 11 },
    }).success,
    false,
  );
  assert.equal(
    standaloneInputSchema.safeParse({
      ...valid,
      outcomes: [
        {
          ...valid.outcomes[0],
          allocations: [
            { componentCode: "C1", rate: 0.5 },
            { componentCode: "C1", rate: 0.5 },
          ],
        },
      ],
    }).success,
    false,
  );
});

test("独立报告允许教师手写大纲信息，并校验 AI 来源引用", () => {
  const manual = standaloneInputSchema.parse({
    ...valid,
    teachingContent: "第一章 Python 基础\n第二章 函数",
    scoringCriteria: "期末考试占 100%",
  });
  assert.equal(manual.syllabusReference, undefined);
  assert.equal(manual.teachingContent.includes("函数"), true);
  const reference = {
    jobId: "cm12345678901234567890123",
    fileVersionId: "cm12345678901234567890124",
    checksumSha256: "a".repeat(64),
  };
  assert.equal(
    standaloneInputSchema.safeParse({ ...valid, syllabusReference: reference })
      .success,
    true,
  );
  assert.equal(
    standaloneInputSchema.safeParse({
      ...valid,
      syllabusReference: { ...reference, checksumSha256: "bad" },
    }).success,
    false,
  );
  const source = qualityReportSourceSnapshotSchema.shape.syllabus.parse({
    publishedStructureId: null,
    versionNumber: 1,
    courseName: valid.courseName,
    courseCategory: null,
    courseNature: null,
    credits: null,
    teachingCollege: null,
    applicableMajors: null,
    objectiveCount: 1,
    assessmentCount: 1,
    assessments: [{ code: "C1", name: "考试", weight: 1 }],
    teachingContent: ["第一章 Python 基础"],
    assessmentDescriptions: ["期末考试占 100%"],
  });
  assert.equal(source?.publishedStructureId, null);
});

test("文件预览仅返回表头和行数，拒绝重复表头", async () => {
  const file = (value: string) => {
    const data = Buffer.from(value);
    return {
      name: "sample.csv",
      type: "text/csv",
      size: data.length,
      arrayBuffer: async () => Uint8Array.from(data).buffer,
    };
  };
  const preview = await previewStandaloneWorkbook(
    file("学号,考试成绩\n001,90\n002,80\n"),
  );
  assert.deepEqual(preview.headers, ["学号", "考试成绩"]);
  assert.equal(preview.rowCount, 2);
  assert.equal(JSON.stringify(preview).includes("001"), false);
  await assert.rejects(
    () => previewStandaloneWorkbook(file("学号,学号\n001,90\n")),
    /表头不能留空或重复/u,
  );
});
