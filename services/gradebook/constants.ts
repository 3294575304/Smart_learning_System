export const COURSE_GRADE_RULE_VERSION = "course-grade-v1";
export const GRADE_TEMPLATE_VERSION = "python-final-grade-template-v1";
export const GRADE_TEMPLATE_MAX_BYTES = 5 * 1024 * 1024;

export const GRADE_TEMPLATE_HEADERS = [
  "学年学期(文本)",
  "课程号(文本)",
  "学号(文本)",
  "姓名(文本)",
  "班级(文本)",
  "成绩标识(文本)",
  "期末成绩(100.0%)(文本)",
  "特殊原因(文本)",
  "等级成绩类型(文本)",
  "备注(文本)",
] as const;
