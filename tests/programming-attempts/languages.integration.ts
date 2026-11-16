import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { PROGRAMMING_LANGUAGES } from "@/lib/programming-language";
import {
  getStudentSubmissionDraft,
  saveStudentAnswers,
} from "@/services/assignments/service";
import {
  createPublicProgrammingRun,
  createFormalProgrammingAttempt,
  getProgrammingAttemptPayload,
} from "@/services/programming-attempts/service";
import { assertIsolatedIntegrationEnvironment } from "../integration/database";

assertIsolatedIntegrationEnvironment("HTTP_INTEGRATION_SCHEMA");

async function main() {
  const teacher = await prisma.user.create({
    data: { role: "TEACHER", passwordHash: "test-only-disabled-login" },
  });
  const student = await prisma.user.create({
    data: { role: "STUDENT", passwordHash: "test-only-disabled-login" },
  });
  const outsider = await prisma.user.create({
    data: { role: "STUDENT", passwordHash: "test-only-disabled-login" },
  });
  const classroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      name: "Language integration",
      joinCode: "LANGTEST",
      memberships: { create: { studentId: student.id } },
    },
  });
  const question = await prisma.question.create({
    data: {
      creatorId: teacher.id,
      title: "Echo",
      content: "Echo stdin",
      type: "PYTHON_PROGRAMMING",
      status: "ACTIVE",
      explanation: "Echo the input",
      gradingConfig: { kind: "PROGRAMMING" },
    },
  });
  const config = await prisma.programmingQuestionConfigRevision.create({
    data: {
      questionId: question.id,
      revisionNumber: 1,
      standardCode: "print(input())",
      starterCode: "",
      totalPoints: 10,
      cpuTimeMs: 1000,
      wallTimeMs: 2000,
      memoryBytes: 67108864,
      outputBytes: 16384,
      processCount: 2,
      testCasesHash: "a".repeat(64),
      configurationHash: "b".repeat(64),
      executorRuleVersion: "python-basic-judge-v1",
      createdById: teacher.id,
      testCases: {
        create: [
          {
            name: "公开样例",
            visibility: "PUBLIC",
            stdin: "public",
            expectedOutput: "public",
            points: 2,
            sortOrder: 1,
          },
          {
            name: "历史第二公开样例",
            visibility: "PUBLIC",
            stdin: "old-extra",
            expectedOutput: "old-extra",
            points: 2,
            sortOrder: 2,
          },
          {
            name: "隐藏用例",
            visibility: "HIDDEN",
            stdin: "hidden-secret",
            expectedOutput: "hidden-secret",
            points: 6,
            sortOrder: 3,
          },
        ],
      },
    },
  });
  assert.equal(config.language, "PYTHON");
  const assignment = await prisma.assignment.create({
    data: {
      classroomId: classroom.id,
      teacherId: teacher.id,
      title: "Language work",
      status: "PUBLISHED",
      publishedAt: new Date(),
      dueAt: new Date(Date.now() + 3600_000),
      totalPoints: 10,
    },
  });
  const frozen = await prisma.assignmentQuestion.create({
    data: {
      assignmentId: assignment.id,
      questionId: question.id,
      sortOrder: 1,
      points: 10,
      titleSnapshot: "Echo",
      contentSnapshot: "Echo stdin",
      typeSnapshot: "PYTHON_PROGRAMMING",
      explanationSnapshot: "Echo input",
      gradingConfigSnapshot: { kind: "PROGRAMMING" },
      programmingConfigSnapshot: {
        create: {
          configRevisionId: config.id,
          configRevisionNumber: 1,
          configurationHash: config.configurationHash,
          testCasesHash: config.testCasesHash,
          executorRuleVersion: config.executorRuleVersion,
          cpuTimeMs: config.cpuTimeMs,
          wallTimeMs: config.wallTimeMs,
          memoryBytes: config.memoryBytes,
          outputBytes: config.outputBytes,
          processCount: config.processCount,
        },
      },
    },
  });
  const submission = await prisma.submission.create({
    data: {
      assignmentId: assignment.id,
      studentId: student.id,
      idempotencyKey: randomUUID(),
    },
  });
  const draft = await getStudentSubmissionDraft(student.id, submission.id);
  assert.equal(draft.questions[0]?.programming?.testCases.length, 1);
  assert.equal(JSON.stringify(draft).includes("hidden-secret"), false);
  assert.equal(JSON.stringify(draft).includes("old-extra"), false);

  let version = 0;
  for (const language of PROGRAMMING_LANGUAGES) {
    const sourceCode = `source for ${language}`;
    await saveStudentAnswers(student.id, submission.id, {
      version,
      answers: [
        {
          assignmentQuestionId: frozen.id,
          kind: "CODE",
          value: sourceCode,
          language,
        },
      ],
    });
    version += 1;
    const saved = await getStudentSubmissionDraft(student.id, submission.id);
    assert.equal(saved.answers[0]?.codeLanguage, language);
    assert.equal(saved.answers[0]?.textAnswer, sourceCode);
    const key = randomUUID();
    const input = {
      assignmentQuestionId: frozen.id,
      sourceCode,
      language,
      idempotencyKey: key,
    };
    const run = await createPublicProgrammingRun(
      student.id,
      submission.id,
      input,
    );
    assert.equal(
      (await createPublicProgrammingRun(student.id, submission.id, input))
        .attemptId,
      run.attemptId,
    );
    await assert.rejects(
      createPublicProgrammingRun(student.id, submission.id, {
        ...input,
        language: language === "C" ? "JAVA" : "C",
      }),
      /幂等键/u,
    );
    const payload = await getProgrammingAttemptPayload(run.attemptId);
    assert.equal(payload.language, language);
    assert.equal(payload.sourceCode, sourceCode);
    assert.equal(payload.testCases.length, 3);
    const answer = await prisma.studentAnswer.findUniqueOrThrow({
      where: {
        submissionId_assignmentQuestionId: {
          submissionId: submission.id,
          assignmentQuestionId: frozen.id,
        },
      },
    });
    const formal = await prisma.$transaction((tx) =>
      createFormalProgrammingAttempt(tx, {
        studentAnswerId: answer.id,
        assignmentQuestionId: frozen.id,
        studentId: student.id,
        sourceCode: answer.textAnswer ?? "",
        language: answer.codeLanguage,
        courseId: null,
      }),
    );
    assert.equal(
      (await getProgrammingAttemptPayload(formal.id)).language,
      language,
    );
    console.log(
      `${language}: draft + non-scoring run + formal job + idempotency passed`,
    );
  }
  await assert.rejects(
    createPublicProgrammingRun(outsider.id, submission.id, {
      assignmentQuestionId: frozen.id,
      sourceCode: "x",
      language: "C",
      idempotencyKey: randomUUID(),
    }),
    /作答记录不存在/u,
  );
  await assert.rejects(
    createPublicProgrammingRun(student.id, submission.id, {
      assignmentQuestionId: frozen.id,
      sourceCode: "x",
      language: "BASH",
      idempotencyKey: randomUUID(),
    }),
  );
  await prisma.assignment.update({
    where: { id: assignment.id },
    data: { status: "ARCHIVED" },
  });
  await assert.rejects(
    createPublicProgrammingRun(student.id, submission.id, {
      assignmentQuestionId: frozen.id,
      sourceCode: "x",
      language: "JAVA",
      idempotencyKey: randomUUID(),
    }),
    /作答记录不存在/u,
  );
  assert.equal(
    (
      await prisma.programmingQuestionConfigRevision.findUniqueOrThrow({
        where: { id: config.id },
      })
    ).language,
    "PYTHON",
  );
  console.log(
    "Single sample isolation, ownership, invalid language, archived-state denial and legacy Python defaults passed.",
  );
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Integration failed",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
