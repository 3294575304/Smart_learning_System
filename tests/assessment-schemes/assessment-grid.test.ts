import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAssessmentGrid,
  buildDraftMappings,
  findAssessmentGrids,
  joinSoftBreaks,
  mapGridToAssessments,
  textTableBlocks,
} from "@/services/syllabus-parsing/assessment-grid";

const docAssessments = [
  { code: "ASSESS-1", name: "期末笔试", weight: 40 },
  { code: "ASSESS-2", name: "期末机试", weight: 20 },
  { code: "ASSESS-3", name: "课内讨论", weight: 10 },
  { code: "ASSESS-4", name: "平时测试与作业", weight: 10 },
  { code: "ASSESS-5", name: "实验", weight: 20 },
];

// The 2018 C++ syllabus only states assessment weights in 5.1; the objective
// breakdown lives in 5.3 as a score table whose headers carry the weight.
const docText = [
  "5.3 课程目标评定方法",
  "课程目标\t毕业要求指标点\t考核与评价方式及成绩评价比例(%)\t设定总分值Σ\t",
  "\t\t课内讨论(10.0%)\t课后作业(10.0%)\t实验(20.0%)\t期末考试(60.0%)\t\t",
  "课程目标1\t5-1\t5.0\t5.0\t10.0\t30.0\t50.0\t",
  "课程目标2\t5-3\t5.0\t5.0\t10.0\t30.0\t50.0\t",
  "合计\t\t10.0\t10.0\t20.0\t60.0\t100.0\t",
  "六、教学团队",
].join("\n");

test("分值型考核表按列合计换算课程目标占比", () => {
  const grids = findAssessmentGrids([{ pageNumber: 1, text: docText }]);
  assert.equal(grids.length, 1);
  const grid = grids[0]!.grid;
  assert.deepEqual(
    grid.columns.map((column) => column.name),
    ["课内讨论", "课后作业", "实验", "期末考试"],
  );
  assert.deepEqual(
    grid.columns.map((column) => column.total),
    [10, 10, 20, 60],
  );
  assert.deepEqual(
    grid.rows.map((row) => row.values),
    [
      [5, 5, 10, 30],
      [5, 5, 10, 30],
    ],
  );
});

test("期末合并列按权重拆分到笔试与机试", () => {
  const grid = findAssessmentGrids([{ pageNumber: 1, text: docText }])[0]!.grid;
  const objectives = [{ code: "OBJ-1" }, { code: "OBJ-2" }];
  const result = mapGridToAssessments(grid, objectives, docAssessments, 1);
  assert.equal(result.unmatchedColumns.length, 0);
  assert.equal(result.mappings.length, 10);
  for (const assessment of docAssessments) {
    const total = result.mappings
      .filter((mapping) => mapping.assessmentCode === assessment.code)
      .reduce((sum, mapping) => sum + mapping.allocationRate, 0);
    assert.equal(total, 100);
  }
});

test("多识别思政目标时按课程目标序号对齐而非数组下标", () => {
  const grid = findAssessmentGrids([{ pageNumber: 1, text: docText }])[0]!.grid;
  const objectives = [
    { code: "OBJ-1", title: "思政目标" },
    { code: "OBJ-2", title: "课程目标1" },
    { code: "OBJ-3", title: "课程目标2" },
  ];
  const result = mapGridToAssessments(grid, objectives, docAssessments, 1);
  const rate = (objectiveCode: string, assessmentCode: string) =>
    result.mappings.find(
      (mapping) =>
        mapping.objectiveCode === objectiveCode &&
        mapping.assessmentCode === assessmentCode,
    )?.allocationRate;
  // 原表只列出课程目标1、课程目标2，思政目标不得占用第一行分值。
  assert.equal(rate("OBJ-1", "ASSESS-1"), 0);
  assert.equal(rate("OBJ-2", "ASSESS-1"), 50);
  assert.equal(rate("OBJ-3", "ASSESS-1"), 50);
  assert.equal(rate("OBJ-2", "ASSESS-3"), 50);
  assert.ok(
    result.warnings.some((warning) => warning.includes("OBJ-1")),
    "缺少分值的课程目标必须给出告警",
  );
});

