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
          "本班总评平均分为80分，学生整体成绩较好。后续教学可结合学生的具体作答情况安排讲评，将基础练习与综合任务衔接，帮助学生进一步巩固课程知识。",
        outcomeAnalysis: "当前没有目标达成数据，因此不作达成结论。",
        outcomeDetails: [],
        studentEvaluation: "学生评价",
        courseSummary:
          "本班学生总评成绩整体较好。后续教学应在巩固课程基础知识的同时，结合具体作答情况安排综合任务与分层辅导，使学生能够及时发现学习中的问题，并通过订正和练习逐步提高独立完成任务的能力。",
        improvementMeasures:
          "1. 结合具体作答情况整理典型错误，安排集中讲评，并让学生独立完成订正。2. 围绕课程学习要求设计递进练习，为基础不同的学生提供相应的练习材料。3. 增加答疑与反馈机会，帮助学生解决独立练习时遇到的问题。",
      };
    }),
    source,
    statistics,
    baseline,
  );
  assert.equal(result.fallbackUsed, false);
  assert.match(result.output.improvementMeasures, /递进练习/u);
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
      const messages = JSON.stringify(requestBodies[0]?.messages);
      assert.match(messages, /weightedAverage/u);
      assert.match(messages, /不得编造历年对比/u);
      assert.match(messages, /displayName/u);
      assert.match(messages, /40-220字/u);
      assert.match(messages, /学生普遍认为课程的基本概念/u);
      assert.match(messages, /范文仅用于文风参照/u);
      assert.match(messages, /主题标签和提及次数不能证明褒贬/u);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

test("机械化正文触发重写，持续失败时返回不含套话的基础报告", async () => {
  let attempts = 0;
  const emptySource = { ...source, students: [] };
  const emptyStatistics = calculateQualityReportStatistics(emptySource);
  const emptyBaseline = buildDeterministicNarrative(
    emptySource,
    emptyStatistics,
  );
  const result = await executeQualityReportNarrative(
    provider((raw) => {
      attempts += 1;
      return {
        ...(raw as QualityReportAIInput).deterministicBaseline,
        gradeAnalysis:
          "本次纳入1名有效学生，平均分80分。成绩分布与各考核环节权重、均值已由表格展示，此处不逐项重复。后续以同口径统计验证改进。",
      };
    }),
    emptySource,
    emptyStatistics,
    emptyBaseline,
  );
  assert.equal(attempts, 3);
  assert.equal(result.fallbackUsed, true);
  assert.doesNotMatch(
    JSON.stringify(result.output),
    /本次纳入|同口径|此处不逐项重复/u,
  );
});

test("模型收到文风修复原因后可成功重写，无需凑满旧版字数", async () => {
  const emptySource = { ...source, students: [] };
  const stats = calculateQualityReportStatistics(emptySource);
  const draft = buildDeterministicNarrative(emptySource, stats);
  const repairMessages: Array<string | undefined> = [];
  const repairingProvider: AIProvider = {
    ...provider(() => ({})),
    writeQualityReportNarrative: async (input, options) => {
      repairMessages.push(options.validationError);
      return {
        ...input.deterministicBaseline,
        gradeAnalysis: options.validationError
          ? "成绩分析待补充。"
          : "本次纳入0名有效学生。",
      };
    },
  };
  const result = await executeQualityReportNarrative(
    repairingProvider,
    emptySource,
    stats,
    draft,
  );
  assert.equal(repairMessages.length, 2);
  assert.match(repairMessages[1] ?? "", /自然总结/u);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.output.gradeAnalysis, "成绩分析待补充。");
});

test("小样本问卷不发送细分数据，也不接受模型编造的学生评价", async () => {
  const suppressed: QualityReportSourceSnapshot = {
    ...source,
    students: [],
    survey: {
      surveyId: "cm0000000000000000000002",
      title: "结课问卷",
      mode: "ANONYMOUS",
      summaryRevisionId: "cm0000000000000000000003",
      summaryRevisionNumber: 1,
      responseCount: 2,
      eligibleCount: 10,
      responseRate: 0.2,
      minSampleSize: 5,
      isSuppressed: true,
      overallMean: 5,
      outcomes: [],
      dimensions: [{ code: "CONTENT", title: "教学内容", count: 2, mean: 5 }],
      themes: [{ key: "DETAIL", label: "不应发送的主题", count: 1 }],
      themeNarrative: "不应发送的原始概括",
      ruleVersion: "test",
    },
  };
  const stats = calculateQualityReportStatistics(suppressed);
  const draft = buildDeterministicNarrative(suppressed, stats);
  let inputText = "";
  const result = await executeQualityReportNarrative(
    provider((raw) => {
      const input = raw as QualityReportAIInput;
      inputText = JSON.stringify(input);
      return {
        ...input.deterministicBaseline,
        studentEvaluation: "学生普遍认为教学方法有效，课程目标全部达成。",
      };
    }),
    suppressed,
    stats,
    draft,
  );
  assert.equal(result.fallbackUsed, false);
  assert.doesNotMatch(inputText, /不应发送|教学内容/u);
  assert.equal(
    result.output.studentEvaluation,
    "问卷反馈较少，暂不作总体评价。",
  );
});

test("AI 接收展示名称，回传内部编号仅保留在关联字段中", async () => {
  const noScores: QualityReportSourceSnapshot = {
    ...source,
    students: [],
    outcomes: [
      {
        code: "OBJ-2",
        title: "能力目标",
        threshold: null,
        attainmentIndex: null,
        participantCount: 0,
        studentScores: [],
      },
    ],
  };
  const stats = calculateQualityReportStatistics(noScores);
  const draft = buildDeterministicNarrative(noScores, stats);
  let displayName: string | undefined;
  const result = await executeQualityReportNarrative(
    provider((raw) => {
      const input = raw as QualityReportAIInput;
      displayName = input.statistics.outcomes[0]?.displayName;
      return {
        ...input.deterministicBaseline,
        outcomeAnalysis: "OBJ-2暂无完整证据。",
        outcomeDetails: [
          { code: "OBJ-2", analysis: "课程目标OBJ-2暂无定量证据。" },
        ],
      };
    }),
    noScores,
    stats,
    draft,
  );
  assert.equal(displayName, "课程目标1");
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.output.outcomeAnalysis, "课程目标1暂无完整证据。");
  assert.deepEqual(result.output.outcomeDetails, [
    { code: "OBJ-2", analysis: "课程目标1暂无定量证据。" },
  ]);
});

test("AI 成绩分析超出版面预算时重试后降级，不截断教师或模型正文", async () => {
  let attempts = 0;
  const result = await executeQualityReportNarrative(
    provider((raw) => {
      attempts += 1;
      return {
        ...(raw as QualityReportAIInput).deterministicBaseline,
        gradeAnalysis: "成绩证据".repeat(56),
      };
    }),
    source,
    statistics,
    baseline,
  );
  assert.equal(attempts, 3);
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(result.output, baseline);
});
