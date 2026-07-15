import {
  AIAnalysisScope,
  AIInsightType,
  AIRecordStatus,
  AssignmentStatus,
  ClassroomStatus,
  GradingStatus,
  MasteryLevel,
  MasteryTrend,
  MembershipStatus,
  Prisma,
  PrismaClient,
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
  RecommendationSource,
  RecommendationStatus,
  RiskLevel,
  Role,
  SubmissionStatus,
  UserStatus,
} from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

interface SeedUser {
  email: string;
  password: string;
  role: Role;
  displayName: string;
  studentNo?: string;
  teacherNo?: string;
}

interface SeedQuestion {
  creatorId: string;
  title: string;
  content: string;
  type: QuestionType;
  difficulty: number;
  visibility: QuestionVisibility;
  explanation: string;
  tags?: string[];
  correctBoolean?: boolean;
  referenceAnswer?: string;
  acceptableAnswers?: string[];
  gradingConfig?: Prisma.InputJsonValue;
}

interface SeedOption {
  label: string;
  content: string;
  isCorrect: boolean;
  sortOrder: number;
}

const seedUsers: SeedUser[] = [
  {
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
    password: process.env.SEED_ADMIN_PASSWORD ?? "Admin123!",
    role: Role.ADMIN,
    displayName: "系统管理员",
  },
  {
    email: process.env.SEED_TEACHER_EMAIL ?? "teacher@example.com",
    password: process.env.SEED_TEACHER_PASSWORD ?? "Teacher123!",
    role: Role.TEACHER,
    displayName: "张老师",
    teacherNo: "T2026001",
  },
  {
    email: "teacher2@example.com",
    password: process.env.SEED_TEACHER_PASSWORD ?? "Teacher123!",
    role: Role.TEACHER,
    displayName: "李老师",
    teacherNo: "T2026002",
  },
  {
    email: process.env.SEED_STUDENT_EMAIL ?? "student@example.com",
    password: process.env.SEED_STUDENT_PASSWORD ?? "Student123!",
    role: Role.STUDENT,
    displayName: "王同学",
    studentNo: "S2026001",
  },
  {
    email: "student2@example.com",
    password: process.env.SEED_STUDENT_PASSWORD ?? "Student123!",
    role: Role.STUDENT,
    displayName: "赵同学",
    studentNo: "S2026002",
  },
  {
    email: "student3@example.com",
    password: process.env.SEED_STUDENT_PASSWORD ?? "Student123!",
    role: Role.STUDENT,
    displayName: "陈同学",
    studentNo: "S2026003",
  },
];

