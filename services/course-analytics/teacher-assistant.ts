import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAIProvider } from "@/services/ai/provider-factory";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getSystemConfigValue } from "@/services/system-config/service";
import {
  resolveTeacherEvaluationAction,
  teacherEvaluationAssistantEnabled,
} from "./evaluation-assistant";
import type { EvaluationIntent } from "./evaluation-assistant-schemas";
import { listTeacherAssistantCourses } from "./evaluation-state";
import {
  assistantCatalog,
  type AssistantTopic,
} from "./teacher-assistant-catalog";
import {
  assistantIntentTerms,
  readAssistantIntent,
} from "./teacher-assistant-intent";
import {
  assistantTopicSchema,
  type AssistantCard,
  type AssistantCourse,
  type TeacherAssistantRequest,
  type TeacherAssistantResult,
} from "./teacher-assistant-schemas";

const workflow: Partial<Record<AssistantTopic, EvaluationIntent>> = {
  GRADEBOOK: "GRADEBOOK",
  QUALITY_REPORT: "QUALITY_REPORT",
  BOTH: "BOTH",
  ASSIGNMENT_ASSEMBLY: "ASSIGNMENT_ASSEMBLY",
  QUESTION_GENERATION: "QUESTION_GENERATION",
};
const topicOutput = z
  .object({ topic: assistantTopicSchema.nullable() })
  .strict();
const commonTopics: AssistantTopic[] = [
  "ASSIGNMENTS",
  "GRADEBOOK",
  "QUALITY_REPORT",
];
const normalize = (text: string) =>
  text.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");

async function inferTopic(teacherId: string, text: string) {
  const terms = assistantIntentTerms(text);
  if (terms.length < 2) return null;
  try {
    if (!(await getSystemConfigValue("aiAnalysisEnabled"))) return null;
    const provider = createAIProvider({
      capability: "teacher_evaluation_intent",
      actorId: teacherId,
    });
    const raw = await provider.classifyTeacherAssistantTopic?.(terms, {
      signal: AbortSignal.timeout(2_500),
    });
    return topicOutput.safeParse(raw).data?.topic ?? null;
  } catch {
    return null;
  }
}

function card(
  topic: AssistantTopic,
  mode: "find" | "do" | "troubleshoot",
  course?: AssistantCourse,
  classroomId?: string,
): AssistantCard {
  const entry = assistantCatalog[topic];
  const coursePath = course
    ? `/teacher/courses/${encodeURIComponent(course.id)}`
    : "";
  const params = new URLSearchParams();
  const listSupportsScope = topic === "ASSIGNMENTS" || topic === "GRADING";
  if (
    classroomId &&
    (entry.course || listSupportsScope || topic === "ASSIGNMENT_ASSEMBLY")
  )
    params.set("classroomId", classroomId);
  if (course && (listSupportsScope || topic === "QUESTION_GENERATION"))
    params.set("courseId", course.id);
  return {
    label: `打开${entry.label}`,
    href: `${entry.course ? coursePath : ""}${entry.path}${params.size ? `?${params}` : ""}`,
    detail: mode === "troubleshoot" ? entry.troubleshoot : entry.next,
  };
}

