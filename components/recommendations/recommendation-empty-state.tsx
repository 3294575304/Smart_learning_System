import React from "react";

interface Props {
  kind: "none" | "filtered" | "insufficient";
}

const content: Record<Props["kind"], { title: string; description: string }> = {
  none: {
    title: "还没有推荐练习",
    description: "完成一些作业后生成推荐，系统会结合近期答题情况为你挑选练习。",
  },
  filtered: {
    title: "当前筛选条件下没有记录",
    description: "可以切换其他状态，或返回全部推荐查看已有练习。",
  },
  insufficient: {
    title: "暂时无法生成推荐",
    description: "目前没有足够的学习数据或可用题目，请先完成一些作业后再试。",
  },
};

export function RecommendationEmptyState({ kind }: Props) {
  const item = content[kind];
  return (
    <section className="rounded-xl border border-dashed p-8 text-center sm:p-10">
      <h2 className="font-semibold">{item.title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
        {item.description}
      </p>
    </section>
  );
}
