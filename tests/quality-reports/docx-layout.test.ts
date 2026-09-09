import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { GradeValueStatus, QualityReportSourceType } from "@prisma/client";

import {
  buildDeterministicNarrative,
  calculateQualityReportStatistics,
} from "@/services/quality-reports/calculation";
import { buildQualityReportDocx } from "@/services/quality-reports/docx-writer";
import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";

const exec = promisify(execFile);
const python =
  process.env.QUALITY_REPORT_PYTHON ||
  (process.platform === "win32"
    ? path.join(
        process.env.USERPROFILE ?? "",
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
      )
    : "python");

test("真实 DOCX 保留模板字体与私有字段边界，图表比例和坐标正确", async (t) => {
  try {
    await exec(python, ["-c", "import docx, PIL"], { windowsHide: true });
  } catch {
    t.skip(
      "需要配置 QUALITY_REPORT_PYTHON 并安装 python-docx、Pillow 才能核验真实 DOCX",
    );
    return;
  }
  const source: QualityReportSourceSnapshot = {
    course: {
      id: "test",
      name: "Python",
      courseNo: "PY",
      term: "2026",
      teacherName: "示例教师",
      courseNature: "选修",
      credits: 2,
      majorClass: "示例班",
      college: "示例学院",
      major: "示例专业",
    },
    classroom: { id: null, name: "示例班" },
    sourceType: QualityReportSourceType.UPLOAD,
    components: [{ code: "final", name: "期末考试", weight: 1 }],
    students: [20, 40, 80].map((score, index) => ({
      studentId: null,
      studentNo: `000${index}`,
      displayName: "示例学生",
      status: GradeValueStatus.SCORED,
      componentScores: { final: score },
      totalScore: score,
    })),
    outcomes: ["OBJ-1", "OBJ-2", "OBJ-3"].map((code) => ({
      code,
      title: "知识目标",
      description: "掌握程序设计。",
      threshold: 0.68,
      attainmentIndex: 0.4667,
      participantCount: 3,
      studentScores: [0.2, 0.4, 0.8],
      componentAllocations: [{ componentCode: "final", allocationRate: 1 / 3 }],
    })),
    attendance: { sessionCount: 0, presentRate: null },
    survey: null,
    sourceReference: {},
  };
  const temp = await mkdtemp(path.join(os.tmpdir(), "report-layout-test-"));
  try {
    for (const mode of ["survey", "suppressed"] as const) {
      source.survey = {
        surveyId: "test",
        title: "示例问卷",
        mode: "ANONYMOUS",
        summaryRevisionId: "test",
        summaryRevisionNumber: 1,
        responseCount: 6,
        eligibleCount: 6,
        responseRate: 1,
        minSampleSize: 5,
        isSuppressed: mode === "suppressed",
        overallMean: 4.5,
        outcomes: [{ code: "OBJ-1", title: "知识目标", count: 6, mean: 4.5 }],
        dimensions: [],
        themes: [],
        themeNarrative: "",
        ruleVersion: "test",
      };
      const statistics = calculateQualityReportStatistics(source);
      const narrative = buildDeterministicNarrative(source, statistics);
      // Old teacher-approved prose must also be normalized at the export boundary.
      narrative.outcomeAnalysis =
        "OBJ-1达成度0.47，课程目标OBJ-2、OBJ-3按正式数据展示。";
      const output = path.join(temp, `${mode}.docx`);
      await writeFile(
        output,
        await buildQualityReportDocx(source, statistics, narrative, {
          reviewed: true,
        }),
      );
      const checked = await exec(
        python,
        [
          "tests/quality-reports/check-docx-layout.py",
          output,
          "assets/report-templates/quality-report-2024.docx",
          mode,
        ],
        { windowsHide: true },
      );
      assert.match(checked.stdout, /checks passed/u);
      assert.equal(source.outcomes[0]?.code, "OBJ-1");
      assert.match(narrative.outcomeAnalysis, /OBJ-1/u);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
