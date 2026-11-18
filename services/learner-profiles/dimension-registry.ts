import type { LearnerProfileEvidenceState } from "@prisma/client";

/**
 * 画像维度注册表。
 *
 * 新增一个维度只需要两步：
 *   1. 在 `dimensions.ts` 里写计算函数并在快照组装时写入该维度 JSON；
 *   2. 在下面 `DIMENSION_REGISTRY` 里加一条（描述怎么把 JSON 变成一张卡）。
 * UI 层按注册表遍历渲染，不再有硬编码的五张卡。
 *
 * 注册表刻意只产出纯数据：它属于 services 层，不引入 React / Link。
 * 需要跳转的卡片用 `action` 声明意图，由 UI 层决定渲染成什么链接。
 */

export type DimensionKey =
  "attendance" | "objectiveMastery" | "activity" | "reflection" | "programming";

export interface DimensionCardData {
  label: string;
  headline: string;
  unit: string;
  detail: string;
  state?: LearnerProfileEvidenceState;
  tone?: "default" | "subjective";
  /** UI 层据此渲染跳转；`reflection` 指向自主练习的自我反思面板。 */
  action?: "reflection";
  /** 跳转文案（由维度自身的数据决定，例如「写一条」还是「查看或修改」）。 */
  actionLabel?: string;
}

export interface DimensionDefinition {
  key: DimensionKey;
  build: (value: unknown, studentView: boolean) => DimensionCardData;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function count(value: unknown): number {
  return number(value) ?? 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function evidenceState(
  value: unknown,
): LearnerProfileEvidenceState | undefined {
  return typeof value === "string"
    ? (value as LearnerProfileEvidenceState)
    : undefined;
}

export const DIMENSION_REGISTRY: readonly DimensionDefinition[] = [
  {
    key: "attendance",
    build: (raw, studentView) => {
      const value = asObject(raw);
      const rate = number(value.rate);
      return {
        label: studentView ? "我的出勤" : "出勤",
        headline: rate === null ? "—" : `${rate}%`,
        unit: rate === null ? "" : "折算率",
        detail: `${count(value.evidenceCount)} 次已关闭考勤 · 仅反映参与情况`,
        state: evidenceState(value.evidenceState),
      };
    },
  },
  {
    key: "objectiveMastery",
    build: (raw, studentView) => {
      const value = asObject(raw);
      const average = number(value.conclusiveAverageMastery);
      return {
        label: studentView ? "我的知识掌握度" : "客观掌握度",
        headline: average === null ? "—" : `${average}%`,
        unit: "稳定均分",
        detail: `${count(value.conclusiveConceptCount)}/${count(value.conceptCount)} 个知识点证据充足 · 未评估不计 0 分`,
        state: evidenceState(value.evidenceState),
      };
    },
  },
  {
    key: "activity",
    build: (raw) => {
      const value = asObject(raw);
      const windowDays = count(value.windowDays) || 14;
      return {
        label: "学习活跃度",
        headline: `${count(value.activeDays)} 天`,
        unit: `近 ${windowDays} 天`,
        detail:
          text(value.conclusion) ?? `近 ${windowDays} 天没有评分类学习事件`,
        state: evidenceState(value.evidenceState),
      };
    },
  },
  {
    key: "reflection",
    build: (raw, studentView) => {
      const value = asObject(raw);
      const confirmed = count(value.confirmedCount);
      return {
        label: "自我反思",
        headline: `${confirmed} 条`,
        unit: "学生自述",
        detail:
          text(value.conclusion) ??
          (studentView
            ? "还没有已确认的自述，可在「自我反思」里写一条。"
            : "学生尚未提交并确认自述。"),
        state: evidenceState(value.evidenceState),
        tone: "subjective",
        action: "reflection",
        actionLabel: confirmed > 0 ? "查看或修改自述" : "写一条学习自述",
      };
    },
  },
  {
    key: "programming",
    build: (raw) => {
      const value = asObject(raw);
      const passRate = number(value.passRate);
      return {
        label: "编程练习",
        headline: passRate === null ? "—" : `${passRate}%`,
        unit: "最近判题通过率",
        detail:
          text(value.conclusion) ??
          "本课程还没有正式判题记录（不计公开运行）。",
        state: evidenceState(value.evidenceState),
      };
    },
  },
] as const;
