import { QuestionText } from "@/components/assignments/question-text";
import { programmingStatementText } from "@/services/programming-questions/statement";

import {
  ProgrammingSample,
  type PublicProgrammingSample,
} from "./programming-sample";

/**
 * 编程题题面。
 *
 * 小节标题由 `QuestionText` 统一渲染（与其它题型同一套规则），这里只做两件事：
 * 1. 题干没有「题目描述」时补一个标题，和其他题型的观感对齐；
 * 2. 有结构化样例时，剔除题干里重复的「公开样例输入 / 样例输出」小节。
 */
export function ProgrammingStatement({
  text,
  sample,
}: {
  text: string;
  sample?: PublicProgrammingSample | null;
}) {
  const statement = sample ? programmingStatementText(text) : text;
  const hasDescription = /题目描述|问题描述/u.test(statement);

  return (
    <div className="min-w-0">
      {hasDescription ? null : (
        <h3 className="text-ink mb-3 text-lg font-bold">题目描述</h3>
      )}
      <QuestionText text={statement} />
      {sample ? <ProgrammingSample sample={sample} /> : null}
    </div>
  );
}
