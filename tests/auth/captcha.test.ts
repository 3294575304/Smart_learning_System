import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  generateCaptchaAnswer,
  renderCaptchaImage,
} from "@/services/auth/captcha-image";
import {
  CaptchaChallengeStore,
  CAPTCHA_TTL_MS,
} from "@/services/auth/captcha-store";
import { adminLoginSchema, loginSchema } from "@/services/auth/schemas";

async function withStore(
  run: (store: CaptchaChallengeStore, directory: string) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "login-captcha-test-"));
  try {
    await run(new CaptchaChallengeStore(directory), directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("验证码生成真实 PNG，字符来自去除易混淆字符的集合", () => {
  for (let i = 0; i < 20; i += 1)
    assert.match(generateCaptchaAnswer(), /^[2346789ACDEFGHJKMNPQRTUVWXY]{5}$/);
  const image = renderCaptchaImage("ACD67");
  const png = Buffer.from(image.split(",")[1], "base64");
  assert.deepEqual(
    Array.from(png.subarray(0, 8)),
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  assert.equal(png.readUInt32BE(16), 176);
  assert.equal(png.readUInt32BE(20), 64);
});

test("验证码忽略大小写和首尾空格，成功后不能再次使用", async () =>
  withStore(async (store) => {
    const challenge = await store.issue("ACD67", "browser-a");
    const input = { captchaId: challenge.id, captchaAnswer: " acd67 " };
    assert.equal(await store.consume(input, "browser-a"), true);
    assert.equal(await store.consume(input, "browser-a"), false);
  }));

test("错误答案消耗验证码，不能用同一张图片不断猜测", async () =>
  withStore(async (store) => {
    const challenge = await store.issue("ACD67", "browser-a");
    assert.equal(
      await store.consume(
        { captchaId: challenge.id, captchaAnswer: "XXXXX" },
        "browser-a",
      ),
      false,
    );
    assert.equal(
      await store.consume(
        { captchaId: challenge.id, captchaAnswer: "ACD67" },
        "browser-a",
      ),
      false,
    );
  }));

test("跨浏览器提交被拒绝，合法浏览器仍可验证", async () =>
  withStore(async (store) => {
    const challenge = await store.issue("ACD67", "browser-a");
    const input = { captchaId: challenge.id, captchaAnswer: "ACD67" };
    assert.equal(await store.consume(input, "browser-b"), false);
    assert.equal(await store.consume(input, "browser-a"), true);
  }));

test("有效期边界处失效，失败后不能重放", async () =>
  withStore(async (store) => {
    const now = Date.now();
    const challenge = await store.issue("ACD67", "browser-a", now);
    assert.equal(
      await store.consume(
        { captchaId: challenge.id, captchaAnswer: "ACD67" },
        "browser-a",
        now + CAPTCHA_TTL_MS,
      ),
      false,
    );
  }));

test("不同 store 实例并发校验只能一次成功", async () =>
  withStore(async (store, directory) => {
    const challenge = await store.issue("ACD67", "browser-a");
    const input = { captchaId: challenge.id, captchaAnswer: "ACD67" };
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        new CaptchaChallengeStore(directory).consume(input, "browser-a"),
      ),
    );
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(
      (await readdir(directory)).filter((name) => name.endsWith(".used"))
        .length,
      1,
    );
  }));

test("刷新使旧验证码失效，磁盘只保存摘要", async () =>
  withStore(async (store, directory) => {
    const old = await store.issue("ACD67", "browser-a");
    const stored = await readFile(join(directory, `${old.id}.json`), "utf8");
    assert.equal(stored.includes("ACD67"), false);
    assert.equal(stored.includes("browser-a"), false);
    await store.invalidate(old.id, "browser-a");
    const next = await store.issue("GHJ89", "browser-a");
    assert.notEqual(old.id, next.id);
    assert.equal(
      await store.consume(
        { captchaId: old.id, captchaAnswer: "ACD67" },
        "browser-a",
      ),
      false,
    );
    assert.equal(
      await store.consume(
        { captchaId: next.id, captchaAnswer: "GHJ89" },
        "browser-a",
      ),
      true,
    );
  }));

test("签发时清理过期文件，不操作其他文件", async () =>
  withStore(async (store, directory) => {
    const old = await store.issue("ACD67", "browser-a");
    const past = new Date(Date.now() - CAPTCHA_TTL_MS - 1000);
    await utimes(join(directory, `${old.id}.json`), past, past);
    await writeFile(join(directory, "keep.txt"), "keep");
    await store.issue("GHJ89", "browser-a");
    const files = await readdir(directory);
    assert.equal(files.includes(`${old.id}.json`), false);
    assert.equal(files.includes("keep.txt"), true);
  }));

test("空绑定、不存在和路径穿越验证码均被拒绝", async () =>
  withStore(async (store) => {
    for (const captchaId of ["", "../private", "a".repeat(48)]) {
      assert.equal(
        await store.consume({ captchaId, captchaAnswer: "ACD67" }, "browser-a"),
        false,
      );
    }
    const issued = await store.issue("ACD67", "browser-a");
    assert.equal(
      await store.consume({ captchaId: issued.id, captchaAnswer: "ACD67" }, ""),
      false,
    );
  }));

test("两个登录 Schema 都强制验证码，旧的无验证码请求不再通过", () => {
  const credentials = {
    email: "teacher@example.com",
    password: "Teacher123!",
    schoolId: "school",
  };
  for (const schema of [loginSchema, adminLoginSchema]) {
    assert.equal(schema.safeParse(credentials).success, false);
    assert.equal(
      schema.safeParse({
        ...credentials,
        captchaId: "a".repeat(48),
        captchaAnswer: "ACD67",
      }).success,
      true,
    );
    assert.equal(
      schema.safeParse({
        ...credentials,
        captchaId: "../file",
        captchaAnswer: "ACD67",
      }).success,
      false,
    );
    assert.equal(
      schema.safeParse({
        ...credentials,
        captchaId: "a".repeat(48),
        captchaAnswer: "",
      }).success,
      false,
    );
  }
});
