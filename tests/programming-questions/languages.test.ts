import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PROGRAMMING_LANGUAGES,
  programmingRuntimeLimits,
} from "@/lib/programming-language";
import { RUNTIMES } from "@/services/sandbox-executor-server/src/languages";
import { validateExecutionRequest } from "@/services/sandbox-executor-server/src/contract";
import { classifySandboxOutcome } from "@/services/sandbox-executor-server/src/runner";
import { sandboxExecutionRequestSchema } from "@/services/sandbox-executor/schemas";
import { studentCaseDetails } from "@/services/programming-attempts/student-results";
import { ProgrammingTestResults } from "@/components/programming/test-results";
import { ProgrammingSample } from "@/components/programming/programming-sample";
import { ProgrammingEditor } from "@/components/programming/code-editor";
import { QuestionText } from "@/components/assignments/question-text";
import { questionTextBlocks } from "@/services/assignments/question-text";
import { programmingCasesForSave } from "@/services/programming-questions/edit-payload";
import { practiceDraftSnapshotSchema } from "@/services/practice-sets/draft-schemas";
import { parsePracticeDraft } from "@/services/practice-sets/draft-storage";
import { parseAssignmentLocalDraft } from "@/components/assignments/local-draft";
import { programmingStatementText } from "@/services/programming-questions/statement";

const limits = {
  cpuTimeMs: 1000,
  wallTimeMs: 2000,
  memoryBytes: 67108864,
  outputBytes: 16384,
  processCount: 2,
};
const request = {
  requestId: "1eb5fcd2-82d6-42eb-8905-93c9ce642eb7",
  sourceCode: "untrusted source",
  stdin: "",
  networkAccess: false,
  limits,
  metadata: { purpose: "FUTURE_JUDGE" },
};

test("all five languages agree across application and isolated executor contracts", () => {
  for (const language of PROGRAMMING_LANGUAGES) {
    assert.ok(
      sandboxExecutionRequestSchema.safeParse({ ...request, language }).success,
    );
    assert.ok(validateExecutionRequest({ ...request, language }));
    assert.ok(RUNTIMES[language]);
    assert.equal(
      validateExecutionRequest({ ...request, language, networkAccess: true }),
      null,
    );
  }
  for (const language of ["BASH", "python; rm", "", null, ["C"]]) {
    assert.equal(
      sandboxExecutionRequestSchema.safeParse({ ...request, language }).success,
      false,
    );
    assert.equal(validateExecutionRequest({ ...request, language }), null);
  }
});

test("compiler routing uses fixed commands, preserves Python and bounds VM allowance", () => {
  assert.equal(RUNTIMES.PYTHON.entrypoint, "python3");
  assert.match(RUNTIMES.C.args.join(" "), /gcc -std=c17/u);
  assert.match(RUNTIMES.CPP.args.join(" "), /g\+\+ -std=c\+\+17/u);
  assert.match(RUNTIMES.JAVA.args.join(" "), /javac[\s\S]*exec java/u);
  assert.equal(RUNTIMES.JAVASCRIPT.entrypoint, "node");
  assert.deepEqual(programmingRuntimeLimits("PYTHON", limits), limits);
  const java = programmingRuntimeLimits("JAVA", limits);
  assert.equal(java.memoryBytes, 256 * 1024 * 1024);
  assert.equal(java.wallTimeMs, 10000);
  assert.equal(java.processCount, 32);
});

test("compile failures and missing compilers cannot become successful execution", () => {
  const outcome = {
    cancelled: false,
    timedOut: false,
    outputLimited: false,
    oomKilled: false,
    peakProcessCount: null,
    processLimit: 32,
  };
  assert.equal(
    classifySandboxOutcome({
      ...outcome,
      exitCode: 65,
      stderr: "COMPILATION_ERROR",
    }),
    "SYNTAX_ERROR",
  );
  assert.equal(
    classifySandboxOutcome({
      ...outcome,
      exitCode: 127,
      stderr: "gcc: not found",
    }),
    "INTERNAL_ERROR",
  );
  assert.equal(
    classifySandboxOutcome({
      ...outcome,
      exitCode: 1,
      stderr: "Error occurred during initialization of VM",
    }),
    "INTERNAL_ERROR",
  );
  assert.equal(
    classifySandboxOutcome({
      ...outcome,
      exitCode: 65,
      stderr: "COMPILATION_ERROR",
      timedOut: true,
    }),
    "TIME_LIMIT",
  );
});

test("hidden and additional historical public cases expose verdicts and metrics only", () => {
  const usage = {
    cpuTimeMs: null,
    wallTimeMs: 4,
    peakMemoryBytes: null,
    outputBytes: 10,
    processCount: null,
  };
  const hidden = studentCaseDetails(
    {
      id: "hidden",
      resourceUsage: usage,
      stdout: "secret input echoed",
      stderr: "secret diagnostic",
    },
    "public",
    true,
  );
  assert.equal(JSON.stringify(hidden).includes("secret"), false);
  assert.deepEqual(hidden.resourceUsage, usage);
  const first = studentCaseDetails(
    { id: "public", resourceUsage: null, stdout: "ok", stderr: "" },
    "public",
    true,
  );
  assert.equal(first.stdout, "ok");
  assert.equal(
    studentCaseDetails(
      { id: "public", resourceUsage: {}, stdout: "secret", stderr: "" },
      "public",
      false,
    ).stdout,
    undefined,
  );
});

