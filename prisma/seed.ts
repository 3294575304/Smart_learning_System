import {
  AIAnalysisScope,
  AIInsightType,
  AIRecordStatus,
  AuditAction,
  AuditTargetType,
  CourseStatus,
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

import { assertSafeSeedDatabase } from "./seed-safety";

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
    deletedAt: null,
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

async function seedUniversityDemo(): Promise<void> {
  type NetworkQuestionSeed = SeedQuestion & {
    key: string;
    knowledgePointCodes: string[];
    options?: SeedOption[];
  };

  type NetworkAssignmentQuestionSeed = {
    questionKey: string;
    points: number;
    sortOrder: number;
  };

  type NetworkAssignmentSeed = {
    key: string;
    title: string;
    description: string;
    publishedAt: Date;
    dueAt: Date;
    questions: NetworkAssignmentQuestionSeed[];
  };

  type NetworkSubmissionAnswerSeed = {
    questionKey: string;
    textAnswer?: string;
    booleanAnswer?: boolean;
    selectedLabels?: string[];
    score: number;
    maxScore: number;
    isCorrect: boolean;
    teacherFeedback?: string;
    responseTimeMs: number;
  };

  type NetworkSubmissionSeed = {
    key: string;
    assignmentKey: string;
    studentEmail: string;
    idempotencyKey: string;
    startedAt: Date;
    submittedAt: Date;
    gradedAt: Date;
    publishedAt: Date;
    feedback: string;
    saveVersion: number;
    lastSavedAt: Date;
    answers: NetworkSubmissionAnswerSeed[];
  };

  type NetworkMasterySeed = {
    studentEmail: string;
    knowledgePointCode: string;
    level: MasteryLevel;
    trend: MasteryTrend;
    masteryScore: string;
    earnedPoints: string;
    availablePoints: string;
    answeredCount: number;
    correctCount: number;
    calculatedAt: Date;
  };

  type NetworkAnalysisInsightSeed = {
    knowledgePointCode?: string;
    type: AIInsightType;
    title: string;
    detail: string;
    priority: number;
    metricName?: string;
    metricValue?: string;
    recommendedAction?: string;
  };

  type NetworkAnalysisSeed = {
    requestKey: string;
    requestedByEmail: string;
    studentEmail?: string;
    classroomScoped: boolean;
    scope: AIAnalysisScope;
    status: AIRecordStatus;
    riskLevel: RiskLevel;
    summary: string;
    overallScore: string;
    sampleSize: number;
    basedOnFrom: Date;
    basedOnTo: Date;
    promptVersion: string;
    retryCount: number;
    fallbackUsed: boolean;
    latencyMs: number;
    inputMetrics: Prisma.InputJsonValue;
    rawResponse: Prisma.InputJsonValue;
    completedAt: Date;
    errorCode?: string;
    insights: NetworkAnalysisInsightSeed[];
  };

  type NetworkRecommendationSeed = {
    studentEmail: string;
    questionKey: string;
    knowledgePointCode: string;
    analysisRequestKey: string;
    cycleKey: string;
    source: RecommendationSource;
    status: RecommendationStatus;
    reason: string;
    targetDifficulty: number;
    priority: number;
    expiresAt: Date;
  };

  const toDecimal = (value: number): Prisma.Decimal =>
    new Prisma.Decimal(value.toFixed(2));
  const average = (values: number[]): number => {
    if (values.length === 0) return 0;
    const total = values.reduce((sum, value) => sum + value, 0);
    return Number((total / values.length).toFixed(2));
  };

  const networkSeedUsers: SeedUser[] = [
    {
      email: "net-teacher@example.com",
      password: "NetDemo2024!",
      role: Role.TEACHER,
      displayName: "网络课教师",
      teacherNo: "T2024001",
    },
    {
      email: "net-student-a@example.com",
      password: "NetDemo2024!",
      role: Role.STUDENT,
      displayName: "网络专业学生甲",
      studentNo: "S2024001",
    },
    {
      email: "net-student-b@example.com",
      password: "NetDemo2024!",
      role: Role.STUDENT,
      displayName: "网络专业学生乙",
      studentNo: "S2024002",
    },
    {
      email: "net-student-c@example.com",
      password: "NetDemo2024!",
      role: Role.STUDENT,
      displayName: "网络专业学生丙",
      studentNo: "S2024003",
    },
  ];

  const [networkTeacher, networkStudentA, networkStudentB, networkStudentC] =
    await Promise.all(networkSeedUsers.map(upsertUser));
  const networkUsersByEmail = new Map<
    string,
    Awaited<ReturnType<typeof upsertUser>>
  >();
  networkUsersByEmail.set(networkTeacher.email!, networkTeacher);
  networkUsersByEmail.set(networkStudentA.email!, networkStudentA);
  networkUsersByEmail.set(networkStudentB.email!, networkStudentB);
  networkUsersByEmail.set(networkStudentC.email!, networkStudentC);

  const networkClassroom = await prisma.classroom.upsert({
    where: { joinCode: "CNSE2024" },
    update: {
      teacherId: networkTeacher.id,
      name: "2024级软件工程1班",
      description: "课程：计算机网络；大学课程 MVP 演示班级",
      status: ClassroomStatus.ACTIVE,
      allowStudentLeave: true,
      joinCodeExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
    },
    create: {
      teacherId: networkTeacher.id,
      name: "2024级软件工程1班",
      description: "课程：计算机网络；大学课程 MVP 演示班级",
      joinCode: "CNSE2024",
      status: ClassroomStatus.ACTIVE,
      allowStudentLeave: true,
      joinCodeExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
    },
  });

  for (const student of [networkStudentA, networkStudentB, networkStudentC]) {
    await prisma.classMembership.upsert({
      where: {
        classroomId_studentId: {
          classroomId: networkClassroom.id,
          studentId: student.id,
        },
      },
      update: {
        status: MembershipStatus.ACTIVE,
        endedAt: null,
      },
      create: {
        classroomId: networkClassroom.id,
        studentId: student.id,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  const knowledgePointSeeds = [
    {
      code: "CN-OSI-TCPIP",
      name: "OSI 与 TCP/IP 分层",
      description: "理解七层模型与四层模型的对应关系。",
    },
    {
      code: "CN-HTTP-HTTPS",
      name: "HTTP 与 HTTPS",
      description: "掌握 Web 请求、TLS 加密和默认端口。",
    },
    {
      code: "CN-DNS-DHCP-ARP",
      name: "DNS、DHCP 与 ARP",
      description: "区分域名解析、地址分配和局域网地址解析。",
    },
    {
      code: "CN-TCP-UDP",
      name: "TCP 与 UDP",
      description: "理解面向连接、无连接与常见适用场景。",
    },
    {
      code: "CN-TCP-HANDSHAKE",
      name: "TCP 三次握手与可靠传输",
      description: "掌握连接建立、确认机制与可靠性基础。",
    },
    {
      code: "CN-IP-SUBNET",
      name: "IPv4 与子网划分",
      description: "练习前缀长度、子网掩码与可用主机数计算。",
    },
    {
      code: "CN-ROUTING-FORWARDING",
      name: "路由与转发",
      description: "理解路由表、下一跳与最长前缀匹配。",
    },
    {
      code: "CN-CONGESTION",
      name: "拥塞控制基础",
      description: "掌握慢开始、拥塞避免和重传触发条件。",
    },
  ] as const;

  const knowledgePoints = new Map<
    string,
    Awaited<ReturnType<typeof prisma.knowledgePoint.upsert>>
  >();
  for (const seed of knowledgePointSeeds) {
    const knowledgePoint = await prisma.knowledgePoint.upsert({
      where: { code: seed.code },
      update: {
        createdById: networkTeacher.id,
        name: seed.name,
        description: seed.description,
        isActive: true,
      },
      create: {
        createdById: networkTeacher.id,
        code: seed.code,
        name: seed.name,
        description: seed.description,
      },
    });
    knowledgePoints.set(seed.code, knowledgePoint);
  }

  const questionSeeds: NetworkQuestionSeed[] = [
    {
      key: "osi-tcpip-layer",
      creatorId: networkTeacher.id,
      title: "OSI 与 TCP/IP 分层对应",
      content: "关于 TCP/IP 模型与 OSI 七层模型的对应关系，下列哪项最准确？",
      type: QuestionType.SINGLE_CHOICE,
      difficulty: 1,
      visibility: QuestionVisibility.PRIVATE,
      explanation: "TCP/IP 的应用层通常吸收了 OSI 的应用层、表示层和会话层。",
      tags: ["分层模型", "基础概念"],
      gradingConfig: { mode: "EXACT_SET" },
      knowledgePointCodes: ["CN-OSI-TCPIP"],
      options: [
        {
          label: "A",
          content: "TCP/IP 应用层大致对应 OSI 的应用层、表示层和会话层",
          isCorrect: true,
          sortOrder: 1,
        },
        {
          label: "B",
          content: "TCP/IP 传输层对应 OSI 的物理层",
          isCorrect: false,
          sortOrder: 2,
        },
        {
          label: "C",
          content: "TCP/IP 网际层对应 OSI 的数据链路层",
          isCorrect: false,
          sortOrder: 3,
        },
        {
          label: "D",
          content: "TCP/IP 网络接口层对应 OSI 的传输层",
          isCorrect: false,
          sortOrder: 4,
        },
      ],
    },
    {
      key: "https-security",
      creatorId: networkTeacher.id,
      title: "HTTPS 安全特征",
      content: "关于 HTTP 与 HTTPS 的说法，哪些正确？",
      type: QuestionType.MULTIPLE_CHOICE,
      difficulty: 2,
      visibility: QuestionVisibility.PRIVATE,
      explanation: "HTTPS 在 HTTP 之上引入 TLS，可提供加密、认证和完整性保护。",
      tags: ["HTTP", "HTTPS"],
      gradingConfig: { mode: "EXACT_SET" },
      knowledgePointCodes: ["CN-HTTP-HTTPS"],
      options: [
        {
          label: "A",
          content: "证书可以帮助验证服务器身份",
          isCorrect: true,
          sortOrder: 1,
        },
        {
          label: "B",
          content: "TLS 可以防止明文被窃听",
          isCorrect: true,
          sortOrder: 2,
        },
        {
          label: "C",
          content: "HTTPS 默认使用 443 端口",
          isCorrect: true,
          sortOrder: 3,
        },
        {
          label: "D",
          content: "HTTPS 会让所有网页内容自动压缩成二进制文件",
          isCorrect: false,
          sortOrder: 4,
        },
      ],
    },
    {
      key: "dns-dhcp-arp",
      creatorId: networkTeacher.id,
      title: "DNS、DHCP 与 ARP",
      content: "关于 DNS、DHCP 与 ARP 的说法，哪些正确？",
      type: QuestionType.MULTIPLE_CHOICE,
      difficulty: 2,
      visibility: QuestionVisibility.PRIVATE,
      explanation:
        "DNS 负责域名解析，DHCP 负责自动分配网络配置，ARP 负责局域网内 IP 到 MAC 的映射。",
      tags: ["DNS", "DHCP", "ARP"],
      gradingConfig: { mode: "EXACT_SET" },
      knowledgePointCodes: ["CN-DNS-DHCP-ARP"],
      options: [
        {
          label: "A",
          content: "DNS 负责域名与 IP 地址映射",
          isCorrect: true,
          sortOrder: 1,
        },
        {
          label: "B",
          content: "DHCP 可以自动分配 IP 地址和网关等配置",
          isCorrect: true,
          sortOrder: 2,
        },
        {
          label: "C",
          content: "ARP 用于把 IP 地址解析为局域网中的 MAC 地址",
          isCorrect: true,
          sortOrder: 3,
        },
        {
          label: "D",
          content: "ARP 负责把域名转换成邮箱地址",
          isCorrect: false,
          sortOrder: 4,
        },
      ],
    },
    {
      key: "tcpip-layer-relationship",
      creatorId: networkTeacher.id,
      title: "TCP/IP 与 OSI 的层次关系",
      content: "TCP/IP 模型中通常把 OSI 的会话层、表示层和应用层合并为应用层。",
      type: QuestionType.TRUE_FALSE,
      difficulty: 1,
      visibility: QuestionVisibility.PRIVATE,
      explanation:
        "TCP/IP 更强调实践中的分层实现，因此将上层协议整合成应用层。",
      tags: ["分层模型", "判断"],
      gradingConfig: { mode: "EXACT_BOOLEAN" },
      correctBoolean: true,
      knowledgePointCodes: ["CN-OSI-TCPIP"],
    },
    {
      key: "arp-lan-scope",
      creatorId: networkTeacher.id,
      title: "ARP 的适用范围",
      content: "ARP 只能在局域网内解析主机的 MAC 地址，不能跨路由器使用。",
      type: QuestionType.TRUE_FALSE,
      difficulty: 2,
      visibility: QuestionVisibility.PRIVATE,
      explanation: "ARP 依赖局域网广播，路由器不会直接转发 ARP 广播报文。",
      tags: ["ARP", "局域网"],
      gradingConfig: { mode: "EXACT_BOOLEAN" },
      correctBoolean: true,
      knowledgePointCodes: ["CN-DNS-DHCP-ARP"],
    },
    {
      key: "https-port",
      creatorId: networkTeacher.id,
      title: "HTTPS 默认端口",
      content: "HTTPS 默认使用的端口是 ____。",
      type: QuestionType.FILL_BLANK,
      difficulty: 1,
      visibility: QuestionVisibility.PRIVATE,
      explanation: "HTTPS 的默认端口号是 443。",
      tags: ["HTTPS", "端口"],
      acceptableAnswers: ["443"],
      gradingConfig: { mode: "EXACT_TEXT", trimWhitespace: true },
      knowledgePointCodes: ["CN-HTTP-HTTPS"],
    },
    {
      key: "dns-name",
      creatorId: networkTeacher.id,
      title: "域名解析协议",
      content: "把域名解析为 IP 地址的协议是 ____。",
      type: QuestionType.FILL_BLANK,
      difficulty: 1,
      visibility: QuestionVisibility.PRIVATE,
      explanation: "DNS 负责将域名映射到 IP 地址。",
      tags: ["DNS", "域名解析"],
      acceptableAnswers: ["DNS", "域名系统"],
      gradingConfig: { mode: "EXACT_TEXT", trimWhitespace: true },
      knowledgePointCodes: ["CN-DNS-DHCP-ARP"],
    },
    {
      key: "osi-tcpip-short",
      creatorId: networkTeacher.id,
      title: "简述 OSI 与 TCP/IP 的关系",
      content:
        "请简述 OSI 七层模型与 TCP/IP 四层模型的关系，并说明为什么在实际网络讨论中更常直接说 TCP/IP 分层。",
      type: QuestionType.SHORT_ANSWER,
      difficulty: 4,
      visibility: QuestionVisibility.PRIVATE,
      explanation:
        "OSI 提供概念框架，TCP/IP 则将上层功能压缩为实践中的应用层，更贴近真实协议栈。",
      tags: ["分层模型", "简答"],
      referenceAnswer:
        "OSI 七层模型更完整地描述了网络功能划分，TCP/IP 在实践中把会话层、表示层和应用层合并为应用层，把物理层和数据链路层合并为网络接口层，因此实际讨论中常直接采用 TCP/IP 四层模型。",
      gradingConfig: { mode: "MANUAL", manualReviewRequired: true },
      knowledgePointCodes: ["CN-OSI-TCPIP"],
    },
    {
      key: "tcp-udp-choice",
      creatorId: networkTeacher.id,
      title: "TCP 与 UDP",
      content: "下列关于 TCP 与 UDP 的说法，哪一项正确？",
      type: QuestionType.SINGLE_CHOICE,
      difficulty: 2,
      visibility: QuestionVisibility.PRIVATE,
      explanation: "TCP 面向连接并提供可靠传输，UDP 则更轻量但不保证可靠性。",
      tags: ["TCP", "UDP"],
      gradingConfig: { mode: "EXACT_SET" },
      knowledgePointCodes: ["CN-TCP-UDP"],
      options: [
        {
          label: "A",
          content: "TCP 面向连接并提供可靠传输",
          isCorrect: true,
          sortOrder: 1,
        },
        {
          label: "B",
          content: "UDP 必须先建立连接再传输",
          isCorrect: false,
          sortOrder: 2,
        },
        {
          label: "C",
          content: "UDP 会自动重传所有丢失报文段",
          isCorrect: false,
          sortOrder: 3,
        },
        {
          label: "D",
          content: "TCP 不支持流量控制",
          isCorrect: false,
          sortOrder: 4,
        },
      ],
    },
    {
      key: "tcp-handshake",
      creatorId: networkTeacher.id,
      title: "TCP 三次握手",
      content: "关于 TCP 三次握手，下列哪些说法正确？",
      type: QuestionType.MULTIPLE_CHOICE,
      difficulty: 3,
      visibility: QuestionVisibility.PRIVATE,
      explanation:
        "三次握手用于确认双方收发能力，并协商初始序列号，从而建立可靠连接。",
      tags: ["TCP", "三次握手"],
      gradingConfig: { mode: "EXACT_SET" },
      knowledgePointCodes: ["CN-TCP-HANDSHAKE"],
      options: [
        {
          label: "A",
          content: "双方可以确认彼此的发送和接收能力",
          isCorrect: true,
          sortOrder: 1,
        },
        {
          label: "B",
          content: "可以协商初始序列号",
          isCorrect: true,
          sortOrder: 2,
        },
        {
          label: "C",
          content: "三次握手的主要目的是压缩报文长度",
          isCorrect: false,
          sortOrder: 3,
        },
        {
          label: "D",
          content: "它帮助建立可靠连接",
          isCorrect: true,
          sortOrder: 4,
        },
      ],
    },
    {
      key: "tcp-congestion",
      creatorId: networkTeacher.id,
      title: "TCP 拥塞控制",
      content: "关于 TCP 拥塞控制，下列哪些说法正确？",
      type: QuestionType.MULTIPLE_CHOICE,
      difficulty: 4,
      visibility: QuestionVisibility.PRIVATE,
      explanation:
        "慢开始阶段拥塞窗口通常指数增长，拥塞避免阶段则更接近线性增长，重复 ACK 可能触发快速重传。",
      tags: ["TCP", "拥塞控制"],
      gradingConfig: { mode: "EXACT_SET" },
      knowledgePointCodes: ["CN-CONGESTION"],
      options: [
        {
          label: "A",
          content: "慢开始阶段拥塞窗口通常指数增长",
          isCorrect: true,
          sortOrder: 1,
        },
        {
          label: "B",
          content: "拥塞避免阶段通常更接近线性增长",
          isCorrect: true,
          sortOrder: 2,
        },
        {
          label: "C",
          content: "收到三次重复 ACK 可能触发快速重传",
          isCorrect: true,
          sortOrder: 3,
        },
        {
          label: "D",
          content: "UDP 也使用 TCP 的拥塞控制算法",
          isCorrect: false,
          sortOrder: 4,
        },
      ],
    },
    {
      key: "routing-forwarding",
      creatorId: networkTeacher.id,
      title: "最长前缀匹配",
      content: "路由器在转发数据包时通常使用最长前缀匹配来选择下一跳。",
      type: QuestionType.TRUE_FALSE,
      difficulty: 2,
      visibility: QuestionVisibility.PRIVATE,
      explanation:
        "路由器会在路由表中选择与目的地址匹配度最高、前缀最长的条目。",
      tags: ["路由", "转发"],
      gradingConfig: { mode: "EXACT_BOOLEAN" },
      correctBoolean: true,
      knowledgePointCodes: ["CN-ROUTING-FORWARDING"],
    },
    {
      key: "tcp-ack",
      creatorId: networkTeacher.id,
      title: "TCP 确认位",
      content: "TCP 首部中用于确认对方数据已收到的控制位通常简称为 ____。",
      type: QuestionType.FILL_BLANK,
      difficulty: 2,
      visibility: QuestionVisibility.PRIVATE,
      explanation: "ACK 标志位用于表示确认响应。",
      tags: ["TCP", "确认"],
      acceptableAnswers: ["ACK", "确认位", "确认标志"],
      gradingConfig: { mode: "EXACT_TEXT", trimWhitespace: true },
      knowledgePointCodes: ["CN-TCP-HANDSHAKE"],
    },
    {
      key: "subnet-prefix",
      creatorId: networkTeacher.id,
      title: "子网前缀",
      content: "255.255.255.192 对应的前缀长度是 ____。",
      type: QuestionType.FILL_BLANK,
      difficulty: 3,
      visibility: QuestionVisibility.PRIVATE,
      explanation: "255.255.255.192 对应 /26，单个子网可用主机数为 62。",
      tags: ["IP 地址", "子网划分"],
      acceptableAnswers: ["26", "/26"],
      gradingConfig: { mode: "EXACT_TEXT", trimWhitespace: true },
      knowledgePointCodes: ["CN-IP-SUBNET"],
    },
    {
      key: "tcp-congestion-short",
      creatorId: networkTeacher.id,
      title: "TCP 慢开始与拥塞避免",
      content:
        "请说明 TCP 慢开始和拥塞避免的基本思想，并举例说明拥塞窗口如何变化。",
      type: QuestionType.SHORT_ANSWER,
      difficulty: 5,
      visibility: QuestionVisibility.PRIVATE,
      explanation:
        "慢开始用于快速探测可用带宽，拥塞避免用于在接近阈值后平稳增加窗口并及时响应拥塞。",
      tags: ["TCP", "拥塞控制", "简答"],
      referenceAnswer:
        "慢开始时拥塞窗口从较小值开始并按轮次快速增长，达到慢开始门限后进入拥塞避免阶段，拥塞窗口改为线性增长；一旦发生拥塞，通常会降低拥塞窗口并重新调整门限。",
      gradingConfig: { mode: "MANUAL", manualReviewRequired: true },
      knowledgePointCodes: ["CN-CONGESTION"],
    },
  ];

  const networkQuestions = new Map<
    string,
    Awaited<ReturnType<typeof upsertQuestion>>
  >();
  for (const seed of questionSeeds) {
    const question = await upsertQuestion({
      creatorId: seed.creatorId,
      title: seed.title,
      content: seed.content,
      type: seed.type,
      difficulty: seed.difficulty,
      visibility: seed.visibility,
      explanation: seed.explanation,
      tags: seed.tags,
      correctBoolean: seed.correctBoolean,
      referenceAnswer: seed.referenceAnswer,
      acceptableAnswers: seed.acceptableAnswers,
      gradingConfig: seed.gradingConfig,
    });
    networkQuestions.set(seed.key, question);

    if (seed.options) {
      await upsertQuestionOptions(question.id, seed.options);
    }

    for (const knowledgePointCode of seed.knowledgePointCodes) {
      const knowledgePoint = knowledgePoints.get(knowledgePointCode);
      if (!knowledgePoint) {
        throw new Error(`Missing knowledge point seed ${knowledgePointCode}`);
      }
      await prisma.questionKnowledgePoint.upsert({
        where: {
          questionId_knowledgePointId: {
            questionId: question.id,
            knowledgePointId: knowledgePoint.id,
          },
        },
        update: { weight: new Prisma.Decimal(1) },
        create: {
          questionId: question.id,
          knowledgePointId: knowledgePoint.id,
          weight: new Prisma.Decimal(1),
        },
      });
    }
  }

  const assignmentSeeds: NetworkAssignmentSeed[] = [
    {
      key: "network-architecture",
      title: "网络体系结构与应用层协议",
      description: "围绕分层模型、HTTP、DNS 和地址解析的入门演示作业。",
      publishedAt: new Date("2026-07-20T01:00:00.000Z"),
      dueAt: new Date("2026-08-05T16:00:00.000Z"),
      questions: [
        { questionKey: "osi-tcpip-layer", points: 4, sortOrder: 1 },
        { questionKey: "https-security", points: 5, sortOrder: 2 },
        { questionKey: "dns-dhcp-arp", points: 5, sortOrder: 3 },
        { questionKey: "tcpip-layer-relationship", points: 3, sortOrder: 4 },
        { questionKey: "arp-lan-scope", points: 3, sortOrder: 5 },
        { questionKey: "https-port", points: 3, sortOrder: 6 },
        { questionKey: "dns-name", points: 2, sortOrder: 7 },
        { questionKey: "osi-tcpip-short", points: 5, sortOrder: 8 },
      ],
    },
    {
      key: "network-transport",
      title: "TCP、IP 地址与子网划分",
      description: "围绕 TCP、拥塞控制、路由和子网划分的进阶演示作业。",
      publishedAt: new Date("2026-07-21T01:00:00.000Z"),
      dueAt: new Date("2026-08-08T16:00:00.000Z"),
      questions: [
        { questionKey: "tcp-udp-choice", points: 4, sortOrder: 1 },
        { questionKey: "tcp-handshake", points: 5, sortOrder: 2 },
        { questionKey: "tcp-congestion", points: 5, sortOrder: 3 },
        { questionKey: "routing-forwarding", points: 3, sortOrder: 4 },
        { questionKey: "tcp-ack", points: 3, sortOrder: 5 },
        { questionKey: "subnet-prefix", points: 5, sortOrder: 6 },
        { questionKey: "tcp-congestion-short", points: 5, sortOrder: 7 },
      ],
    },
  ];

  const assignmentByKey = new Map<
    string,
    Awaited<ReturnType<typeof prisma.assignment.upsert>>
  >();
  const assignmentQuestionIdByKey = new Map<string, Map<string, string>>();
  for (const assignmentSeed of assignmentSeeds) {
    const assignmentQuestions = assignmentSeed.questions.map((item) => {
      const question = networkQuestions.get(item.questionKey);
      if (!question) {
        throw new Error(`Missing network question ${item.questionKey}`);
      }
      return {
        question,
        ...item,
      };
    });
    const totalPoints = assignmentQuestions.reduce(
      (sum, item) => sum + item.points,
      0,
    );
    const existingAssignment = await prisma.assignment.findFirst({
      where: {
        classroomId: networkClassroom.id,
        title: assignmentSeed.title,
      },
    });
    const assignmentData = {
      classroomId: networkClassroom.id,
      teacherId: networkTeacher.id,
      title: assignmentSeed.title,
      description: assignmentSeed.description,
      status: AssignmentStatus.PUBLISHED,
      totalPoints: new Prisma.Decimal(totalPoints),
      allowResubmission: false,
      publishedAt: assignmentSeed.publishedAt,
      dueAt: assignmentSeed.dueAt,
    };
    const assignment = existingAssignment
      ? await prisma.assignment.update({
          where: { id: existingAssignment.id },
          data: assignmentData,
        })
      : await prisma.assignment.create({ data: assignmentData });
    assignmentByKey.set(assignmentSeed.key, assignment);

    const assignmentQuestionIds = new Map<string, string>();
    assignmentQuestionIdByKey.set(assignmentSeed.key, assignmentQuestionIds);
    for (const item of assignmentQuestions) {
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
      assignmentQuestionIds.set(item.questionKey, assignmentQuestion.id);

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
  }

  const submissionSeeds: NetworkSubmissionSeed[] = [
    {
      key: "network-a-architecture",
      assignmentKey: "network-architecture",
      studentEmail: networkStudentA.email!,
      idempotencyKey: "seed-network-a-architecture",
      startedAt: new Date("2026-07-22T01:10:00.000Z"),
      submittedAt: new Date("2026-07-22T01:45:00.000Z"),
      gradedAt: new Date("2026-07-22T02:05:00.000Z"),
      publishedAt: new Date("2026-07-22T02:10:00.000Z"),
      feedback: "应用层协议掌握扎实，继续加强分层迁移理解。",
      saveVersion: 4,
      lastSavedAt: new Date("2026-07-22T01:40:00.000Z"),
      answers: [
        {
          questionKey: "osi-tcpip-layer",
          selectedLabels: ["A"],
          score: 4,
          maxScore: 4,
          isCorrect: true,
          responseTimeMs: 18_000,
        },
        {
          questionKey: "https-security",
          selectedLabels: ["A", "B", "C"],
          score: 5,
          maxScore: 5,
          isCorrect: true,
          responseTimeMs: 21_000,
        },
        {
          questionKey: "dns-dhcp-arp",
          selectedLabels: ["A", "B", "C"],
          score: 5,
          maxScore: 5,
          isCorrect: true,
          responseTimeMs: 23_000,
        },
        {
          questionKey: "tcpip-layer-relationship",
          booleanAnswer: true,
          score: 3,
          maxScore: 3,
          isCorrect: true,
          responseTimeMs: 14_000,
        },
        {
          questionKey: "arp-lan-scope",
          booleanAnswer: true,
          score: 3,
          maxScore: 3,
          isCorrect: true,
          responseTimeMs: 12_000,
        },
        {
          questionKey: "https-port",
          textAnswer: "443",
          score: 3,
          maxScore: 3,
          isCorrect: true,
          responseTimeMs: 11_000,
        },
        {
          questionKey: "dns-name",
          textAnswer: "DNS",
          score: 2,
          maxScore: 2,
          isCorrect: true,
          responseTimeMs: 9_000,
        },
        {
          questionKey: "osi-tcpip-short",
          textAnswer: "OSI 七层更完整，TCP/IP 在实践中把上层功能整合得更紧凑。",
          score: 5,
          maxScore: 5,
          isCorrect: true,
          teacherFeedback: "表达清楚，抓住了实际协议栈的特点。",
          responseTimeMs: 42_000,
        },
      ],
    },
    {
      key: "network-b-architecture",
      assignmentKey: "network-architecture",
      studentEmail: networkStudentB.email!,
      idempotencyKey: "seed-network-b-architecture",
      startedAt: new Date("2026-07-22T02:00:00.000Z"),
      submittedAt: new Date("2026-07-22T02:34:00.000Z"),
      gradedAt: new Date("2026-07-22T02:52:00.000Z"),
      publishedAt: new Date("2026-07-22T03:00:00.000Z"),
      feedback: "应用层协议掌握很好，继续巩固 TCP 相关细节。",
      saveVersion: 3,
      lastSavedAt: new Date("2026-07-22T02:28:00.000Z"),
      answers: [
        {
          questionKey: "osi-tcpip-layer",
          selectedLabels: ["A"],
          score: 4,
          maxScore: 4,
          isCorrect: true,
          responseTimeMs: 17_000,
        },
        {
          questionKey: "https-security",
          selectedLabels: ["A", "B", "C"],
          score: 5,
          maxScore: 5,
          isCorrect: true,
          responseTimeMs: 19_000,
        },
        {
          questionKey: "dns-dhcp-arp",
          selectedLabels: ["A", "B", "C"],
          score: 5,
          maxScore: 5,
          isCorrect: true,
          responseTimeMs: 20_000,
        },
        {
          questionKey: "tcpip-layer-relationship",
          booleanAnswer: true,
          score: 3,
          maxScore: 3,
          isCorrect: true,
          responseTimeMs: 13_000,
        },
        {
          questionKey: "arp-lan-scope",
          booleanAnswer: true,
          score: 3,
          maxScore: 3,
          isCorrect: true,
          responseTimeMs: 12_000,
        },
        {
          questionKey: "https-port",
          textAnswer: "443",
          score: 3,
          maxScore: 3,
          isCorrect: true,
          responseTimeMs: 10_000,
        },
        {
          questionKey: "dns-name",
          textAnswer: "域名系统",
          score: 2,
          maxScore: 2,
          isCorrect: true,
          responseTimeMs: 8_000,
        },
        {
          questionKey: "osi-tcpip-short",
          textAnswer:
            "TCP/IP 把上层功能合并后更接近工程实践，便于应用层协议统一理解。",
          score: 5,
          maxScore: 5,
          isCorrect: true,
          teacherFeedback: "应用层理解到位。",
          responseTimeMs: 39_000,
        },
      ],
    },
    {
      key: "network-c-architecture",
      assignmentKey: "network-architecture",
      studentEmail: networkStudentC.email!,
      idempotencyKey: "seed-network-c-architecture",
      startedAt: new Date("2026-07-22T02:20:00.000Z"),
      submittedAt: new Date("2026-07-22T02:48:00.000Z"),
      gradedAt: new Date("2026-07-22T03:15:00.000Z"),
      publishedAt: new Date("2026-07-22T03:20:00.000Z"),
      feedback: "基础概念仍需补课，但 DNS 和分层关系已有初步认识。",
      saveVersion: 3,
      lastSavedAt: new Date("2026-07-22T02:42:00.000Z"),
      answers: [
        {
          questionKey: "osi-tcpip-layer",
          selectedLabels: ["B"],
          score: 0,
          maxScore: 4,
          isCorrect: false,
          responseTimeMs: 22_000,
        },
        {
          questionKey: "https-security",
          selectedLabels: ["A", "C"],
          score: 0,
          maxScore: 5,
          isCorrect: false,
          responseTimeMs: 25_000,
        },
        {
          questionKey: "dns-dhcp-arp",
          selectedLabels: ["A", "B", "C"],
          score: 5,
          maxScore: 5,
          isCorrect: true,
          responseTimeMs: 24_000,
        },
        {
          questionKey: "tcpip-layer-relationship",
          booleanAnswer: true,
          score: 3,
          maxScore: 3,
          isCorrect: true,
          responseTimeMs: 16_000,
        },
        {
          questionKey: "arp-lan-scope",
          booleanAnswer: false,
          score: 0,
          maxScore: 3,
          isCorrect: false,
          responseTimeMs: 18_000,
        },
        {
          questionKey: "https-port",
          textAnswer: "80",
          score: 0,
          maxScore: 3,
          isCorrect: false,
          responseTimeMs: 12_000,
        },
        {
          questionKey: "dns-name",
          textAnswer: "HTTP",
          score: 0,
          maxScore: 2,
          isCorrect: false,
          responseTimeMs: 12_000,
        },
        {
          questionKey: "osi-tcpip-short",
          textAnswer: "TCP/IP 会把上面几层合在一起。",
          score: 2,
          maxScore: 5,
          isCorrect: false,
          teacherFeedback: "提到了合并关系，但还需要补充分层作用和实践原因。",
          responseTimeMs: 45_000,
        },
      ],
    },
    {
      key: "network-a-transport",
      assignmentKey: "network-transport",
      studentEmail: networkStudentA.email!,
      idempotencyKey: "seed-network-a-transport",
      startedAt: new Date("2026-07-23T01:05:00.000Z"),
      submittedAt: new Date("2026-07-23T01:38:00.000Z"),
      gradedAt: new Date("2026-07-23T02:00:00.000Z"),
      publishedAt: new Date("2026-07-23T02:05:00.000Z"),
      feedback: "整体表现优秀，子网划分需要单独补一轮。",
      saveVersion: 5,
      lastSavedAt: new Date("2026-07-23T01:31:00.000Z"),
      answers: [
        {
          questionKey: "tcp-udp-choice",
          selectedLabels: ["A"],
          score: 4,
          maxScore: 4,
          isCorrect: true,
          responseTimeMs: 16_000,
        },
        {
          questionKey: "tcp-handshake",
          selectedLabels: ["A", "B", "D"],
          score: 5,
          maxScore: 5,
          isCorrect: true,
          responseTimeMs: 20_000,
        },
        {
          questionKey: "tcp-congestion",
          selectedLabels: ["A", "B", "C"],
          score: 5,
          maxScore: 5,
          isCorrect: true,
          responseTimeMs: 24_000,
        },
        {
          questionKey: "routing-forwarding",
          booleanAnswer: true,
          score: 3,
          maxScore: 3,
          isCorrect: true,
          responseTimeMs: 12_000,
        },
        {
          questionKey: "tcp-ack",
          textAnswer: "ACK",
          score: 3,
          maxScore: 3,
          isCorrect: true,
          responseTimeMs: 10_000,
        },
        {
          questionKey: "subnet-prefix",
          textAnswer: "30",
          score: 0,
          maxScore: 5,
          isCorrect: false,
          responseTimeMs: 28_000,
        },
        {
          questionKey: "tcp-congestion-short",
          textAnswer:
            "先慢开始快速扩张窗口，达到阈值后转为线性增长；遇到拥塞就下调窗口并重新探测。",
          score: 5,
          maxScore: 5,
          isCorrect: true,
          teacherFeedback: "思路完整，子网部分再强化就更稳了。",
          responseTimeMs: 44_000,
        },
      ],
    },
    {
      key: "network-b-transport",
      assignmentKey: "network-transport",
      studentEmail: networkStudentB.email!,
      idempotencyKey: "seed-network-b-transport",
      startedAt: new Date("2026-07-23T01:20:00.000Z"),
      submittedAt: new Date("2026-07-23T01:58:00.000Z"),
      gradedAt: new Date("2026-07-23T02:18:00.000Z"),
      publishedAt: new Date("2026-07-23T02:25:00.000Z"),
      feedback: "应用层很稳，但 TCP 建连与拥塞控制还需重点补强。",
      saveVersion: 5,
      lastSavedAt: new Date("2026-07-23T01:51:00.000Z"),
      answers: [
        {
          questionKey: "tcp-udp-choice",
          selectedLabels: ["A"],
          score: 4,
          maxScore: 4,
          isCorrect: true,
          responseTimeMs: 17_000,
        },
        {
          questionKey: "tcp-handshake",
          selectedLabels: ["A", "D"],
          score: 0,
          maxScore: 5,
          isCorrect: false,
          responseTimeMs: 26_000,
        },
        {
          questionKey: "tcp-congestion",
          selectedLabels: ["A", "B", "D"],
          score: 0,
          maxScore: 5,
          isCorrect: false,
          responseTimeMs: 29_000,
        },
        {
          questionKey: "routing-forwarding",
          booleanAnswer: true,
          score: 3,
          maxScore: 3,
          isCorrect: true,
          responseTimeMs: 12_000,
        },
        {
          questionKey: "tcp-ack",
          textAnswer: "ACK",
          score: 3,
          maxScore: 3,
          isCorrect: true,
          responseTimeMs: 11_000,
        },
        {
          questionKey: "subnet-prefix",
          textAnswer: "/26",
          score: 5,
          maxScore: 5,
          isCorrect: true,
          responseTimeMs: 18_000,
        },
        {
          questionKey: "tcp-congestion-short",
          textAnswer: "慢开始和拥塞避免是逐步探测可用带宽并避免网络过载。",
          score: 4,
          maxScore: 5,
          isCorrect: false,
          teacherFeedback: "方向是对的，但需要补充窗口增长和阈值变化。",
          responseTimeMs: 46_000,
        },
      ],
    },
    {
      key: "network-c-transport",
      assignmentKey: "network-transport",
      studentEmail: networkStudentC.email!,
      idempotencyKey: "seed-network-c-transport",
      startedAt: new Date("2026-07-23T02:00:00.000Z"),
      submittedAt: new Date("2026-07-23T02:34:00.000Z"),
      gradedAt: new Date("2026-07-23T02:56:00.000Z"),
      publishedAt: new Date("2026-07-23T03:05:00.000Z"),
      feedback: "基础题仍有较多空白，建议先复习 TCP 与子网划分基础。",
      saveVersion: 4,
      lastSavedAt: new Date("2026-07-23T02:27:00.000Z"),
      answers: [
        {
          questionKey: "tcp-udp-choice",
          selectedLabels: ["B"],
          score: 0,
          maxScore: 4,
          isCorrect: false,
          responseTimeMs: 24_000,
        },
        {
          questionKey: "tcp-handshake",
          selectedLabels: ["A", "B"],
          score: 0,
          maxScore: 5,
          isCorrect: false,
          responseTimeMs: 27_000,
        },
        {
          questionKey: "tcp-congestion",
          selectedLabels: ["A", "D"],
          score: 0,
          maxScore: 5,
          isCorrect: false,
          responseTimeMs: 28_000,
        },
        {
          questionKey: "routing-forwarding",
          booleanAnswer: true,
          score: 3,
          maxScore: 3,
          isCorrect: true,
          responseTimeMs: 14_000,
        },
        {
          questionKey: "tcp-ack",
          textAnswer: "ACK",
          score: 3,
          maxScore: 3,
          isCorrect: true,
          responseTimeMs: 13_000,
        },
        {
          questionKey: "subnet-prefix",
          textAnswer: "24",
          score: 0,
          maxScore: 5,
          isCorrect: false,
          responseTimeMs: 23_000,
        },
        {
          questionKey: "tcp-congestion-short",
          textAnswer: "窗口会一点点变大，遇到拥塞就缩小。",
          score: 2,
          maxScore: 5,
          isCorrect: false,
          teacherFeedback:
            "先记住慢开始和拥塞避免的基本流程，再补具体窗口变化。",
          responseTimeMs: 48_000,
        },
      ],
    },
  ];

  const submissionPercentagesByStudentEmail = new Map<string, number[]>();
  const allSubmissionPercentages: number[] = [];
  for (const submissionSeed of submissionSeeds) {
    const assignment = assignmentByKey.get(submissionSeed.assignmentKey);
    if (!assignment) {
      throw new Error(
        `Missing assignment seed ${submissionSeed.assignmentKey}`,
      );
    }
    const assignmentQuestionIds = assignmentQuestionIdByKey.get(
      submissionSeed.assignmentKey,
    );
    if (!assignmentQuestionIds) {
      throw new Error(
        `Missing assignment question snapshots for ${submissionSeed.assignmentKey}`,
      );
    }
    const student = networkUsersByEmail.get(submissionSeed.studentEmail);
    if (!student) {
      throw new Error(`Missing student seed ${submissionSeed.studentEmail}`);
    }

    const totalScore = submissionSeed.answers.reduce(
      (sum, answer) => sum + answer.score,
      0,
    );
    const totalMaxScore = submissionSeed.answers.reduce(
      (sum, answer) => sum + answer.maxScore,
      0,
    );
    if (totalMaxScore !== assignment.totalPoints.toNumber()) {
      throw new Error(
        `Submission ${submissionSeed.key} max score mismatch: ${totalMaxScore} !== ${assignment.totalPoints.toNumber()}`,
      );
    }
    const percentage = Number(((totalScore / totalMaxScore) * 100).toFixed(2));
    const existingSubmission = await prisma.submission.findUnique({
      where: { idempotencyKey: submissionSeed.idempotencyKey },
    });
    const latestAttempt = existingSubmission
      ? null
      : await prisma.submission.aggregate({
          where: { assignmentId: assignment.id, studentId: student.id },
          _max: { attemptNumber: true },
        });
    const submissionData = {
      idempotencyKey: submissionSeed.idempotencyKey,
      status: SubmissionStatus.PUBLISHED,
      startedAt: submissionSeed.startedAt,
      submittedAt: submissionSeed.submittedAt,
      gradedAt: submissionSeed.gradedAt,
      publishedAt: submissionSeed.publishedAt,
      score: toDecimal(totalScore),
      maxScore: toDecimal(totalMaxScore),
      percentage: toDecimal(percentage),
      feedback: submissionSeed.feedback,
      saveVersion: submissionSeed.saveVersion,
      lastSavedAt: submissionSeed.lastSavedAt,
    };
    const submission = existingSubmission
      ? await prisma.submission.update({
          where: { id: existingSubmission.id },
          data: {
            assignmentId: assignment.id,
            studentId: student.id,
            ...submissionData,
          },
        })
      : await prisma.submission.create({
          data: {
            assignmentId: assignment.id,
            studentId: student.id,
            attemptNumber: (latestAttempt?._max.attemptNumber ?? 0) + 1,
            ...submissionData,
          },
        });

    for (const answerSeed of submissionSeed.answers) {
      const question = networkQuestions.get(answerSeed.questionKey);
      if (!question) {
        throw new Error(`Missing question seed ${answerSeed.questionKey}`);
      }
      const assignmentQuestionId = assignmentQuestionIds.get(
        answerSeed.questionKey,
      );
      if (!assignmentQuestionId) {
        throw new Error(
          `Missing assignment question snapshot for ${answerSeed.questionKey}`,
        );
      }
      const isShortAnswer = question.type === QuestionType.SHORT_ANSWER;
      const gradingStatus = isShortAnswer
        ? GradingStatus.GRADED
        : GradingStatus.AUTO_GRADED;
      const answer = await prisma.studentAnswer.upsert({
        where: {
          submissionId_assignmentQuestionId: {
            submissionId: submission.id,
            assignmentQuestionId,
          },
        },
        update: {
          graderId: isShortAnswer ? networkTeacher.id : null,
          textAnswer: answerSeed.textAnswer,
          booleanAnswer: answerSeed.booleanAnswer,
          gradingStatus,
          score: toDecimal(answerSeed.score),
          maxScore: toDecimal(answerSeed.maxScore),
          isCorrect: answerSeed.isCorrect,
          responseTimeMs: answerSeed.responseTimeMs,
          teacherFeedback: answerSeed.teacherFeedback ?? null,
          gradedAt: submissionSeed.gradedAt,
        },
        create: {
          submissionId: submission.id,
          assignmentQuestionId,
          graderId: isShortAnswer ? networkTeacher.id : undefined,
          textAnswer: answerSeed.textAnswer,
          booleanAnswer: answerSeed.booleanAnswer,
          gradingStatus,
          score: toDecimal(answerSeed.score),
          maxScore: toDecimal(answerSeed.maxScore),
          isCorrect: answerSeed.isCorrect,
          responseTimeMs: answerSeed.responseTimeMs,
          teacherFeedback: answerSeed.teacherFeedback ?? null,
          gradedAt: submissionSeed.gradedAt,
        },
      });

      await prisma.studentAnswerOption.deleteMany({
        where: { studentAnswerId: answer.id },
      });
      for (const selectedLabel of answerSeed.selectedLabels ?? []) {
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

      if (answerSeed.isCorrect && answerSeed.score === answerSeed.maxScore) {
        await prisma.wrongQuestion.deleteMany({
          where: { studentAnswerId: answer.id },
        });
      } else {
        await prisma.wrongQuestion.upsert({
          where: { studentAnswerId: answer.id },
          update: {
            studentId: student.id,
            assignmentQuestionId,
            isResolved: false,
            reviewCount: 1,
            wrongCount: 1,
            firstWrongAt: submissionSeed.submittedAt,
            lastWrongAt: submissionSeed.submittedAt,
            lastReviewedAt: submissionSeed.gradedAt,
          },
          create: {
            studentId: student.id,
            studentAnswerId: answer.id,
            assignmentQuestionId,
            isResolved: false,
            reviewCount: 1,
            wrongCount: 1,
            firstWrongAt: submissionSeed.submittedAt,
            lastWrongAt: submissionSeed.submittedAt,
            lastReviewedAt: submissionSeed.gradedAt,
          },
        });
      }
    }

    submissionPercentagesByStudentEmail.set(student.email!, [
      ...(submissionPercentagesByStudentEmail.get(student.email!) ?? []),
      percentage,
    ]);
    allSubmissionPercentages.push(percentage);
  }

  const masterySeeds: NetworkMasterySeed[] = [
    {
      studentEmail: networkStudentA.email!,
      knowledgePointCode: "CN-OSI-TCPIP",
      level: MasteryLevel.MASTERED,
      trend: MasteryTrend.UP,
      masteryScore: "96.00",
      earnedPoints: "19.2",
      availablePoints: "20",
      answeredCount: 2,
      correctCount: 2,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentA.email!,
      knowledgePointCode: "CN-HTTP-HTTPS",
      level: MasteryLevel.MASTERED,
      trend: MasteryTrend.UP,
      masteryScore: "98.00",
      earnedPoints: "19.6",
      availablePoints: "20",
      answeredCount: 2,
      correctCount: 2,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentA.email!,
      knowledgePointCode: "CN-DNS-DHCP-ARP",
      level: MasteryLevel.PROFICIENT,
      trend: MasteryTrend.UP,
      masteryScore: "94.00",
      earnedPoints: "14.1",
      availablePoints: "15",
      answeredCount: 2,
      correctCount: 2,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentA.email!,
      knowledgePointCode: "CN-TCP-UDP",
      level: MasteryLevel.PROFICIENT,
      trend: MasteryTrend.UP,
      masteryScore: "92.00",
      earnedPoints: "18.4",
      availablePoints: "20",
      answeredCount: 1,
      correctCount: 1,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentA.email!,
      knowledgePointCode: "CN-TCP-HANDSHAKE",
      level: MasteryLevel.PROFICIENT,
      trend: MasteryTrend.UP,
      masteryScore: "90.00",
      earnedPoints: "18",
      availablePoints: "20",
      answeredCount: 2,
      correctCount: 2,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentA.email!,
      knowledgePointCode: "CN-IP-SUBNET",
      level: MasteryLevel.DEVELOPING,
      trend: MasteryTrend.DOWN,
      masteryScore: "60.00",
      earnedPoints: "6",
      availablePoints: "10",
      answeredCount: 1,
      correctCount: 0,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentA.email!,
      knowledgePointCode: "CN-ROUTING-FORWARDING",
      level: MasteryLevel.PROFICIENT,
      trend: MasteryTrend.UP,
      masteryScore: "86.00",
      earnedPoints: "8.6",
      availablePoints: "10",
      answeredCount: 1,
      correctCount: 1,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentA.email!,
      knowledgePointCode: "CN-CONGESTION",
      level: MasteryLevel.PROFICIENT,
      trend: MasteryTrend.UP,
      masteryScore: "88.00",
      earnedPoints: "8.8",
      availablePoints: "10",
      answeredCount: 1,
      correctCount: 1,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentB.email!,
      knowledgePointCode: "CN-OSI-TCPIP",
      level: MasteryLevel.PROFICIENT,
      trend: MasteryTrend.UP,
      masteryScore: "90.00",
      earnedPoints: "18",
      availablePoints: "20",
      answeredCount: 2,
      correctCount: 2,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentB.email!,
      knowledgePointCode: "CN-HTTP-HTTPS",
      level: MasteryLevel.MASTERED,
      trend: MasteryTrend.UP,
      masteryScore: "98.00",
      earnedPoints: "19.6",
      availablePoints: "20",
      answeredCount: 2,
      correctCount: 2,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentB.email!,
      knowledgePointCode: "CN-DNS-DHCP-ARP",
      level: MasteryLevel.PROFICIENT,
      trend: MasteryTrend.UP,
      masteryScore: "92.00",
      earnedPoints: "13.8",
      availablePoints: "15",
      answeredCount: 2,
      correctCount: 2,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentB.email!,
      knowledgePointCode: "CN-TCP-UDP",
      level: MasteryLevel.BEGINNER,
      trend: MasteryTrend.DOWN,
      masteryScore: "45.00",
      earnedPoints: "9",
      availablePoints: "20",
      answeredCount: 2,
      correctCount: 1,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentB.email!,
      knowledgePointCode: "CN-TCP-HANDSHAKE",
      level: MasteryLevel.BEGINNER,
      trend: MasteryTrend.DOWN,
      masteryScore: "40.00",
      earnedPoints: "8",
      availablePoints: "20",
      answeredCount: 2,
      correctCount: 1,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentB.email!,
      knowledgePointCode: "CN-IP-SUBNET",
      level: MasteryLevel.PROFICIENT,
      trend: MasteryTrend.UP,
      masteryScore: "85.00",
      earnedPoints: "8.5",
      availablePoints: "10",
      answeredCount: 1,
      correctCount: 1,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentB.email!,
      knowledgePointCode: "CN-ROUTING-FORWARDING",
      level: MasteryLevel.DEVELOPING,
      trend: MasteryTrend.STABLE,
      masteryScore: "72.00",
      earnedPoints: "7.2",
      availablePoints: "10",
      answeredCount: 1,
      correctCount: 1,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentB.email!,
      knowledgePointCode: "CN-CONGESTION",
      level: MasteryLevel.DEVELOPING,
      trend: MasteryTrend.DOWN,
      masteryScore: "55.00",
      earnedPoints: "5.5",
      availablePoints: "10",
      answeredCount: 1,
      correctCount: 0,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentC.email!,
      knowledgePointCode: "CN-OSI-TCPIP",
      level: MasteryLevel.BEGINNER,
      trend: MasteryTrend.DOWN,
      masteryScore: "35.00",
      earnedPoints: "7",
      availablePoints: "20",
      answeredCount: 2,
      correctCount: 0,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentC.email!,
      knowledgePointCode: "CN-HTTP-HTTPS",
      level: MasteryLevel.BEGINNER,
      trend: MasteryTrend.DOWN,
      masteryScore: "30.00",
      earnedPoints: "6",
      availablePoints: "20",
      answeredCount: 2,
      correctCount: 0,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentC.email!,
      knowledgePointCode: "CN-DNS-DHCP-ARP",
      level: MasteryLevel.BEGINNER,
      trend: MasteryTrend.STABLE,
      masteryScore: "42.00",
      earnedPoints: "6.3",
      availablePoints: "15",
      answeredCount: 2,
      correctCount: 1,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentC.email!,
      knowledgePointCode: "CN-TCP-UDP",
      level: MasteryLevel.BEGINNER,
      trend: MasteryTrend.DOWN,
      masteryScore: "28.00",
      earnedPoints: "5.6",
      availablePoints: "20",
      answeredCount: 2,
      correctCount: 0,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentC.email!,
      knowledgePointCode: "CN-TCP-HANDSHAKE",
      level: MasteryLevel.BEGINNER,
      trend: MasteryTrend.DOWN,
      masteryScore: "25.00",
      earnedPoints: "5",
      availablePoints: "20",
      answeredCount: 2,
      correctCount: 0,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentC.email!,
      knowledgePointCode: "CN-IP-SUBNET",
      level: MasteryLevel.BEGINNER,
      trend: MasteryTrend.DOWN,
      masteryScore: "30.00",
      earnedPoints: "3",
      availablePoints: "10",
      answeredCount: 1,
      correctCount: 0,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentC.email!,
      knowledgePointCode: "CN-ROUTING-FORWARDING",
      level: MasteryLevel.DEVELOPING,
      trend: MasteryTrend.UP,
      masteryScore: "40.00",
      earnedPoints: "4",
      availablePoints: "10",
      answeredCount: 1,
      correctCount: 1,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
    {
      studentEmail: networkStudentC.email!,
      knowledgePointCode: "CN-CONGESTION",
      level: MasteryLevel.BEGINNER,
      trend: MasteryTrend.DOWN,
      masteryScore: "20.00",
      earnedPoints: "2",
      availablePoints: "10",
      answeredCount: 1,
      correctCount: 0,
      calculatedAt: new Date("2026-07-23T03:10:00.000Z"),
    },
  ];
  for (const masterySeed of masterySeeds) {
    const student = networkUsersByEmail.get(masterySeed.studentEmail);
    if (!student) {
      throw new Error(`Missing student seed ${masterySeed.studentEmail}`);
    }
    const knowledgePoint = knowledgePoints.get(masterySeed.knowledgePointCode);
    if (!knowledgePoint) {
      throw new Error(
        `Missing knowledge point seed ${masterySeed.knowledgePointCode}`,
      );
    }
    await prisma.studentKnowledgeMastery.upsert({
      where: {
        studentId_knowledgePointId: {
          studentId: student.id,
          knowledgePointId: knowledgePoint.id,
        },
      },
      update: {
        level: masterySeed.level,
        trend: masterySeed.trend,
        masteryScore: toDecimal(Number(masterySeed.masteryScore)),
        earnedPoints: new Prisma.Decimal(masterySeed.earnedPoints),
        availablePoints: new Prisma.Decimal(masterySeed.availablePoints),
        answeredCount: masterySeed.answeredCount,
        correctCount: masterySeed.correctCount,
        calculatedAt: masterySeed.calculatedAt,
      },
      create: {
        studentId: student.id,
        knowledgePointId: knowledgePoint.id,
        level: masterySeed.level,
        trend: masterySeed.trend,
        masteryScore: toDecimal(Number(masterySeed.masteryScore)),
        earnedPoints: new Prisma.Decimal(masterySeed.earnedPoints),
        availablePoints: new Prisma.Decimal(masterySeed.availablePoints),
        answeredCount: masterySeed.answeredCount,
        correctCount: masterySeed.correctCount,
        calculatedAt: masterySeed.calculatedAt,
      },
    });
  }

  const studentAverageByEmail = new Map<string, number>();
  for (const [email, percentages] of submissionPercentagesByStudentEmail) {
    studentAverageByEmail.set(email, average(percentages));
  }
  const classAverageScore = average(allSubmissionPercentages);

  const analysisSeeds: NetworkAnalysisSeed[] = [
    {
      requestKey: "seed-network-student-a-analysis",
      requestedByEmail: networkStudentA.email!,
      studentEmail: networkStudentA.email!,
      classroomScoped: false,
      scope: AIAnalysisScope.STUDENT,
      status: AIRecordStatus.SUCCEEDED,
      riskLevel: RiskLevel.LOW,
      summary: "应用层协议表现优秀，子网划分是需要单独巩固的薄弱点。",
      overallScore:
        studentAverageByEmail.get(networkStudentA.email!)?.toFixed(2) ?? "0.00",
      sampleSize: 15,
      basedOnFrom: new Date("2026-07-20T00:00:00.000Z"),
      basedOnTo: new Date("2026-07-23T23:59:59.000Z"),
      promptVersion: "network-student-analysis-v1",
      retryCount: 0,
      fallbackUsed: false,
      latencyMs: 380,
      inputMetrics: {
        assignmentCount: 2,
        submissionCount: 2,
        wrongQuestionCount: 1,
      },
      rawResponse: {
        validated: true,
        strengths: ["HTTP/HTTPS", "DNS 与地址解析"],
        weaknesses: ["IPv4 与子网划分"],
      },
      completedAt: new Date("2026-07-23T03:20:00.000Z"),
      insights: [
        {
          knowledgePointCode: "CN-HTTP-HTTPS",
          type: AIInsightType.STRENGTH,
          title: "应用层协议掌握较稳",
          detail: "两次作业中相关题目几乎全对。",
          priority: 2,
          metricName: "masteryScore",
          metricValue: "98.00",
        },
        {
          knowledgePointCode: "CN-IP-SUBNET",
          type: AIInsightType.WEAKNESS,
          title: "子网划分仍需单独训练",
          detail: "本次在 /26 前缀计算上失分。",
          priority: 10,
          metricName: "masteryScore",
          metricValue: "60.00",
          recommendedAction: "先练习前缀长度、可用主机数和子网掩码换算。",
        },
      ],
    },
    {
      requestKey: "seed-network-student-b-analysis",
      requestedByEmail: networkStudentB.email!,
      studentEmail: networkStudentB.email!,
      classroomScoped: false,
      scope: AIAnalysisScope.STUDENT,
      status: AIRecordStatus.SUCCEEDED,
      riskLevel: RiskLevel.MEDIUM,
      summary: "应用层稳定，但 TCP 建连、拥塞控制和重传机制较薄弱。",
      overallScore:
        studentAverageByEmail.get(networkStudentB.email!)?.toFixed(2) ?? "0.00",
      sampleSize: 15,
      basedOnFrom: new Date("2026-07-20T00:00:00.000Z"),
      basedOnTo: new Date("2026-07-23T23:59:59.000Z"),
      promptVersion: "network-student-analysis-v1",
      retryCount: 0,
      fallbackUsed: false,
      latencyMs: 410,
      inputMetrics: {
        assignmentCount: 2,
        submissionCount: 2,
        wrongQuestionCount: 3,
      },
      rawResponse: {
        validated: true,
        strengths: ["HTTP/HTTPS", "DNS 与地址解析"],
        weaknesses: ["TCP 三次握手", "TCP 拥塞控制"],
      },
      completedAt: new Date("2026-07-23T03:20:00.000Z"),
      insights: [
        {
          knowledgePointCode: "CN-HTTP-HTTPS",
          type: AIInsightType.STRENGTH,
          title: "应用层协议表现稳定",
          detail: "相关题目全部答对，说明基础很好。",
          priority: 2,
          metricName: "masteryScore",
          metricValue: "98.00",
        },
        {
          knowledgePointCode: "CN-TCP-HANDSHAKE",
          type: AIInsightType.WEAKNESS,
          title: "TCP 建连流程需要补课",
          detail: "在三次握手题目上出现明显失分。",
          priority: 10,
          metricName: "masteryScore",
          metricValue: "40.00",
          recommendedAction:
            "回看 SYN、SYN-ACK、ACK 的顺序并完成 3 道同类练习。",
        },
      ],
    },
    {
      requestKey: "seed-network-student-c-analysis",
      requestedByEmail: networkStudentC.email!,
      studentEmail: networkStudentC.email!,
      classroomScoped: false,
      scope: AIAnalysisScope.STUDENT,
      status: AIRecordStatus.SUCCEEDED,
      riskLevel: RiskLevel.HIGH,
      summary: "基础概念偏弱，需要先补分层、地址和 TCP 机制的入门练习。",
      overallScore:
        studentAverageByEmail.get(networkStudentC.email!)?.toFixed(2) ?? "0.00",
      sampleSize: 15,
      basedOnFrom: new Date("2026-07-20T00:00:00.000Z"),
      basedOnTo: new Date("2026-07-23T23:59:59.000Z"),
      promptVersion: "network-student-analysis-v1",
      retryCount: 0,
      fallbackUsed: false,
      latencyMs: 450,
      inputMetrics: {
        assignmentCount: 2,
        submissionCount: 2,
        wrongQuestionCount: 11,
      },
      rawResponse: {
        validated: true,
        strengths: ["DNS 基础", "路由与转发"],
        weaknesses: ["OSI/TCP-IP 分层", "TCP 与 UDP", "子网划分"],
      },
      completedAt: new Date("2026-07-23T03:20:00.000Z"),
      insights: [
        {
          knowledgePointCode: "CN-OSI-TCPIP",
          type: AIInsightType.WEAKNESS,
          title: "分层模型概念需要重建",
          detail: "选择题和简答题都暴露出分层理解不稳。",
          priority: 10,
          metricName: "masteryScore",
          metricValue: "35.00",
          recommendedAction: "先完成教材前两节的分层图和协议栈对应关系复习。",
        },
        {
          knowledgePointCode: "CN-TCP-UDP",
          type: AIInsightType.WEAKNESS,
          title: "传输层协议区别不清晰",
          detail: "对 TCP 和 UDP 的核心差异掌握不足。",
          priority: 9,
          metricName: "masteryScore",
          metricValue: "28.00",
          recommendedAction: "先记住连接、可靠性和典型应用场景，再做判断题。",
        },
      ],
    },
    {
      requestKey: "seed-network-class-analysis",
      requestedByEmail: networkTeacher.email!,
      classroomScoped: true,
      scope: AIAnalysisScope.CLASSROOM,
      status: AIRecordStatus.SUCCEEDED,
      riskLevel: RiskLevel.MEDIUM,
      summary: "班级整体应用层表现较强，但 TCP 机制和子网划分是共同薄弱点。",
      overallScore: classAverageScore.toFixed(2),
      sampleSize: 6,
      basedOnFrom: new Date("2026-07-20T00:00:00.000Z"),
      basedOnTo: new Date("2026-07-23T23:59:59.000Z"),
      promptVersion: "network-class-analysis-v1",
      retryCount: 0,
      fallbackUsed: false,
      latencyMs: 520,
      inputMetrics: {
        assignmentCount: 2,
        studentCount: 3,
        submissionCount: 6,
        wrongQuestionCount: 15,
      },
      rawResponse: {
        validated: true,
        classAverageScore,
        strengths: ["HTTP/HTTPS", "DNS 与地址解析"],
        weaknesses: ["TCP 三次握手", "子网划分"],
      },
      completedAt: new Date("2026-07-23T03:22:00.000Z"),
      insights: [
        {
          knowledgePointCode: "CN-HTTP-HTTPS",
          type: AIInsightType.STRENGTH,
          title: "应用层协议整体稳定",
          detail: "班级在 HTTP/HTTPS 和 DNS 题上正确率很高。",
          priority: 2,
          metricName: "masteryScore",
          metricValue: "94.00",
        },
        {
          knowledgePointCode: "CN-IP-SUBNET",
          type: AIInsightType.WEAKNESS,
          title: "子网划分是共性薄弱点",
          detail: "不同学生在前缀换算题上均出现失分。",
          priority: 10,
          metricName: "masteryScore",
          metricValue: "58.00",
          recommendedAction: "下次课安排 15 分钟子网换算练习。",
        },
      ],
    },
  ];

  const analysisByRequestKey = new Map<
    string,
    Awaited<ReturnType<typeof prisma.aIAnalysis.upsert>>
  >();
  for (const analysisSeed of analysisSeeds) {
    const requestedBy = networkUsersByEmail.get(analysisSeed.requestedByEmail);
    if (!requestedBy) {
      throw new Error(
        `Missing analysis requester ${analysisSeed.requestedByEmail}`,
      );
    }
    const student =
      analysisSeed.studentEmail === undefined
        ? null
        : (networkUsersByEmail.get(analysisSeed.studentEmail) ?? null);
    if (analysisSeed.studentEmail && !student) {
      throw new Error(`Missing analysis student ${analysisSeed.studentEmail}`);
    }
    const classroomId = analysisSeed.classroomScoped
      ? networkClassroom.id
      : null;
    const analysis = await prisma.aIAnalysis.upsert({
      where: { requestKey: analysisSeed.requestKey },
      update: {
        requestedById: requestedBy.id,
        studentId: student?.id ?? null,
        classroomId,
        scope: analysisSeed.scope,
        status: analysisSeed.status,
        riskLevel: analysisSeed.riskLevel,
        summary: analysisSeed.summary,
        overallScore: new Prisma.Decimal(analysisSeed.overallScore),
        sampleSize: analysisSeed.sampleSize,
        basedOnFrom: analysisSeed.basedOnFrom,
        basedOnTo: analysisSeed.basedOnTo,
        provider: "seed-provider",
        model: "seed-model",
        promptVersion: analysisSeed.promptVersion,
        retryCount: analysisSeed.retryCount,
        fallbackUsed: analysisSeed.fallbackUsed,
        inputMetrics: analysisSeed.inputMetrics,
        rawResponse: analysisSeed.rawResponse,
        errorCode: analysisSeed.errorCode ?? null,
        latencyMs: analysisSeed.latencyMs,
        completedAt: analysisSeed.completedAt,
      },
      create: {
        requestKey: analysisSeed.requestKey,
        requestedById: requestedBy.id,
        studentId: student?.id ?? null,
        classroomId,
        scope: analysisSeed.scope,
        status: analysisSeed.status,
        riskLevel: analysisSeed.riskLevel,
        summary: analysisSeed.summary,
        overallScore: new Prisma.Decimal(analysisSeed.overallScore),
        sampleSize: analysisSeed.sampleSize,
        basedOnFrom: analysisSeed.basedOnFrom,
        basedOnTo: analysisSeed.basedOnTo,
        provider: "seed-provider",
        model: "seed-model",
        promptVersion: analysisSeed.promptVersion,
        retryCount: analysisSeed.retryCount,
        fallbackUsed: analysisSeed.fallbackUsed,
        inputMetrics: analysisSeed.inputMetrics,
        rawResponse: analysisSeed.rawResponse,
        errorCode: analysisSeed.errorCode ?? null,
        latencyMs: analysisSeed.latencyMs,
        completedAt: analysisSeed.completedAt,
      },
    });
    analysisByRequestKey.set(analysisSeed.requestKey, analysis);

    for (const insightSeed of analysisSeed.insights) {
      const knowledgePoint = insightSeed.knowledgePointCode
        ? knowledgePoints.get(insightSeed.knowledgePointCode)
        : null;
      if (insightSeed.knowledgePointCode && !knowledgePoint) {
        throw new Error(
          `Missing analysis knowledge point ${insightSeed.knowledgePointCode}`,
        );
      }
      await upsertAnalysisInsight({
        analysisId: analysis.id,
        knowledgePointId: knowledgePoint?.id,
        type: insightSeed.type,
        title: insightSeed.title,
        detail: insightSeed.detail,
        priority: insightSeed.priority,
        metricName: insightSeed.metricName,
        metricValue:
          insightSeed.metricValue === undefined
            ? undefined
            : new Prisma.Decimal(insightSeed.metricValue),
        recommendedAction: insightSeed.recommendedAction,
      });
    }
  }

  const recommendationSeeds: NetworkRecommendationSeed[] = [
    {
      studentEmail: networkStudentA.email!,
      questionKey: "subnet-prefix",
      knowledgePointCode: "CN-IP-SUBNET",
      analysisRequestKey: "seed-network-student-a-analysis",
      cycleKey: "2024-network-week-1-a",
      source: RecommendationSource.HYBRID,
      status: RecommendationStatus.PENDING,
      reason: "子网前缀和可用主机数计算仍需单独训练。",
      targetDifficulty: 3,
      priority: 10,
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    },
    {
      studentEmail: networkStudentB.email!,
      questionKey: "tcp-handshake",
      knowledgePointCode: "CN-TCP-HANDSHAKE",
      analysisRequestKey: "seed-network-student-b-analysis",
      cycleKey: "2024-network-week-1-b",
      source: RecommendationSource.HYBRID,
      status: RecommendationStatus.PENDING,
      reason: "三次握手中的序列号和确认关系需要再练习。",
      targetDifficulty: 3,
      priority: 9,
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    },
    {
      studentEmail: networkStudentC.email!,
      questionKey: "osi-tcpip-layer",
      knowledgePointCode: "CN-OSI-TCPIP",
      analysisRequestKey: "seed-network-student-c-analysis",
      cycleKey: "2024-network-week-1-c",
      source: RecommendationSource.RULE,
      status: RecommendationStatus.PENDING,
      reason: "先补分层模型基础，再做更复杂的协议细节题。",
      targetDifficulty: 1,
      priority: 8,
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    },
  ];

  for (const recommendationSeed of recommendationSeeds) {
    const student = networkUsersByEmail.get(recommendationSeed.studentEmail);
    if (!student) {
      throw new Error(
        `Missing recommendation student ${recommendationSeed.studentEmail}`,
      );
    }
    const question = networkQuestions.get(recommendationSeed.questionKey);
    if (!question) {
      throw new Error(
        `Missing recommendation question ${recommendationSeed.questionKey}`,
      );
    }
    const knowledgePoint = knowledgePoints.get(
      recommendationSeed.knowledgePointCode,
    );
    if (!knowledgePoint) {
      throw new Error(
        `Missing recommendation knowledge point ${recommendationSeed.knowledgePointCode}`,
      );
    }
    const analysis = analysisByRequestKey.get(
      recommendationSeed.analysisRequestKey,
    );
    if (!analysis) {
      throw new Error(
        `Missing recommendation analysis ${recommendationSeed.analysisRequestKey}`,
      );
    }
    await prisma.personalizedRecommendation.upsert({
      where: {
        studentId_questionId_cycleKey: {
          studentId: student.id,
          questionId: question.id,
          cycleKey: recommendationSeed.cycleKey,
        },
      },
      update: {
        knowledgePointId: knowledgePoint.id,
        analysisId: analysis.id,
        source: recommendationSeed.source,
        status: recommendationSeed.status,
        reason: recommendationSeed.reason,
        targetDifficulty: recommendationSeed.targetDifficulty,
        priority: recommendationSeed.priority,
        expiresAt: recommendationSeed.expiresAt,
      },
      create: {
        studentId: student.id,
        questionId: question.id,
        knowledgePointId: knowledgePoint.id,
        analysisId: analysis.id,
        cycleKey: recommendationSeed.cycleKey,
        source: recommendationSeed.source,
        status: recommendationSeed.status,
        reason: recommendationSeed.reason,
        targetDifficulty: recommendationSeed.targetDifficulty,
        priority: recommendationSeed.priority,
        expiresAt: recommendationSeed.expiresAt,
      },
    });
  }

  console.info(
    `Seeded computer network demo classroom ${networkClassroom.name} with ${networkSeedUsers.length} users, ${questionSeeds.length} questions, 2 assignments, 6 submissions, ${analysisSeeds.length} analyses, and ${recommendationSeeds.length} recommendations.`,
  );
}

async function main(): Promise<void> {
  assertSafeSeedDatabase();

  // Notifications and published announcements are intentionally not seeded.
  // They must always be created by a real business event or an explicit admin action.
  await prisma.authSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  const users = await Promise.all(seedUsers.map(upsertUser));
  const [admin, teacher, teacherTwo, student, studentTwo, studentThree] = users;

  await prisma.systemConfig.upsert({
    where: { singletonKey: "default" },
    update: {},
    create: {
      singletonKey: "default",
      updatedById: admin.id,
    },
  });

  const existingSeedAuditLog = await prisma.auditLog.findFirst({
    where: {
      actorId: admin.id,
      action: AuditAction.USER_CREATED,
      targetType: AuditTargetType.USER,
      targetId: admin.id,
      summary: "初始化管理员演示账号",
    },
    select: { id: true },
  });
  if (!existingSeedAuditLog) {
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: AuditAction.USER_CREATED,
        targetType: AuditTargetType.USER,
        targetId: admin.id,
        summary: "初始化管理员演示账号",
        afterData: {
          displayName: seedUsers[0].displayName,
          email: admin.email!,
          role: admin.role,
          status: admin.status,
        },
      },
    });
  }

  const pythonCourseTemplate = await prisma.courseTemplate.upsert({
    where: { code: "python-programming-v1" },
    update: {
      name: "Python 程序设计",
      description: "V1.0 Python 程序设计课程模板，用于课程与导入基础建设。",
      version: "1.0",
      isBuiltin: true,
      isActive: true,
    },
    create: {
      code: "python-programming-v1",
      name: "Python 程序设计",
      description: "V1.0 Python 程序设计课程模板，用于课程与导入基础建设。",
      version: "1.0",
      isBuiltin: true,
      isActive: true,
    },
  });

  const existingPythonCourse = await prisma.course.findFirst({
    where: {
      teacherId: teacher.id,
      courseNo: "PYTHON-2026",
      term: "2026-2027-1",
      status: { not: CourseStatus.ARCHIVED },
    },
    select: { id: true },
  });
  const pythonCourseData = {
    templateId: pythonCourseTemplate.id,
    name: "Python 程序设计",
    description: "V1.0 Python 课程模板示例课程。",
    status: CourseStatus.ACTIVE,
    publishedAt: new Date("2026-09-01T00:00:00.000Z"),
    archivedAt: null,
  };
  if (existingPythonCourse) {
    await prisma.course.update({
      where: { id: existingPythonCourse.id },
      data: pythonCourseData,
    });
  } else {
    await prisma.course.create({
      data: {
        ...pythonCourseData,
        teacherId: teacher.id,
        courseNo: "PYTHON-2026",
        term: "2026-2027-1",
      },
    });
  }

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
    // Intentionally retained as a historical teacher-created public question
    // so administrators can verify source labeling and revoke governance.
    visibility: QuestionVisibility.PUBLIC,
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

  const existingSubmission = await prisma.submission.findUnique({
    where: { idempotencyKey: "seed-submit-student-1-assignment-1" },
  });
  const submissionData = {
    idempotencyKey: "seed-submit-student-1-assignment-1",
    status: SubmissionStatus.PUBLISHED,
    startedAt: new Date("2026-07-14T01:30:00.000Z"),
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
  const latestAttempt = existingSubmission
    ? null
    : await prisma.submission.aggregate({
        where: { assignmentId: assignment.id, studentId: student.id },
        _max: { attemptNumber: true },
      });
  const submission = existingSubmission
    ? await prisma.submission.update({
        where: { id: existingSubmission.id },
        data: submissionData,
      })
    : await prisma.submission.create({
        data: {
          assignmentId: assignment.id,
          studentId: student.id,
          attemptNumber: (latestAttempt?._max.attemptNumber ?? 0) + 1,
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
        responseTimeMs: 45_000,
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
        responseTimeMs: 45_000,
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
      latencyMs: 420,
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
      latencyMs: 420,
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
      latencyMs: 8_000,
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
      latencyMs: 8_000,
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
  console.info(`Unenrolled permission-test student: ${studentThree.email!}`);

  await seedUniversityDemo();
}

main()
  .catch((error: unknown) => {
    console.error("Failed to seed the database:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
