import assert from "node:assert/strict";
import test from "node:test";
import {
  NAVIGATION,
  getDashboardPageTitle,
  isNavigationItemActive,
} from "@/components/dashboard/navigation";
import { buildBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import {
  directoryHref,
  schoolAdminDirectorySchema,
} from "@/services/super-admin/directory-schemas";

test("学校与管理员入口仅属于超级管理员，子页面不会同时高亮工作台", () => {
  const items = NAVIGATION.SUPER_ADMIN.flatMap((group) => group.items);
  const active = items.filter((item) =>
    isNavigationItemActive("/super-admin/schools", item),
  );
  assert.deepEqual(
    active.map((item) => item.label),
    ["学校与管理员"],
  );
  for (const role of ["ADMIN", "TEACHER", "STUDENT"] as const) {
    assert.ok(
      NAVIGATION[role].every((group) =>
        group.items.every((item) => !item.href.startsWith("/super-admin")),
      ),
    );
  }
  assert.equal(
    getDashboardPageTitle("/super-admin/schools", NAVIGATION.SUPER_ADMIN),
    "学校与管理员",
  );
  assert.deepEqual(
    buildBreadcrumbs("/super-admin/schools").map((item) => item.label),
    ["超级管理员工作台", "学校与管理员"],
  );
});

test("目录参数有安全默认值，并拒绝非法视图、分页与未知字段", () => {
  assert.deepEqual(schoolAdminDirectorySchema.parse({}), {
    view: "SCHOOLS",
    keyword: "",
    page: 1,
  });
  for (const input of [
    { view: "SUPER_ADMIN" },
    { page: 0 },
    { page: "1.5" },
    { page: 10001 },
    { keyword: "a".repeat(101) },
    { role: "SUPER_ADMIN" },
  ]) {
    assert.equal(schoolAdminDirectorySchema.safeParse(input).success, false);
  }
});

test("分页保留视图和搜索词，搜索字符不会覆盖路由参数", () => {
  const query = schoolAdminDirectorySchema.parse({
    view: "ADMINS",
    keyword: " 南京&view=SCHOOLS ",
    page: "2",
  });
  const url = new URL(directoryHref(query, 3), "https://example.test");
  assert.equal(url.pathname, "/super-admin/schools");
  assert.equal(url.searchParams.get("view"), "ADMINS");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(url.searchParams.get("keyword"), "南京&view=SCHOOLS");
});
