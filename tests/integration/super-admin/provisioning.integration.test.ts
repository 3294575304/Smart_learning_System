import {
  listAdminQuestions,
  getAdminQuestion,
  disableAdminQuestion,
} from "../../../services/admin/questions/service";
import { adminQuestionListQuerySchema } from "../../../services/admin/questions/schemas";
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import {
  hashPasswordCore,
  verifyPasswordCore,
} from "../../../services/auth/password-core";
import {
  AuthorizationError,
  ResourceNotFoundError,
} from "../../../services/auth/policy";
import {
  createPartnerSchool,
  createSchoolAdmin,
  deletePartnerSchool,
} from "../../../services/super-admin/provisioning";
import { ProvisioningError } from "../../../services/super-admin/provisioning-errors";
import { assertIsolatedIntegrationEnvironment } from "../database";
import {
  listAdminUsers,
  getAdminUser,
  updateAdminUser,
} from "../../../services/admin/users/service";
import { adminUserListQuerySchema } from "../../../services/admin/users/schemas";
import {
  getDashboardOverview,
  getDashboardTrends,
  getDashboardDistributions,
  getDashboardActivities,
} from "../../../services/admin/dashboard/service";
import {
  listAdminClassrooms,
  getAdminClassroom,
  closeAdminClassroom,
} from "../../../services/admin/classrooms/service";
import { adminClassroomListQuerySchema } from "../../../services/admin/classrooms/schemas";
import {
  updateAdminSchoolBinding,
  SchoolBindingOperationError,
} from "../../../services/schools/service";

assertIsolatedIntegrationEnvironment("SUPER_ADMIN_PROVISIONING_SCHEMA");
const context = { ipAddress: null, userAgent: "isolated-provisioning-check" };
let actorId: string;
let fixtureHash: string;
const name = () => `合作高校${randomUUID()}`;
const password = () => `Aa1!${randomBytes(18).toString("hex")}`;
const email = () => `admin-${randomUUID()}@example.invalid`;
before(async () => {
  fixtureHash = await hashPasswordCore(password());
  const actor = await prisma.user.create({
    data: { role: Role.SUPER_ADMIN, email: email(), passwordHash: fixtureHash },
  });
  actorId = actor.id;
});
after(async () => {
  await prisma.$disconnect();
});
async function school() {
  return createPartnerSchool(
    actorId,
    { name: name(), provinceCode: "320000" },
    context,
  );
}
function adminInput(schoolId: string) {
  const initial = password();
  return {
    schoolId,
    displayName: "测试管理员",
    email: email(),
    password: initial,
    confirmPassword: initial,
  };
}

