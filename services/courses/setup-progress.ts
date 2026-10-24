import type {
  CourseStatus,
  KnowledgeGraphStatus,
  SyllabusParseStatus,
} from "@prisma/client";

export type SetupStepState =
  "complete" | "pending" | "processing" | "attention" | "blocked";

export interface CourseSetupStep {
  id: string;
  title: string;
  state: SetupStepState;
  detail: string;
  href: string;
  action: string;
}

export interface CourseSetupInput {
  courseId: string;
  status: CourseStatus;
  activeClassroomCount: number;
  activeStudentCount: number;
  syllabus: {
    id: string;
    versionNumber: number;
    parseStatus: SyllabusParseStatus | null;
  } | null;
  publishedSyllabus: {
    id: string;
    syllabusId: string;
    versionNumber: number;
    graphDraftStatus: KnowledgeGraphStatus | null;
  } | null;
  graph: {
    id: string;
    sourceSyllabusStructureId: string;
    versionNumber: number;
  } | null;
  assessment: {
    sourcePublishedSyllabusStructureId: string | null;
    versionNumber: number;
  } | null;
}

/** Derive readiness from saved records; never treat a draft or an old source as a new publication. */
export function buildCourseSetupProgress(input: CourseSetupInput) {
  const base = `/teacher/courses/${input.courseId}`;
  const { syllabus, publishedSyllabus, graph, assessment } = input;
  const steps: CourseSetupStep[] = [
    {
      id: "classrooms",
      title: "关联授课班级",
      state: input.activeClassroomCount > 0 ? "complete" : "pending",
      detail: input.activeClassroomCount
        ? `已关联 ${input.activeClassroomCount} 个开课班级。`
        : "请先关联一个启用中的班级，后续名单和教学任务将归入该班级。",
      href: `${base}#course-classrooms`,
      action: "管理班级",
    },
  ];

  const syllabusStep: CourseSetupStep = {
    id: "syllabus",
    title: "教学大纲",
    state: "pending",
    detail:
      "上传文本型 PDF，系统将提取课程目标、章节和考核要求；审核后发布正式版本。",
    href: `${base}/syllabus`,
    action: "上传大纲",
  };
  if (publishedSyllabus && publishedSyllabus.syllabusId === syllabus?.id) {
    syllabusStep.state = "complete";
    syllabusStep.detail = `正式大纲第 ${publishedSyllabus.versionNumber} 版已发布。`;
    syllabusStep.action = "查看大纲工作区";
  } else if (syllabus) {
    const previous = publishedSyllabus
      ? `正式第 ${publishedSyllabus.versionNumber} 版继续生效；新上传文件尚未发布。`
      : "";
    const uploaded = `已上传第 ${syllabus.versionNumber} 版文件。`;
    if (syllabus.parseStatus === "FAILED") {
      syllabusStep.state = "attention";
      syllabusStep.detail = `${previous}${uploaded}本次解析失败，请查看诊断，重新解析或更换文件。`;
      syllabusStep.action = "查看诊断并重试";
    } else if (
      syllabus.parseStatus === "PENDING" ||
      syllabus.parseStatus === "PROCESSING"
    ) {
      syllabusStep.state = "processing";
      syllabusStep.detail = `${previous}${uploaded}解析任务正在排队或处理中，可进入工作区查看进度。`;
      syllabusStep.action = "查看解析进度";
    } else {
      syllabusStep.state = publishedSyllabus ? "attention" : "pending";
      syllabusStep.detail = `${previous}${uploaded}${syllabus.parseStatus === "SUCCEEDED" ? "解析草稿已就绪，请核对原文、保存修订并发布。" : "请发起解析，再审核和发布。"}`;
      syllabusStep.action = "继续解析与审核";
    }
  }
  steps.push(syllabusStep);

  const graphStep: CourseSetupStep = {
    id: "graph",
    title: "审核并发布知识图谱",
    state: "blocked",
    detail: "请先发布正式大纲，再生成课程图谱。",
    href: `${base}/knowledge-graph`,
    action: "查看知识图谱",
  };
  if (publishedSyllabus) {
    if (graph?.sourceSyllabusStructureId === publishedSyllabus.id) {
      graphStep.state = "complete";
      graphStep.detail = `正式图谱第 ${graph.versionNumber} 版与当前正式大纲一致。`;
    } else if (
      publishedSyllabus.graphDraftStatus === "PENDING" ||
      publishedSyllabus.graphDraftStatus === "PROCESSING"
    ) {
      graphStep.state = "processing";
      graphStep.detail = "当前大纲的图谱正在生成，请进入工作区查看任务进度。";
    } else if (publishedSyllabus.graphDraftStatus === "FAILED") {
      graphStep.state = "attention";
      graphStep.detail = "当前大纲的图谱生成失败，请进入工作区重试。";
    } else {
      graphStep.state = graph ? "attention" : "pending";
      graphStep.detail = graph
        ? "正式大纲已更新，现有图谱仍引用旧版大纲；请核对差异并发布新版本。"
        : "生成草稿后请核对节点和关系，只有正式发布后才可供学生使用。";
    }
  }
  steps.push(graphStep);

  steps.push({
    id: "assessment",
    title: "确认成绩构成",
    state: assessment
      ? assessment.sourcePublishedSyllabusStructureId !== null &&
        assessment.sourcePublishedSyllabusStructureId !== publishedSyllabus?.id
        ? "attention"
        : "complete"
      : publishedSyllabus
        ? "pending"
        : "blocked",
    detail: assessment
      ? assessment.sourcePublishedSyllabusStructureId !== null &&
        assessment.sourcePublishedSyllabusStructureId !== publishedSyllabus?.id
        ? "考核方案仍引用旧版大纲，请核对成绩项目、权重和课程目标后重新确认。"
        : `正式考核方案第 ${assessment.versionNumber} 版已发布，可进入成绩台账。`
      : "审核成绩项目与权重后发布考核方案，发布前须确保权重合计为 100%。",
    href: `${base}/assessment-scheme`,
    action: "查看考核方案",
  });

  const completedCount = steps.filter(
    (step) => step.state === "complete",
  ).length;
  const nextStep =
    input.status === "ARCHIVED"
      ? null
      : (steps.find(
          (step) => step.state === "attention" || step.state === "pending",
        ) ??
        steps.find((step) => step.state === "processing") ??
        null);
  return {
    steps,
    completedCount,
    totalCount: steps.length,
    percentage: Math.round((completedCount / steps.length) * 100),
    nextStep,
    archived: input.status === "ARCHIVED",
    activeStudentCount: input.activeStudentCount,
  };
}

export type CourseSetupProgress = ReturnType<typeof buildCourseSetupProgress>;
