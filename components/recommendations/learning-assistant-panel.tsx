"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { LearningConversationHistory } from "./learning-conversation-history";
import { MessageCircle, Send, Sparkles } from "lucide-react";
import { requestApi } from "@/components/courses/request-api";
import type {
  LearningAssistantReply,
  LearningAssistantRequest,
  LearningConversationDetail,
} from "@/services/learning-assistant/schemas";

interface CourseOption {
  courseId: string;
  courseName: string;
  concepts: Array<{ id: string; name: string }>;
  chapters: Array<{ id: string; name: string }>;
}
interface Turn {
  question: string;
  phase: "QUESTION" | "ADVICE";
  reply: LearningAssistantReply;
}

export function LearningAssistantPanel({
  courses,
  initialCourseId,
  initialConceptId,
  reflectionHistory,
}: {
  courses: CourseOption[];
  initialCourseId?: string;
  initialConceptId?: string;
  reflectionHistory?: ReactNode;
}) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(
    courses.find((item) => item.courseId === initialCourseId)?.courseId ??
      courses[0]?.courseId ??
      "",
  );
  const course = courses.find((item) => item.courseId === courseId);
  const uniqueCourses = [
    ...new Map(courses.map((item) => [item.courseId, item])).values(),
  ];
  const [topicValue, setTopicValue] = useState(
    initialConceptId &&
      course?.concepts.some((item) => item.id === initialConceptId)
      ? `KNOWLEDGE_POINT:${initialConceptId}`
      : "",
  );
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const requestIdentity = useRef<{ key: string; id: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const topicName = topicValue.startsWith("CHAPTER:")
    ? course?.chapters.find((item) => `CHAPTER:${item.id}` === topicValue)?.name
    : course?.concepts.find(
        (item) => `KNOWLEDGE_POINT:${item.id}` === topicValue,
      )?.name;

  function resetConversation(preserveQuestion = false) {
    setTurns([]);
    setConversationId(null);
    requestIdentity.current = null;
    if (!preserveQuestion) setText("");
    setError(null);
    setDraft(null);
    setNotice(null);
  }
  async function ask(phase: "QUESTION" | "ADVICE", question = text) {
    if (
      pending ||
      !course ||
      (topicValue && !topicName) ||
      question.trim().length < 2
    )
      return;
    setPending(true);
    setError(null);
    setNotice(null);
    const separator = topicValue.indexOf(":");
    const kind =
      topicValue.slice(0, separator) === "CHAPTER"
        ? "CHAPTER"
        : "KNOWLEDGE_POINT";
    const identityKey = JSON.stringify({
      courseId,
      topicValue,
      conversationId,
      phase,
      question,
    });
    if (requestIdentity.current?.key !== identityKey)
      requestIdentity.current = { key: identityKey, id: crypto.randomUUID() };
    const input: LearningAssistantRequest = {
      ...(conversationId ? { conversationId } : {}),
      requestId: requestIdentity.current.id,
      topic: topicValue
        ? { kind, id: topicValue.slice(separator + 1) }
        : { kind: "COURSE", id: courseId },
      text: question,
      phase,
      history: turns
        .flatMap((turn) => [
          { role: "user" as const, content: turn.question },
          { role: "assistant" as const, content: turn.reply.answer },
        ])
        .slice(-6),
    };
    const response = await requestApi<LearningAssistantReply>(
      `/api/student/courses/${encodeURIComponent(course.courseId)}/learning-assistant`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    setPending(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    requestIdentity.current = null;
    setConversationId(response.data.conversationId ?? null);
    setTurns((current) => [
      ...current,
      { question, phase, reply: response.data },
    ]);
    if (phase === "QUESTION") setText("");
  }
  async function saveReflection() {
    if (!draft || pending) return;
    setPending(true);
    setError(null);
    const response = await requestApi<unknown>(
      `/api/student/courses/${encodeURIComponent(courseId)}/self-reflections`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: draft }),
      },
    );
    setPending(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    setDraft(null);
    setNotice(
      "已保存为学习反思草稿，可以在“AI 历史对话 → 已保存的学习反思”中修改、确认或删除。",
    );
  }
  function restoreConversation(conversation: LearningConversationDetail) {
    setConversationId(conversation.id);
    setTopicValue(
      conversation.topic.kind === "COURSE"
        ? ""
        : `${conversation.topic.kind}:${conversation.topic.id}`,
    );
    setTurns(conversation.turns);
    setText("");
    setError(null);
    setDraft(null);
    requestIdentity.current = null;
    setNotice(
      "已恢复历史对话。历史掌握情况为当时记录，继续提问会按当前学习数据回答。",
    );
  }
  const topicAvailable = Boolean(course && (!topicValue || topicName));
  if (!course)
    return (
      <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">
        暂时没有可学习的课程。加入课程后，即可使用 AI 学习助手。
      </div>
    );
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      id="learning-assistant-conversation"
      aria-label="AI 课程学习助手"
      aria-busy={pending}
    >
      <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-5">
          <LearningConversationHistory
            key={courseId}
            courseId={courseId}
            revision={`${conversationId}:${turns.length}`}
            pending={pending}
            onRestore={restoreConversation}
            onDelete={(id) => {
              if (id === conversationId) resetConversation();
            }}
            reflectionHistory={reflectionHistory}
          />
        </aside>
        <div className="min-w-0 space-y-4 lg:border-l lg:border-slate-100 lg:pl-5">
          <header>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setTopicValue("");
                resetConversation();
              }}
              className="float-right ml-3 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              新建对话
            </button>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <MessageCircle
                className="size-5 text-sky-600"
                aria-hidden="true"
              />
              AI 课程学习助手
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              直接描述你的疑问，AI
              会结合课程内容解答。需要时，再获取学习建议或前往练习。
            </p>
          </header>
          <div className="flex flex-wrap items-center gap-3">
            {uniqueCourses.length > 1 ? (
              <label className="text-sm font-medium text-slate-700">
                课程
                <select
                  className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2"
                  value={courseId}
                  disabled={pending}
                  onChange={(event) => {
                    setCourseId(event.target.value);
                    router.push(
                      `/student/recommendations?view=assistant&courseId=${encodeURIComponent(event.target.value)}`,
                    );
                    setTopicValue("");
                    resetConversation(true);
                  }}
                >
                  {uniqueCourses.map((item) => (
                    <option key={item.courseId} value={item.courseId}>
                      {item.courseName}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="rounded-full bg-sky-50 px-3 py-1.5 text-sm text-sky-800">
                {course.courseName}
              </span>
            )}
            {topicName ? (
              <span className="text-sm text-slate-600">
                当前主题：{topicName}
              </span>
            ) : null}
          </div>
          <details className="rounded-xl border border-slate-100 px-3 py-2">
            <summary className="cursor-pointer text-xs text-slate-500">
              指定学习主题（可选）
            </summary>
            <label className="text-sm font-medium text-slate-700">
              <span className="sr-only">学习主题</span>
              <select
                className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2"
                disabled={pending}
                value={topicValue}
                onChange={(event) => {
                  setTopicValue(event.target.value);
                  resetConversation(true);
                }}
              >
                <option value="">自动识别，不限制章节</option>
                <optgroup label="课程章节">
                  {course.chapters.map((item) => (
                    <option key={item.id} value={`CHAPTER:${item.id}`}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="知识点">
                  {course.concepts.map((item) => (
                    <option key={item.id} value={`KNOWLEDGE_POINT:${item.id}`}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          </details>
          <p className="text-xs leading-5 text-slate-400">
            对话自动保存，可在左侧继续交流。学习反思由你确认后保存。
          </p>
          {turns.length ? (
            <div
              className="max-h-[min(60vh,640px)] min-h-48 space-y-5 overflow-y-auto overscroll-contain rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:p-4"
              aria-label="课程答疑记录"
            >
              {turns.map((turn, index) => (
                <article key={index} className="space-y-3">
                  <div className="ml-6 rounded-xl bg-sky-100 p-3 text-sm text-sky-950">
                    <p className="mb-1 text-xs font-medium text-sky-700">
                      我的{turn.phase === "ADVICE" ? "请求" : "问题"}
                    </p>
                    <p className="break-words whitespace-pre-wrap">
                      {turn.question}
                    </p>
                  </div>
                  <div className="mr-2 space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-700">
                      <Sparkles className="size-3.5" aria-hidden="true" />
                      {turn.reply.fallbackUsed
                        ? "课程基础帮助 · AI 暂不可用"
                        : "学习助手"}
                    </p>
                    <p className="leading-7 break-words whitespace-pre-wrap">
                      {turn.reply.answer}
                    </p>
                    {turn.reply.objectiveSummary ? (
                      <div className="rounded-lg bg-slate-50 p-3">
                        <h3 className="text-xs font-semibold text-slate-700">
                          已有作答反映的掌握情况
                        </h3>
                        <p className="mt-1 text-xs leading-6 text-slate-600">
                          {turn.reply.objectiveSummary}
                        </p>
                      </div>
                    ) : null}
                    {turn.reply.learningObservation ? (
                      <p className="text-xs leading-6 text-slate-500">
                        本次交流中的学习线索（待练习验证）：
                        {turn.reply.learningObservation}
                      </p>
                    ) : null}
                    {turn.reply.advice.length ? (
                      <div>
                        <h3 className="font-medium">可以尝试这样学习</h3>
                        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
                          {turn.reply.advice.map((item, adviceIndex) => (
                            <li key={adviceIndex}>{item}</li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {turn.reply.canOfferAdvice && index === turns.length - 1 ? (
                      <div className="border-t border-slate-100 pt-3">
                        <p className="text-sm">
                          需要我针对
                          {topicName ? `“${topicName}”` : "刚才的问题"}
                          提供学习建议吗？
                        </p>
                        <button
                          disabled={pending}
                          type="button"
                          className="mt-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                          onClick={() =>
                            void ask(
                              "ADVICE",
                              "请根据刚才的疑问，给我这个主题的学习建议。",
                            )
                          }
                        >
                          需要学习建议
                        </button>
                        <span className="ml-3 text-xs text-slate-500">
                          也可以继续输入问题
                        </span>
                      </div>
                    ) : null}
                    {turn.reply.practiceUrl && turn.reply.testUrl ? (
                      <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4">
                        <h3 className="text-sm font-semibold text-sky-900">
                          要不要练一练，检验刚才的理解？
                        </h3>
                        {turn.reply.practiceSuggestion && (
                          <div className="space-y-1 text-xs leading-6 text-slate-600">
                            <p className="font-medium text-sky-900">
                              课程：{course?.courseName ?? "当前课程"}
                            </p>
                            <p>
                              范围：{turn.reply.practiceSuggestion.scopeLabel}
                            </p>
                            <p>
                              {turn.reply.practiceSuggestion.typeLabel} ·{" "}
                              {turn.reply.practiceSuggestion.count} 题 · 难度{" "}
                              {turn.reply.practiceSuggestion.difficulty}/5
                            </p>
                            <p>{turn.reply.practiceSuggestion.note}</p>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Link
                            className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white"
                            href={turn.reply.practiceUrl}
                            onClick={(event) => {
                              if (
                                event.ctrlKey ||
                                event.metaKey ||
                                event.shiftKey ||
                                event.altKey
                              )
                                return;
                              event.preventDefault();
                              window.dispatchEvent(
                                new CustomEvent("learning-assistant-practice", {
                                  detail: turn.reply.practiceUrl,
                                }),
                              );
                            }}
                          >
                            确认范围，去生成练习
                          </Link>
                          <Link
                            className="rounded-lg border px-3 py-2 text-xs font-medium text-sky-700"
                            href={turn.reply.testUrl}
                            onClick={(event) => {
                              if (
                                event.ctrlKey ||
                                event.metaKey ||
                                event.shiftKey ||
                                event.altKey
                              )
                                return;
                              event.preventDefault();
                              window.dispatchEvent(
                                new CustomEvent("learning-assistant-practice", {
                                  detail: turn.reply.testUrl,
                                }),
                              );
                            }}
                          >
                            改为自主测试（50 题）
                          </Link>
                        </div>
                        <p className="text-xs leading-5 text-slate-500">
                          这里只带入练习条件，不会立即生成或提交。请在练习中心核对课程、范围、题型和题量；范围不符合你的意思时可返回继续说明。不计入正式课程成绩。
                        </p>
                      </div>
                    ) : null}
                    {turn.reply.status === "ANSWER" &&
                    !turn.reply.fallbackUsed ? (
                      <button
                        className="text-xs text-slate-500 underline underline-offset-4"
                        disabled={pending}
                        type="button"
                        onClick={() => {
                          setDraft(
                            `${turn.question}\n${turn.reply.learningObservation}`
                              .trim()
                              .slice(0, 2000),
                          );
                          setNotice(null);
                        }}
                      >
                        整理为我的学习反思
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-5 text-sm leading-6 text-slate-500">
              例如：“为什么 for 循环里的 range(5) 不包含
              5？”或“这一章的列表和元组有什么区别？”
            </div>
          )}
          {pending ? (
            <p className="text-sm text-sky-700" role="status">
              正在处理，请稍候…
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}，请稍后重新提交。
            </p>
          ) : null}
          {notice ? (
            <p
              role="status"
              className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
            >
              {notice}{" "}
              <button
                className="underline"
                type="button"
                onClick={() => window.location.reload()}
              >
                刷新查看记录
              </button>
            </p>
          ) : null}
          {draft !== null ? (
            <div className="space-y-3 rounded-xl border border-sky-200 p-4">
              <label className="block text-sm font-medium">
                核对并修改你的学习反思
                <textarea
                  aria-label="学习反思草稿"
                  maxLength={2000}
                  className="mt-2 min-h-24 w-full rounded-lg border p-3 text-sm"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={pending}
                />
              </label>
              <p className="text-xs text-slate-500">
                保存后仍是待确认草稿，不会覆盖客观掌握度。
              </p>
              <div className="flex gap-2">
                <button
                  className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                  type="button"
                  disabled={pending || draft.trim().length < 2}
                  onClick={() => void saveReflection()}
                >
                  保存反思草稿
                </button>
                <button
                  className="rounded-lg border px-3 py-2 text-sm"
                  disabled={pending}
                  type="button"
                  onClick={() => setDraft(null)}
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}
          {conversationId && !topicAvailable && (
            <p role="status" className="text-sm text-amber-700">
              该历史主题已不在当前课程图谱中，可查看记录；继续学习请另选主题。
            </p>
          )}
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void ask("QUESTION");
            }}
          >
            <label className="block">
              <span className="sr-only">向课程学习助手提问</span>
              <textarea
                className="min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 focus-visible:outline-sky-500 disabled:opacity-50"
                maxLength={2000}
                value={text}
                disabled={pending}
                onChange={(event) => setText(event.target.value)}
                placeholder={
                  topicName
                    ? `关于“${topicName}”，你想了解什么？也可以贴出简短 Python 代码。`
                    : "直接输入课程疑问，也可以贴出简短代码，例如：为什么 range(5) 不包含 5？"
                }
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">{text.length}/2000</span>
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                type="submit"
                disabled={pending || !topicAvailable || text.trim().length < 2}
              >
                <Send className="size-4" aria-hidden="true" />
                {pending ? "回答中…" : "发送问题"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
