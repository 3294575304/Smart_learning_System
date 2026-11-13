"use client";

import { useEffect, useRef, useState } from "react";

interface Candidate {
  id: string;
  name: string;
  studentNo: string;
}

export function RandomStudentPicker({ students }: { students: Candidate[] }) {
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [rollingStudent, setRollingStudent] = useState<Candidate | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawing = useRef(false);
  const isDrawing = rollingStudent !== null;
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const pickedSet = new Set(pickedIds);
  const remaining = students.filter((student) => !pickedSet.has(student.id));
  const selected = students.find(
    (student) => student.id === pickedIds[pickedIds.length - 1],
  );

  function draw() {
    if (drawing.current) return;
    const pool = remaining.length ? remaining : students;
    if (pool.length === 0) return;
    drawing.current = true;
    const index = Math.floor(Math.random() * pool.length);
    const chosenId = pool[index].id;
    // 只抽取一次最终结果；跳动姓名只是展示，不提前消耗本轮名额。
    const finish = () => {
      timer.current = null;
      drawing.current = false;
      setPickedIds((ids) =>
        remaining.length === 0 ? [chosenId] : [...ids, chosenId],
      );
      setRollingStudent(null);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRollingStudent(pool[index]);
      timer.current = setTimeout(finish, 300);
      return;
    }
    let frame = 0;
    let displayIndex = Math.floor(Math.random() * pool.length);
    const roll = () => {
      if (frame === 24) {
        finish();
        return;
      }
      if (pool.length > 1)
        displayIndex =
          (displayIndex + 1 + Math.floor(Math.random() * (pool.length - 1))) %
          pool.length;
      setRollingStudent(pool[displayIndex]);
      frame++;
      timer.current = setTimeout(roll, 45 + Math.pow(frame / 24, 3) * 200);
    };
    roll();
  }

  const displayedStudent = rollingStudent ?? selected;

  return (
    <div className="rounded-xl border bg-white p-6 sm:p-8">
      <p className="text-sm text-slate-600">
        共 {students.length} 名在读学生 · 本轮还可抽取 {remaining.length} 人
      </p>
      <div
        aria-live={isDrawing ? "off" : "polite"}
        aria-busy={isDrawing}
        className={`mt-5 flex min-h-36 flex-col items-center justify-center rounded-xl border p-6 text-center transition-colors ${isDrawing ? "border-sky-300 bg-gradient-to-br from-sky-50 via-cyan-50 to-indigo-50" : "border-sky-200 bg-sky-50"}`}
      >
        {displayedStudent ? (
          <>
            <p className="text-xs text-sky-700">
              {isDrawing ? "正在抽取…" : "本次抽中"}
            </p>
            <p
              className={`mt-2 text-3xl font-semibold ${isDrawing ? "text-sky-700 motion-safe:animate-pulse" : "text-slate-900"}`}
            >
              {displayedStudent.name}
            </p>
            {displayedStudent.studentNo && (
              <p className="mt-1 text-sm text-slate-600">
                学号 {displayedStudent.studentNo}
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
          disabled={students.length === 0 || isDrawing}
          className="rounded-lg bg-sky-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
        >
          {isDrawing
            ? "抽取中…"
            : remaining.length === 0
              ? "开始新一轮"
              : "随机选人"}
        </button>
        <button
          type="button"
          onClick={() => setPickedIds([])}
          disabled={isDrawing}
          className="rounded-lg border px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-50"
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
