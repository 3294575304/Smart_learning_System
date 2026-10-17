/** Topic checks are review aids, not a claim that the narrative is factually correct. */
export function courseSummaryCoverage(text: string) {
  return [
    {
      label: "教学内容、授课方式与目标支撑",
      covered:
        /教学内容|授课内容|章节|实验项目/u.test(text) &&
        /授课|教学方法|教学方式|讲授|教学安排/u.test(text) &&
        /目标|支撑/u.test(text),
    },
    {
      label: "考核与大纲、目标及评分标准",
      covered:
        /考核|考试/u.test(text) &&
        /大纲/u.test(text) &&
        /评分|评价标准/u.test(text) &&
        /目标/u.test(text),
    },
    {
      label: "课程目标达成情况",
      covered:
        /目标/u.test(text) &&
        /达成|达到|未达到|暂无|缺少|未提供|待补充/u.test(text),
    },
    {
      label: "目标达成与学生评价比较",
      covered:
        /学生评价|学生自评|问卷/u.test(text) &&
        /比较|对照|一致|差异|不能比较|无法比较|暂不能|不足|未提供|缺少/u.test(
          text,
        ),
    },
  ];
}
