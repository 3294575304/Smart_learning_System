import "server-only";

import { createHash } from "node:crypto";
import { getSystemConfigValue } from "@/services/system-config/service";
import { createAIProvider } from "@/services/ai/provider-factory";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { RecommendationOperationError } from "@/services/recommendations/errors";
import {
  evaluationIntentOutputSchema,
  type EvaluationAssistantRequest,
  type EvaluationAssistantResult,
  type EvaluationIntent,
} from "./evaluation-assistant-schemas";
import {
  loadTeacherEvaluationScope,
  loadTeacherEvaluationStep,
} from "./evaluation-state";

// Only these teaching terms may leave the server. Free text, names and IDs remain local.
const teachingTerms =
  /教学质量|质量报告|课程报告|分析报告|成绩台账|工作簿|课程总结|课程评价|达成度|考核|结课|台账|成绩|分析|统计|报告|生成|整理|建立|导出|查看|核对|同步|和|以及|再/gu;

async function identifyIntent(
  teacherId: string,
  text: string,
): Promise<EvaluationIntent | null> {
  if (/不要|不用|取消|删除|清空|撤销|跳过审核/u.test(text)) return null;
  const gradebook = /台账|成绩工作簿/u.test(text);
  const report = /教学质量|质量报告|分析报告|课程报告/u.test(text);
  if (gradebook && report) return "BOTH";
  if (gradebook) return "GRADEBOOK";
  if (report) return "QUALITY_REPORT";
  if (/出题|生成.{0,8}(?:候选题|题目)/u.test(text))
    return "QUESTION_GENERATION";
  if (/组卷|创建作业|新建作业|布置作业/u.test(text))
    return "ASSIGNMENT_ASSEMBLY";
  const terms = [...text.matchAll(teachingTerms)]
    .map(([term]) => term)
    .slice(0, 24);
  if (!terms.some((term) => /成绩|课程评价|课程总结|达成度|报告/u.test(term)))
    return null;
  try {
    if (!(await getSystemConfigValue("aiAnalysisEnabled"))) return null;
    const provider = createAIProvider({
      capability: "teacher_evaluation_intent",
      actorId: teacherId,
    });
    const raw = await provider.classifyTeacherEvaluationIntent?.(terms, {
      signal: AbortSignal.timeout(5_000),
    });
    return evaluationIntentOutputSchema.safeParse(raw).data?.intent ?? null;
  } catch {
    return null;
  }
}

function namedClassrooms<T extends { name: string }>(
  text: string,
  classrooms: T[],
) {
  const normalize = (value: string) =>
    value.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
  const normalized = normalize(text);
  const matches = classrooms.flatMap((classroom) => {
    const name = normalize(classroom.name);
    const offset = name ? normalized.indexOf(name) : -1;
    if (
      offset < 0 ||
      (/^\d/u.test(name) && /\d/u.test(normalized[offset - 1] ?? ""))
    )
      return [];
    return [{ classroom, offset, length: name.length }];
  });
  return matches
    .filter(
      (match) =>
        !matches.some(
          (other) =>
            other.length > match.length &&
            other.offset <= match.offset &&
            other.offset + other.length >= match.offset + match.length,
        ),
    )
    .map(({ classroom }) => classroom);
}

export function teacherEvaluationAssistantEnabled() {
  return process.env.TEACHER_EVALUATION_ASSISTANT_DISABLED !== "true";
}

