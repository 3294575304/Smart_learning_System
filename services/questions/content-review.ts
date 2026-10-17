/** Flag source artefacts for human review; never silently strip question text. */
export function questionContentReview(content: string): string[] {
  const warnings: string[] = [];
  if (
    /(?:^|\n)\s*(?:页眉|页脚|第\s*\d+\s*页(?:\s*[\/／共]\s*\d+\s*页?)?)\s*$/mu.test(
      content,
    )
  )
    warnings.push("题干可能混入文档页眉、页脚或页码，请核对原文");
  if (/(?:^|\n)\s*(?:参考答案|标准答案|答案解析)\s*[：:]/mu.test(content))
    warnings.push("题干可能包含答案区，请将答案与解析放入对应字段");
  return warnings;
}
