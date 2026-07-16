import type { DistributionBucket } from "@/services/assignment-results/types";

interface ScoreDistributionProps {
  buckets: DistributionBucket[];
}

export function ScoreDistribution({ buckets }: ScoreDistributionProps) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const maximum = Math.max(1, ...buckets.map((bucket) => bucket.count));

  return (
    <section className="bg-card rounded-xl border p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-semibold">学生成绩分布</h2>
        <span className="text-muted-foreground text-xs">
          已完成批改 {total} 人
        </span>
      </div>
      {total === 0 ? (
        <div className="text-muted-foreground mt-4 rounded-lg border border-dashed p-8 text-center text-sm">
          暂无最终成绩，完成批改后将生成成绩分布。
        </div>
      ) : (
        <figure className="mt-5 space-y-4" aria-label="学生成绩分布柱状图">
          {buckets.map((bucket) => {
            const width = Math.max(4, (bucket.count / maximum) * 100);
            return (
              <div
                className="grid grid-cols-[4rem_1fr_2rem] items-center gap-3"
                key={bucket.key}
              >
                <span className="text-muted-foreground text-sm">
                  {bucket.label}
                </span>
                <div className="bg-muted h-7 overflow-hidden rounded-md">
                  <div
                    className="bg-primary flex h-full items-center justify-end rounded-md px-2 text-xs text-white transition-[width]"
                    style={{ width: `${width}%` }}
                  >
                    {bucket.count > 0 ? bucket.count : null}
                  </div>
                </div>
                <span className="text-right text-sm">{bucket.count}</span>
              </div>
            );
          })}
          <figcaption className="text-muted-foreground text-xs">
            按每名学生最新一次已完成批改的提交百分比分组。
          </figcaption>
        </figure>
      )}
    </section>
  );
}
