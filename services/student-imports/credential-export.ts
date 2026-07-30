import type { StudentInitialCredential } from "@/services/student-imports/types";

export const initialCredentialCsvHeaders = [
  "姓名",
  "学号",
  "登录账号",
  "初始密码",
  "联系方式",
  "班级",
  "导入行号",
] as const;

function csvCell(value: string | number | null): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/gu, '""')}"`;
}

export function buildInitialCredentialCsv(
  credentials: readonly StudentInitialCredential[],
): string {
  const rows = [
    initialCredentialCsvHeaders,
    ...credentials.map((credential) => [
      credential.studentName,
      credential.studentNo,
      credential.loginAccount,
      credential.initialPassword,
      credential.contact ?? "",
      credential.className,
      credential.rowNumber,
    ]),
  ];

  return `\uFEFF${rows
    .map((row) => row.map((value) => csvCell(value)).join(","))
    .join("\r\n")}`;
}

export function initialCredentialCsvFilename(batchId: string): string {
  return `student-initial-accounts-${batchId}.csv`;
}
