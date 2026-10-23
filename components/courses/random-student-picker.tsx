"use client";

import { useState } from "react";

interface Candidate {
  id: string;
  name: string;
  studentNo: string;
}

export function RandomStudentPicker({ students }: { students: Candidate[] }) {
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const pickedSet = new Set(pickedIds);
  const remaining = students.filter((student) => !pickedSet.has(student.id));
  const selected = students.find(
    (student) => student.id === pickedIds[pickedIds.length - 1],
  );

  function draw() {
    const pool = remaining.length ? remaining : students;
    if (pool.length === 0) return;
    const index = Math.floor(Math.random() * pool.length);
    const chosenId = pool[index].id;
    setPickedIds((ids) =>
      remaining.length === 0 ? [chosenId] : [...ids, chosenId],
    );
  }

  return (
    <div className="rounded-xl border bg-white p-6 sm:p-8">
      <p className="text-sm text-slate-600">
        共 {students.length} 名在读学生 · 本轮还可抽取 {remaining.length} 人
      </p>
      <div
        aria-live="polite"
        className="mt-5 flex min-h-36 flex-col items-center justify-center rounded-xl border border-sky-200 bg-sky-50 p-6 text-center"
      >
        {selected ? (
          <>
            <p className="text-xs text-sky-700">本次抽中</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {selected.name}
            </p>
            {selected.studentNo && (
              <p className="mt-1 text-sm text-slate-600">
                学号 {selected.studentNo}
              </p>
            )}
          </>
        ) : (
          <p className="text-slate-600">点击下方按钮，从当前班级随机选人。</p>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={draw}
          disabled={students.length === 0}
          className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {remaining.length === 0 ? "开始新一轮" : "随机选人"}
        </button>
        <button
          type="button"
          onClick={() => setPickedIds([])}
          className="rounded-lg border px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          重置本轮
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        同一轮内不重复抽取；全部抽完后可开始新一轮。
      </p>
      <section
        aria-labelledby="picker-history-title"
        className="mt-8 border-t pt-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="picker-history-title"
            className="font-semibold text-slate-900"
          >
            本轮选人记录
          </h2>
          <span className="text-sm text-slate-500">
            已选 {pickedIds.length} 人
          </span>
        </div>
        {pickedIds.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">本轮尚未选人。</p>
        ) : (
          <ol className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {pickedIds.map((id, index) => {
              const student = students.find((item) => item.id === id);
              if (!student) return null;
              return (
                <li
                  key={id}
                  className="flex items-center gap-3 rounded-lg border border-sky-100 bg-sky-50/60 px-4 py-3 text-sm"
                >
                  <span className="w-7 shrink-0 text-slate-500">
                    {index + 1}.
                  </span>
                  <span className="font-medium text-slate-900">
                    {student.name}
                  </span>
                  {student.studentNo && (
                    <span className="text-slate-500">
                      学号 {student.studentNo}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
