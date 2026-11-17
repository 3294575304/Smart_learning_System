import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd(), true);
async function main() {
  const { prisma } = await import("../lib/prisma");
  const { createProgrammingConfigRevision } =
    await import("../services/programming-questions/service");
  const { verifyProgrammingCandidate } =
    await import("../services/ai-question-generation/verify-programming");
  try {
    const questions = await prisma.question.findMany({
      where: {
        title: "[导入题 04] 区间素数查找",
        deletedAt: null,
        type: "PYTHON_PROGRAMMING",
      },
      include: {
        programmingConfigRevisions: {
          orderBy: { revisionNumber: "desc" },
          take: 1,
          include: { testCases: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    if (questions.length !== 1)
      throw new Error("Expected exactly one matching question");
    const question = questions[0],
      revision = question.programmingConfigRevisions[0];
    if (!revision) throw new Error("Missing configuration");
    if (
      revision.testCases.filter((c) => c.visibility === "PUBLIC").length >= 3
    ) {
      console.log("Already contains at least 3 public examples");
      return;
    }
    const original = revision.testCases.find((c) => c.visibility === "PUBLIC");
    if (!original) throw new Error("Missing original public example");
    const cents = Math.round(original.points.toNumber() * 100);
    if (cents < 3) throw new Error("Insufficient public score to split");
    const share = Math.floor(cents / 3);
    const maxOrder = Math.max(...revision.testCases.map((c) => c.sortOrder));
    const testCases = revision.testCases.map((c) => ({
      visibility: c.visibility,
      name: c.name,
      stdin: c.stdin,
      expectedOutput: c.expectedOutput,
      points:
        c.id === original.id ? (cents - share * 2) / 100 : c.points.toNumber(),
      sortOrder: c.sortOrder,
    }));
    const additional = [
      {
        name: "公开样例：包含最小素数",
        stdin: "2 10\n",
        expectedOutput: "2 3 5 7\n",
      },
      {
        name: "公开样例：非素数端点",
        stdin: "10 20\n",
        expectedOutput: "11 13 17 19\n",
      },
    ];
    if (
      additional.some((c) =>
        revision.testCases.some((old) => old.stdin.trim() === c.stdin.trim()),
      )
    )
      throw new Error("Example input already exists; review required");
    testCases.push(
      ...additional.map((c, i) => ({
        ...c,
        visibility: "PUBLIC" as const,
        points: share / 100,
        sortOrder: maxOrder + i + 1,
      })),
    );
    const input = {
      standardCode: revision.standardCode,
      starterCode: revision.starterCode,
      totalPoints: revision.totalPoints.toNumber(),
      limits: {
        cpuTimeMs: revision.cpuTimeMs,
        wallTimeMs: revision.wallTimeMs,
        memoryBytes: revision.memoryBytes,
        outputBytes: revision.outputBytes,
        processCount: revision.processCount,
      },
      testCases,
    };
    await verifyProgrammingCandidate(input);
    const saved = await createProgrammingConfigRevision(
      revision.createdById,
      question.id,
      input,
      { ipAddress: null, userAgent: "Public example supplementation" },
    );
    console.log(
      JSON.stringify({
        title: question.title,
        revision: saved.revisionNumber,
        publicCases: saved.testCases.filter((c) => c.visibility === "PUBLIC")
          .length,
        hiddenCases: saved.testCases.filter((c) => c.visibility === "HIDDEN")
          .length,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Supplement failed");
  process.exitCode = 1;
});
