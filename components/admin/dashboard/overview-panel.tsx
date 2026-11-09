import {
  BookOpenCheck,
  BrainCircuit,
  ClipboardCheck,
  GraduationCap,
  School,
  UserCog,
  Users,
} from "lucide-react";

import {
  SectionError,
  SectionLoading,
} from "@/components/admin/dashboard/section-state";
import { StatCard } from "@/components/dashboard/stat-card";
import type { DashboardOverview } from "@/services/admin/dashboard/types";

const capabilityLabels: Record<string, string> = {
  assignment_suggestion: "作业智能组卷",
  quality_report: "教学质量报告",
  question_generation: "批量出题",
  paper_parse: "试卷解析",
  syllabus_parse: "大纲解析",
  graph_enhance: "知识图谱增强",
  question_mapping: "题目知识点映射",
  objective_classify: "课程目标分类",
  student_analysis: "学情分析",
  learning_assistant: "课程答疑",
  teacher_evaluation_intent: "教师评价助手",
  recommend_explain: "课程推荐理由",
  self_reflection: "自我反思",
};

function number(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function rate(count: number, total: number): string {
  return total
    ? new Intl.NumberFormat("zh-CN", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(count / total)
    : "暂无样本";
}

function comparisonHint(overview: DashboardOverview): string {
  const comparison = overview.users.newUserComparison;
  if (comparison.kind === "NEW")
    return `最近 7 天新增 ${comparison.current}，前 7 天为 0`;
  if (comparison.kind === "NO_CHANGE") return "最近 7 天与前 7 天均无新增";
  const direction = comparison.difference >= 0 ? "增长" : "下降";
  return `最近 7 天新增 ${comparison.current}，较前 7 天${direction} ${Math.abs(comparison.percentage ?? 0)}%`;
}

export function OverviewPanel({
  data,
  error,
  loading,
}: {
  data: DashboardOverview | null;
  error: string | null;
  loading: boolean;
}) {
  if (loading && !data) return <SectionLoading label="正在汇总平台核心指标" />;
  if (error && !data) return <SectionError message={error} />;
  if (!data) return null;
  const question = data.ai.questionGeneration;
  const questionMetrics = [
    {
      label: "候选题采纳率",
      value: rate(question.confirmed, question.generated),
      hint: `${number(question.confirmed)} / ${number(question.generated)} 道已生成`,
    },
    {
      label: "首次结构通过率",
      value: rate(
        question.firstValidationPasses,
        question.firstValidationChecks,
      ),
      hint: `${number(question.firstValidationPasses)} / ${number(question.firstValidationChecks)} 次首次生成`,
    },
    {
      label: "每道候选平均返修",
      value: question.generated
        ? `${(question.reviewEdits / question.generated).toFixed(1)} 次`
        : "暂无样本",
      hint: `${number(question.reviewEdits)} 次教师保存修改`,
    },
    {
      label: "批次未完整生成率",
      value: rate(question.incompleteBatches, question.terminalBatches),
      hint: `${number(question.incompleteBatches)} / ${number(question.terminalBatches)} 个终态批次`,
    },
    {
      label: "修改后采纳占比",
      value: rate(question.editedBeforeConfirmation, question.confirmed),
      hint: `${number(question.editedBeforeConfirmation)} / ${number(question.confirmed)} 道已采纳`,
    },
  ];
  return (
    <section aria-labelledby="overview-title">
      <div className="mb-4">
        <h2 className="font-semibold" id="overview-title">
          核心指标
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          截至{" "}
          {new Date(data.generatedAt).toLocaleString("zh-CN", {
            timeZone: data.timeZone,
          })}{" "}
          的数据库汇总。
        </p>
      </div>
      {error ? (
        <p className="mb-3 text-xs text-amber-700">
          刷新失败，当前显示上一次成功数据。
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="用户总数"
          value={number(data.users.total)}
          hint={comparisonHint(data)}
        />
        <StatCard
          icon={UserCog}
          label="教师"
          value={number(data.users.byRole.TEACHER)}
          hint={`启用用户 ${number(data.users.byStatus.ACTIVE)} 人`}
        />
        <StatCard
          icon={GraduationCap}
          label="学生"
          value={number(data.users.byRole.STUDENT)}
          hint={`禁用用户 ${number(data.users.byStatus.INACTIVE)} 人`}
        />
        <StatCard
          icon={School}
          label="有效班级"
          value={number(data.teaching.activeClassroomCount)}
          hint={`全部班级 ${number(data.teaching.classroomTotal)} 个`}
        />
        <StatCard
          icon={BookOpenCheck}
          label="题目"
          value={number(data.teaching.questionTotal)}
          hint="排除已软删除题目"
        />
        <StatCard
          icon={ClipboardCheck}
          label="已发布作业"
          value={number(data.teaching.publishedAssignmentCount)}
          hint={`草稿 ${number(data.teaching.draftAssignmentCount)} · 已结束 ${number(data.teaching.closedAssignmentCount)}`}
        />
        <StatCard
          icon={ClipboardCheck}
          label="有效提交"
          value={number(data.teaching.effectiveSubmissionCount)}
          hint={`已批改 ${number(data.teaching.gradedSubmissionCount)} · 待复核 ${number(data.teaching.pendingReviewSubmissionCount)}`}
        />
        <StatCard
          icon={BrainCircuit}
          label="学情分析"
          value={number(data.learning.generatedAnalysisCount)}
          hint={`推荐记录 ${number(data.learning.generatedRecommendationCount)} 条`}
        />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <p className="bg-muted/60 rounded-lg px-4 py-3 text-sm">
          <span className="text-muted-foreground block text-xs">
            已批改提交平均得分率
          </span>
          <strong className="mt-1 block">
            {data.learning.averageGradedPercentage === null
              ? "暂无数据"
              : `${data.learning.averageGradedPercentage}%`}
          </strong>
        </p>
        <p className="bg-muted/60 rounded-lg px-4 py-3 text-sm">
          <span className="text-muted-foreground block text-xs">
            最近 7 天答题
          </span>
          <strong className="mt-1 block">
            {number(data.learning.answersLast7Days)} 次
          </strong>
        </p>
        <p className="bg-muted/60 rounded-lg px-4 py-3 text-sm">
          <span className="text-muted-foreground block text-xs">
            错误作答记录
          </span>
          <strong className="mt-1 block">
            {number(data.learning.incorrectAnswerCount)} 条
          </strong>
        </p>
        <p className="bg-muted/60 rounded-lg px-4 py-3 text-sm">
          <span className="text-muted-foreground block text-xs">
            AI 终态成功率
          </span>
          <strong className="mt-1 block">
            {data.ai.successRate === null
              ? "暂无可比记录"
              : `${data.ai.successRate}%`}
          </strong>
        </p>
      </div>
      <div className="mt-4">
        <h3 className="mb-2 text-sm font-semibold">近 7 天 AI 出题</h3>
        <p className="text-muted-foreground mb-2 text-xs">
          按本校批次创建日期归组，显示截至当前的审核结果。首次结构通过率按已记录的首次生成统计。
        </p>
        <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {questionMetrics.map(({ label, value, hint }) => (
            <div className="bg-muted/60 rounded-lg px-4 py-3" key={label}>
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="mt-1 text-sm font-semibold">{value}</dd>
              <dd className="text-muted-foreground mt-1 text-xs">{hint}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-4 overflow-x-auto">
        <h3 className="mb-2 text-sm font-semibold">近 7 天外部 AI 调用</h3>
        {data.ai.gateway.length ? (
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr>
                {[
                  "能力",
                  "请求",
                  "上游尝试",
                  "失败",
                  "超额",
                  "本地拒绝",
                  "已知 Token",
                  "用量覆盖",
                  "P95 延迟",
                ].map((heading) => (
                  <th key={heading} scope="col" className="px-2 py-2">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.ai.gateway.map((row) => (
                <tr className="border-t" key={row.capability}>
                  <th scope="row" className="px-2 py-2 font-medium">
                    {capabilityLabels[row.capability] ?? row.capability}
                  </th>
                  <td className="px-2">{number(row.requests)}</td>
                  <td className="px-2">{number(row.attempts)}</td>
                  <td className="px-2">{number(row.failed)}</td>
                  <td className="px-2">{number(row.wouldLimit)}</td>
                  <td className="px-2">{number(row.rejected)}</td>
                  <td className="px-2">
                    {row.measuredAttempts ? number(row.totalTokens) : "未知"}
                  </td>
                  <td className="px-2">
                    {row.measuredAttempts}/{row.attempts}
                  </td>
                  <td className="px-2">
                    {row.p95LatencyMs === null
                      ? "暂无"
                      : `${number(row.p95LatencyMs)} ms`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted-foreground text-sm">
            暂无本校外部 AI 调用记录。
          </p>
        )}
      </div>
    </section>
  );
}
