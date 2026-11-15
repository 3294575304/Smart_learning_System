import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { isStudentRoute, STUDENT_THEME_INIT } from "@/lib/student-route-theme";

test("首屏脚本在水合前为学生路径设置主题，不影响其他角色和相似路径", () => {
  for (const pathname of [
    "/student",
    "/student/recommendations",
    "/student/wrong-questions",
    "/teacher",
    "/admin",
    "/login",
    "/student-other",
  ]) {
    const attrs = new Map<string, string>();
    runInNewContext(STUDENT_THEME_INIT, {
      location: { pathname },
      document: {
        documentElement: {
          setAttribute: (key: string, value: string) => attrs.set(key, value),
        },
      },
    });
    assert.equal(
      attrs.has("data-student-route"),
      isStudentRoute(pathname),
      pathname,
    );
  }
});
