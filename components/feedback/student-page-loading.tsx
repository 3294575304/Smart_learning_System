import React from "react";

export function StudentPageLoading({
  title,
  variant = "list",
}: {
  title: string;
  variant?: "list" | "dashboard" | "answer" | "ledger" | "detail";
}) {
  return (
    <section aria-busy="true" aria-label={title} className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-950 sm:text-2xl">
        {title}
      </h1>
      <p role="status" className="text-sm text-slate-600">
        正在加载，请稍候…
      </p>
      <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
        {variant === "detail" ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="space-y-3 rounded-xl border bg-white p-5">
              <div className="h-5 w-1/3 rounded bg-slate-100" />
              <div className="h-14 rounded bg-slate-100" />
              <div className="h-24 rounded bg-slate-100" />
              <div className="h-14 rounded bg-slate-100" />
            </div>
            <div className="space-y-3 rounded-xl border bg-white p-5">
              <div className="h-5 w-1/2 rounded bg-slate-100" />
              <div className="h-20 rounded bg-slate-100" />
              <div className="h-11 w-2/3 rounded bg-slate-100" />
            </div>
          </div>
        ) : (
          <>
            <div className="h-11 rounded-lg bg-slate-100" />
            {variant === "dashboard" && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="h-24 rounded-xl bg-slate-100" />
                ))}
              </div>
            )}
            {variant === "ledger" ? (
              <div className="overflow-hidden rounded-xl border bg-white">
                <div className="h-8 border-b bg-slate-50" />
                {Array.from({ length: 5 }, (_, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-4 border-b px-4 py-4 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-2/5 rounded bg-slate-100" />
                      <div className="h-3 w-3/5 rounded bg-slate-100" />
                    </div>
                    <div className="h-9 w-24 rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : variant === "answer" ? (
              <div className="space-y-4 rounded-xl border bg-white p-5">
                <div className="h-6 w-2/3 rounded bg-slate-100" />
                <div className="h-24 rounded bg-slate-100" />
                <div className="h-52 rounded bg-slate-100" />
              </div>
            ) : (
              <div
                className={`grid gap-4 ${variant === "dashboard" ? "lg:grid-cols-2" : "md:grid-cols-2"}`}
              >
                {Array.from(
                  { length: variant === "list" ? 4 : 2 },
                  (_, index) => (
                    <div
                      key={index}
                      className="h-36 rounded-xl border bg-white"
                    />
                  ),
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
