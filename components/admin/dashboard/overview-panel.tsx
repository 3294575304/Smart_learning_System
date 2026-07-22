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

function number(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
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
          的数据库实时汇总。
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
    </section>
  );
}
