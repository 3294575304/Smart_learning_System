import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  describeFilterSummary,
  hasActiveFilterCondition,
  matchesFilterKeyword,
  normalizeFilterText,
  readAllowedParam,
  readTextParam,
  tokenizeFilterKeyword,
} from "../../lib/list-filter";

test("关键词统一全角半角与大小写，避免输入法差异导致漏搜", () => {
  assert.equal(normalizeFilterText("Ｐｙｔｈｏｎ"), "python");
  assert.equal(normalizeFilterText("Python 2班"), "python 2班");
  assert.equal(normalizeFilterText(null), "");
  assert.equal(normalizeFilterText(undefined), "");
});

test("关键词按空白切分，兼容全角空格与连续空格", () => {
  assert.deepEqual(tokenizeFilterKeyword("  python　2班 "), ["python", "2班"]);
  assert.deepEqual(tokenizeFilterKeyword(""), []);
  assert.deepEqual(tokenizeFilterKeyword("   "), []);
});

test("多关键词要求全部命中，且允许分别命中不同字段", () => {
  const fields = ["Python 程序设计1班", "演示班级", "CCDA4QPV"];
  assert.equal(matchesFilterKeyword("", fields), true);
  assert.equal(matchesFilterKeyword("   ", fields), true);
  assert.equal(matchesFilterKeyword("python", fields), true);
  assert.equal(matchesFilterKeyword("PYTHON", fields), true);
  assert.equal(matchesFilterKeyword("python 演示", fields), true);
  assert.equal(matchesFilterKeyword("ccda", fields), true);
  assert.equal(matchesFilterKeyword("python 结课", fields), false);
});

test("空字段不会让相邻字段拼出原本不存在的关键词", () => {
  assert.equal(matchesFilterKeyword("ab", ["a", null, "b"]), false);
  assert.equal(matchesFilterKeyword("a", [undefined, "a"]), true);
  // 分词后每个词各自命中即可，不要求在原字符串里连续出现
  assert.equal(matchesFilterKeyword("a b", ["ab"]), true);
});

test("筛选摘要区分未筛选、有结果和无结果三种状态", () => {
  assert.equal(
    describeFilterSummary({
      visibleCount: 3,
      totalCount: 3,
      unit: "个班级",
      conditions: [],
      idleHint: "可按名称搜索",
    }),
    "共 3 个班级 · 可按名称搜索",
  );
  assert.equal(
    describeFilterSummary({
      visibleCount: 3,
      totalCount: 3,
      unit: "个班级",
      conditions: [],
    }),
    "共 3 个班级",
  );
  assert.equal(
    describeFilterSummary({
      visibleCount: 2,
      totalCount: 5,
      unit: "个班级",
      conditions: ["状态「已结课」", "关键词「python」"],
    }),
    "找到 2 / 5 个班级 · 当前条件：状态「已结课」、关键词「python」",
  );
  assert.equal(
    describeFilterSummary({
      visibleCount: 0,
      totalCount: 5,
      unit: "门课程",
      conditions: ["学期「2025-2026-2」"],
    }),
    "共 5 门课程中没有匹配项 · 当前条件：学期「2025-2026-2」",
  );
});

test("只有非空条件才算启用筛选，纯空白关键词不算", () => {
  assert.equal(
    hasActiveFilterCondition({ keyword: "   ", values: ["", ""] }),
    false,
  );
  assert.equal(
    hasActiveFilterCondition({ keyword: "", values: ["", "COMPLETED"] }),
    true,
  );
  assert.equal(
    hasActiveFilterCondition({ keyword: "py", values: ["", ""] }),
    true,
  );
});

test("链接参数只接受白名单值，非法状态回退为不筛选", () => {
  const allowed = ["ACTIVE", "COMPLETED", "CLOSED"];
  assert.equal(readAllowedParam("COMPLETED", allowed), "COMPLETED");
  assert.equal(readAllowedParam("HACKED", allowed), "");
  assert.equal(readAllowedParam(undefined, allowed), "");
  assert.equal(readAllowedParam("", allowed), "");
});

test("链接里的文本参数去掉首尾空白并限制长度", () => {
  assert.equal(readTextParam("  python  "), "python");
  assert.equal(readTextParam(undefined), "");
  assert.equal(readTextParam("x".repeat(200)).length, 80);
  assert.equal(readTextParam("x".repeat(200), 40).length, 40);
});

test("两个列表把筛选条件镜像到地址栏，页面从 searchParams 读回", async () => {
  const [classroomList, courseList, classroomPage, coursePage] =
    await Promise.all([
      readFile(
        new URL(
          "../../components/classrooms/teacher-classroom-list.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../components/courses/teacher-course-list.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../app/(protected)/teacher/classrooms/page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../app/(protected)/teacher/courses/page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

  // 组件侧：纯本地过滤 + 地址栏镜像，不触发服务端重新渲染
  assert.match(classroomList, /useListFilterUrlSync\(\{/u);
  assert.match(courseList, /useListFilterUrlSync\(\{/u);
  assert.doesNotMatch(classroomList, /router\.replace/u);
  assert.doesNotMatch(courseList, /router\.replace/u);
  assert.match(courseList, /initialFilters\?\.|initialFilters = \{/u);

  // 页面侧：从 searchParams 读回同一批 key，刷新与分享可还原
  assert.match(classroomPage, /readTextParam\(params\.keyword\)/u);
  assert.match(classroomPage, /readAllowedParam\(\s*params\.status/u);
  assert.match(classroomPage, /readTextParam\(params\.courseId, 64\)/u);
  assert.match(classroomPage, /initialFilters=\{initialFilters\}/u);
  assert.match(coursePage, /readTextParam\(params\.keyword\)/u);
  assert.match(coursePage, /readAllowedParam\(\s*params\.status/u);
  assert.match(coursePage, /readTextParam\(params\.term, 40\)/u);
  assert.match(coursePage, /initialFilters=\{initialFilters\}/u);
});
