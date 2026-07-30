import { ScrollText } from "lucide-react";

import {
  AUDIT_ACTION_LABELS,
  ROLE_LABELS,
  USER_STATUS_LABELS,
} from "@/components/admin/user-labels";
import { EmptyState } from "@/components/dashboard/empty-state";
import type {
  AuditConfigSnapshot,
  AuditConfigValue,
  AuditLogView,
  AuditSnapshot,
  AuditUserSnapshot,
} from "@/services/audit/types";
import {
  systemConfigDefinitions,
  type SystemConfigKey,
} from "@/services/system-config/definitions";

function isUserSnapshot(
  snapshot: AuditSnapshot | null,
): snapshot is AuditUserSnapshot {
  return Boolean(snapshot && "email" in snapshot && "role" in snapshot);
}

function displayValue(value: AuditConfigValue | undefined) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "开启" : "关闭";
  if (Array.isArray(value)) return `${value.length} 项`;
  if (typeof value === "object") return "已记录";
  return String(value);
}

function snapshotRows(
  before: AuditUserSnapshot | null,
  after: AuditUserSnapshot | null,
) {
  const fields = [
    ["姓名", before?.displayName, after?.displayName],
    ["邮箱", before?.email, after?.email],
    [
      "角色",
      before ? ROLE_LABELS[before.role] : undefined,
      after ? ROLE_LABELS[after.role] : undefined,
    ],
    [
      "状态",
      before ? USER_STATUS_LABELS[before.status] : undefined,
      after ? USER_STATUS_LABELS[after.status] : undefined,
    ],
  ] as const;
  return fields.filter(([, left, right]) => left !== right);
}

function configSnapshotRows(
  before: AuditConfigSnapshot | null,
  after: AuditConfigSnapshot | null,
) {
  const keys = [
    ...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ];
  const auditFieldLabels: Record<string, string> = {
    title: "标题",
    contentLength: "正文长度",
    targetType: "目标对象",
    status: "状态",
    expiresAt: "过期时间",
    code: "编码",
    version: "版本",
    name: "名称",
    description: "描述",
    isBuiltin: "内置",
    isActive: "启用",
    courseCount: "课程数",
    templateCode: "模板编码",
    templateName: "模板名称",
    courseNo: "课程号",
    term: "学期",
    classroomCount: "关联班级数",
    activeClassroomCount: "开课班级数",
    activeStudentCount: "学生数",
    classroomName: "班级名称",
    classroomStatus: "班级状态",
    classroomId: "班级 ID",
    currentCourseId: "当前课程 ID",
    currentCourseName: "当前课程名称",
    currentCourseNo: "当前课程号",
    currentCourseTerm: "当前学期",
  };

  return keys.flatMap((key) => {
    const left = before?.[key];
    const right = after?.[key];
    if (left === right) return [];
    if (key in systemConfigDefinitions) {
      const configKey = key as SystemConfigKey;
      return [[systemConfigDefinitions[configKey].label, left, right] as const];
    }
    const label = auditFieldLabels[key];
    return label ? [[label, left, right] as const] : [];
  });
}

export function AuditLogList({ logs }: { logs: AuditLogView[] }) {
  if (logs.length === 0) {
    return (
      <EmptyState
        description="调整筛选条件后重试。"
        icon={ScrollText}
        title="没有找到审计记录"
      />
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => {
        const changes =
          isUserSnapshot(log.beforeData) || isUserSnapshot(log.afterData)
            ? snapshotRows(
                isUserSnapshot(log.beforeData) ? log.beforeData : null,
                isUserSnapshot(log.afterData) ? log.afterData : null,
              )
            : configSnapshotRows(log.beforeData, log.afterData);
        return (
          <article className="bg-card rounded-xl border p-4" key={log.id}>
            <div className="flex flex-col justify-between gap-2 sm:flex-row">
              <div>
                <p className="font-medium">
                  {AUDIT_ACTION_LABELS[log.action]} · {log.summary}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  操作人：{log.actor.displayName}（{log.actor.email}） ·
                  操作对象：
                  {log.targetLabel}
                </p>
              </div>
              <time className="text-muted-foreground shrink-0 text-sm">
                {log.createdAt.toLocaleString("zh-CN")}
              </time>
            </div>
            {changes.length > 0 ? (
              <details className="mt-3 rounded-md bg-gray-50 p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  查看变更摘要
                </summary>
                <dl className="mt-3 grid gap-2">
                  {changes.map(([label, before, after]) => (
                    <div
                      className="grid grid-cols-[5rem_1fr] gap-2"
                      key={label}
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd>
                        {displayValue(before)} → {displayValue(after)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : null}
            {log.ipAddress || log.userAgent ? (
              <p className="text-muted-foreground mt-3 text-xs break-all">
                {log.ipAddress ? `IP：${log.ipAddress}` : ""}
                {log.ipAddress && log.userAgent ? " · " : ""}
                {log.userAgent ? `客户端：${log.userAgent}` : ""}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