test("高校管理员只读取本校师生和统计，拒绝跨校编辑、班级操作及重新绑定学校", async () => {
  const ownSchool = await school();
  const otherSchool = await school();
  const admin = await createSchoolAdmin(
    actorId,
    adminInput(ownSchool.id),
    context,
  );
  const otherAdmin = await createSchoolAdmin(
    actorId,
    adminInput(otherSchool.id),
    context,
  );
  async function person(
    schoolId: string,
    role: typeof Role.TEACHER | typeof Role.STUDENT,
  ) {
    return prisma.user.create({
      data: {
        schoolId,
        role,
        email: email(),
        passwordHash: fixtureHash,
        profile: { create: { displayName: `隔离${randomUUID()}` } },
      },
    });
  }
  const ownTeacher = await person(ownSchool.id, Role.TEACHER);
  const ownStudent = await person(ownSchool.id, Role.STUDENT);
  const otherTeacher = await person(otherSchool.id, Role.TEACHER);
  const otherStudent = await person(otherSchool.id, Role.STUDENT);
  const ownClass = await prisma.classroom.create({
    data: {
      teacherId: ownTeacher.id,
      name: "本校班级",
      joinCode: randomUUID(),
    },
  });
  const otherClass = await prisma.classroom.create({
    data: {
      teacherId: otherTeacher.id,
      name: "其他学校班级",
      joinCode: randomUUID(),
    },
  });
  const users = await listAdminUsers(
    admin.id,
    adminUserListQuerySchema.parse({}),
  );
  assert.deepEqual(
    new Set(users.items.map((user) => user.id)),
    new Set([admin.id, ownTeacher.id, ownStudent.id]),
  );
  for (const target of [otherAdmin, otherTeacher, otherStudent]) {
    await assert.rejects(
      getAdminUser(admin.id, target.id),
      ResourceNotFoundError,
    );
    await assert.rejects(
      updateAdminUser(
        admin.id,
        target.id,
        { status: UserStatus.INACTIVE },
        context,
      ),
      ResourceNotFoundError,
    );
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } }))
        .schoolId,
      otherSchool.id,
    );
  }
  const classes = await listAdminClassrooms(
    admin.id,
    adminClassroomListQuerySchema.parse({}),
  );
  assert.deepEqual(
    classes.items.map((item) => item.id),
    [ownClass.id],
  );
  await assert.rejects(
    getAdminClassroom(admin.id, otherClass.id),
    ResourceNotFoundError,
  );
  await assert.rejects(
    closeAdminClassroom(admin.id, otherClass.id, context, "跨校关闭"),
    ResourceNotFoundError,
  );
  const category = await prisma.questionCourseCategory.create({
    data: { name: name(), normalizedName: randomUUID() },
  });
  const ownQuestion = await prisma.question.create({
    data: {
      creatorId: ownTeacher.id,
      questionCategoryId: category.id,
      title: "本校题目",
      content: "1 == 1",
      type: "TRUE_FALSE",
      difficulty: 1,
      explanation: "相等",
      correctBoolean: true,
    },
  });
  const otherQuestion = await prisma.question.create({
    data: {
      creatorId: otherTeacher.id,
      questionCategoryId: category.id,
      title: "其他学校题目",
      content: "2 == 2",
      type: "TRUE_FALSE",
      difficulty: 1,
      explanation: "相等",
      correctBoolean: true,
    },
  });
  const bank = await listAdminQuestions(
    admin.id,
    adminQuestionListQuerySchema.parse({}),
  );
  assert.deepEqual(
    bank.items.map((item) => item.id),
    [ownQuestion.id],
  );
  await assert.rejects(
    getAdminQuestion(admin.id, otherQuestion.id),
    ResourceNotFoundError,
  );
  await assert.rejects(
    disableAdminQuestion(admin.id, otherQuestion.id, context),
    ResourceNotFoundError,
  );
  const overview = await getDashboardOverview(admin.id);
  assert.equal(overview.teaching.questionTotal, 1);
  assert.equal(overview.users.total, 3);
  assert.equal(overview.users.byRole.TEACHER, 1);
  assert.equal(overview.users.byRole.STUDENT, 1);
  assert.equal(overview.teaching.classroomTotal, 1);
  const distribution = await getDashboardDistributions(admin.id);
  assert.equal(
    distribution.roles.reduce((sum, row) => sum + row.count, 0),
    3,
  );
  const trends = await getDashboardTrends(admin.id, { range: "7d" });
  assert.equal(
    trends.points.reduce((sum, point) => sum + point.users, 0),
    3,
  );
  const activity = await getDashboardActivities(admin.id, {
    type: "USER_CREATED",
    limit: 10,
  });
  assert.equal(activity.items.length, 2);
  await assert.rejects(
    updateAdminSchoolBinding(admin.id, { name: otherSchool.name }, context),
    SchoolBindingOperationError,
  );
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).schoolId,
    ownSchool.id,
  );
});

test("先登记合作学校再开通管理员，账号绑定、改密要求和审计完整且不泄露密码", async () => {
  const partner = await school();
  assert.equal(
    await prisma.school.count({
      where: { id: partner.id, admins: { some: { role: Role.ADMIN } } },
    }),
    0,
  );
  const input = adminInput(partner.id);
  const result = await createSchoolAdmin(actorId, input, context);
  const saved = await prisma.user.findUniqueOrThrow({
    where: { id: result.id },
    include: { profile: true },
  });
  assert.equal(saved.schoolId, partner.id);
  assert.equal(saved.role, Role.ADMIN);
  assert.equal(saved.status, UserStatus.ACTIVE);
  assert.equal(saved.mustChangePassword, true);
  assert.equal(saved.profile?.displayName, input.displayName);
  assert.notEqual(saved.passwordHash, input.password);
  assert.equal(
    await verifyPasswordCore(input.password, saved.passwordHash),
    true,
  );
  assert.equal(
    await prisma.school.count({
      where: { id: partner.id, admins: { some: { role: Role.ADMIN } } },
    }),
    1,
  );
  const audit = await prisma.auditLog.findMany({
    where: { targetId: { in: [result.id, partner.id] } },
  });
  assert.equal(audit.length, 3);
  for (const serialized of [JSON.stringify(audit), JSON.stringify(result)]) {
    assert.equal(serialized.includes(input.password), false);
    assert.equal(serialized.includes(saved.passwordHash), false);
  }
});

