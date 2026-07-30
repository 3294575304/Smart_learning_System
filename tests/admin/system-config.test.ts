import assert from "node:assert/strict";
import test from "node:test";
import { Role } from "@prisma/client";

import {
  defaultSystemConfig,
  publicSystemConfigKeys,
  systemConfigDefinitions,
} from "@/services/system-config/definitions";
import {
  MaintenanceModeError,
  SelfRegistrationDisabledError,
} from "@/services/system-config/errors";
import {
  assertSelfRegistrationEnabled,
  assertRegistrationAvailable,
  assertSystemAvailableForUser,
} from "@/services/system-config/policy";
import { systemConfigUpdateRequestSchema } from "@/services/system-config/schemas";
import { resolveSystemConfigValues } from "@/services/system-config/values";

test("系统配置具有安全默认值和显式公开白名单", () => {
  assert.equal(defaultSystemConfig.maintenanceMode, false);
  assert.equal(defaultSystemConfig.allowSelfRegistration, true);
  assert.equal(defaultSystemConfig.aiAnalysisEnabled, true);
  assert.deepEqual(resolveSystemConfigValues(null), defaultSystemConfig);
  assert.equal(publicSystemConfigKeys.includes("platformName"), true);
  assert.equal(
    publicSystemConfigKeys.includes("assignmentAutosaveDelayMs"),
    false,
  );
  assert.equal(
    Object.values(systemConfigDefinitions).some(
      (definition) => definition.sensitive,
    ),
    false,
  );
});

test("配置更新拒绝未知键、原型污染键、非法类型和越界数值", () => {
  assert.equal(
    systemConfigUpdateRequestSchema.safeParse({
      updates: { platformName: "智学平台", assignmentDefaultDueDays: 14 },
    }).success,
    true,
  );
  assert.equal(
    systemConfigUpdateRequestSchema.safeParse({ updates: { apiKey: "secret" } })
      .success,
    false,
  );
  assert.equal(
    systemConfigUpdateRequestSchema.safeParse({
      updates: { maintenanceMode: "true" },
    }).success,
    false,
  );
  assert.equal(
    systemConfigUpdateRequestSchema.safeParse({
      updates: { assignmentAutosaveDelayMs: 100 },
    }).success,
    false,
  );
  assert.equal(
    systemConfigUpdateRequestSchema.safeParse(
      JSON.parse('{"updates":{"constructor":"blocked"}}'),
    ).success,
    false,
  );
});

test("维护模式阻止教师和学生但始终允许管理员", () => {
  const config = { maintenanceMode: true, maintenanceMessage: "升级中" };
  assert.throws(
    () =>
      assertSystemAvailableForUser(
        {
          id: "teacher",
          email: "t@example.com",
          displayName: "T",
          role: Role.TEACHER,
          mustChangePassword: false,
        },
        config,
      ),
    MaintenanceModeError,
  );
  assert.doesNotThrow(() =>
    assertSystemAvailableForUser(
      {
        id: "admin",
        email: "a@example.com",
        displayName: "A",
        role: Role.ADMIN,
        mustChangePassword: false,
      },
      config,
    ),
  );
});

test("自主注册关闭时产生可识别业务错误", () => {
  assert.throws(
    () => assertSelfRegistrationEnabled({ allowSelfRegistration: false }),
    SelfRegistrationDisabledError,
  );
  assert.doesNotThrow(() =>
    assertSelfRegistrationEnabled({ allowSelfRegistration: true }),
  );
  assert.throws(
    () =>
      assertRegistrationAvailable({
        allowSelfRegistration: true,
        maintenanceMode: true,
        maintenanceMessage: "维护中",
      }),
    MaintenanceModeError,
  );
});
