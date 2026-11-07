"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { QuestionType } from "@prisma/client";
import { selectAssignmentQuestions } from "@/services/assignments/editor-helpers";

type Q = {
  id: string;
  title: string;
  type: QuestionType;
  difficulty: number;
  blocked: boolean;
};
type Selected = { questionId: string; title: string; points: number };
export function ExamForm({
  courses,
  classrooms,
  conceptGroups,
}: {
  courses: { id: string; name: string; term: string }[];
  classrooms: { id: string; name: string; courseId: string | null }[];
  conceptGroups: {
    id: string;
    chapters: {
      id: string;
      name: string;
      nodes: { conceptId: string; name?: string }[];
    }[];
  }[];
}) {
  const router = useRouter();
  const requestIdRef = useRef<string | null>(null);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [classroomIds, setClassroomIds] = useState<string[]>([]);
  const [type, setType] = useState("MIDTERM");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [allowedSwitches, setAllowedSwitches] = useState(2);
  const [questionType, setQuestionType] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [conceptId, setConceptId] = useState("");
  const [count, setCount] = useState(10);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [selected, setSelected] = useState<Selected[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    if (!startsAt) {
      setError("请先设置开考时间");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        courseId,
        startsAt: new Date(startsAt).toISOString(),
      });
      if (questionType) params.set("questionType", questionType);
      if (difficulty) params.set("difficulty", difficulty);
      if (conceptId) params.set("conceptId", conceptId);
      const response = await fetch(`/api/teacher/exams/questions?${params}`);
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error ?? "题库加载失败");
      setQuestions(body.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "题库加载失败");
    } finally {
      setBusy(false);
    }
  }
  function add(item: Q) {
    setSelected((old) => [
      ...old,
      { questionId: item.id, title: item.title, points: 10 },
    ]);
  }
  function randomPick() {
    let pool: Q[];
    try {
      pool = selectAssignmentQuestions(
        questions.filter((item) => !item.blocked),
        selected.map((item) => item.questionId),
        count,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "选题失败");
      return;
    }
    setSelected((old) => [
      ...old,
      ...pool.map((item) => ({
        questionId: item.id,
        title: item.title,
        points: 10,
      })),
    ]);
  }
  function move(index: number, offset: number) {
    setSelected((old) => {
      const next = [...old];
      const target = index + offset;
      if (target < 0 || target >= next.length) return old;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  async function publish() {
    if (!window.confirm("发布后试卷和考试规则将冻结。确认发布？")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/teacher/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: (requestIdRef.current ??= crypto.randomUUID()),
          courseId,
          classroomIds,
          type,
          title,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          allowedSwitches,
          questions: selected.map(({ questionId, points }) => ({
            questionId,
            points,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error ?? "发布失败");
      router.push("/teacher/exams");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "发布失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <section className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-2">
        <label>
          课程
          <select
            className="mt-1 w-full rounded border p-2"
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setClassroomIds([]);
              setQuestions([]);
              setSelected([]);
            }}
          >
            {courses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.term}
              </option>
            ))}
          </select>
        </label>
        <label>
          考试类型
          <select
            className="mt-1 w-full rounded border p-2"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="MIDTERM">期中考试</option>
            <option value="FINAL">期末考试</option>
          </select>
        </label>
        <label>
          考试名称
          <input
            className="mt-1 w-full rounded border p-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          允许切屏次数
          <input
            className="mt-1 w-full rounded border p-2"
            type="number"
            min="0"
            max="20"
            value={allowedSwitches}
            onChange={(e) => setAllowedSwitches(Number(e.target.value))}
          />
        </label>
        <label>
          开考时间
          <input
            className="mt-1 w-full rounded border p-2"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </label>
        <label>
          截止时间
          <input
            className="mt-1 w-full rounded border p-2"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </label>
        <fieldset className="sm:col-span-2">
          <legend>参加班级</legend>
          <div className="flex flex-wrap gap-3">
            {classrooms
              .filter((item) => item.courseId === courseId)
              .map((item) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={classroomIds.includes(item.id)}
                    onChange={(e) =>
                      setClassroomIds((old) =>
                        e.target.checked
                          ? [...old, item.id]
                          : old.filter((id) => id !== item.id),
                      )
                    }
                  />{" "}
                  {item.name}
                </label>
              ))}
          </div>
        </fieldset>
      </section>
      <section className="space-y-3 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">试卷选题</h2>
        <p className="text-sm">
          上传试卷请先
          <Link className="text-sky-700 underline" href="/teacher/exams/import">
            识别并审核文件
          </Link>
          ，入共享题库后返回选题。支持 DOC、DOCX、文本型 PDF、TXT、JSON。
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded border p-2"
            value={questionType}
            onChange={(e) => setQuestionType(e.target.value)}
          >
            <option value="">全部题型</option>
            {[
              "SINGLE_CHOICE",
              "MULTIPLE_CHOICE",
              "TRUE_FALSE",
              "FILL_BLANK",
              "SHORT_ANSWER",
              "PYTHON_PROGRAMMING",
            ].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            className="rounded border p-2"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="">全部难度</option>
            {[1, 2, 3, 4, 5].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            className="rounded border p-2"
            value={conceptId}
            onChange={(e) => setConceptId(e.target.value)}
          >
            <option value="">全部知识点</option>
            {conceptGroups
              .find((item) => item.id === courseId)
              ?.chapters.flatMap((chapter) =>
                chapter.nodes.map((node) => (
                  <option key={node.conceptId} value={node.conceptId}>
                    {chapter.name} · {node.name ?? node.conceptId}
                  </option>
                )),
              )}
          </select>
          <button
            className="rounded border px-3"
            disabled={busy}
            onClick={load}
          >
            查询可用题
          </button>
          <input
            aria-label="一键选题数量"
            className="w-20 rounded border p-2"
            type="number"
            min="1"
            max="200"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
          <button
            className="rounded bg-sky-700 px-3 text-white"
            onClick={randomPick}
          >
            一键选题
          </button>
        </div>
        <ul className="max-h-64 overflow-auto">
          {questions.map((item) => (
            <li
              key={item.id}
              className="flex justify-between border-b py-2 text-sm"
            >
              <span>
                {item.title} · 难度 {item.difficulty}
                {item.blocked ? " · 三年禁重" : ""}
              </span>
              <button
                className="text-sky-700 disabled:text-slate-400"
                disabled={
                  item.blocked ||
                  selected.some((row) => row.questionId === item.id)
                }
                onClick={() => add(item)}
              >
                加入
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">题序 · {selected.length} 题</h2>
        <ol>
          {selected.map((item, index) => (
            <li
              key={item.questionId}
              className="flex items-center gap-2 border-b py-2"
            >
              <span className="flex-1">
                {index + 1}. {item.title}
              </span>
              <input
                aria-label="分值"
                className="w-20 rounded border p-1"
                type="number"
                min="0.01"
                step="0.01"
                value={item.points}
                onChange={(e) =>
                  setSelected((old) =>
                    old.map((row, i) =>
                      i === index
                        ? { ...row, points: Number(e.target.value) }
                        : row,
                    ),
                  )
                }
              />
              <button onClick={() => move(index, -1)}>上移</button>
              <button onClick={() => move(index, 1)}>下移</button>
              <button
                onClick={() =>
                  setSelected((old) =>
                    old.filter((row) => row.questionId !== item.questionId),
                  )
                }
              >
                移除
              </button>
            </li>
          ))}
        </ol>
      </section>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <button
        className="rounded bg-sky-700 px-5 py-2 text-white disabled:opacity-50"
        disabled={
          busy ||
          !courseId ||
          !classroomIds.length ||
          !title ||
          !startsAt ||
          !endsAt ||
          !selected.length
        }
        onClick={publish}
      >
        {busy ? "处理中…" : "确认发布考试"}
      </button>
    </div>
  );
}
