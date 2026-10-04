import { ResourceNotFoundError } from "@/services/auth/policy";
import type { LearningAssistantRequest } from "./schemas";

interface CourseContext {
  courseId: string;
  courseName?: string;
  graphVersionNumber: number | null;
  concepts: Array<{ id: string; code: string; name: string }>;
  chapters: Array<{
    id: string;
    code: string;
    name: string;
    conceptIds: string[];
  }>;
}

// 入参只能来自按当前学生成员关系读取的课程列表，不能使用客户端提交的课程上下文。
export function resolveAuthorizedLearningTopic(
  courses: CourseContext[],
  courseId: string,
  request: LearningAssistantRequest["topic"],
) {
  const course = courses.find((item) => item.courseId === courseId);
  if (!course) throw new ResourceNotFoundError("课程不存在");
  if (request.kind === "COURSE") {
    if (request.id !== courseId) throw new ResourceNotFoundError("课程不存在");
    return {
      course,
      topic: { id: courseId, code: "", name: course.courseName ?? "当前课程" },
      conceptIds: course.concepts.map((item) => item.id),
    };
  }
  const topic =
    request.kind === "CHAPTER"
      ? course.chapters.find((item) => item.id === request.id)
      : course.concepts.find((item) => item.id === request.id);
  if (!topic)
    throw new ResourceNotFoundError("课程知识点或章节不存在，请重新选择");
  const conceptIds =
    request.kind === "CHAPTER"
      ? (course.chapters.find((item) => item.id === request.id)?.conceptIds ??
        [])
      : [request.id];
  return { course, topic, conceptIds };
}

export function learningPracticeLinks(
  courseId: string,
  topic: LearningAssistantRequest["topic"],
  enabled: boolean,
) {
  if (!enabled) return { practiceUrl: null, testUrl: null };
  const params = new URLSearchParams({
    view: "generate",
    courseId,
    ...(topic.kind === "COURSE"
      ? {}
      : topic.kind === "CHAPTER"
        ? { chapterId: topic.id }
        : { conceptId: topic.id }),
  });
  return {
    practiceUrl: `/student/recommendations?${params}&mode=PRACTICE#course-practice-center`,
    testUrl: `/student/recommendations?${params}&mode=TEST#course-practice-center`,
  };
}

// 模型只返回课程内的代码，服务器将其解析为正式 Concept；不接受模型生成的 ID 或 URL。
export function resolveSuggestedPracticeTopic(
  course: CourseContext,
  requested: LearningAssistantRequest["topic"],
  topicCode: string | null | undefined,
): LearningAssistantRequest["topic"] | null {
  if (requested.kind !== "COURSE") return requested;
  const concept = course.concepts.find((item) => item.code === topicCode);
  return concept ? { kind: "KNOWLEDGE_POINT", id: concept.id } : null;
}

/** 仅用服务器已授权的正式章节/Concept 构造练习链接，模型不能提供任意 URL。 */
export function suggestLearningPractice(
  course: CourseContext,
  requested: LearningAssistantRequest["topic"],
  text: string,
  topicCode?: string | null,
) {
  const ordered = [...course.chapters].sort((a, b) => {
    const left = Number(a.code.match(/\d+/u)?.[0] ?? 0);
    const right = Number(b.code.match(/\d+/u)?.[0] ?? 0);
    return left - right;
  });
  const number = text.match(
    /前(?:面)?\s*([一二三四五六七八九十]|\d+)\s*(?:个)?章/u,
  )?.[1];
  const chinese = "一二三四五六七八九十";
  const firstCount = number
    ? Number(number) || chinese.indexOf(number) + 1
    : /前(?:面)?几章/u.test(text)
      ? 3
      : 0;
  const chapterMatches =
    requested.kind === "COURSE" && firstCount > 0
      ? ordered.slice(0, Math.min(firstCount, ordered.length))
      : requested.kind === "COURSE"
        ? ordered.filter(
            (item) =>
              text.includes(item.name) ||
              text.includes(item.code) ||
              [
                ...text.matchAll(/第\s*([一二三四五六七八九十]|\d+)\s*章/gu),
              ].some((match) => {
                const ordinal =
                  Number(match[1]) || chinese.indexOf(match[1]) + 1;
                return ordinal === Number(item.code.match(/\d+/u)?.[0]);
              }),
          )
        : [];
  const topic =
    resolveSuggestedPracticeTopic(course, requested, topicCode) ??
    (course.concepts.find((item) => text.includes(item.name))
      ? {
          kind: "KNOWLEDGE_POINT" as const,
          id:
            course.concepts.find((item) => text.includes(item.name))?.id ?? "",
        }
      : null);
  if (!chapterMatches.length && !topic) return null;
  const params = new URLSearchParams({
    view: "generate",
    courseId: course.courseId,
  });
  let scopeLabel = "";
  if (chapterMatches.length) {
    for (const chapter of chapterMatches)
      params.append("chapterId", chapter.id);
    scopeLabel = chapterMatches.map((item) => item.name).join("、");
  } else if (topic?.kind === "CHAPTER") {
    params.set("chapterId", topic.id);
    scopeLabel =
      course.chapters.find((item) => item.id === topic.id)?.name ?? "";
  } else if (topic?.kind === "KNOWLEDGE_POINT") {
    params.set("conceptId", topic.id);
    scopeLabel =
      course.concepts.find((item) => item.id === topic.id)?.name ?? "";
  }
  if (!scopeLabel) return null;
  const difficulty = /基础|入门|不牢|不太牢/u.test(text) ? 2 : 3;
  params.set("difficulty", String(difficulty));
  const template = /判断题/u.test(text)
    ? "TRUE_FALSE10"
    : /编程题/u.test(text)
      ? "PYTHON5"
      : "CHOICE20";
  params.set("template", template);
  return {
    scopeLabel,
    note: /前(?:面)?几章/u.test(text)
      ? "暂按前 3 章准备，可在生成页调整。"
      : "已匹配本课程正式知识范围，可在生成页调整。",
    count: template === "TRUE_FALSE10" ? 10 : template === "PYTHON5" ? 5 : 20,
    typeLabel:
      template === "TRUE_FALSE10"
        ? "判断题"
        : template === "PYTHON5"
          ? "Python 编程题"
          : "单选与多选",
    difficulty,
    practiceUrl: `/student/recommendations?${params}&mode=PRACTICE#course-practice-center`,
    testUrl: `/student/recommendations?${params}&mode=TEST#course-practice-center`,
  };
}
