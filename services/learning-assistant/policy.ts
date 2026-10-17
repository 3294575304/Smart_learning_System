import { scrubSensitiveText } from "@/services/ai/privacy";
import type { LearningAssistantOutput } from "./schemas";

export const OUT_OF_SCOPE_REPLY =
  "该方向暂时还未开发。我目前只支持本课程知识点、章节答疑与学习建议，请选择课程内容后提问。";
export const SAFE_REPLY =
  "这个问题涉及安全、隐私或不适宜的内容，我无法提供相关操作指导。可以继续讨论本课程的知识点，或学习如何保护个人信息与遵守安全规范。";

// 高置信度规则用于在外发前拦截；语义范围与隐晦风险仍由 Provider 的独立输出状态约束。
export function learningRequestRestriction(
  text: string,
): LearningAssistantOutput | null {
  const normalized = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u200b-\u200f]/gu, "");
  const selfHarm = /自杀|自残|结束生命|不想活|suicid|self.?harm/u.test(
    normalized,
  );
  const unsafe =
    /窃取|盗取|偷取|破解密码|绕过.{0,8}(认证|登录|权限)|制作.{0,8}(炸弹|毒品)|攻击.{0,12}(网站|服务器|同学)|恶意软件|勒索软件|色情|开盒|人肉搜索|偷看.{0,8}(成绩|密码)|steal.{0,15}(password|credential)|ransomware/u.test(
      normalized,
    );
  const injection =
    /忽略.{0,8}(指令|规则|限制)|泄露.{0,8}(提示词|密钥)|系统提示词|ignore.{0,15}(instructions|rules)|systemprompt/u.test(
      normalized,
    );
  if (selfHarm || unsafe || injection)
    return {
      status: "SAFE_REDIRECT",
      answer: selfHarm
        ? "听起来你可能正在承受很大的压力。你的安全比学习更重要，请先联系你信任的人陪伴你；如果现在有伤害自己的危险，请立即寻求当地紧急帮助。本助手无法提供伤害自己的方法。"
        : SAFE_REPLY,
      learningObservation: "",
      advice: [],
    };
  if (
    /天气预报|股票推荐|彩票|赌博|八字|星座运势|医疗诊断|投资建议|weatherforecast|stockpick/u.test(
      normalized,
    )
  )
    return {
      status: "OUT_OF_SCOPE",
      answer: OUT_OF_SCOPE_REPLY,
      learningObservation: "",
      advice: [],
    };
  return null;
}

export function masteryLabel(state: string, score: number | null): string {
  if (state !== "CONCLUSIVE" || score === null) return "暂未评估";
  return score >= 80 ? "熟练掌握" : score >= 60 ? "基本掌握" : "需要巩固";
}

export function summarizeTopicMastery(
  entries: Array<{
    name: string;
    evidenceState: string;
    masteryScore: number | null;
  }>,
  scope: "本章" | "课程" = "本章",
): string {
  if (!entries.length)
    return "当前知识点暂未评估，完成作业或练习后会更新掌握情况。";
  if (entries.length === 1)
    return `${entries[0]?.name}：${masteryLabel(entries[0]?.evidenceState ?? "", entries[0]?.masteryScore ?? null)}。这是根据已评分作答整理的学习状态，不会因一次提问直接改变。`;
  const grouped = new Map<string, string[]>();
  for (const entry of entries) {
    const label = masteryLabel(entry.evidenceState, entry.masteryScore);
    grouped.set(label, [...(grouped.get(label) ?? []), entry.name]);
  }
  return `${scope}学习情况：${[...grouped].map(([label, names]) => `${label} ${names.length} 个知识点${label === "需要巩固" ? `（${names.slice(0, 3).join("、")}${names.length > 3 ? "等" : ""}）` : ""}`).join("；")}。尚未评估的内容可以通过练习进一步了解。`;
}

export function sanitizeLearningText(
  text: string,
  privateValues: readonly string[] = [],
): string {
  const redacted = text.replace(
    /(?:sk-[a-zA-Z0-9_-]{12,}|(?:api[_-]?key|password|密码|密钥)\s*[:=：]\s*["']?[^\s"']{4,})/giu,
    "[已隐藏凭据]",
  );
  return redacted
    .split("\n")
    .map((line) => {
      const indentation = line.match(/^[ \t]*/u)?.[0] ?? "";
      return indentation + scrubSensitiveText(line, privateValues);
    })
    .join("\n")
    .trim()
    .slice(0, 4000);
}
