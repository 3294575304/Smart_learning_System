import assert from "node:assert/strict";
import test from "node:test";
import {
  suggestTemplateMappings,
  getTemplateSelection,
} from "@/services/quality-reports/template-matching";
import type { TemplateManifest } from "@/services/quality-reports/template-schema";

test("明确字段自动配置，保留审批空白，普通空白单元格无需强制设置", () => {
  const manifest: TemplateManifest = {
    slots: [
      { id: "course", label: "课程名称", kind: "TOKEN" },
      { id: "weight", label: "课程总评成绩构成", kind: "TOKEN" },
      { id: "signature", label: "签名（位置 4）", kind: "CELL" },
      { id: "optional", label: "其他备注", kind: "CELL" },
    ],
  };
  const values = suggestTemplateMappings(manifest);
  assert.deepEqual(values, {
    course: "courseName",
    weight: "gradeComposition",
    signature: "BLANK",
    optional: "",
  });
  const selection = getTemplateSelection(
    "cm0000000000000000000001",
    manifest,
    values,
  );
  assert.equal(selection.templateMappingConfirmed, true);
  assert.equal(selection.templateMappings?.length, 3);
});
test("不猜测未知占位符，处理后才允许生成；修改或切换模板重新验证", () => {
  const manifest: TemplateManifest = {
    slots: [
      { id: "a", label: "成绩分析", kind: "TOKEN" },
      { id: "b", label: "学校特殊指标", kind: "TOKEN" },
    ],
  };
  const values = suggestTemplateMappings(manifest);
  assert.equal(
    getTemplateSelection("one", manifest, values).templateMappingConfirmed,
    false,
  );
  assert.equal(
    getTemplateSelection("one", manifest, { ...values, b: "BLANK" })
      .templateMappingConfirmed,
    true,
  );
  assert.equal(
    getTemplateSelection("one", manifest, { a: "", b: "BLANK" })
      .templateMappingConfirmed,
    false,
  );
  assert.equal(
    getTemplateSelection(
      "two",
      { slots: [{ id: "c", label: "课程名称", kind: "TOKEN" }] },
      values,
    ).templateMappingConfirmed,
    false,
  );
  assert.equal(
    getTemplateSelection("one", manifest, { a: "secret", b: "BLANK" })
      .templateMappingConfirmed,
    false,
  );
});
