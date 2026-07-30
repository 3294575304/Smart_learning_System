import { createHash, randomBytes } from "node:crypto";

import {
  AIAnalysisScope,
  AIRecordStatus,
  AssignmentStatus,
  ClassroomStatus,
  GradingStatus,
  MasteryLevel,
  MasteryTrend,
  MembershipStatus,
  Prisma,
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
  RecommendationSource,
  RecommendationStatus,
  Role,
  SubmissionStatus,
  UserStatus,
} from "@prisma/client";

import type { AuthenticatedUser } from "../../../services/auth/types";
import { SESSION_COOKIE_NAME } from "../../../services/auth/constants";
import { integrationPrisma, testPrefix } from "./database";

type UserRecord = Awaited<ReturnType<typeof integrationPrisma.user.create>>;
type ClassroomRecord = Awaited<
  ReturnType<typeof integrationPrisma.classroom.create>
>;
type QuestionRecord = Awaited<
  ReturnType<typeof integrationPrisma.question.create>
>;
type KnowledgePointRecord = Awaited<
  ReturnType<typeof integrationPrisma.knowledgePoint.create>
>;
type AssignmentQuestionRecord = Awaited<
  ReturnType<typeof integrationPrisma.assignmentQuestion.create>
>;

export interface AnswerSeed {
  question: QuestionRecord;
  isCorrect: boolean | null;
  gradedAt: Date;
}

export class RecommendationTestFactory {
  readonly prefix: string;
  private sequence = 0;
  private readonly userIds: string[] = [];
  private readonly classroomIds: string[] = [];
  private readonly questionIds: string[] = [];
  private readonly knowledgePointIds: string[] = [];
  private readonly assignmentIds: string[] = [];

  constructor(label: string) {
    this.prefix = testPrefix(label);
  }

  private next(label: string): string {
    this.sequence += 1;
    return `${this.prefix}_${label}_${this.sequence}`;
  }

  async user(
    role: Role,
    overrides: { status?: UserStatus; displayName?: string } = {},
  ): Promise<UserRecord> {
    const key = this.next(role.toLowerCase());
    const user = await integrationPrisma.user.create({
      data: {
        email: `${key}@example.test`,
        passwordHash: "integration-test-password-hash",
        role,
        status: overrides.status ?? UserStatus.ACTIVE,
        profile: {
          create: { displayName: overrides.displayName ?? key },
        },
      },
    });
    this.userIds.push(user.id);
    return user;
  }

  admin(): Promise<UserRecord> {
    return this.user(Role.ADMIN);
  }

  teacher(): Promise<UserRecord> {
    return this.user(Role.TEACHER);
  }

  student(): Promise<UserRecord> {
    return this.user(Role.STUDENT);
  }

