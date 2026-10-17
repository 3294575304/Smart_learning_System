import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import test from "node:test";
import {
  templateManifestSchema,
  validateTemplateMappings,
  templateMappingSchema,
} from "@/services/quality-reports/template-schema";

test("模板映射拒绝未知位置、重复位置、漏选占位符及全部留空", () => {
  const manifest = templateManifestSchema.parse({
    slots: [
      { id: "a", label: "课程名称", kind: "TOKEN" },
      { id: "b", label: "签名", kind: "CELL" },
    ],
  });
  assert.throws(() => validateTemplateMappings(manifest, []));
  assert.throws(() =>
    validateTemplateMappings(manifest, [{ slotId: "a", field: "BLANK" }]),
  );
  assert.throws(() =>
    validateTemplateMappings(manifest, [
      { slotId: "bad", field: "courseName" },
    ]),
  );
  assert.throws(() =>
    validateTemplateMappings(manifest, [
      { slotId: "a", field: "courseName" },
      { slotId: "a", field: "mean" },
    ]),
  );
  assert.equal(
    templateMappingSchema.safeParse({ slotId: "a", field: "password" }).success,
    false,
  );
  validateTemplateMappings(manifest, [{ slotId: "a", field: "courseName" }]);
});

test("真实 DOCX 跨文本片段、页眉、空白表格填充及压缩包安全验证", async () => {
  const python =
    process.env.QUALITY_REPORT_PYTHON ||
    (process.platform === "win32"
      ? path.join(
          process.env.USERPROFILE ?? "",
          ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
        )
      : "python");
  const result = await promisify(execFile)(
    python,
    ["tests/quality-reports/test-custom-template.py"],
    { windowsHide: true, timeout: 40_000 },
  );
  assert.match(result.stdout, /custom template checks passed/);
});