test("重复名称和并发重复学校请求只创建一个学校，兼容历史非哈希学校键", async () => {
  const schoolName = name();
  const results = await Promise.allSettled([
    createPartnerSchool(
      actorId,
      { name: schoolName, provinceCode: "320000" },
      context,
    ),
    createPartnerSchool(
      actorId,
      { name: ` ${schoolName} `, provinceCode: "110000" },
      context,
    ),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(await prisma.school.count({ where: { name: schoolName } }), 1);
  assert.ok(
    results.some(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof ProvisioningError,
    ),
  );
  const legacy = await prisma.school.create({
    data: {
      key: `legacy_${randomUUID()}`,
      name: name(),
      provinceCode: "110000",
    },
  });
  await assert.rejects(
    createPartnerSchool(
      actorId,
      { name: legacy.name, provinceCode: "320000" },
      context,
    ),
    ProvisioningError,
  );
  assert.equal(
    (await prisma.school.findUniqueOrThrow({ where: { id: legacy.id } }))
      .provinceCode,
    "110000",
  );
});

test("重复邮箱不覆盖既有管理员、密码或学校绑定", async () => {
  const first = await school(),
    second = await school();
  const input = adminInput(first.id);
  const created = await createSchoolAdmin(actorId, input, context);
  const duplicate = adminInput(second.id);
  await assert.rejects(
    createSchoolAdmin(
      actorId,
      { ...duplicate, email: input.email.toUpperCase() },
      context,
    ),
    ProvisioningError,
  );
  const saved = await prisma.user.findUniqueOrThrow({
    where: { id: created.id },
  });
  assert.equal(saved.schoolId, first.id);
  assert.equal(
    await verifyPasswordCore(input.password, saved.passwordHash),
    true,
  );
  assert.equal(await prisma.user.count({ where: { schoolId: second.id } }), 0);
});

test("未知合作学校无法创建管理员", async () => {
  const input = adminInput("school_does_not_exist");
  await assert.rejects(
    createSchoolAdmin(actorId, input, context),
    ResourceNotFoundError,
  );
  assert.equal(await prisma.user.count({ where: { email: input.email } }), 0);
});

test("学校管理员、师生、禁用超级管理员和不存在的操作者均不能新增或删除", async () => {
  const partner = await school();
  const actors = await Promise.all(
    [Role.ADMIN, Role.TEACHER, Role.STUDENT, Role.SUPER_ADMIN].map((role) =>
      prisma.user.create({
        data: {
          email: email(),
          role,
          passwordHash: fixtureHash,
          schoolId: role === Role.SUPER_ADMIN ? null : partner.id,
          status:
            role === Role.SUPER_ADMIN ? UserStatus.INACTIVE : UserStatus.ACTIVE,
        },
      }),
    ),
  );
  for (const id of [...actors.map((actor) => actor.id), "missing_actor"]) {
    await assert.rejects(
      createPartnerSchool(
        id,
        { name: name(), provinceCode: "320000" },
        context,
      ),
      AuthorizationError,
    );
    await assert.rejects(
      createSchoolAdmin(id, adminInput(partner.id), context),
      AuthorizationError,
    );
    await assert.rejects(
      deletePartnerSchool(id, partner.id, context),
      AuthorizationError,
    );
  }
});

test("可删除未绑定账号的合作学校，重复删除返回不存在并保留删除审计", async () => {
  const partner = await school();
  await deletePartnerSchool(actorId, partner.id, context);
  assert.equal(
    await prisma.school.findUnique({ where: { id: partner.id } }),
    null,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { targetId: partner.id, summary: { startsWith: "删除合作学校" } },
    }),
    1,
  );
  await assert.rejects(
    deletePartnerSchool(actorId, partner.id, context),
    ResourceNotFoundError,
  );
});

test("任意角色的绑定账号都会阻止删除学校，保留账号及学校", async () => {
  for (const role of [Role.ADMIN, Role.TEACHER, Role.STUDENT]) {
    const partner = await school();
    const bound = await prisma.user.create({
      data: { role, passwordHash: fixtureHash, schoolId: partner.id },
    });
    await assert.rejects(
      deletePartnerSchool(actorId, partner.id, context),
      ProvisioningError,
    );
    assert.ok(await prisma.school.findUnique({ where: { id: partner.id } }));
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: bound.id } }))
        .schoolId,
      partner.id,
    );
  }
});

test("审计失败时学校创建、账号创建和学校删除均完整回滚", async () => {
  const partner = await school();
  const input = adminInput(partner.id);
  const schoolName = name();
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION reject_test_school_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated audit failure'; END; $$`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER reject_test_school_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_test_school_audit()`,
  );
  try {
    await assert.rejects(
      createPartnerSchool(
        actorId,
        { name: schoolName, provinceCode: "320000" },
        context,
      ),
    );
    assert.equal(await prisma.school.count({ where: { name: schoolName } }), 0);
    await assert.rejects(createSchoolAdmin(actorId, input, context));
    assert.equal(await prisma.user.count({ where: { email: input.email } }), 0);
    await assert.rejects(deletePartnerSchool(actorId, partner.id, context));
    assert.ok(await prisma.school.findUnique({ where: { id: partner.id } }));
  } finally {
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER reject_test_school_audit ON "AuditLog"`,
    );
    await prisma.$executeRawUnsafe(`DROP FUNCTION reject_test_school_audit()`);
  }
});