test("case cards render AC, WA, actual metrics and missing measurements distinctly", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProgrammingTestResults, {
      cases: [
        {
          index: 1,
          passed: true,
          errorType: "NONE",
          safeErrorSummary: null,
          resourceUsage: { wallTimeMs: 4, peakMemoryBytes: 90112 },
        },
        {
          index: 2,
          passed: false,
          errorType: "WRONG_ANSWER",
          safeErrorSummary: "输出不匹配",
          resourceUsage: { wallTimeMs: 6, peakMemoryBytes: null },
        },
      ],
    }),
  );
  assert.match(html, /AC/u);
  assert.match(html, /WA/u);
  assert.match(html, /4ms \/ 88.0KB/u);
  assert.match(html, /6ms \/ —/u);
  assert.match(html, /测试点信息/u);
});

test("sample input and output each have a copy control and escaped content", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProgrammingSample, {
      sample: { stdin: "6 6 3 3", expectedOutput: "<script>6</script>" },
    }),
  );
  assert.equal((html.match(/<button/g) ?? []).length, 2);
  assert.match(html, /复制样例输入/u);
  assert.match(html, /复制样例输出/u);
  assert.doesNotMatch(html, /<script>/u);
});

test("statement headings are semantic larger bold text without treating Python comments as titles", () => {
  const text =
    "# 题目描述\n计算路径数\n**输入格式**\n一行整数\n【输出格式】\n一个整数\n说明/提示\n```python\n# 输入格式\nprint(1)\n```";
  assert.equal(
    questionTextBlocks(text).filter((block) => block.heading).length,
    4,
  );
  const html = renderToStaticMarkup(
    React.createElement(QuestionText, { text }),
  );
  assert.equal((html.match(/<h3/g) ?? []).length, 4);
  assert.match(html, /text-lg/u);
  assert.match(html, /font-bold/u);
  assert.match(html, /# 输入格式\nprint\(1\)/u);
});

test("editor selector contains five actual language options", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProgrammingEditor, {
      value: "",
      language: "CPP",
      onChange: () => undefined,
    }),
  );
  assert.equal((html.match(/<option/g) ?? []).length, 5);
  assert.match(html, /G\+\+ · C\+\+17/u);
});

test("new revision keeps one public sample, all other cases and scores are preserved", () => {
  const cases = ["PUBLIC", "PUBLIC", "HIDDEN"].map((visibility, index) => ({
    visibility: visibility as "PUBLIC" | "HIDDEN",
    name: `${index}`,
    stdin: `${index}`,
    expectedOutput: `${index * 2}`,
    points: 2,
    sortOrder: index + 1,
  }));
  const normalized = programmingCasesForSave(cases);
  assert.deepEqual(
    normalized.map((item) => item.visibility),
    ["PUBLIC", "HIDDEN", "HIDDEN"],
  );
  assert.deepEqual(
    cases.map((item) => item.visibility),
    ["PUBLIC", "PUBLIC", "HIDDEN"],
  );
  assert.deepEqual(
    normalized.map((item) => item.stdin),
    cases.map((item) => item.stdin),
  );
});

test("language survives account and local drafts while old code drafts stay compatible", () => {
  const id = "clx00000000000000000000001";
  const draft = {
    kind: "CODE" as const,
    value: "int main() {}",
    language: "CPP" as const,
  };
  assert.deepEqual(
    practiceDraftSnapshotSchema.parse({ current: id, drafts: { [id]: draft } })
      .drafts[id],
    draft,
  );
  assert.deepEqual(
    parsePracticeDraft(
      { at: 100, current: id, drafts: { [id]: draft }, keys: {} },
      [id],
      100,
    )?.drafts[id],
    draft,
  );
  assert.deepEqual(
    parseAssignmentLocalDraft(
      JSON.stringify({ answers: { [id]: draft } }),
      [{ id, type: "PYTHON_PROGRAMMING", options: [] }],
      { [id]: { kind: "CODE", value: "" } },
    )?.answers[id],
    draft,
  );
});

test("imported sample sections are replaced in the view without discarding constraints or code", () => {
  const source =
    "题目描述\n求和\n输入输出样例\n输入 #1\n1 2\n输出 #1\n3\n输入 #2\n4 5\n输出 #2\n9\n说明/提示\n整数范围\n```python\n# 输入格式\n```";
  const view = programmingStatementText(source);
  assert.doesNotMatch(view, /1 2|4 5/u);
  assert.match(view, /说明\/提示\n整数范围/u);
  assert.match(view, /# 输入格式/u);
  const inline = questionTextBlocks("输入格式：一行整数\n输出格式：一个整数");
  assert.equal(inline.filter((block) => block.heading).length, 2);
  assert.ok(inline.some((block) => block.text === "一行整数"));
});
