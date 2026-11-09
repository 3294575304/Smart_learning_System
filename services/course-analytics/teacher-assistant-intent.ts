import type { AssistantTopic } from "./teacher-assistant-catalog";

const topicPatterns: ReadonlyArray<readonly [AssistantTopic, RegExp]> = [
  ["GRADEBOOK", /成绩台账|台账|成绩工作簿|(?:导入|同步|导出).{0,5}成绩/u],
  ["QUALITY_REPORT", /教学质量|质量分析|质量报告|分析报告|课程报告|课程总结/u],
  ["ASSIGNMENT_ASSEMBLY", /(?:智能|自动)?组卷|创建作业|新建作业|布置作业/u],
  [
    "QUESTION_IMPORT",
    /(?:导入|上传).{0,8}(?:题库|题目|试题)|(?:题库|题目|试题).{0,6}(?:导入|上传)/u,
  ],
  ["EXAM_IMPORT", /(?:导入|上传).{0,8}试卷|试卷.{0,6}(?:导入|解析)/u],
  ["EXAM_ASSEMBLY", /(?:创建|新建|安排|布置).{0,6}(?:考试|期中|期末)/u],
  ["QUESTION_GENERATION", /出题|生成.{0,8}(?:候选题|题目)|候选题|变式题/u],
  [
    "ROSTER",
    /(?:导入|上传).{0,8}(?:学生|名单)|名单.{0,6}(?:导入|上传)|导入预览/u,
  ],
  [
    "GRADING",
    /待批改|批改|阅卷|成绩统计|公布成绩|发布成绩|作业成绩|(?:本班|这个班|学生).{0,8}成绩/u,
  ],
  ["ANALYTICS", /学情|达成度|成绩分布|课程评价/u],
  ["ATTENDANCE", /签到|考勤|出勤|缺勤/u],
  ["SURVEYS", /问卷|教学反馈/u],
  ["SYLLABUS", /教学大纲|大纲/u],
  ["KNOWLEDGE_GRAPH", /知识图谱|图谱|教学进度/u],
  ["NOTIFICATIONS", /通知|消息中心|提醒记录/u],
  ["ASSIGNMENTS", /作业|提交记录/u],
  ["EXAMS", /考试|测验|期中|期末|试卷/u],
  ["QUESTION_BANK", /题库|题目管理/u],
  ["CLASSROOMS", /班级管理|教学班管理|入班|学生名单|学生管理|认领/u],
  ["COURSES", /课程管理|我的课程|创建课程|开课/u],
  ["WORKBENCH", /工作台|待办|首页/u],
];

export function readAssistantIntent(text: string) {
  const normalized = text.normalize("NFKC");
  const mode =
    /为什么|怎么回事|失败|报错|打不开|看不到|没有|没收到|不显示|卡住|一直|找不到|不能|无法|不对|不行|排查/u.test(
      normalized,
    )
      ? "troubleshoot"
      : /在哪|入口|哪个页面|什么页面|打开|查看|带我|去哪里/u.test(normalized)
        ? "find"
        : "do";
  const topics = topicPatterns
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([topic]) => topic);
  const found = new Set(topics);
  if (found.has("GRADEBOOK") && found.has("QUALITY_REPORT")) {
    found.delete("GRADEBOOK");
    found.delete("QUALITY_REPORT");
    found.add("BOTH");
  }
  if (found.has("ASSIGNMENT_ASSEMBLY") || found.has("GRADING"))
    found.delete("ASSIGNMENTS");
  if (
    (found.has("GRADEBOOK") || found.has("BOTH")) &&
    !/批改|阅卷/u.test(normalized)
  )
    found.delete("GRADING");
  if (found.has("QUESTION_IMPORT") || found.has("QUESTION_GENERATION"))
    found.delete("QUESTION_BANK");
  if (found.has("EXAM_IMPORT") || found.has("EXAM_ASSEMBLY"))
    found.delete("EXAMS");
  if (found.has("ROSTER")) found.delete("CLASSROOMS");
  if (
    /考试|期中|期末/u.test(normalized) &&
    !/作业/u.test(normalized) &&
    found.has("ASSIGNMENT_ASSEMBLY")
  ) {
    found.delete("ASSIGNMENT_ASSEMBLY");
    found.delete("EXAMS");
    found.add("EXAM_ASSEMBLY");
  }
  return {
    topics: [...found].slice(0, 4),
    mode,
    followUp:
      /^(?:然后呢|接下来(?:怎么做)?|下一步(?:呢|怎么办)?|还是(?:不行|打不开|看不到)|接着呢)[？?。！!\s]*$/u.test(
        normalized,
      ),
  } as const;
}

// Raw questions may contain names, grades or credentials. Only these fixed
// platform vocabulary tokens may be sent to the intent model.
export function assistantIntentTerms(text: string) {
  return (
    text
      .normalize("NFKC")
      .match(
        /教学|课程|学生|名单|班级|小组|考核|成绩|分数|得分|结果|作答|提交|作业|考试|试卷|卷子|题|练习|评分|评阅|批阅|审核|上传|导出|导入|回收|统计|总结|报告|发布|开放|记录|提醒|消息|模板|文件|解析|出勤|进度|章节|知识点|材料|报名|选课|名单|上课|没看到|看不到|找|怎么|失败|无法|页面|在哪/gu,
      ) ?? []
  ).slice(0, 28);
}
