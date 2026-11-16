import React from "react";
import { QuestionText } from "@/components/assignments/question-text";
import {
  ProgrammingSample,
  type PublicProgrammingSample,
} from "./programming-sample";
import { programmingStatementText } from "@/services/programming-questions/statement";

export function ProgrammingStatement({
  text,
  sample,
}: {
  text: string;
  sample?: PublicProgrammingSample | null;
}) {
  const statement = sample ? programmingStatementText(text) : text;
  return (
    <div className="min-w-0">
      {!/题目描述|问题描述/u.test(statement) ? (
        <h3 className="mb-3 text-lg font-bold text-slate-900">题目描述</h3>
      ) : null}
      <QuestionText text={statement} />
      {sample ? <ProgrammingSample sample={sample} /> : null}
    </div>
  );
}
