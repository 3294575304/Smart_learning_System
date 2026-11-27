import {
  knowledgeStateColor,
  knowledgeStateDot,
} from "@/components/ui/knowledge-state";
import {
  STUDENT_KNOWLEDGE_STATES,
  type KnowledgeStatus,
} from "@/services/learner-profiles/knowledge-status";

const ORDER: KnowledgeStatus[] = [
  "MASTERED",
  "DEVELOPING",
  "NEEDS_SUPPORT",
  "INSUFFICIENT",
  "NO_EVIDENCE",
];

/**
 * 知识状态分布条。
 *
 * 从章节列表面板里抽出来的原因：切「按目标」时章节列表会被替换，
 * 分布条如果跟着消失，页面高度会突变、也会让人以为数据没加载。
 * 这里只依赖状态计数，与聚合维度无关。
 *
 * 条内直接标百分比，避免 8px 纯色条只能靠颜色传达比例。
 */
export function KnowledgeDistribution({
  chapters,
}: {
  chapters: Array<{ concepts: Array<{ status: KnowledgeStatus }> }>;
}) {
  const counts: Record<KnowledgeStatus, number> = {
    MASTERED: 0,
    DEVELOPING: 0,
    NEEDS_SUPPORT: 0,
    INSUFFICIENT: 0,
    NO_EVIDENCE: 0,
  };
  for (const chapter of chapters)
    for (const concept of chapter.concepts) counts[concept.status] += 1;
  const total = ORDER.reduce((sum, status) => sum + counts[status], 0);
  const visible = ORDER.filter((status) => counts[status] > 0);
  if (!total || !visible.length) return null;

  return (
    <div className="bg-muted/65 rounded-xl px-3 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-ink-soft text-[11px]">掌握状态分布</p>
        <p className="text-ink-soft text-[11px] tabular-nums">
          按知识点数量占比 · 共 {total} 个
        </p>
      </div>
      {/* 25/50/75 刻度：只靠色块长度读比例，误差肉眼很难判断，刻度给一个参照。 */}
      <div className="relative mt-1.5 flex h-2.5 overflow-hidden rounded-full">
        {visible.map((status) => {
          const share = (counts[status] / total) * 100;
          return (
            <span
              aria-hidden="true"
              className={`flex items-center justify-center ${knowledgeStateColor[status]}`}
              key={status}
              style={{ flexGrow: counts[status], flexBasis: 0 }}
              title={`${STUDENT_KNOWLEDGE_STATES[status].label} ${counts[status]} 个 · ${Math.round(share)}%`}
            >
              {share >= 15 ? (
                <span className="text-[10px] leading-none font-medium text-white tabular-nums">
                  {Math.round(share)}%
                </span>
              ) : null}
            </span>
          );
        })}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          {[25, 50, 75].map((tick) => (
            <span
              className="absolute top-0 h-full w-px bg-white/55"
              key={tick}
              style={{ left: `${tick}%` }}
            />
          ))}
        </span>
      </div>
      <ul
        aria-label="知识状态分布"
        className="text-ink-body mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs"
      >
        {visible.map((status) => (
          <li className="flex items-center gap-1.5" key={status}>
            <span
              aria-hidden="true"
              className={`size-2.5 shrink-0 ${knowledgeStateDot[status]}`}
            />
            {STUDENT_KNOWLEDGE_STATES[status].label}
            <strong className="font-semibold tabular-nums">
              {counts[status]}
            </strong>
            <span className="text-ink-soft tabular-nums">
              {Math.round((counts[status] / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
