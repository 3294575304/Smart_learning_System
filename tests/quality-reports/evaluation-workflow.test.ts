import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { prisma } from "@/lib/prisma";
import { MockAIProvider } from "@/services/ai/mock-provider";
import { AIProviderRequestError } from "@/services/ai/provider";
import { assembleAssignmentReview } from "@/services/assignments/editor-assistance";
import { getTeacherCourseAnalytics } from "@/services/course-analytics/service";
import { resolveTeacherEvaluationAction } from "@/services/course-analytics/evaluation-assistant";
import { resolveTeacherAssistant } from "@/services/course-analytics/teacher-assistant";
import { courseRecommendationGenerationSchema } from "@/services/course-recommendations/schemas";
import {
  createCourseRecommendations,
  getStudentPracticeSession,
} from "@/services/course-recommendations/service";
import {
  correctTeacherGradeEntry,
  createTeacherCourseGradebook,
  publishTeacherGradebook,
} from "@/services/gradebook/service";
import { deliverQualityReportNotifications } from "@/services/quality-reports/notifications";
import {
  approveTeacherQualityReport,
  downloadTeacherQualityReport,
  processQualityReportJob,
  queuePlatformQualityReport,
} from "@/services/quality-reports/service";
import { qualityReportNarrativeSchema } from "@/services/quality-reports/schemas";
import { createPublishedGraphFixture } from "../helpers/teaching-graph-fixture";

after(() => prisma.$disconnect());

