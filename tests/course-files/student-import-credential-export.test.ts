import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInitialCredentialCsv,
  initialCredentialCsvHeaders,
} from "@/services/student-imports/credential-export";
import type { StudentInitialCredential } from "@/services/student-imports/types";

function credential(
  overrides: Partial<StudentInitialCredential> = {},
): StudentInitialCredential {
  return {
    rowNumber: 2,
    studentName: "测试学生甲",
    studentNo: "0000123401",
    className: "软件测试一班",
    loginAccount: "0000123401",
    initialPassword: "LocalOnlyPass123",
    contact: null,
    ...overrides,
  };
}

test("一次性账号表只导出传入的新账号凭据并保留文本学号", () => {
  const csv = buildInitialCredentialCsv([
    credential(),
    credential({
      rowNumber: 5,
      studentName: "测试学生乙",
      studentNo: "0000123402",
      loginAccount: "student-b@example.test",
      initialPassword: "LocalOnlyPass456",
      contact: "student-b@example.test",
    }),
  ]);

  assert.equal(csv.startsWith("\uFEFF"), true);
  assert.match(csv, /"0000123401"/u);
  assert.match(csv, /"0000123402"/u);
  assert.match(csv, /"LocalOnlyPass123"/u);
  assert.match(csv, /"LocalOnlyPass456"/u);
  assert.equal(csv.split("\r\n").length, 1 + 2);
  assert.equal(
    initialCredentialCsvHeaders.every((header) => csv.includes(`"${header}"`)),
    true,
  );
  assert.doesNotMatch(
    csv,
    /已注册学生|已在班级学生|passwordHash|createdUserId|matchedUserId/u,
  );
});

test("一次性账号表中可能触发电子表格公式的字段会被中和", () => {
  const csv = buildInitialCredentialCsv([
    credential({
      studentName: '=HYPERLINK("https://invalid.example","点击")',
      studentNo: "+0000123403",
      loginAccount: "@malicious",
      initialPassword: "-FormulaLikePassword",
      contact: " =1+1",
      className: "\t+SUM(1,1)",
    }),
  ]);

  assert.match(
    csv,
    /"'=HYPERLINK\(""https:\/\/invalid\.example"",""点击""\)"/u,
  );
  assert.match(csv, /"'\+0000123403"/u);
  assert.match(csv, /"'@malicious"/u);
  assert.match(csv, /"'-FormulaLikePassword"/u);
  assert.match(csv, /"' =1\+1"/u);
  assert.match(csv, /"'\t\+SUM\(1,1\)"/u);
});
