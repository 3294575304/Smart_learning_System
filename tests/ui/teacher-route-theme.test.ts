import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { isTeacherRoute, TEACHER_THEME_INIT } from "@/lib/teacher-route-theme";
import { STUDENT_THEME_INIT } from "@/lib/student-route-theme";

test("教师首屏直接使用教师主题，与学生及其他角色隔离", () => {
  for (const pathname of [
    "/teacher",
    "/teacher/courses",
    "/teacher/assignments/a",
    "/student",
    "/student/courses",
    "/admin",
    "/super-admin",
    "/login",
    "/teacher-other",
  ]) {
    const attrs = new Map<string, string>();
    runInNewContext(STUDENT_THEME_INIT + TEACHER_THEME_INIT, {
      location: { pathname },
      document: {
        documentElement: {
          setAttribute: (key: string, value: string) => attrs.set(key, value),
        },
      },
    });
    assert.equal(
      attrs.has("data-teacher-route"),
      isTeacherRoute(pathname),
      pathname,
    );
    assert.ok(
      !(attrs.has("data-teacher-route") && attrs.has("data-student-route")),
      pathname,
    );
  }
});