export async function resolveTeacherEvaluationAction(
  teacherId: string,
  courseId: string,
  request: EvaluationAssistantRequest,
  context?: { intent: EvaluationIntent },
): Promise<EvaluationAssistantResult> {
  if (!teacherEvaluationAssistantEnabled())
    throw new ResourceNotFoundError("教师 AI 助手暂未开放，请使用工作台入口。");
  const course = await loadTeacherEvaluationScope(teacherId, courseId);
  const selected = course.classrooms.find(
    (room) => room.id === request.classroomId,
  );
  if (request.classroomId && !selected)
    throw new ResourceNotFoundError("班级不在当前课程或无权访问");
  const intent =
    request.action === "plan"
      ? (context?.intent ??
        (await identifyIntent(teacherId, request.text.normalize("NFKC"))))
      : request.intent;
  if (!intent)
    return {
      status: "MANUAL",
      message: "可以询问成绩台账、教学质量分析、作业智能组卷或 AI 出题。",
    };

  if (intent === "QUESTION_GENERATION" && !course.questionCategory.isActive)
    return {
      status: "MANUAL",
      message: "该课程的题库分类已停用，请先在课程管理中核对题库分类。",
    };
  if (intent === "QUESTION_GENERATION")
    return prepareNavigation(teacherId, course, null, intent, request, {
      detail: "打开 AI 辅助出题工作台，可选择出题范围并审核候选题。",
      action: {
        label: "打开 AI 出题",
        href: `/teacher/questions/ai?courseId=${encodeURIComponent(course.id)}`,
      },
    });

  if (!course.classrooms.length)
    return {
      status: "MANUAL",
      message: "为课程关联教学班后，即可继续处理班级教学任务。",
    };

  let classroom = selected;
  if (request.action === "plan") {
    const named = namedClassrooms(request.text, course.classrooms);
    classroom = named.length === 1 ? named[0] : undefined;
    if (
      !classroom &&
      named.length === 0 &&
      (/本班|当前班级|这个班/u.test(request.text) ||
        (context &&
          !/外校|其他班|另一个班|[0-9一二三四五六七八九十]+\s*班/u.test(
            request.text.normalize("NFKC"),
          )))
    )
      classroom =
        selected ??
        (course.classrooms.length === 1 ? course.classrooms[0] : undefined);
    if (!classroom)
      return {
        status: "CHOOSE_CLASSROOM",
        intent,
        classrooms: named.length ? named : course.classrooms,
      };
  }
  if (!classroom) throw new ResourceNotFoundError("班级不在当前课程或无权访问");
  if (intent === "ASSIGNMENT_ASSEMBLY") {
    if (classroom.status !== "ACTIVE")
      return {
        status: "MANUAL",
        message: "请选择正在授课的班级，再打开作业智能组卷。",
      };
    return prepareNavigation(teacherId, course, classroom, intent, request, {
      detail: "打开创建作业页面，并选中这个教学班。可在选题区使用智能组卷。",
      action: {
        label: "打开作业组卷",
        href: `/teacher/assignments/new?classroomId=${encodeURIComponent(classroom.id)}`,
      },
    });
  }
  const { step, schemeId, publication } = await loadTeacherEvaluationStep(
    course,
    classroom.id,
    intent !== "GRADEBOOK",
  );
  if (!step?.action)
    throw new ResourceNotFoundError("当前班级没有可用的评价操作");
  return prepareNavigation(
    teacherId,
    course,
    classroom,
    intent,
    request,
    { ...step, action: step.action },
    schemeId,
    publication,
  );
}

function prepareNavigation(
  teacherId: string,
  course: { id: string; name: string },
  classroom: { id: string; name: string } | null,
  intent: EvaluationIntent,
  request: EvaluationAssistantRequest,
  step: { detail: string; action: { label: string; href: string } },
  schemeId?: string | null,
  publication?: { id: string; versionNumber: number } | null,
): EvaluationAssistantResult {
  const revision = createHash("sha256")
    .update(
      JSON.stringify([
        teacherId,
        course.id,
        classroom?.id,
        intent,
        schemeId,
        publication?.id,
        step,
      ]),
    )
    .digest("hex");
  if (request.action === "confirm") {
    if (request.revision !== revision)
      throw new RecommendationOperationError(
        "台账或报告进度已变化，请重新查看下一步。",
        409,
      );
    return { status: "CONFIRMED", href: step.action.href };
  }
  return {
    status: "REVIEW",
    intent,
    courseName: course.name,
    classroom,
    publicationVersion: publication?.versionNumber ?? null,
    detail: step.detail,
    label: step.action.label,
    revision,
  };
}
