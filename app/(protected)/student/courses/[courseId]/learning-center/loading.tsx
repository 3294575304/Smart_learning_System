import React from "react";

/**
 * 课程学习中心的加载骨架。
 *
 * 原来复用通用的 StudentPageLoading（"dashboard" 变体是四宫格），
 * 和本页的「页头 + 页签 + 双列行动区 + 整宽漏斗」完全对不上，
 * 加载完成时整页会明显跳一下。这里按真实版式画占位块。
 */
const block = "rounded-md bg-muted";

export default function Loading() {
  return (
    <section
      aria-busy="true"
      aria-label="课程学习中心"
      className="mx-auto max-w-7xl min-w-0 space-y-4"
    >
      <p role="status" className="sr-only">
        正在加载课程学习中心…
      </p>

      <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className={`${block} h-7 w-52 max-w-full`} />
            <div className={`${block} h-5 w-44 max-w-full`} />
          </div>
          <div className="bg-muted h-11 w-28 rounded-lg" />
        </div>

        <div className="bg-muted h-11 w-80 max-w-full rounded-xl" />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="border-line bg-card min-w-0 space-y-3 rounded-xl border p-4 sm:p-5">
            <div className={`${block} h-4 w-24`} />
            <div className={`${block} h-4 w-full`} />
            <div className={`${block} h-4 w-2/3`} />
            <div className="flex flex-wrap gap-2 pt-1">
              <div className={`${block} h-6 w-20`} />
              <div className={`${block} h-6 w-24`} />
              <div className={`${block} h-6 w-20`} />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <div className="bg-muted h-11 w-28 rounded-lg" />
              <div className="bg-muted h-11 w-24 rounded-lg" />
            </div>
          </div>

          <div className="border-line bg-card min-w-0 space-y-3 rounded-xl border p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className={`${block} h-4 w-28`} />
              <div className={`${block} h-5 w-14`} />
            </div>
            {Array.from({ length: 4 }, (_, index) => (
              <div
                className="flex items-center justify-between gap-3"
                key={index}
              >
                <div className={`${block} h-3 w-20`} />
                <div className={`${block} h-3 w-16`} />
              </div>
            ))}
          </div>
        </div>

        <div className="border-line bg-card min-w-0 rounded-xl border p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className={`${block} h-4 w-32`} />
            <div className="bg-muted h-10 w-32 rounded-lg" />
          </div>
          <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="space-y-2" key={index}>
                <div className={`${block} h-3 w-20`} />
                <div className={`${block} h-6 w-24`} />
                <div className={`${block} h-1.5 w-full`} />
                <div className={`${block} h-3 w-10`} />
                <div className={`${block} h-3 w-full`} />
              </div>
            ))}
          </div>
          <div className={`${block} mt-4 h-3 w-72 max-w-full`} />
        </div>
      </div>
    </section>
  );
}