test("单元格内换行不拆散表头列名", () => {
  const text = [
    "序号\t课程目标（支撑毕业要求指标点）\t\t评价依据及成绩比例\t成绩比例",
    "（%）\t",
    "\t\t平时表现\t平时作业\t期中",
    "考试\t期末",
    "考试\t\t",
    "1 \t目标一\t\t20\t\t30\t50\t",
    "2 \t目标二\t\t10\t\t20\t30\t",
    "合计\t10\t30\t10\t50\t100\t",
  ].join("\n");
  const grids = findAssessmentGrids([{ pageNumber: 1, text }]);
  assert.equal(grids.length, 1);
  assert.deepEqual(
    grids[0]!.grid.columns.map((column) => column.name),
    ["平时表现", "平时作业", "期中考试", "期末考试"],
  );
  assert.deepEqual(
    grids[0]!.grid.rows.map((row) => row.values),
    [
      [null, 20, null, 30],
      [null, 10, null, 20],
    ],
  );
});

test("毕业要求指标点的数字不被并入考核列", () => {
  const text = [
    "课程目标序号\t课程目标内容\t毕业要求指标点\t评分方式及成绩（分数）\t成绩",
    "比例（%）\t",
    "\t\t\t实验报告\t上机考勤\t半期测试实验\t课程设计\t\t",
    "1\t描述一\t2.1\t33\t15\t6\t12\t66\t",
    "2\t描述二\t4.1\t22\t\t4\t8\t34\t",
    "合计\t\t55\t15\t10\t20\t100\t",
  ].join("\n");
  const grid = findAssessmentGrids([{ pageNumber: 1, text }])[0]!.grid;
  assert.deepEqual(
    grid.columns.map((column) => column.name),
    ["实验报告", "上机考勤", "半期测试实验", "课程设计"],
  );
  assert.deepEqual(grid.rows[0]!.values, [33, 15, 6, 12]);
  assert.deepEqual(grid.rows[1]!.values, [22, null, 4, 8]);
});

test("软换行合并只作用于被截断的表格行", () => {
  assert.equal(
    joinSoftBreaks("普通段落\n表格\t行\t\n普通段落二"),
    "普通段落\n表格\t行\t\n普通段落二",
  );
  assert.equal(
    joinSoftBreaks("表头\t期中\n考试\t\n正文"),
    "表头\t期中考试\t\n正文",
  );
});

test("纯权重表不产生课程目标网格", () => {
  const text = [
    "考核方式\t期末笔试\t期末机试\t平时成绩\t",
    "\t\t\t课内讨论\t平时测试与作业\t实验\t",
    "成绩比例\t40%\t20%\t10%\t10%\t20%\t",
    "5.2 考核内容与成绩评定",
  ].join("\n");
  assert.equal(findAssessmentGrids([{ pageNumber: 1, text }]).length, 0);
  assert.equal(textTableBlocks(text).length, 1);
  assert.equal(buildAssessmentGrid(textTableBlocks(text)[0]!), null);
});

test("缺少目标分解时按目标等分生成草稿", () => {
  const objectives = [{ code: "OBJ-1" }, { code: "OBJ-2" }, { code: "OBJ-3" }];
  const assessments = [{ code: "A1" }, { code: "A2" }];
  const draft = buildDraftMappings(objectives, assessments);
  assert.equal(draft.mappings.length, 6);
  for (const assessment of assessments) {
    const total = draft.mappings
      .filter((mapping) => mapping.assessmentCode === assessment.code)
      .reduce((sum, mapping) => sum + mapping.allocationRate, 0);
    assert.equal(total, 100);
  }
  assert.match(draft.warnings.join(""), /等分生成草稿/u);
});

test("草稿不会因为除不尽产生浮点残差", () => {
  const objectives = Array.from({ length: 7 }, (_, index) => ({
    code: `OBJ-${index + 1}`,
  }));
  const draft = buildDraftMappings(objectives, [{ code: "A1" }]);
  assert.equal(
    draft.mappings.reduce((sum, mapping) => sum + mapping.allocationRate, 0),
    100,
  );
});