export async function resolveTeacherAssistant(
  teacherId: string,
  input: TeacherAssistantRequest,
): Promise<TeacherAssistantResult> {
  if (!teacherEvaluationAssistantEnabled())
    throw new ResourceNotFoundError("教师 AI 助手暂未开放，请使用工作台入口。");
  const { topics, mode, followUp } = readAssistantIntent(input.text);
  const denied = /不要|不想|不用|别再/u.test(input.text) && !input.topic;
  if (!denied && !input.topic && topics.length > 1)
    return { message: "你提到了几项事情。先选一项，我帮你找到入口。", topics };
  const topic = denied
    ? null
    : (input.topic ??
      topics[0] ??
      (followUp ? input.previousTopic : undefined) ??
      (await inferTopic(teacherId, input.text)) ??
      (mode === "troubleshoot" && input.area !== "WORKBENCH"
        ? input.area
        : undefined));
  if (!topic)
    return {
      message:
        "你想找哪个功能，或者哪一步遇到了问题？告诉我页面名称或看到的提示，我可以帮你找到下一步。",
      topics: [
        ...new Set([
          ...(input.area && input.area !== "WORKBENCH" ? [input.area] : []),
          ...commonTopics,
        ]),
      ].slice(0, 3),
      cards: [card("WORKBENCH", "find")],
    };

  const entry = assistantCatalog[topic];
  const intent = workflow[topic];
  const needsCourse = entry.course || (intent && mode !== "find");
  const scoped =
    needsCourse ||
    ((intent || topic === "ASSIGNMENTS" || topic === "GRADING") &&
      (input.courseId || input.selectedCourseId || input.classroomId));
  const contextClassroom =
    scoped && input.classroomId
      ? await prisma.classroom.findFirst({
          where: {
            id: input.classroomId,
            teacherId,
            status: { in: ["ACTIVE", "COMPLETED"] },
          },
          select: { id: true, courseId: true },
        })
      : null;
  let course: AssistantCourse | undefined;
  if (scoped) {
    const courses = await listTeacherAssistantCourses(teacherId);
    const normalized = normalize(input.text);
    const named = courses.filter((item) =>
      [item.name, item.courseNo]
        .map(normalize)
        .some((value) => value.length >= 2 && normalized.includes(value)),
    );
    if (input.selectedCourseId) {
      course = courses.find((item) => item.id === input.selectedCourseId);
      if (!course) throw new ResourceNotFoundError("课程不存在或无权访问");
    } else {
      course =
        named.length === 1
          ? named[0]
          : named.length > 1
            ? undefined
            : (courses.find(
                (item) =>
                  item.id === (input.courseId ?? contextClassroom?.courseId),
              ) ?? (courses.length === 1 ? courses[0] : undefined));
    }
    if (needsCourse && !course) {
      return courses.length
        ? {
            topic,
            message: `要处理哪门课的${entry.label}？`,
            courses: named.length > 1 ? named : courses,
          }
        : {
            topic,
            message: "这项操作需要先有一门可管理的课程。",
            cards: [card("COURSES", "find")],
          };
    }
  }

  const classroomId =
    course && contextClassroom?.courseId === course.id
      ? contextClassroom.id
      : undefined;
  if (
    intent &&
    course &&
    (mode !== "find" ||
      topic === "ASSIGNMENT_ASSEMBLY" ||
      topic === "QUESTION_GENERATION")
  ) {
    const state = await resolveTeacherEvaluationAction(
      teacherId,
      course.id,
      { action: "plan", text: input.text, classroomId },
      { intent },
    );
    if (state.status === "REVIEW" || state.status === "CHOOSE_CLASSROOM")
      return {
        topic,
        message:
          state.status === "CHOOSE_CLASSROOM"
            ? `请选择要处理的教学班，我再帮你打开${entry.label}的下一步。`
            : mode === "troubleshoot"
              ? entry.troubleshoot
              : "我找到了这个事项的下一步。",
        evaluation: { courseId: course.id, state },
      };
    if (state.status === "MANUAL")
      return {
        topic,
        message: state.message,
        cards:
          topic === "QUESTION_GENERATION"
            ? [card("QUESTION_BANK", "troubleshoot")]
            : [
                {
                  label: "查看课程教学班",
                  href: `/teacher/courses/${encodeURIComponent(course.id)}/classrooms`,
                  detail: "查看教学班的关联和授课状态。",
                },
              ],
      };
  }

  const cards =
    topic === "BOTH" && mode === "find"
      ? [
          card("GRADEBOOK", mode, course, classroomId),
          card("QUALITY_REPORT", mode, course, classroomId),
        ]
      : [card(topic, mode, course, classroomId)];
  return {
    topic,
    message:
      mode === "troubleshoot"
        ? "可以从下面的入口开始排查。"
        : `我找到了${entry.label}的入口。`,
    cards,
  };
}