test("教师评价提醒沿台账和报告版本推进，报告终态通知按接收人与状态去重", async (t) => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  assert.match(
    database.searchParams.get("schema") ?? "",
    /^unit_it_[a-z0-9_]+$/u,
  );
  const [teacher, outsider, student] = await Promise.all(
    ["teacher@example.com", "teacher2@example.com", "student@example.com"].map(
      (email) => prisma.user.findUniqueOrThrow({ where: { email } }),
    ),
  );
  const template = await prisma.courseTemplate.findFirstOrThrow();
  const course = await prisma.course.create({
    data: {
      teacher: { connect: { id: teacher.id } },
      template: { connect: { id: template.id } },
      courseNo: "EVALUATION-TEST",
      name: "评价提醒测试",
      term: "2026",
      status: "ACTIVE",
      questionCategory: {
        create: {
          name: "评价测试",
          normalizedName: "evaluation-test",
          schoolId: teacher.schoolId,
        },
      },
    },
  });
  const classroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "评价一班",
      joinCode: randomUUID(),
      memberships: { create: { studentId: student.id } },
    },
  });
  const otherClassroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "评价二班",
      joinCode: randomUUID(),
    },
  });
  const context = { ipAddress: null, userAgent: "evaluation-workflow-test" };
  const askAssistant = (
    text: string,
    extra: Parameters<typeof resolveTeacherAssistant>[1] = { text },
  ) => resolveTeacherAssistant(teacher.id, { ...extra, text });
  const lookup = await askAssistant(`${course.name}的成绩台账在哪里？`);
  assert.equal(
    lookup.cards?.[0].href,
    `/teacher/courses/${course.id}/gradebook`,
  );
  assert.equal(lookup.evaluation, undefined);
  const missing = await askAssistant("为什么学生看不到作业？");
  assert.equal(missing.cards?.[0].href, "/teacher/assignments");
  assert.match(missing.cards?.[0].detail ?? "", /发布状态和开放时间/u);
  const followUp = await askAssistant("还是打不开", {
    text: "",
    previousTopic: missing.topic,
  });
  assert.equal(followUp.cards?.[0].href, "/teacher/assignments");
  assert.deepEqual((await askAssistant("导入学生名单并发起签到")).topics, [
    "ROSTER",
    "ATTENDANCE",
  ]);
  const vague = await askAssistant("麻烦看一下");
  assert.ok(vague.topics?.length);
  assert.equal(vague.cards?.[0].href, "/teacher");
  const scoped = await askAssistant("给本班智能组卷", {
    text: "",
    classroomId: classroom.id,
  });
  assert.equal(scoped.evaluation?.courseId, course.id);
  assert.equal(scoped.evaluation?.state.status, "REVIEW");
  if (scoped.evaluation.state.status === "REVIEW")
    assert.equal(scoped.evaluation.state.classroom?.id, classroom.id);
  const needsClass = await askAssistant(
    `生成${course.name}的台账和教学质量分析`,
  );
  assert.equal(needsClass.evaluation?.state.status, "CHOOSE_CLASSROOM");
  await assert.rejects(
    resolveTeacherAssistant(outsider.id, {
      text: "打开成绩台账",
      selectedCourseId: course.id,
    }),
    /不存在|无权/u,
  );
  const next = async (classroomId = classroom.id) =>
    (await getTeacherCourseAnalytics(teacher.id, course.id, classroomId))
      .evaluationNextStep;
  const plan = (text: string, classroomId?: string) =>
    resolveTeacherEvaluationAction(teacher.id, course.id, {
      action: "plan",
      text,
      classroomId,
    });
  const reviewPlan = async (text: string) => {
    const result = await plan(text);
    assert.equal(result.status, "REVIEW");
    return result;
  };
  const confirmPlan = (result: Awaited<ReturnType<typeof reviewPlan>>) =>
    resolveTeacherEvaluationAction(teacher.id, course.id, {
      action: "confirm",
      intent: result.intent,
      classroomId: result.classroom?.id,
      revision: result.revision,
    });
  const firstPlan = await reviewPlan(
    "帮我生成评价一班的成绩台账和教学质量分析",
  );
  assert.equal(firstPlan.intent, "BOTH");
  assert.equal(firstPlan.classroom?.id, classroom.id);
  assert.deepEqual(
    await confirmPlan(await reviewPlan("帮我给评价一班智能组卷")),
    {
      status: "CONFIRMED",
      href: `/teacher/assignments/new?classroomId=${classroom.id}`,
    },
  );
  assert.deepEqual(await confirmPlan(await reviewPlan("帮我出题")), {
    status: "CONFIRMED",
    href: `/teacher/questions/ai?courseId=${course.id}`,
  });
  assert.equal(firstPlan.label, "查看考核方案");
  const providerEnv = {
    AI_PROVIDER: "openai-compatible",
    AI_BASE_URL: "https://example.invalid/v1",
    AI_API_KEY: "test-only",
    AI_MODEL: "test-only",
    AI_API_TYPE: "chat-completions",
    AI_EXTERNAL_CALLS_DISABLED: "false",
    AI_QUOTA_MODE: "off",
  };
  const previousEnv = Object.entries(providerEnv).map(
    ([key]) => [key, process.env[key]] as const,
  );
  let outbound: string | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      outbound = String(init?.body);
      return Response.json({
        choices: [
          {
            message: { content: '{"intent":"GRADEBOOK"}' },
            finish_reason: "stop",
          },
        ],
      });
    },
  );
  try {
    Object.assign(process.env, providerEnv);
    assert.equal(
      (await reviewPlan("请整理评价一班的成绩，学生张三，电话13812345678"))
        .intent,
      "GRADEBOOK",
    );
    assert.ok(outbound);
    assert.doesNotMatch(outbound, /评价一班|张三|13812345678/u);
  } finally {
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    t.mock.restoreAll();
  }
  let modelReply: unknown = { topic: "ANALYTICS" };
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      outbound = String(init?.body);
      assert.match(JSON.parse(outbound).messages[0].content, /JSON/u);
      return Response.json({
        choices: [
          {
            message: { content: JSON.stringify(modelReply) },
            finish_reason: "stop",
          },
        ],
      });
    },
  );
  try {
    Object.assign(process.env, providerEnv);
    const inferred = await askAssistant("我想找张三 13812345678 的分数结果", {
      text: "",
      courseId: course.id,
    });
    assert.equal(
      inferred.cards?.[0].href,
      `/teacher/courses/${course.id}/analytics`,
    );
    assert.ok(outbound);
    assert.doesNotMatch(outbound, /张三|13812345678/u);
    modelReply = { topic: "ANALYTICS", href: "https://example.invalid" };
    const invalidDestination = await askAssistant("我想找分数结果", {
      text: "",
      courseId: course.id,
    });
    assert.equal(invalidDestination.cards?.[0].href, "/teacher");
  } finally {
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    t.mock.restoreAll();
  }
  assert.deepEqual(await confirmPlan(firstPlan), await confirmPlan(firstPlan));
  assert.equal(
    await prisma.courseGradebook.count({ where: { courseId: course.id } }),
    0,
  );
  assert.equal(
    (await plan("生成外校班级的成绩台账", classroom.id)).status,
    "CHOOSE_CLASSROOM",
  );
  assert.equal(
    (await plan("请删除本班成绩台账", classroom.id)).status,
    "MANUAL",
  );
  await assert.rejects(
    () =>
      resolveTeacherEvaluationAction(outsider.id, course.id, {
        action: "plan",
        text: "成绩台账",
      }),
    /不存在|无权/u,
  );
  const duplicateClassroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: classroom.name,
      joinCode: randomUUID(),
    },
  });
  const ambiguous = await plan("评价一班成绩台账");
  assert.equal(ambiguous.status, "CHOOSE_CLASSROOM");
  assert.deepEqual(
    new Set(ambiguous.classrooms.map(({ id }) => id)),
    new Set([classroom.id, duplicateClassroom.id]),
  );
  await prisma.classroom.delete({ where: { id: duplicateClassroom.id } });
  await assert.rejects(
    () => getTeacherCourseAnalytics(outsider.id, course.id, classroom.id),
    /不存在|无权/u,
  );
  assert.equal(
    (await getTeacherCourseAnalytics(teacher.id, course.id)).evaluationNextStep
      ?.action,
    null,
  );
  assert.equal((await next())?.action?.label, "查看考核方案");

  const fixture = await createPublishedGraphFixture(course.id, teacher.id);
  const concept = await prisma.knowledgeGraphConcept.create({
    data: { courseId: course.id, stableKey: "evaluation-concept" },
  });
  const graph = await fixture.publishVersion(1, [concept.id]);
  const question = await prisma.question.create({
    data: {
      creatorId: teacher.id,
      questionCategoryId: course.questionCategoryId,
      title: "评价测试判断题",
      content: "这是判断题。",
      type: "TRUE_FALSE",
      status: "ACTIVE",
      correctBoolean: true,
      explanation: "测试解析",
    },
  });
  await prisma.questionKnowledgeGraphBindingSet.create({
    data: {
      questionId: question.id,
      courseId: course.id,
      bindings: {
        create: {
          questionId: question.id,
          courseId: course.id,
          conceptId: concept.id,
          sourceGraphVersionId: graph.id,
          sourceNodeId: graph.nodes[0].id,
          bindingType: "PRIMARY",
          createdById: teacher.id,
        },
      },
    },
  });
  const assemble = () =>
    assembleAssignmentReview(
      teacher.id,
      {
        action: "ASSEMBLE",
        classroomIds: [classroom.id],
        conceptIds: [concept.id],
        types: ["TRUE_FALSE"],
        count: 1,
        excludedIds: [],
      },
      context,
    );
  assert.equal((await assemble()).source, "AI");
  t.mock.method(MockAIProvider.prototype, "assembleAssignment", async () => ({
    picks: [{ key: 99, reason: "超出候选范围" }],
  }));
  const invalid = await assemble();
  assert.equal(invalid.source, "RULES");
  assert.deepEqual(
    invalid.questions.map(({ id }) => id),
    [question.id],
  );
  t.mock.restoreAll();
  t.mock.method(MockAIProvider.prototype, "assembleAssignment", async () => {
    throw new AIProviderRequestError("test timeout", "PROVIDER_TIMEOUT");
  });
  assert.equal((await assemble()).source, "RULES");
  t.mock.restoreAll();
  await prisma.course.update({
    where: { id: course.id },
    data: {
      currentPublishedSyllabusStructureId: graph.sourceSyllabusStructureId,
    },
  });
  await t.test(
    "自主练习保留选题规则并存储可追溯的 AI 学习建议",
    async (practiceTest) => {
      const actor = {
        id: student.id,
        role: "STUDENT" as const,
        email: null,
        displayName: null,
        mustChangePassword: false,
      };
      const input = courseRecommendationGenerationSchema.parse({
        classroomId: classroom.id,
        conceptIds: [concept.id],
        questionTypes: ["TRUE_FALSE"],
        count: 1,
        requestId: randomUUID(),
        mode: "PRACTICE",
      });
      const requests: string[] = [];
      practiceTest.mock.method(
        globalThis,
        "fetch",
        async (_url: unknown, init?: RequestInit) => {
          requests.push(String(init?.body));
          return Response.json({
            choices: [
              {
                message: {
                  content:
                    requests.length === 1
                      ? '{"items":[{"key":1,"focus":"DIAGNOSTIC_EVIDENCE"}]}'
                      : '{"items":[{"key":2,"focus":"DIAGNOSTIC_EVIDENCE"}]}',
                },
                finish_reason: "stop",
              },
            ],
          });
        },
      );
      try {
        Object.assign(process.env, providerEnv);
        const enhanced = await createCourseRecommendations(
          actor,
          course.id,
          input,
        );
        assert.deepEqual(
          enhanced.items.map((item) => item.questionId),
          [question.id],
        );
        const [item] = enhanced.items;
        assert.equal(item.source, "HYBRID");
        assert.equal(
          item.reasonPromptVersion,
          "course-recommendation-focus-v1",
        );
        assert.match(item.reason, /诊断证据。.*先独立作答/u);
        assert.equal(
          (await getStudentPracticeSession(student.id, enhanced.cycle.id))
            .items[0].reasonSource,
          "HYBRID",
        );
        await assert.rejects(
          () => getStudentPracticeSession(outsider.id, enhanced.cycle.id),
          /不存在|无权/u,
        );
        assert.deepEqual(
          (await createCourseRecommendations(actor, course.id, input)).items,
          enhanced.items,
        );
        assert.equal(requests.length, 1);
        for (const privateValue of [
          student.id,
          question.id,
          concept.id,
          question.content,
        ]) {
          assert.ok(!requests[0].includes(privateValue));
        }
        await prisma.personalizedRecommendation.update({
          where: { id: item.id },
          data: { status: "DISMISSED" },
        });
        const fallback = await createCourseRecommendations(actor, course.id, {
          ...input,
          requestId: randomUUID(),
        });
        assert.equal(requests.length, 2);
        assert.equal(fallback.items[0].questionId, question.id);
        assert.equal(fallback.items[0].source, "RULE");
        assert.equal(fallback.items[0].reasonPromptVersion, null);
        assert.ok(item.reason.startsWith(fallback.items[0].reason));
      } finally {
        for (const [key, value] of previousEnv) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    },
  );
  const syllabus = await prisma.publishedSyllabusStructure.findFirstOrThrow({
    where: { courseId: course.id },
  });
  const sourceFingerprint = "a".repeat(64);
  const draft = await prisma.assessmentSchemeDraft.create({
    data: {
      courseId: course.id,
      createdById: teacher.id,
      structureJson: {},
      sourceFingerprint,
    },
  });
  const review = await prisma.assessmentSchemeReviewRevision.create({
    data: {
      draftId: draft.id,
      courseId: course.id,
      editedById: teacher.id,
      revisionNumber: 1,
      structureJson: {},
      sourceFingerprint,
    },
  });
  const scheme = await prisma.publishedAssessmentScheme.create({
    data: {
      courseId: course.id,
      sourcePublishedSyllabusStructureId: syllabus.id,
      reviewRevisionId: review.id,
      publishedById: teacher.id,
      versionNumber: 1,
      structureJson: {},
      sourceFingerprint,
      calculationRuleVersion: "test",
      components: {
        create: {
          code: "FINAL",
          name: "期末考试",
          type: "FINAL_EXAM",
          fullScore: 100,
          weight: 100,
          sourceType: "MANUAL",
          sortOrder: 1,
          sourceJson: [],
          rubricJson: [],
        },
      },
      outcomes: {
        create: {
          code: "O1",
          title: "课程目标一",
          description: "理解基础知识",
          attainmentThreshold: 60,
          sortOrder: 1,
          sourceJson: [],
        },
      },
    },
    include: { components: true, outcomes: true },
  });
  await prisma.course.update({
    where: { id: course.id },
    data: { currentPublishedAssessmentSchemeId: scheme.id },
  });
  assert.equal((await next())?.action?.label, "建立成绩台账");
  const gradebook = await createTeacherCourseGradebook(
    teacher.id,
    course.id,
    classroom.id,
    context,
  );
  assert.equal((await next())?.action?.label, "核对成绩台账");
  const item = await prisma.gradeItem.findFirstOrThrow({
    where: { gradebookId: gradebook.id },
  });
  const enterGrade = (score: number, expectedRevisionNumber: number) =>
    correctTeacherGradeEntry(
      teacher.id,
      gradebook.id,
      item.id,
      student.id,
      {
        status: "SCORED",
        score,
        reason: "测试录入",
        expectedRevisionNumber,
        idempotencyKey: randomUUID(),
      },
      context,
    );
  await enterGrade(80, 0);
  const firstPublication = await publishTeacherGradebook(
    teacher.id,
    gradebook.id,
    context,
  );
  assert.equal((await next())?.action?.label, "核对考核方案");
  await prisma.publishedAssessmentOutcomeMapping.create({
    data: {
      schemeId: scheme.id,
      componentId: scheme.components[0].id,
      outcomeId: scheme.outcomes[0].id,
      allocationRate: 100,
      sourceJson: [],
    },
  });
  assert.match(
    (await next())?.action?.href ?? "",
    new RegExp(`gradebookId=${gradebook.id}`, "u"),
  );
  assert.equal((await next(otherClassroom.id))?.action?.label, "建立成绩台账");

  const requestReport = (majorClass: string) =>
    queuePlatformQualityReport(
      teacher.id,
      course.id,
      { sourceType: "PLATFORM", gradebookId: gradebook.id, majorClass },
      context,
    );
  const queued = await requestReport("评价一班");
  const queuePlan = await reviewPlan("评价一班教学质量分析");
  assert.equal(queuePlan.publicationVersion, 1);
  assert.equal(queuePlan.label, "查看生成进度");
  assert.equal((await reviewPlan("评价一班成绩台账")).label, "查看成绩台账");
  assert.equal((await next())?.action?.label, "查看生成进度");
  await deliverQualityReportNotifications();
  assert.equal(
    await prisma.notification.count({ where: { sourceId: queued.report.id } }),
    0,
  );
  const report = await processQualityReportJob(queued.report.id, context);
  assert.equal(report?.status, "SUCCEEDED");
  assert.equal(report?.aiStatus, "FALLBACK");
  assert.equal((await next())?.action?.label, "查看并审核报告");
  await Promise.all([
    deliverQualityReportNotifications(),
    deliverQualityReportNotifications(),
  ]);
  const inbox = await prisma.notification.findMany({
    where: { sourceId: queued.report.id },
  });
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].recipientId, teacher.id);
  assert.match(
    inbox[0].actionUrl ?? "",
    new RegExp(`reportId=${queued.report.id}&classroomId=${classroom.id}`, "u"),
  );
  await assert.rejects(
    () =>
      downloadTeacherQualityReport(
        outsider.id,
        course.id,
        queued.report.id,
        "docx",
        context,
      ),
    /不存在/u,
  );

  const narrative = qualityReportNarrativeSchema
    .strip()
    .parse(report?.narrativeSnapshotJson);
  await approveTeacherQualityReport(
    teacher.id,
    course.id,
    queued.report.id,
    narrative,
    context,
  );
  assert.equal((await next())?.action?.label, "下载正式 DOCX");
  const output = await downloadTeacherQualityReport(
    teacher.id,
    course.id,
    queued.report.id,
    "docx",
    context,
  );
  assert.equal(output.data.subarray(0, 2).toString(), "PK");

  await enterGrade(90, 1);
  assert.match((await next())?.detail ?? "", /未发布的成绩修改/u);
  await publishTeacherGradebook(teacher.id, gradebook.id, context);
  await assert.rejects(() => confirmPlan(queuePlan), /已变化/u);
  assert.equal(
    (await reviewPlan("评价一班教学质量分析")).publicationVersion,
    2,
  );
  await assert.rejects(
    () =>
      queuePlatformQualityReport(
        teacher.id,
        course.id,
        {
          sourceType: "PLATFORM",
          gradebookId: gradebook.id,
          expectedPublicationId: firstPublication.id,
        },
        context,
      ),
    /正式成绩版本已更新/u,
  );
  assert.equal((await next())?.action?.label, "生成分析报告");
  const terminalFailure = await requestReport("评价一班新版本");
  await prisma.backgroundJob.update({
    where: { id: terminalFailure.report.backgroundJobId ?? "" },
    data: { status: "FAILED" },
  });
  await deliverQualityReportNotifications();
  await deliverQualityReportNotifications();
  assert.equal((await next())?.action?.label, "查看生成记录");
  const failures = await prisma.notification.findMany({
    where: { sourceId: terminalFailure.report.id },
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0].title, /生成失败/u);
});
