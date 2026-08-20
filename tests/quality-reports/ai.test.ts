import assert from "node:assert/strict";
import test from "node:test";

import { GradeValueStatus, QualityReportSourceType } from "@prisma/client";

import type { AIProvider } from "@/services/ai/provider";
import { OpenAICompatibleProvider } from "@/services/ai/openai-compatible";
import {
  buildDeterministicNarrative,
  calculateQualityReportStatistics,
} from "@/services/quality-reports/calculation";
import { executeQualityReportNarrative } from "@/services/quality-reports/ai-execution";
import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";
import type { QualityReportAIInput } from "@/services/quality-reports/schemas";

const source: QualityReportSourceSnapshot = {
  course: {
    id: "cm0000000000000000000000",
    name: "Python",
    courseNo: "PY",
    term: "2026-1",
    teacherName: "不会发送给 AI",
    courseNature: "专业(必)",
    credits: 4,
    majorClass: "一班",
    college: "学院",
    major: "专业",
  },
  classroom: { id: null, name: "一班" },
  sourceType: QualityReportSourceType.PLATFORM,
  components: [{ code: "final", name: "期末考试", weight: 1 }],
  students: [
    {
      studentId: "cm0000000000000000000001",
      studentNo: "20260001",
      displayName: "不会发送给 AI",
      status: GradeValueStatus.SCORED,
      componentScores: { final: 80 },
      totalScore: 80,
    },
  ],
  outcomes: [],
  attendance: { sessionCount: 0, presentRate: null },
  survey: null,
  sourceReference: {},
};
const statistics = calculateQualityReportStatistics(source);
const baseline = buildDeterministicNarrative(source, statistics);

function provider(responder: (input: unknown) => unknown): AIProvider {
  return {
    name: "test-provider",
    model: "test-model",
    analyzeStudentPerformance: async () => ({}),
    parseSyllabus: async () => ({}),
    writeQualityReportNarrative: async (input) => responder(input),
  };
}

test("报告 AI 只接收去标识化聚合并接受严格结构文字", async () => {
  let serializedInput = "";
  const result = await executeQualityReportNarrative(
    provider((input) => {
      serializedInput = JSON.stringify(input);
      return {
        gradeAnalysis:
          "成绩分析引用了班级总体成绩、分数段分布和考核项目均值，并据此识别相对薄弱环节。现有结果只反映本次冻结数据快照，不直接推断教学因果；后续应结合试题覆盖、评分标准和学习过程证据进一步复核，并使用同口径数据验证变化，同时关注有效样本数、特殊状态人数及不同分数段的结构变化。",
        outcomeAnalysis: "当前没有目标达成数据，因此不作达成结论。",
        outcomeDetails: [],
        studentEvaluation: "学生评价",
        courseSummary:
          "课程总结综合成绩总体水平、分数段结构与分项考核表现，明确区分现有证据与缺失数据。当前未提供课程目标定量结果、问卷和出勤汇总，因此结论限于成绩统计，不对学生表现或教学效果作超出数据范围的推断，并保留下一轮同口径复核空间。",
        improvementMeasures:
          "第一，针对最低分考核环节归类典型错误并安排讲评，以同类题正确率和低分段人数验证；第二，复核考核内容与课程目标的一致性，以同口径达成度和有效样本数验证；第三，补充学生反馈和出勤证据，比较问卷响应率、学生自评与客观成绩的差异。所有措施均记录实施时间、覆盖学生范围、责任人和下一轮复核指标。",
      };
    }),
    source,
    statistics,
    baseline,
  );
  assert.equal(result.fallbackUsed, false);
  assert.match(result.output.improvementMeasures, /同口径达成度/u);
  assert.doesNotMatch(serializedInput, /20260001|不会发送给 AI/u);
});

test("报告 AI 连续三次输出无效时保留确定性基础报告", async () => {
  let attempts = 0;
  const result = await executeQualityReportNarrative(
    provider(() => {
      attempts += 1;
      return { invalid: true };
    }),
    source,
    statistics,
    baseline,
  );
  assert.equal(attempts, 3);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.errorCode, "AI_NARRATIVE_INVALID");
  assert.deepEqual(result.output, baseline);
});

test(
  "教学质量报告 Provider 默认预留 8192 个输出 token",
  { concurrency: false },
  async () => {
    const originalFetch = globalThis.fetch;
    const requestBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = async (_input, init) => {
      requestBodies.push(
        JSON.parse(String(init?.body)) as Record<string, unknown>,
      );
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  gradeAnalysis: "成绩分析",
                  outcomeAnalysis: "目标分析",
                  outcomeDetails: [],
                  studentEvaluation: "学生评价",
                  courseSummary: "课程总结",
                  improvementMeasures: "持续改进",
                }),
              },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    try {
      const aiInput: QualityReportAIInput = {
        course: { name: "Python", courseNo: "PY", term: "2026-1" },
        statistics: {
          participantCount: 1,
          mean: 80,
          passRate: 1,
          excellentRate: 0,
          distribution: [],
          componentMeans: [],
          outcomes: [],
          attendance: { sessionCount: 0, presentRate: null },
        },
        survey: null,
        dataAvailability: {
          publishedSyllabus: true,
          outcomeAttainmentCount: 0,
          outcomeCount: 0,
          surveyAvailable: false,
          attendanceAvailable: false,
        },
        deterministicBaseline: baseline,
      };
      const openAIProvider = new OpenAICompatibleProvider({
        apiKey: "test",
        baseUrl: "https://example.invalid/v1",
        model: "test",
      });
      await openAIProvider.writeQualityReportNarrative!(aiInput, {
        signal: new AbortController().signal,
      });
      assert.equal(requestBodies[0]?.max_tokens, 8_192);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