async function upsertUser(seedUser: SeedUser) {
  const passwordHash = await hash(seedUser.password, 12);
  const user = await prisma.user.upsert({
    where: { email: seedUser.email },
    update: {
      passwordHash,
      role: seedUser.role,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: seedUser.email,
      passwordHash,
      role: seedUser.role,
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {
      displayName: seedUser.displayName,
      studentNo: seedUser.studentNo,
      teacherNo: seedUser.teacherNo,
    },
    create: {
      userId: user.id,
      displayName: seedUser.displayName,
      studentNo: seedUser.studentNo,
      teacherNo: seedUser.teacherNo,
    },
  });

  return user;
}

async function upsertQuestion(seedQuestion: SeedQuestion) {
  const existingQuestion = await prisma.question.findFirst({
    where: {
      creatorId: seedQuestion.creatorId,
      title: seedQuestion.title,
    },
  });
  const data = {
    creatorId: seedQuestion.creatorId,
    title: seedQuestion.title,
    content: seedQuestion.content,
    type: seedQuestion.type,
    difficulty: seedQuestion.difficulty,
    visibility: seedQuestion.visibility,
    status: QuestionStatus.ACTIVE,
    explanation: seedQuestion.explanation,
    tags: seedQuestion.tags ?? [],
    correctBoolean: seedQuestion.correctBoolean,
    referenceAnswer: seedQuestion.referenceAnswer,
    acceptableAnswers: seedQuestion.acceptableAnswers ?? [],
    isCaseSensitive: false,
    gradingConfig: seedQuestion.gradingConfig,
  };

  if (existingQuestion) {
    return prisma.question.update({
      where: { id: existingQuestion.id },
      data,
    });
  }

  return prisma.question.create({ data });
}

async function upsertQuestionOptions(
  questionId: string,
  options: SeedOption[],
): Promise<void> {
  for (const option of options) {
    await prisma.questionOption.upsert({
      where: {
        questionId_label: {
          questionId,
          label: option.label,
        },
      },
      update: option,
      create: {
        questionId,
        ...option,
      },
    });
  }
}

async function upsertAnalysisInsight(input: {
  analysisId: string;
  knowledgePointId?: string;
  type: AIInsightType;
  title: string;
  detail: string;
  priority: number;
  metricName?: string;
  metricValue?: Prisma.Decimal;
  recommendedAction?: string;
}): Promise<void> {
  const existingInsight = await prisma.aIAnalysisInsight.findFirst({
    where: {
      analysisId: input.analysisId,
      type: input.type,
      title: input.title,
    },
  });

  if (existingInsight) {
    await prisma.aIAnalysisInsight.update({
      where: { id: existingInsight.id },
      data: input,
    });
    return;
  }

  await prisma.aIAnalysisInsight.create({ data: input });
}

async function main(): Promise<void> {
  await prisma.authSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  const users = await Promise.all(seedUsers.map(upsertUser));
  const [admin, teacher, teacherTwo, student, studentTwo, studentThree] = users;

  const classroom = await prisma.classroom.upsert({
    where: { joinCode: "MATH2026" },
    update: {
      teacherId: teacher.id,
      name: "初一数学一班",
      description: "MVP 业务闭环演示班级",
      status: ClassroomStatus.ACTIVE,
      allowStudentLeave: true,
      joinCodeExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
    },
    create: {
      teacherId: teacher.id,
      name: "初一数学一班",
      description: "MVP 业务闭环演示班级",
      joinCode: "MATH2026",
      status: ClassroomStatus.ACTIVE,
      allowStudentLeave: true,
      joinCodeExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
    },
  });

  await prisma.classroom.upsert({
    where: { joinCode: "MATH-ISO" },
    update: {
      teacherId: teacherTwo.id,
      name: "教师隔离测试班",
      status: ClassroomStatus.ACTIVE,
      allowStudentLeave: false,
    },
    create: {
      teacherId: teacherTwo.id,
      name: "教师隔离测试班",
      description: "用于验证教师之间的数据隔离",
      joinCode: "MATH-ISO",
      status: ClassroomStatus.ACTIVE,
      allowStudentLeave: false,
    },
  });

  for (const enrolledStudent of [student, studentTwo]) {
    await prisma.classMembership.upsert({
      where: {
        classroomId_studentId: {
          classroomId: classroom.id,
          studentId: enrolledStudent.id,
        },
      },
      update: {
        status: MembershipStatus.ACTIVE,
        endedAt: null,
      },
      create: {
        classroomId: classroom.id,
        studentId: enrolledStudent.id,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  const arithmetic = await prisma.knowledgePoint.upsert({
    where: { code: "MATH-ARITHMETIC" },
    update: {
      createdById: admin.id,
      name: "有理数运算",
      description: "整数、分数及基本四则运算",
      isActive: true,
    },
    create: {
      createdById: admin.id,
      code: "MATH-ARITHMETIC",
      name: "有理数运算",
      description: "整数、分数及基本四则运算",
    },
  });
  const algebra = await prisma.knowledgePoint.upsert({
    where: { code: "MATH-ALGEBRA" },
    update: {
      createdById: admin.id,
      name: "一元一次方程",
      description: "方程建模、移项与求解",
      isActive: true,
    },
    create: {
      createdById: admin.id,
      code: "MATH-ALGEBRA",
      name: "一元一次方程",
      description: "方程建模、移项与求解",
    },
  });
  const geometry = await prisma.knowledgePoint.upsert({
    where: { code: "MATH-GEOMETRY" },
    update: {
      createdById: admin.id,
      name: "平面几何",
      description: "三角形性质与勾股定理",
      isActive: true,
    },
    create: {
      createdById: admin.id,
      code: "MATH-GEOMETRY",
      name: "平面几何",
      description: "三角形性质与勾股定理",
    },
  });

  const singleChoice = await upsertQuestion({
    creatorId: admin.id,
    title: "基础加法",
    content: "2 + 3 的结果是多少？",
    type: QuestionType.SINGLE_CHOICE,
    difficulty: 1,
    visibility: QuestionVisibility.PUBLIC,
    explanation: "将 2 与 3 相加得到 5。",
    tags: ["基础", "计算"],
  });
  const multipleChoice = await upsertQuestion({
    creatorId: teacher.id,
    title: "12 的因数",
    content: "下列哪些数是 12 的因数？",
    type: QuestionType.MULTIPLE_CHOICE,
    difficulty: 3,
    visibility: QuestionVisibility.PRIVATE,
    explanation: "能整除 12 的数是其因数。",
    tags: ["因数", "多选"],
    gradingConfig: { mode: "EXACT_SET" },
  });
  const trueFalse = await upsertQuestion({
    creatorId: teacher.id,
    title: "三角形内角和",
    content: "平面三角形的内角和等于 180 度。",
    type: QuestionType.TRUE_FALSE,
    difficulty: 1,
    visibility: QuestionVisibility.PRIVATE,
    explanation: "欧氏平面内任意三角形的内角和为 180 度。",
    tags: ["几何", "判断"],
    correctBoolean: true,
  });
  const fillBlank = await upsertQuestion({
    creatorId: teacher.id,
    title: "解一元一次方程",
    content: "解方程 3x = 12，x = ____。",
    type: QuestionType.FILL_BLANK,
    difficulty: 3,
    visibility: QuestionVisibility.PRIVATE,
    explanation: "等式两边同时除以 3，得到 x = 4。",
    tags: ["方程", "填空"],
    acceptableAnswers: ["4", "4.0"],
    gradingConfig: { trimWhitespace: true, numericTolerance: 0 },
  });
  const shortAnswer = await upsertQuestion({
    creatorId: teacher.id,
    title: "说明勾股定理",
    content: "请用自己的语言说明勾股定理，并写出公式。",
    type: QuestionType.SHORT_ANSWER,
    difficulty: 5,
    visibility: QuestionVisibility.PRIVATE,
    explanation: "直角三角形两条直角边平方和等于斜边平方。",
    tags: ["几何", "简答"],
    referenceAnswer:
      "在直角三角形中，两直角边 a、b 与斜边 c 满足 a² + b² = c²。",
    gradingConfig: { manualReviewRequired: true },
  });
  await upsertQuestion({
    creatorId: teacherTwo.id,
    title: "隔离测试私有题",
    content: "该题只应由李老师管理。",
    type: QuestionType.TRUE_FALSE,
    difficulty: 1,
    visibility: QuestionVisibility.PRIVATE,
    explanation: "用于权限测试。",
    correctBoolean: true,
  });

  await upsertQuestionOptions(singleChoice.id, [
    { label: "A", content: "4", isCorrect: false, sortOrder: 1 },
    { label: "B", content: "5", isCorrect: true, sortOrder: 2 },
    { label: "C", content: "6", isCorrect: false, sortOrder: 3 },
  ]);
  await upsertQuestionOptions(multipleChoice.id, [
    { label: "A", content: "2", isCorrect: true, sortOrder: 1 },
    { label: "B", content: "3", isCorrect: true, sortOrder: 2 },
    { label: "C", content: "5", isCorrect: false, sortOrder: 3 },
    { label: "D", content: "7", isCorrect: false, sortOrder: 4 },
  ]);

  const questionKnowledgePoints = [
    { questionId: singleChoice.id, knowledgePointId: arithmetic.id, weight: 1 },
    {
      questionId: multipleChoice.id,
      knowledgePointId: arithmetic.id,
      weight: 1,
    },
    { questionId: trueFalse.id, knowledgePointId: geometry.id, weight: 1 },
    { questionId: fillBlank.id, knowledgePointId: algebra.id, weight: 1 },
    { questionId: shortAnswer.id, knowledgePointId: geometry.id, weight: 1 },
  ];
  for (const link of questionKnowledgePoints) {
    await prisma.questionKnowledgePoint.upsert({
      where: {
        questionId_knowledgePointId: {
          questionId: link.questionId,
          knowledgePointId: link.knowledgePointId,
        },
      },
      update: { weight: link.weight },
      create: link,
    });
  }

  const existingAssignment = await prisma.assignment.findFirst({
    where: { classroomId: classroom.id, title: "七年级数学综合练习" },
  });
  const assignmentData = {
    classroomId: classroom.id,
    teacherId: teacher.id,
    title: "七年级数学综合练习",
    description: "包含五类题型的完整批改演示",
    status: AssignmentStatus.PUBLISHED,
    totalPoints: new Prisma.Decimal(30),
    allowResubmission: false,
    publishedAt: new Date("2026-07-14T01:00:00.000Z"),
    dueAt: new Date("2027-01-01T00:00:00.000Z"),
  };
  const assignment = existingAssignment
    ? await prisma.assignment.update({
        where: { id: existingAssignment.id },
        data: assignmentData,
      })
    : await prisma.assignment.create({ data: assignmentData });

  const assignmentQuestionSeeds = [
    { question: singleChoice, points: 5, sortOrder: 1 },
    { question: multipleChoice, points: 5, sortOrder: 2 },
    { question: trueFalse, points: 5, sortOrder: 3 },
    { question: fillBlank, points: 5, sortOrder: 4 },
    { question: shortAnswer, points: 10, sortOrder: 5 },
  ];
  const assignmentQuestionByQuestionId = new Map<string, string>();
  for (const item of assignmentQuestionSeeds) {
    const snapshotData = {
      sortOrder: item.sortOrder,
      points: new Prisma.Decimal(item.points),
      titleSnapshot: item.question.title,
      contentSnapshot: item.question.content,
      typeSnapshot: item.question.type,
      difficultySnapshot: item.question.difficulty,
      explanationSnapshot: item.question.explanation,
      correctBooleanSnapshot: item.question.correctBoolean,
      referenceAnswerSnapshot: item.question.referenceAnswer,
      acceptableAnswersSnapshot: item.question.acceptableAnswers,
      isCaseSensitiveSnapshot: item.question.isCaseSensitive,
      gradingConfigSnapshot:
        item.question.gradingConfig === null
          ? Prisma.JsonNull
          : item.question.gradingConfig,
    };
    const assignmentQuestion = await prisma.assignmentQuestion.upsert({
      where: {
        assignmentId_questionId: {
          assignmentId: assignment.id,
          questionId: item.question.id,
        },
      },
      update: snapshotData,
      create: {
        assignmentId: assignment.id,
        questionId: item.question.id,
        ...snapshotData,
      },
    });
    assignmentQuestionByQuestionId.set(item.question.id, assignmentQuestion.id);

    const sourceOptions = await prisma.questionOption.findMany({
      where: { questionId: item.question.id },
      orderBy: { sortOrder: "asc" },
    });
    for (const sourceOption of sourceOptions) {
      await prisma.assignmentQuestionOption.upsert({
        where: {
          assignmentQuestionId_labelSnapshot: {
            assignmentQuestionId: assignmentQuestion.id,
            labelSnapshot: sourceOption.label,
          },
        },
        update: {
          sourceOptionId: sourceOption.id,
          contentSnapshot: sourceOption.content,
          isCorrectSnapshot: sourceOption.isCorrect,
          sortOrder: sourceOption.sortOrder,
        },
        create: {
          assignmentQuestionId: assignmentQuestion.id,
          sourceOptionId: sourceOption.id,
          labelSnapshot: sourceOption.label,
          contentSnapshot: sourceOption.content,
          isCorrectSnapshot: sourceOption.isCorrect,
          sortOrder: sourceOption.sortOrder,
        },
      });
    }

    const knowledgeLinks = await prisma.questionKnowledgePoint.findMany({
      where: { questionId: item.question.id },
      include: { knowledgePoint: true },
    });
    for (const link of knowledgeLinks) {
      await prisma.assignmentQuestionKnowledgePoint.upsert({
        where: {
          assignmentQuestionId_knowledgePointId: {
            assignmentQuestionId: assignmentQuestion.id,
            knowledgePointId: link.knowledgePointId,
          },
        },
        update: {
          codeSnapshot: link.knowledgePoint.code,
          nameSnapshot: link.knowledgePoint.name,
          weightSnapshot: link.weight,
        },
        create: {
          assignmentQuestionId: assignmentQuestion.id,
          knowledgePointId: link.knowledgePointId,
          codeSnapshot: link.knowledgePoint.code,
          nameSnapshot: link.knowledgePoint.name,
          weightSnapshot: link.weight,
        },
      });
    }
  }

  const existingSubmission = await prisma.submission.findFirst({
    where: {
      OR: [
        { idempotencyKey: "seed-submit-student-1-assignment-1" },
        {
          assignmentId: assignment.id,
          studentId: student.id,
          status: { not: SubmissionStatus.WITHDRAWN },
        },
      ],
    },
    orderBy: { attemptNumber: "asc" },
  });
  const submissionData = {
    idempotencyKey: "seed-submit-student-1-assignment-1",
    status: SubmissionStatus.PUBLISHED,
    submittedAt: new Date("2026-07-14T02:00:00.000Z"),
    gradedAt: new Date("2026-07-14T02:10:00.000Z"),
    publishedAt: new Date("2026-07-14T02:15:00.000Z"),
    score: new Prisma.Decimal(23),
    maxScore: new Prisma.Decimal(30),
    percentage: new Prisma.Decimal("76.67"),
    feedback: "基础知识较扎实，需要加强方程计算。",
    saveVersion: 1,
    lastSavedAt: new Date("2026-07-14T01:55:00.000Z"),
  };
  const submission = existingSubmission
    ? await prisma.submission.update({
        where: { id: existingSubmission.id },
        data: submissionData,
      })
    : await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: student.id,
          attemptNumber: 1,
          startedAt: new Date("2026-07-14T01:30:00.000Z"),
          ...submissionData,
        },
      });

  const answerSeeds = [
    {
      question: singleChoice,
      textAnswer: undefined,
      booleanAnswer: undefined,
      score: 5,
      maxScore: 5,
      isCorrect: true,
      selectedLabels: ["B"],
      feedback: undefined,
    },
    {
      question: multipleChoice,
      textAnswer: undefined,
      booleanAnswer: undefined,
      score: 5,
      maxScore: 5,
      isCorrect: true,
      selectedLabels: ["A", "B"],
      feedback: undefined,
    },
    {
      question: trueFalse,
      textAnswer: undefined,
      booleanAnswer: true,
      score: 5,
      maxScore: 5,
      isCorrect: true,
      selectedLabels: [],
      feedback: undefined,
    },
    {
      question: fillBlank,
      textAnswer: "5",
      booleanAnswer: undefined,
      score: 0,
      maxScore: 5,
      isCorrect: false,
      selectedLabels: [],
      feedback: "等式两边应同时除以 3。",
    },
    {
      question: shortAnswer,
      textAnswer: "直角三角形的两直角边平方和等于斜边平方。",
      booleanAnswer: undefined,
      score: 8,
      maxScore: 10,
      isCorrect: false,
      selectedLabels: [],
      feedback: "表述正确，建议补充公式。",
    },
  ];
  let wrongAnswerId: string | undefined;
  for (const answerSeed of answerSeeds) {
    const assignmentQuestionId = assignmentQuestionByQuestionId.get(
      answerSeed.question.id,
    );
    if (!assignmentQuestionId) {
      throw new Error(
        `Missing assignment snapshot for ${answerSeed.question.id}`,
      );
    }
    const isManual = answerSeed.question.type === QuestionType.SHORT_ANSWER;
    const answer = await prisma.studentAnswer.upsert({
      where: {
        submissionId_assignmentQuestionId: {
          submissionId: submission.id,
          assignmentQuestionId,
        },
      },
      update: {
        graderId: isManual ? teacher.id : null,
        textAnswer: answerSeed.textAnswer,
        booleanAnswer: answerSeed.booleanAnswer,
        gradingStatus: isManual
          ? GradingStatus.GRADED
          : GradingStatus.AUTO_GRADED,
        score: new Prisma.Decimal(answerSeed.score),
        maxScore: new Prisma.Decimal(answerSeed.maxScore),
        isCorrect: answerSeed.isCorrect,
        teacherFeedback: answerSeed.feedback,
        gradedAt: new Date("2026-07-14T02:10:00.000Z"),
      },
      create: {
        submissionId: submission.id,
        assignmentQuestionId,
        graderId: isManual ? teacher.id : undefined,
        textAnswer: answerSeed.textAnswer,
        booleanAnswer: answerSeed.booleanAnswer,
        gradingStatus: isManual
          ? GradingStatus.GRADED
          : GradingStatus.AUTO_GRADED,
        score: new Prisma.Decimal(answerSeed.score),
        maxScore: new Prisma.Decimal(answerSeed.maxScore),
        isCorrect: answerSeed.isCorrect,
        teacherFeedback: answerSeed.feedback,
        gradedAt: new Date("2026-07-14T02:10:00.000Z"),
      },
    });
    if (answerSeed.question.id === fillBlank.id) {
      wrongAnswerId = answer.id;
    }

    for (const selectedLabel of answerSeed.selectedLabels) {
      const option = await prisma.assignmentQuestionOption.findUniqueOrThrow({
        where: {
          assignmentQuestionId_labelSnapshot: {
            assignmentQuestionId,
            labelSnapshot: selectedLabel,
          },
        },
      });
      await prisma.studentAnswerOption.upsert({
        where: {
          studentAnswerId_assignmentQuestionOptionId: {
            studentAnswerId: answer.id,
            assignmentQuestionOptionId: option.id,
          },
        },
        update: {},
        create: {
          studentAnswerId: answer.id,
          assignmentQuestionOptionId: option.id,
        },
      });
    }
  }

  if (!wrongAnswerId) {
    throw new Error("Missing wrong answer seed record");
  }
  const fillAssignmentQuestionId = assignmentQuestionByQuestionId.get(
    fillBlank.id,
  );
  if (!fillAssignmentQuestionId) {
    throw new Error("Missing fill-blank assignment snapshot");
  }
  await prisma.wrongQuestion.upsert({
    where: { studentAnswerId: wrongAnswerId },
    update: {
      studentId: student.id,
      assignmentQuestionId: fillAssignmentQuestionId,
      isResolved: false,
      reviewCount: 1,
      lastReviewedAt: new Date("2026-07-14T03:00:00.000Z"),
    },
    create: {
      studentId: student.id,
      studentAnswerId: wrongAnswerId,
      assignmentQuestionId: fillAssignmentQuestionId,
      isResolved: false,
      reviewCount: 1,
      firstWrongAt: new Date("2026-07-14T02:15:00.000Z"),
      lastReviewedAt: new Date("2026-07-14T03:00:00.000Z"),
    },
  });

  await prisma.studentKnowledgeMastery.upsert({
    where: {
      studentId_knowledgePointId: {
        studentId: student.id,
        knowledgePointId: algebra.id,
      },
    },
    update: {
      level: MasteryLevel.BEGINNER,
      trend: MasteryTrend.DOWN,
      masteryScore: new Prisma.Decimal(40),
      earnedPoints: new Prisma.Decimal(4),
      availablePoints: new Prisma.Decimal(10),
      answeredCount: 2,
      correctCount: 1,
      calculatedAt: new Date("2026-07-14T02:16:00.000Z"),
    },
    create: {
      studentId: student.id,
      knowledgePointId: algebra.id,
      level: MasteryLevel.BEGINNER,
      trend: MasteryTrend.DOWN,
      masteryScore: new Prisma.Decimal(40),
      earnedPoints: new Prisma.Decimal(4),
      availablePoints: new Prisma.Decimal(10),
      answeredCount: 2,
      correctCount: 1,
      calculatedAt: new Date("2026-07-14T02:16:00.000Z"),
    },
  });
  await prisma.studentKnowledgeMastery.upsert({
    where: {
      studentId_knowledgePointId: {
        studentId: student.id,
        knowledgePointId: geometry.id,
      },
    },
    update: {
      level: MasteryLevel.PROFICIENT,
      trend: MasteryTrend.UP,
      masteryScore: new Prisma.Decimal(86.67),
      earnedPoints: new Prisma.Decimal(13),
      availablePoints: new Prisma.Decimal(15),
      answeredCount: 2,
      correctCount: 1,
      calculatedAt: new Date("2026-07-14T02:16:00.000Z"),
    },
    create: {
      studentId: student.id,
      knowledgePointId: geometry.id,
      level: MasteryLevel.PROFICIENT,
      trend: MasteryTrend.UP,
      masteryScore: new Prisma.Decimal(86.67),
      earnedPoints: new Prisma.Decimal(13),
      availablePoints: new Prisma.Decimal(15),
      answeredCount: 2,
      correctCount: 1,
      calculatedAt: new Date("2026-07-14T02:16:00.000Z"),
    },
  });

  const studentAnalysis = await prisma.aIAnalysis.upsert({
    where: { requestKey: "seed-analysis-student-1-2026-07" },
    update: {
      requestedById: student.id,
      studentId: student.id,
      classroomId: null,
      scope: AIAnalysisScope.STUDENT,
      status: AIRecordStatus.SUCCEEDED,
      riskLevel: RiskLevel.MEDIUM,
      summary: "几何表现稳定，一元一次方程是当前主要薄弱点。",
      overallScore: new Prisma.Decimal("76.67"),
      sampleSize: 5,
      provider: "seed-provider",
      model: "seed-model",
      promptVersion: "student-analysis-v1",
      retryCount: 0,
      fallbackUsed: false,
      inputMetrics: {
        assignmentCount: 1,
        publishedSubmissionCount: 1,
      },
      rawResponse: {
        summary: "几何表现稳定，一元一次方程是当前主要薄弱点。",
        validated: true,
      },
      completedAt: new Date("2026-07-14T02:20:00.000Z"),
    },
    create: {
      requestKey: "seed-analysis-student-1-2026-07",
      requestedById: student.id,
      studentId: student.id,
      scope: AIAnalysisScope.STUDENT,
      status: AIRecordStatus.SUCCEEDED,
      riskLevel: RiskLevel.MEDIUM,
      summary: "几何表现稳定，一元一次方程是当前主要薄弱点。",
      overallScore: new Prisma.Decimal("76.67"),
      sampleSize: 5,
      provider: "seed-provider",
      model: "seed-model",
      promptVersion: "student-analysis-v1",
      retryCount: 0,
      fallbackUsed: false,
      inputMetrics: {
        assignmentCount: 1,
        publishedSubmissionCount: 1,
      },
      rawResponse: {
        summary: "几何表现稳定，一元一次方程是当前主要薄弱点。",
        validated: true,
      },
      completedAt: new Date("2026-07-14T02:20:00.000Z"),
    },
  });
  await upsertAnalysisInsight({
    analysisId: studentAnalysis.id,
    knowledgePointId: geometry.id,
    type: AIInsightType.STRENGTH,
    title: "平面几何表现较好",
    detail: "相关题目加权得分率为 86.67%。",
    priority: 2,
    metricName: "masteryScore",
    metricValue: new Prisma.Decimal("86.67"),
  });
  await upsertAnalysisInsight({
    analysisId: studentAnalysis.id,
    knowledgePointId: algebra.id,
    type: AIInsightType.WEAKNESS,
    title: "方程移项需要巩固",
    detail: "近期方程知识点加权得分率仅为 40%。",
    priority: 10,
    metricName: "masteryScore",
    metricValue: new Prisma.Decimal(40),
    recommendedAction: "先完成 3 道同难度方程练习，再逐步提高难度。",
  });

  const classAnalysis = await prisma.aIAnalysis.upsert({
    where: { requestKey: "seed-analysis-class-1-fallback" },
    update: {
      requestedById: teacher.id,
      studentId: null,
      classroomId: classroom.id,
      scope: AIAnalysisScope.CLASSROOM,
      status: AIRecordStatus.FALLBACK,
      riskLevel: RiskLevel.UNKNOWN,
      summary: "AI 服务不可用，当前结果由规则统计生成。",
      sampleSize: 2,
      promptVersion: "class-analysis-v1",
      retryCount: 1,
      fallbackUsed: true,
      inputMetrics: { submittedStudents: 1, enrolledStudents: 2 },
      errorCode: "PROVIDER_TIMEOUT",
      completedAt: new Date("2026-07-14T02:25:00.000Z"),
    },
    create: {
      requestKey: "seed-analysis-class-1-fallback",
      requestedById: teacher.id,
      classroomId: classroom.id,
      scope: AIAnalysisScope.CLASSROOM,
      status: AIRecordStatus.FALLBACK,
      riskLevel: RiskLevel.UNKNOWN,
      summary: "AI 服务不可用，当前结果由规则统计生成。",
      sampleSize: 2,
      promptVersion: "class-analysis-v1",
      retryCount: 1,
      fallbackUsed: true,
      inputMetrics: { submittedStudents: 1, enrolledStudents: 2 },
      errorCode: "PROVIDER_TIMEOUT",
      completedAt: new Date("2026-07-14T02:25:00.000Z"),
    },
  });

  await prisma.personalizedRecommendation.upsert({
    where: {
      studentId_questionId_cycleKey: {
        studentId: student.id,
        questionId: fillBlank.id,
        cycleKey: "2026-07-week-3",
      },
    },
    update: {
      knowledgePointId: algebra.id,
      analysisId: studentAnalysis.id,
      source: RecommendationSource.HYBRID,
      status: RecommendationStatus.PENDING,
      reason: "一元一次方程掌握度低于 60%，推荐同难度巩固练习。",
      targetDifficulty: 3,
      priority: 10,
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    },
    create: {
      studentId: student.id,
      questionId: fillBlank.id,
      knowledgePointId: algebra.id,
      analysisId: studentAnalysis.id,
      cycleKey: "2026-07-week-3",
      source: RecommendationSource.HYBRID,
      status: RecommendationStatus.PENDING,
      reason: "一元一次方程掌握度低于 60%，推荐同难度巩固练习。",
      targetDifficulty: 3,
      priority: 10,
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    },
  });
  await prisma.personalizedRecommendation.upsert({
    where: {
      studentId_questionId_cycleKey: {
        studentId: student.id,
        questionId: singleChoice.id,
        cycleKey: "2026-07-week-2",
      },
    },
    update: {
      knowledgePointId: arithmetic.id,
      analysisId: null,
      source: RecommendationSource.RULE,
      status: RecommendationStatus.COMPLETED,
      reason: "用于复习基础运算。",
      targetDifficulty: 1,
      priority: 1,
      completedAt: new Date("2026-07-13T01:00:00.000Z"),
      wasCorrect: true,
      score: new Prisma.Decimal(5),
      maxScore: new Prisma.Decimal(5),
    },
    create: {
      studentId: student.id,
      questionId: singleChoice.id,
      knowledgePointId: arithmetic.id,
      cycleKey: "2026-07-week-2",
      source: RecommendationSource.RULE,
      status: RecommendationStatus.COMPLETED,
      reason: "用于复习基础运算。",
      targetDifficulty: 1,
      priority: 1,
      completedAt: new Date("2026-07-13T01:00:00.000Z"),
      wasCorrect: true,
      score: new Prisma.Decimal(5),
      maxScore: new Prisma.Decimal(5),
    },
  });

  await prisma.aITutoringRecord.upsert({
    where: { requestKey: "seed-tutoring-student-1-fill-1" },
    update: {
      studentId: student.id,
      questionId: fillBlank.id,
      knowledgePointId: algebra.id,
      status: AIRecordStatus.SUCCEEDED,
      prompt: "为什么 3x = 12 的答案不是 5？",
      answer: "把等式两边同时除以 3，就能保持等式成立并得到 x = 4。",
      explanationSteps: [
        "识别 x 的系数为 3",
        "等式两边同时除以 3",
        "计算得到 x = 4",
      ],
      hints: ["想一想怎样消去 x 前面的 3。"],
      provider: "seed-provider",
      model: "seed-model",
      promptVersion: "question-help-v1",
      retryCount: 0,
      fallbackUsed: false,
      confidence: new Prisma.Decimal("0.9500"),
      safetyFlagged: false,
      inputContext: {
        questionType: "FILL_BLANK",
        includeStandardAnswer: false,
      },
      rawResponse: { validated: true, stepCount: 3 },
      promptTokens: 80,
      completionTokens: 120,
      latencyMs: 350,
      completedAt: new Date("2026-07-14T03:05:00.000Z"),
    },
    create: {
      requestKey: "seed-tutoring-student-1-fill-1",
      studentId: student.id,
      questionId: fillBlank.id,
      knowledgePointId: algebra.id,
      status: AIRecordStatus.SUCCEEDED,
      prompt: "为什么 3x = 12 的答案不是 5？",
      answer: "把等式两边同时除以 3，就能保持等式成立并得到 x = 4。",
      explanationSteps: [
        "识别 x 的系数为 3",
        "等式两边同时除以 3",
        "计算得到 x = 4",
      ],
      hints: ["想一想怎样消去 x 前面的 3。"],
      provider: "seed-provider",
      model: "seed-model",
      promptVersion: "question-help-v1",
      retryCount: 0,
      fallbackUsed: false,
      confidence: new Prisma.Decimal("0.9500"),
      safetyFlagged: false,
      inputContext: {
        questionType: "FILL_BLANK",
        includeStandardAnswer: false,
      },
      rawResponse: { validated: true, stepCount: 3 },
      promptTokens: 80,
      completionTokens: 120,
      latencyMs: 350,
      completedAt: new Date("2026-07-14T03:05:00.000Z"),
    },
  });
  await prisma.aITutoringRecord.upsert({
    where: { requestKey: "seed-tutoring-student-1-fallback" },
    update: {
      studentId: student.id,
      questionId: shortAnswer.id,
      knowledgePointId: geometry.id,
      status: AIRecordStatus.FALLBACK,
      prompt: "怎样写出勾股定理的完整公式？",
      answer: shortAnswer.explanation,
      explanationSteps: ["确认题目涉及直角三角形", "使用题库中的规则解析"],
      hints: ["用 a、b 表示直角边，用 c 表示斜边。"],
      promptVersion: "question-help-v1",
      retryCount: 1,
      fallbackUsed: true,
      safetyFlagged: false,
      errorCode: "INVALID_AI_OUTPUT",
      completedAt: new Date("2026-07-14T03:10:00.000Z"),
    },
    create: {
      requestKey: "seed-tutoring-student-1-fallback",
      studentId: student.id,
      questionId: shortAnswer.id,
      knowledgePointId: geometry.id,
      status: AIRecordStatus.FALLBACK,
      prompt: "怎样写出勾股定理的完整公式？",
      answer: shortAnswer.explanation,
      explanationSteps: ["确认题目涉及直角三角形", "使用题库中的规则解析"],
      hints: ["用 a、b 表示直角边，用 c 表示斜边。"],
      promptVersion: "question-help-v1",
      retryCount: 1,
      fallbackUsed: true,
      safetyFlagged: false,
      errorCode: "INVALID_AI_OUTPUT",
      completedAt: new Date("2026-07-14T03:10:00.000Z"),
    },
  });

  console.info(
    `Seeded ${users.length} users, classroom ${classroom.name}, assignment ${assignment.title}, and AI records ${studentAnalysis.id}/${classAnalysis.id}.`,
  );
  console.info(`Unenrolled permission-test student: ${studentThree.email}`);
}

main()
  .catch((error: unknown) => {
    console.error("Failed to seed the database:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
