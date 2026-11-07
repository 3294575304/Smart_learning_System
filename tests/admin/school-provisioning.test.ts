import assert from "node:assert/strict";
import test from "node:test";
import {
  createPartnerSchoolSchema,
  createSchoolAdminSchema,
  partnerSchoolIdSchema,
} from "@/services/super-admin/provisioning-schemas";
import { buildBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import {
  NAVIGATION,
  getDashboardPageTitle,
  isNavigationItemActive,
} from "@/components/dashboard/navigation";

test("合作学校校验名称和省份，并规范化全角输入", () => {
  assert.deepEqual(
    createPartnerSchoolSchema.parse({
      name: "　合作大学Ａ　",
      provinceCode: "320000",
    }),
    { name: "合作大学A", provinceCode: "320000" },
  );
  for (const input of [
    { name: "", provinceCode: "320000" },
    { name: "大学", provinceCode: "" },
    { name: "大学", provinceCode: "320100" },
    { name: "大学", provinceCode: "320000", role: "ADMIN" },
  ])
    assert.equal(createPartnerSchoolSchema.safeParse(input).success, false);
});

test("新管理员必须绑定已有学校，校验密码确认并拒绝指定权限", () => {
  const input = {
    schoolId: "school_nuist",
    displayName: "高校管理员",
    email: " ADMIN@EXAMPLE.INVALID ",
    password: "TestPassword123!",
    confirmPassword: "TestPassword123!",
  };
  assert.equal(
    createSchoolAdminSchema.parse(input).email,
    "admin@example.invalid",
  );
  for (const patch of [
    { schoolId: "" },
    { confirmPassword: "other" },
    { password: "x".repeat(73), confirmPassword: "x".repeat(73) },
    { role: "SUPER_ADMIN" },
    { status: "ACTIVE" },
    { mustChangePassword: false },
  ])
    assert.equal(
      createSchoolAdminSchema.safeParse({ ...input, ...patch }).success,
      false,
    );
  assert.equal(partnerSchoolIdSchema.parse("school_nuist"), "school_nuist");
  assert.equal(partnerSchoolIdSchema.safeParse("").success, false);
});

test("创建页面保持学校模块选中，面包屑指向真实学校目录", () => {
  for (const [leaf, label] of [
    ["new-school", "添加合作学校"],
    ["new-admin", "新建高校管理员"],
  ]) {
    const pathname = `/super-admin/schools/${leaf}`;
    assert.equal(
      getDashboardPageTitle(pathname, NAVIGATION.SUPER_ADMIN),
      label,
    );
    assert.deepEqual(
      NAVIGATION.SUPER_ADMIN.flatMap((group) => group.items)
        .filter((item) => isNavigationItemActive(pathname, item))
        .map((item) => item.label),
      ["合作学校和管理员"],
    );
    const crumbs = buildBreadcrumbs(pathname);
    assert.equal(crumbs.at(-1)?.label, label);
    assert.equal(crumbs.at(-2)?.href, "/super-admin/schools");
  }
});
