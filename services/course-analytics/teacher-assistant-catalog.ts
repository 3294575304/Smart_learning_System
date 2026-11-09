export const assistantTopics = [
  "WORKBENCH",
  "COURSES",
  "CLASSROOMS",
  "ASSIGNMENTS",
  "GRADING",
  "ASSIGNMENT_ASSEMBLY",
  "QUESTION_BANK",
  "QUESTION_IMPORT",
  "QUESTION_GENERATION",
  "EXAMS",
  "EXAM_ASSEMBLY",
  "EXAM_IMPORT",
  "GRADEBOOK",
  "QUALITY_REPORT",
  "BOTH",
  "ANALYTICS",
  "ROSTER",
  "ATTENDANCE",
  "SURVEYS",
  "SYLLABUS",
  "KNOWLEDGE_GRAPH",
  "NOTIFICATIONS",
] as const;

export type AssistantTopic = (typeof assistantTopics)[number];

type Entry = {
  label: string;
  path: string;
  course?: true;
  next: string;
  troubleshoot: string;
};

export const assistantCatalog: Record<AssistantTopic, Entry> = {
  WORKBENCH: {
    label: "教师工作台",
    path: "/teacher",
    next: "查看待办和最近的教学事项。",
    troubleshoot: "先在待办中找到相关课程或任务，核对状态后再打开详情。",
  },
  COURSES: {
    label: "课程管理",
    path: "/teacher/courses",
    next: "查看课程详情、教学班和课程资料。",
    troubleshoot: "核对课程学期与当前状态，再从课程详情进入对应功能。",
  },
  CLASSROOMS: {
    label: "班级管理",
    path: "/teacher/classrooms",
    next: "查看教学班、学生名单和入班状态。",
    troubleshoot: "核对班级是否属于正确的课程和学期，以及学生是否已认领账号。",
  },
  ASSIGNMENTS: {
    label: "作业管理",
    path: "/teacher/assignments",
    next: "按教学班查找作业，查看发布和提交情况。",
    troubleshoot: "先核对教学班、作业发布状态和开放时间，再查看学生提交记录。",
  },
  GRADING: {
    label: "成绩统计与批改",
    path: "/teacher/results",
    next: "按教学班找到作业的提交、批改和成绩记录。",
    troubleshoot:
      "先选教学班和作业，核对学生是否已提交、主观题是否待批改，以及成绩是否已公布。",
  },
  ASSIGNMENT_ASSEMBLY: {
    label: "作业智能组卷",
    path: "/teacher/assignments/new",
    next: "选择教学班后，在创建作业页面的选题区使用智能组卷。",
    troubleshoot: "先检查教学班和选题范围，再核对题库中符合范围的可用题目。",
  },
  QUESTION_BANK: {
    label: "题库管理",
    path: "/teacher/questions",
    next: "按课程分类筛选题目，打开详情核对内容和启用状态。",
    troubleshoot: "先核对课程分类、筛选条件和题目状态，再打开题目详情。",
  },
  QUESTION_IMPORT: {
    label: "批量导入题目",
    path: "/teacher/questions/import",
    next: "选择课程分类，上传文件后先检查导入预览。",
    troubleshoot: "核对文件格式和课程分类，再根据预览中的提示修正出错的题目。",
  },
  QUESTION_GENERATION: {
    label: "AI 出题",
    path: "/teacher/questions/ai",
    next: "选择课程和出题范围，审核生成的候选题。",
    troubleshoot:
      "打开最近任务查看失败原因。按图谱范围出题前，先检查该课程是否已有正式图谱。",
  },
  EXAMS: {
    label: "考试管理",
    path: "/teacher/exams",
    next: "查看考试、发布状态和作答时间。",
    troubleshoot:
      "核对考试是否发布、是否到开放时间，以及学生是否属于考试教学班。",
  },
  EXAM_ASSEMBLY: {
    label: "创建考试",
    path: "/teacher/exams/new",
    next: "选择课程、考试类型和教学班，再进入选题和组卷。",
    troubleshoot:
      "先核对考试课程和考查范围，再检查题库中可用于本次考试的题目。",
  },
  EXAM_IMPORT: {
    label: "试卷导入",
    path: "/teacher/exams/import",
    next: "上传试卷并核对题干、答案、图片和分值。",
    troubleshoot: "先核对文件格式，再在试卷草稿中检查缺少的答案、图片或分值。",
  },
  GRADEBOOK: {
    label: "成绩台账",
    path: "/gradebook",
    course: true,
    next: "选择教学班，查看台账和正式成绩版本。",
    troubleshoot: "先核对考核方案和班级，再检查成绩是否同步或发布。",
  },
  QUALITY_REPORT: {
    label: "教学质量分析",
    path: "/quality-report",
    course: true,
    next: "查看报告版本、生成进度和审核状态。",
    troubleshoot: "先核对正式台账和当前报告的生成或审核状态。",
  },
  BOTH: {
    label: "成绩台账和教学质量分析",
    path: "/analytics",
    course: true,
    next: "按当前班级的进度处理考核方案、台账和报告。",
    troubleshoot: "先核对考核方案和台账发布状态，再查看对应报告版本。",
  },
  ANALYTICS: {
    label: "课程学情",
    path: "/analytics",
    course: true,
    next: "按教学班查看成绩分布、提交情况和课程目标达成度。",
    troubleshoot:
      "核对班级和统计范围，再确认作业成绩已公布或台账已有正式版本。",
  },
  ROSTER: {
    label: "导入学生名单",
    path: "/students/import",
    course: true,
    next: "下载名单模板，上传后核对字段和导入预览。",
    troubleshoot: "打开导入预览，重点检查学号、表头、教学班和错误行。",
  },
  ATTENDANCE: {
    label: "课堂签到",
    path: "/check-in",
    course: true,
    next: "选择教学班，查看或发起课堂签到。",
    troubleshoot: "核对签到时段和教学班，再查看签到状态或进行纠正。",
  },
  SURVEYS: {
    label: "结课问卷",
    path: "/surveys",
    course: true,
    next: "查看问卷草稿、开放时间和回收情况。",
    troubleshoot: "核对发布班级、开放时间和截止时间，再查看回收状态。",
  },
  SYLLABUS: {
    label: "教学大纲",
    path: "/syllabus",
    course: true,
    next: "上传大纲或查看解析任务、审核草稿和正式版本。",
    troubleshoot: "检查上传文件是否为可提取文字的 PDF，再查看解析任务的状态。",
  },
  KNOWLEDGE_GRAPH: {
    label: "知识图谱",
    path: "/knowledge-graph",
    course: true,
    next: "查看图谱草稿和正式版本，核对课程知识点。",
    troubleshoot: "先检查教学大纲是否已正式发布，再查看图谱生成和审核状态。",
  },
  NOTIFICATIONS: {
    label: "通知中心",
    path: "/notifications",
    next: "查看报告结果、作业和课程相关通知。",
    troubleshoot: "查看全部通知并检查已读筛选，再打开对应通知详情。",
  },
};

export const assistantStarters = [
  { label: "找页面", text: "成绩台账在哪里？" },
  { label: "办事项", text: "帮我给这个班智能组卷" },
  { label: "排查问题", text: "为什么学生看不到作业？" },
] as const;
