import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true);
async function main() {
  const { prisma } = await import("../lib/prisma");
  const { HttpSandboxExecutor } =
    await import("../services/sandbox-executor/http-executor");
  const { normalizeProgramOutput } =
    await import("../services/programming-attempts/fingerprint");
  const { writeFile } = await import("node:fs/promises");
  const executor = new HttpSandboxExecutor();
  try {
    const q = await prisma.question.findFirstOrThrow({
      where: { title: "[导入题 04] 区间素数查找", deletedAt: null },
      include: {
        programmingConfigRevisions: {
          orderBy: [{ revisionNumber: "desc" }, { id: "desc" }],
          take: 1,
          include: {
            testCases: {
              where: { visibility: "PUBLIC" },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    });
    const revision = q.programmingConfigRevisions[0];
    if (!revision || revision.testCases.length < 3)
      throw new Error("Expected at least 3 public examples");
    const rows: Array<{
      input: string;
      expected: string;
      actual: string;
      passed: boolean;
      error: string;
    }> = [];
    async function run(sourceCode: string, stdin: string) {
      const receipt = await executor.submitExecution({
        requestId: crypto.randomUUID(),
        language: "PYTHON",
        sourceCode,
        stdin,
        networkAccess: false,
        limits: {
          cpuTimeMs: revision.cpuTimeMs,
          wallTimeMs: revision.wallTimeMs,
          memoryBytes: revision.memoryBytes,
          outputBytes: revision.outputBytes,
          processCount: revision.processCount,
        },
        metadata: { purpose: "FUTURE_JUDGE" },
      });
      try {
        for (let poll = 0; poll < 80; poll++) {
          const result = await executor.getExecution(receipt.executionId);
          if (result.status !== "QUEUED" && result.status !== "RUNNING")
            return result;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        throw new Error("Sandbox timeout");
      } finally {
        await executor
          .cancelExecution(receipt.executionId)
          .catch(() => undefined);
      }
    }
    for (const testCase of revision.testCases) {
      const result = await run(revision.standardCode, testCase.stdin);
      const passed =
        result.status === "SUCCEEDED" &&
        result.errorType === "NONE" &&
        normalizeProgramOutput(result.stdout) ===
          normalizeProgramOutput(testCase.expectedOutput);
      const row = {
        input: testCase.stdin.trim(),
        expected: testCase.expectedOutput.trim(),
        actual: result.stdout.trim(),
        passed,
        error: result.errorType,
      };
      rows.push(row);
      console.log(JSON.stringify(row));
    }
    const wrong = await run('print("WRONG")', revision.testCases[0].stdin);
    const wrongRejected =
      normalizeProgramOutput(wrong.stdout) !==
      normalizeProgramOutput(revision.testCases[0].expectedOutput);
    console.log(
      JSON.stringify({
        revision: revision.revisionNumber,
        publicCases: rows.length,
        passed: rows.filter((r) => r.passed).length,
        deliberatelyWrongAnswerRejected: wrongRejected,
      }),
    );
    const report = [
      "# 区间素数查找：公开样例实际运行结果",
      "",
      `配置版本：${revision.revisionNumber}；公开样例：${rows.length} 条。执行环境：项目配置的隔离沙箱。`,
      "",
      "| 输入 | 预期输出 | 实际输出 | 结果 |",
      "|---|---|---|---|",
      ...rows.map(
        (r) =>
          `| ${r.input} | ${r.expected} | ${r.actual} | ${r.passed ? "通过" : "失败"} |`,
      ),
      "",
      `故意错误的代码 print("WRONG")：${wrongRejected ? "被正确判定为答案错误" : "未通过反向验证"}。`,
      "",
      "本次直接验证最新配置与真实沙箱执行，未修改作业、学生答案或成绩；未进行浏览器端验收。",
    ].join("\n");
    await writeFile("tmp/prime-public-sample-verification.md", report, "utf8");
    if (rows.some((r) => !r.passed) || !wrongRejected)
      throw new Error("Verification failed");
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Verification failed");
  process.exitCode = 1;
});
