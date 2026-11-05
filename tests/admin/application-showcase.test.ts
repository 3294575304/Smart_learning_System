import assert from "node:assert/strict";
import test from "node:test";
import map from "@/data/maps/china-provinces.json";
import { PROVINCES, schoolProvinceSchema } from "@/services/schools/provinces";
import {
  buildSchoolDistribution,
  provinceFill,
  type ShowcaseSchool,
} from "@/services/super-admin/showcase-metrics";
import {
  NAVIGATION,
  getDashboardPageTitle,
  isNavigationItemActive,
} from "@/components/dashboard/navigation";

function school(
  id: string,
  provinceCode: string | null,
  learners = 3,
): ShowcaseSchool {
  return {
    id,
    name: `高校${id}`,
    provinceCode,
    learners,
    joinedAt: "2026-11-05T00:00:00.000Z",
  };
}

test("学校按省份聚合且按学校身份去重，未定位学校不伪造地区", () => {
  const data = buildSchoolDistribution([
    school("a", "320000"),
    school("a", "320000"),
    school("b", "320000", 5),
    school("c", "110000"),
    school("d", null),
    school("e", "000000"),
  ]);
  assert.equal(data.totalSchools, 5);
  assert.equal(data.coveredProvinces, 2);
  assert.equal(data.ranking[0]?.name, "江苏省");
  assert.deepEqual(
    data.ranking[0]?.schools.map((item) => item.id),
    ["a", "b"],
  );
  assert.equal(data.totalLearners, 17);
  assert.equal(data.unlocated.length, 2);
  assert.equal(
    data.provinces.find((item) => item.code === "310000")?.schools.length,
    0,
  );
});

test("空系统与仅有未定位高校时地图仍可选择全部省级地区", () => {
  for (const data of [
    buildSchoolDistribution([]),
    buildSchoolDistribution([school("a", null)]),
  ]) {
    assert.equal(data.provinces.length, 34);
    assert.equal(data.coveredProvinces, 0);
    assert.equal(data.ranking.length, 0);
    assert.equal(data.maxCount, 1);
    assert.ok(
      data.provinces.every((province) => province.schools.length === 0),
    );
  }
});

test("填色随高校数量增加而变深，零值和单校系统有明确颜色", () => {
  const luminance = (hex: string) =>
    Number.parseInt(hex.slice(1, 3), 16) * 0.2126 +
    Number.parseInt(hex.slice(3, 5), 16) * 0.7152 +
    Number.parseInt(hex.slice(5, 7), 16) * 0.0722;
  const colors = [0, 1, 5, 10].map((count) => provinceFill(count, 10));
  assert.ok(colors.every((color) => /^#[0-9a-f]{6}$/.test(color)));
  assert.ok(
    colors.every(
      (color, index) =>
        index === 0 || luminance(color) < luminance(colors[index - 1] ?? color),
    ),
  );
  assert.notEqual(provinceFill(0, 1), provinceFill(1, 1));
  assert.equal(provinceFill(5, 0), provinceFill(1, 1));
});

test("地图含全部34省级地区及南海边界，几何和标注没有无效坐标", () => {
  assert.deepEqual(
    new Set(map.provinces.map((province) => province.code)),
    new Set(PROVINCES.map((province) => province.code)),
  );
  assert.equal(map.provinces.length, 34);
  for (const code of ["710000", "810000", "820000", "460000"])
    assert.ok(map.provinces.some((province) => province.code === code));
  assert.ok(map.maritimePath.length > 0 && map.maritimeInsetPath.length > 0);
  for (const province of map.provinces) {
    assert.ok(province.path.startsWith("M") && province.path.includes("Z"));
    assert.equal(
      /NaN|Infinity/.test(province.path + province.insetPath),
      false,
    );
    assert.ok(province.label.every(Number.isFinite));
    assert.equal(province.capital.length, 2);
    assert.ok(province.capital.every(Number.isFinite));
    assert.ok(
      (province.capital[0] ?? -1) >= 0 &&
        (province.capital[0] ?? Infinity) <= map.width,
    );
    assert.ok(
      (province.capital[1] ?? -1) >= 0 &&
        (province.capital[1] ?? Infinity) <= map.height,
    );
  }
  const innerMongolia = map.provinces.find(
    (province) => province.code === "150000",
  );
  assert.ok(innerMongolia);
  assert.notDeepEqual(innerMongolia.capital, innerMongolia.center);
  assert.ok(
    (innerMongolia.capital[1] ?? 0) > (innerMongolia.center[1] ?? 0),
    "呼和浩特位于省域几何中心以南，圆点不能使用省域中心",
  );
});

test("学校地区只接收合法省级代码，兼容旧请求与未设置地区", () => {
  assert.equal(schoolProvinceSchema.parse("320000"), "320000");
  assert.equal(schoolProvinceSchema.parse(""), null);
  assert.equal(schoolProvinceSchema.parse(null), null);
  assert.equal(schoolProvinceSchema.parse(undefined), undefined);
  for (const value of ["江苏省", "320100", "000000", ["320000"], {}])
    assert.equal(schoolProvinceSchema.safeParse(value).success, false);
});

test("系统应用情况具有独立导航及标题，不会同时高亮工作台", () => {
  const active = NAVIGATION.SUPER_ADMIN.flatMap((group) => group.items).filter(
    (item) => isNavigationItemActive("/super-admin/showcase", item),
  );
  assert.deepEqual(
    active.map((item) => item.label),
    ["系统应用情况"],
  );
  assert.equal(
    getDashboardPageTitle("/super-admin/showcase", NAVIGATION.SUPER_ADMIN),
    "系统应用情况",
  );
  for (const role of ["ADMIN", "TEACHER", "STUDENT"] as const)
    assert.ok(
      NAVIGATION[role].every((group) =>
        group.items.every((item) => item.href !== "/super-admin/showcase"),
      ),
    );
});
