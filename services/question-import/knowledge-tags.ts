const TAG_RULES: Array<{ tag: string; patterns: RegExp[] }> = [
  {
    tag: "输入输出",
    patterns: [/\binput\s*\(/iu, /\bprint\s*\(/iu, /输入|输出/u],
  },
  {
    tag: "数据类型与运算",
    patterns: [/数据类型|类型转换|运算符|表达式|divmod|\bint\b|\bfloat\b/iu],
  },
  {
    tag: "字符串",
    patterns: [/字符串|\bstr\b|format|切片|字符编码|ord\s*\(|chr\s*\(/iu],
  },
  { tag: "列表", patterns: [/列表|\blist\b|append|extend|insert|pop\s*\(/iu] },
  { tag: "元组", patterns: [/元组|\btuple\b/iu] },
  {
    tag: "字典",
    patterns: [/字典|\bdict\b|keys\s*\(|values\s*\(|items\s*\(/iu],
  },
  { tag: "集合", patterns: [/集合|\bset\b|交集|并集|差集/iu] },
  { tag: "条件分支", patterns: [/条件|分支|\bif\b|\belif\b|\belse\b/iu] },
  {
    tag: "循环",
    patterns: [/循环|\bfor\b|\bwhile\b|\bbreak\b|\bcontinue\b|range\s*\(/iu],
  },
  {
    tag: "函数与参数",
    patterns: [/函数|参数|返回值|\bdef\b|\breturn\b|lambda/iu],
  },
  {
    tag: "模块与包",
    patterns: [/模块|第三方库|\bimport\b|\bfrom\b.+\bimport\b|pip/iu],
  },
  {
    tag: "异常处理",
    patterns: [/异常|\btry\b|\bexcept\b|\bfinally\b|raise/iu],
  },
  {
    tag: "文件操作",
    patterns: [/文件|\bopen\s*\(|read\s*\(|write\s*\(|with\s+open/iu],
  },
  {
    tag: "面向对象",
    patterns: [/面向对象|类与对象|\bclass\b|继承|封装|多态|__init__/iu],
  },
  { tag: "正则表达式", patterns: [/正则|re\.|match\s*\(|search\s*\(/iu] },
  { tag: "数据分析", patterns: [/numpy|pandas|dataframe|数据分析/iu] },
  { tag: "数据可视化", patterns: [/matplotlib|pyplot|绘图|可视化/iu] },
  { tag: "算法与复杂度", patterns: [/算法|复杂度|排序|查找|递归|二分/iu] },
  {
    tag: "Python环境",
    patterns: [/安装|开发环境|jupyter|pycharm|解释器|版本/iu],
  },
];

function cleanTag(value: string): string | null {
  const cleaned = value.replace(/^#+/u, "").replace(/\s+/gu, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 30);
}

export function inferQuestionKnowledgeTags(
  text: string,
  explicitTags: string[] = [],
): string[] {
  const matched = TAG_RULES.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(text)),
  ).map((rule) => rule.tag);
  const combined = [...explicitTags, ...matched];
  if (combined.length === 0 && /python|程序|代码|编程/iu.test(text)) {
    combined.push("Python基础");
  }
  return [
    ...new Map(
      combined
        .map(cleanTag)
        .filter((tag): tag is string => Boolean(tag))
        .map((tag) => [tag.toLocaleLowerCase(), tag]),
    ).values(),
  ].slice(0, 6);
}
