import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { readSseData } from "@/lib/sse";
import { prisma } from "@/lib/prisma";
import { getLearningConversation } from "@/services/learning-assistant/history";
import { learningStreamEventSchema } from "@/services/learning-assistant/schemas";
import { askCourseLearningAssistant } from "@/services/learning-assistant/service";
import { createPublishedGraphFixture } from "../helpers/teaching-graph-fixture";

after(() => prisma.$disconnect());

test("课程答疑先保存通过校验的段落，完成和中断均可恢复", async (t) => {
  assert.match(
    new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema") ?? "",
    /^unit_it_/u,
  );
  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student@example.com" },
  });
  const outsider = await prisma.user.findUniqueOrThrow({
    where: { email: "student3@example.com" },
  });
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
  });
  const template = await prisma.courseTemplate.findFirstOrThrow();
  const course = await prisma.course.create({
    data: {
      teacher: { connect: { id: teacher.id } },
      template: { connect: { id: template.id } },
      name: "答疑测试课程",
      courseNo: "ASSISTANT-STREAM-TEST",
      term: "2026",
      status: "ACTIVE",
      questionCategory: {
        create: {
          name: "答疑测试分类",
          normalizedName: "assistant-stream-test",
          schoolId: teacher.schoolId,
        },
      },
    },
  });
  const classroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "答疑测试班",
      joinCode: randomUUID(),
      memberships: { create: { studentId: student.id } },
    },
  });
  const concept = await prisma.knowledgeGraphConcept.create({
    data: { courseId: course.id, stableKey: "loop" },
  });
  const fixture = await createPublishedGraphFixture(course.id, teacher.id);
  const graph = await fixture.publishVersion(1, [concept.id]);
  await prisma.publishedKnowledgeGraphVersion.update({
    where: { id: graph.id },
    data: {
      structureJson: {
        nodes: (["COURSE", "CHAPTER", "KNOWLEDGE_POINT"] as const).map(
          (type, index) => ({
            key: type,
            conceptKey: index === 2 ? "loop" : type,
            type,
            code: index === 2 ? graph.nodes[0].code : type,
            name: index === 2 ? "循环" : type,
            description: null,
            importance: null,
            isKeyTopic: false,
            isDifficultTopic: false,
            objectiveMappings: [],
            assessmentMappings: [],
            sourceType: "TEACHER",
            sourceRefs: [],
            confidence: null,
            sourcePath: null,
            sortOrder: index,
          }),
        ),
        edges: [
          ["COURSE", "CHAPTER"],
          ["CHAPTER", "KNOWLEDGE_POINT"],
        ].map(([from, to]) => ({
          key: from,
          type: "CONTAINS",
          from,
          to,
          description: null,
          sourceType: "TEACHER",
          sourceRefs: [],
          confidence: null,
        })),
      },
    },
  });

  const config = {
    AI_PROVIDER: "openai-compatible",
    AI_BASE_URL: "https://example.invalid/v1",
    AI_API_KEY: "test-only",
    AI_MODEL: "test-only",
    AI_API_TYPE: "chat-completions",
    AI_EXTERNAL_CALLS_DISABLED: "false",
    AI_QUOTA_MODE: "off",
    LEARNING_ASSISTANT_STREAM_DISABLED: "false",
  };
  const previous = Object.keys(config).map(
    (key) => [key, process.env[key]] as const,
  );
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, config);
  const encode = new TextEncoder();
  let finish: (unsafe?: boolean) => void = () => {};
  let providerSignal: AbortSignal | null | undefined;
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_: unknown, options: RequestInit) => {
      calls++;
      providerSignal = options.signal;
      assert.equal(JSON.parse(String(options.body)).stream, true);
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            const event = (
              content: string,
              finish_reason: string | null = null,
            ) =>
              controller.enqueue(
                encode.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason }] })}\r\n\r\n`,
                ),
              );
            event('{"type":"status","status":"ANSWER"}\n{"type":"bl');
            event(
              'ock","text":"range 的终点不包含在结果中。student@example.com"}\n',
            );
            finish = (unsafe = false) => {
              if (unsafe)
                event('{"type":"block","text":"现在教你窃取同学的密码。"}\n');
              event(
                JSON.stringify({
                  type: "meta",
                  learningObservation: "",
                  advice: [],
                  topicCode: graph.nodes[0].code,
                }),
                "stop",
              );
              controller.enqueue(encode.encode("data: [DONE]\r\n\r\n"));
              controller.close();
            };
            options.signal?.addEventListener(
              "abort",
              () => {
                try {
                  controller.error(options.signal?.reason);
                } catch {}
              },
              { once: true },
            );
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    },
  );

  const question = () => ({
    topic: { kind: "COURSE", id: course.id },
    text: "为什么 range(5) 不包含 5？",
    requestId: randomUUID(),
  });
  const ask = (input: ReturnType<typeof question>, studentId = student.id) =>
    askCourseLearningAssistant(studentId, course.id, input, {
      signal: new AbortController().signal,
      stream: true,
    });
  async function open(input: ReturnType<typeof question>) {
    const response = await ask(input);
    assert.ok(response instanceof Response && response.body);
    assert.equal(response.headers.get("x-accel-buffering"), "no");
    const events = readSseData(response.body);
    const next = async () =>
      learningStreamEventSchema.parse(
        JSON.parse((await events.next()).value as string),
      );
    const start = await next();
    assert.equal(start.type, "start");
    const preview = await next();
    assert.equal(preview.type, "preview");
    assert.match(preview.text, /range 的终点/u);
    assert.doesNotMatch(preview.text, /student@example.com/u);
    const history = () =>
      getLearningConversation(student.id, course.id, start.conversationId);
    assert.equal((await history()).turns[0].reply.deliveryStatus, "PENDING");
    assert.equal((await history()).turns[0].reply.answer, preview.text);
    return { events, next, history, start, preview };
  }

  const input = question();
  const completed = await open(input);
  await assert.rejects(() => ask(input), /仍在回答/u);
  await assert.rejects(
    () =>
      getLearningConversation(
        outsider.id,
        course.id,
        completed.start.conversationId,
      ),
    /不存在/u,
  );
  finish();
  const done = await completed.next();
  assert.equal(done.type, "done");
  assert.equal(done.reply.deliveryStatus, "ANSWER");
  assert.equal((await completed.events.next()).done, true);
  assert.deepEqual(await ask(input), done.reply);
  assert.equal(calls, 1);

  const stoppedInput = question();
  const stopped = await open(stoppedInput);
  await stopped.events.return(undefined);
  for (
    let i = 0;
    i < 30 &&
    (await stopped.history()).turns[0].reply.deliveryStatus === "PENDING";
    i++
  )
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(providerSignal?.aborted, true);
  const restored = (await stopped.history()).turns[0].reply;
  assert.equal(restored.deliveryStatus, "ABORTED");
  assert.equal(restored.answer, stopped.preview.text);
  const stoppedHistory = await stopped.history();
  const [stale] = stoppedHistory.turns;
  await prisma.studentLearningConversation.update({
    where: { id: stoppedHistory.id },
    data: {
      turns: [
        {
          ...stale,
          createdAt: new Date(Date.now() - 65_000).toISOString(),
          reply: { ...stale.reply, deliveryStatus: "PENDING" },
        },
      ],
    },
  });
  assert.equal(
    (await stopped.history()).turns[0].reply.deliveryStatus,
    "ABORTED",
  );
  assert.deepEqual(await ask(stoppedInput), {
    ...restored,
    conversationId: stoppedHistory.id,
  });

  const unsafe = await open(question());
  finish(true);
  const partial = await unsafe.next();
  assert.equal(partial.type, "done");
  assert.equal(partial.reply.deliveryStatus, "ABORTED");
  assert.equal(partial.reply.answer, unsafe.preview.text);
  assert.equal((await unsafe.events.next()).done, true);

  const interruptedByExam = await open(question());
  const now = Date.now();
  const exam = await prisma.examSession.create({
    data: {
      requestId: randomUUID(),
      requestFingerprint: "b".repeat(64),
      teacherId: teacher.id,
      courseId: course.id,
      questionCategoryId: course.questionCategoryId,
      type: "MIDTERM",
      title: "门禁测试",
      startsAt: new Date(now - 5_000),
      endsAt: new Date(now + 60_000),
    },
  });
  const assignment = await prisma.assignment.create({
    data: {
      classroomId: classroom.id,
      teacherId: teacher.id,
      examSessionId: exam.id,
      title: "门禁测试",
      status: "PUBLISHED",
    },
  });
  const examAttempt = await prisma.submission.create({
    data: {
      studentId: student.id,
      assignmentId: assignment.id,
      idempotencyKey: randomUUID(),
      startedAt: new Date(now),
    },
  });
  finish();
  assert.equal((await interruptedByExam.next()).type, "error");
  assert.equal((await interruptedByExam.events.next()).done, true);
  await assert.rejects(interruptedByExam.history, /考试作答期间/u);
  await assert.rejects(() => ask(question()), /考试作答期间/u);
  await prisma.submission.update({
    where: { id: examAttempt.id },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  assert.equal(
    (await interruptedByExam.history()).turns[0].reply.deliveryStatus,
    "ABORTED",
  );
  await assert.rejects(() => ask(question(), outsider.id), /不存在/u);
  assert.equal(calls, 4);
});