  actor(user: UserRecord): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      displayName: user.email,
      mustChangePassword: false,
    };
  }

  async classroom(
    teacherId: string,
    overrides: { status?: ClassroomStatus } = {},
  ): Promise<ClassroomRecord> {
    const key = this.next("classroom");
    const classroom = await integrationPrisma.classroom.create({
      data: {
        teacherId,
        name: key,
        joinCode: key,
        status: overrides.status ?? ClassroomStatus.ACTIVE,
      },
    });
    this.classroomIds.push(classroom.id);
    return classroom;
  }

  async membership(
    classroomId: string,
    studentId: string,
    status: MembershipStatus = MembershipStatus.ACTIVE,
  ) {
    return integrationPrisma.classMembership.create({
      data: {
        classroomId,
        studentId,
        status,
        ...(status === MembershipStatus.ACTIVE
          ? {}
          : { endedAt: new Date("2026-07-01T00:00:00.000Z") }),
      },
    });
  }

  async knowledgePoint(
    createdById: string,
    overrides: { name?: string; isActive?: boolean } = {},
  ): Promise<KnowledgePointRecord> {
    const key = this.next("kp");
    const point = await integrationPrisma.knowledgePoint.create({
      data: {
        createdById,
        code: key,
        name: overrides.name ?? key,
        isActive: overrides.isActive ?? true,
      },
    });
    this.knowledgePointIds.push(point.id);
    return point;
  }

  async question(
    creatorId: string,
    overrides: {
      title?: string;
      type?: QuestionType;
      difficulty?: number;
      visibility?: QuestionVisibility;
      status?: QuestionStatus;
      knowledgePointIds?: string[];
    } = {},
  ): Promise<QuestionRecord> {
    const key = this.next("question");
    const type = overrides.type ?? QuestionType.SINGLE_CHOICE;
    const question = await integrationPrisma.question.create({
      data: {
        creatorId,
        title: overrides.title ?? key,
        content: `Content for ${key}`,
        type,
        difficulty: overrides.difficulty ?? 3,
        visibility: overrides.visibility ?? QuestionVisibility.PRIVATE,
        status: overrides.status ?? QuestionStatus.ACTIVE,
        explanation: `Explanation for ${key}`,
        tags: [this.prefix],
        ...(type === QuestionType.TRUE_FALSE
          ? { correctBoolean: true }
          : type === QuestionType.FILL_BLANK
            ? { acceptableAnswers: ["expected"] }
            : type === QuestionType.SHORT_ANSWER
              ? { referenceAnswer: "expected" }
              : {}),
        ...(type === QuestionType.SINGLE_CHOICE ||
        type === QuestionType.MULTIPLE_CHOICE
          ? {
              options: {
                create: [
                  {
                    label: "A",
                    content: "Wrong",
                    isCorrect: false,
                    sortOrder: 1,
                  },
                  {
                    label: "B",
                    content: "Correct",
                    isCorrect: true,
                    sortOrder: 2,
                  },
                ],
              },
            }
          : {}),
        ...(overrides.knowledgePointIds?.length
          ? {
              knowledgePointLinks: {
                create: overrides.knowledgePointIds.map((knowledgePointId) => ({
                  knowledgePointId,
                  weight: new Prisma.Decimal(1),
                })),
              },
            }
          : {}),
      },
    });
    this.questionIds.push(question.id);
    return question;
  }

  async bulkQuestions(
    creatorId: string,
    count: number,
  ): Promise<QuestionRecord[]> {
    const batch = this.next("bulk");
    await integrationPrisma.question.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        creatorId,
        title: `${batch}_${String(index).padStart(4, "0")}`,
        content: `Bulk question ${index}`,
        type: QuestionType.FILL_BLANK,
        difficulty: 3,
        visibility: QuestionVisibility.PRIVATE,
        status: QuestionStatus.ACTIVE,
        explanation: `Bulk explanation ${index}`,
        acceptableAnswers: ["expected"],
        tags: [this.prefix],
      })),
    });
    const questions = await integrationPrisma.question.findMany({
      where: { title: { startsWith: batch } },
      orderBy: { title: "asc" },
    });
    this.questionIds.push(...questions.map((question) => question.id));
    return questions;
  }

  async mastery(input: {
    studentId: string;
    knowledgePointId: string;
    masteryScore: number;
    answeredCount?: number;
    correctCount?: number;
  }) {
    return integrationPrisma.studentKnowledgeMastery.create({
      data: {
        studentId: input.studentId,
        knowledgePointId: input.knowledgePointId,
        level:
          input.masteryScore < 60
            ? MasteryLevel.DEVELOPING
            : MasteryLevel.PROFICIENT,
        trend: MasteryTrend.STABLE,
        masteryScore: new Prisma.Decimal(input.masteryScore),
        answeredCount: input.answeredCount ?? 5,
        correctCount: input.correctCount ?? 2,
      },
    });
  }

  async answers(input: {
    teacherId: string;
    classroomId: string;
    studentId: string;
    seeds: AnswerSeed[];
    status?: SubmissionStatus;
  }) {
    const assignmentKey = this.next("assignment");
    const assignment = await integrationPrisma.assignment.create({
      data: {
        classroomId: input.classroomId,
        teacherId: input.teacherId,
        title: assignmentKey,
        status: AssignmentStatus.PUBLISHED,
        totalPoints: new Prisma.Decimal(input.seeds.length),
        publishedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    });
    this.assignmentIds.push(assignment.id);
    const assignmentQuestions: AssignmentQuestionRecord[] = [];
    for (const [index, seed] of input.seeds.entries()) {
      assignmentQuestions.push(
        await integrationPrisma.assignmentQuestion.create({
          data: {
            assignmentId: assignment.id,
            questionId: seed.question.id,
            sortOrder: index + 1,
            points: new Prisma.Decimal(1),
            titleSnapshot: seed.question.title,
            contentSnapshot: seed.question.content,
            typeSnapshot: seed.question.type,
            difficultySnapshot: seed.question.difficulty,
            explanationSnapshot: seed.question.explanation,
            correctBooleanSnapshot: seed.question.correctBoolean,
            referenceAnswerSnapshot: seed.question.referenceAnswer,
            acceptableAnswersSnapshot: seed.question.acceptableAnswers,
          },
        }),
      );
    }
    const submission = await integrationPrisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentId: input.studentId,
        idempotencyKey: this.next("submission"),
        status: input.status ?? SubmissionStatus.PUBLISHED,
        startedAt: new Date("2026-07-01T00:00:00.000Z"),
        submittedAt: new Date("2026-07-10T00:00:00.000Z"),
        gradedAt: new Date("2026-07-10T00:00:00.000Z"),
        publishedAt:
          input.status === SubmissionStatus.WITHDRAWN
            ? null
            : new Date("2026-07-10T00:00:00.000Z"),
      },
    });
    return Promise.all(
      input.seeds.map((seed, index) =>
        integrationPrisma.studentAnswer.create({
          data: {
            submissionId: submission.id,
            assignmentQuestionId: assignmentQuestions[index].id,
            gradingStatus: GradingStatus.GRADED,
            maxScore: new Prisma.Decimal(1),
            score: new Prisma.Decimal(seed.isCorrect ? 1 : 0),
            isCorrect: seed.isCorrect,
            gradedAt: seed.gradedAt,
          },
        }),
      ),
    );
  }

  async analysisWithErrorType(input: {
    requestedById: string;
    studentId: string;
    knowledgePointId: string;
    errorType: "CONCEPT" | "CALCULATION" | "CARELESS" | "METHOD" | "UNKNOWN";
  }) {
    return integrationPrisma.aIAnalysis.create({
      data: {
        requestKey: this.next("analysis"),
        requestedById: input.requestedById,
        studentId: input.studentId,
        scope: AIAnalysisScope.STUDENT,
        status: AIRecordStatus.SUCCEEDED,
        promptVersion: "integration-v1",
        completedAt: new Date(),
        rawResponse: {
          overallLevel: "BASIC",
          masteredKnowledgePoints: [],
          weakKnowledgePoints: [
            {
              knowledgePointId: input.knowledgePointId,
              severity: 4,
              reason: "Integration test weakness",
            },
          ],
          errorPatterns: [
            { type: input.errorType, evidence: "Integration test answer" },
          ],
          suggestions: ["Practice"],
          recommendedDifficulty: 3,
          confidence: 0.8,
        },
      },
    });
  }

  async recommendation(input: {
    studentId: string;
    questionId: string;
    cycleKey?: string;
    status?: RecommendationStatus;
    expiresAt?: Date | null;
  }) {
    return integrationPrisma.personalizedRecommendation.create({
      data: {
        studentId: input.studentId,
        questionId: input.questionId,
        cycleKey: input.cycleKey ?? this.next("cycle"),
        source: RecommendationSource.RULE,
        status: input.status ?? RecommendationStatus.PENDING,
        reason: "Integration test recommendation",
        targetDifficulty: 3,
        priority: 10,
        expiresAt: input.expiresAt ?? new Date("2026-08-01T00:00:00.000Z"),
      },
    });
  }

  async sessionCookie(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await integrationPrisma.authSession.create({
      data: {
        userId,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 300_000),
      },
    });
    return `${SESSION_COOKIE_NAME}=${token}`;
  }

  async cleanup(): Promise<void> {
    if (this.userIds.length === 0) return;
    await integrationPrisma.notification.deleteMany({
      where: { recipientId: { in: this.userIds } },
    });
    await integrationPrisma.personalizedRecommendation.deleteMany({
      where: {
        OR: [
          { studentId: { in: this.userIds } },
          { questionId: { in: this.questionIds } },
        ],
      },
    });
    await integrationPrisma.aIAnalysisInsight.deleteMany({
      where: { analysis: { requestedById: { in: this.userIds } } },
    });
    await integrationPrisma.aIAnalysis.deleteMany({
      where: { requestedById: { in: this.userIds } },
    });
    await integrationPrisma.wrongQuestion.deleteMany({
      where: { studentId: { in: this.userIds } },
    });
    await integrationPrisma.studentAnswer.deleteMany({
      where: { submission: { studentId: { in: this.userIds } } },
    });
    await integrationPrisma.submission.deleteMany({
      where: { studentId: { in: this.userIds } },
    });
    await integrationPrisma.assignment.deleteMany({
      where: { id: { in: this.assignmentIds } },
    });
    await integrationPrisma.studentKnowledgeMastery.deleteMany({
      where: { studentId: { in: this.userIds } },
    });
    await integrationPrisma.question.deleteMany({
      where: { id: { in: this.questionIds } },
    });
    await integrationPrisma.classMembership.deleteMany({
      where: { classroomId: { in: this.classroomIds } },
    });
    await integrationPrisma.classroom.deleteMany({
      where: { id: { in: this.classroomIds } },
    });
    await integrationPrisma.knowledgePoint.deleteMany({
      where: { id: { in: this.knowledgePointIds } },
    });
    await integrationPrisma.authSession.deleteMany({
      where: { userId: { in: this.userIds } },
    });
    await integrationPrisma.user.deleteMany({
      where: { id: { in: this.userIds } },
    });
  }
}
