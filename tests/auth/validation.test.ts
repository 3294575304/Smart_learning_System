import assert from "node:assert/strict";
import test from "node:test";

import { loginSchema, registerSchema } from "@/services/auth/schemas";

test("登录邮箱会去除空格并转为小写", () => {
  const result = loginSchema.parse({
    email: "  Student@Example.COM ",
    password: "Student123!",
  });
  assert.equal(result.email, "student@example.com");
});

test("学生注册需要强密码和相同的确认密码", () => {
  assert.equal(
    registerSchema.safeParse({
      displayName: "测试学生",
      email: "new-student@example.com",
      password: "weak",
      confirmPassword: "different",
    }).success,
    false,
  );

  assert.equal(
    registerSchema.safeParse({
      displayName: "测试学生",
      email: "new-student@example.com",
      password: "Student123!",
      confirmPassword: "Student123!",
    }).success,
    true,
  );
});
