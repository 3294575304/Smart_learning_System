"use client";

import { Eye } from "lucide-react";
import { useState } from "react";

export function SchoolAdminPassword({ displayName }: { displayName: string }) {
  const [noticeOpen, setNoticeOpen] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="font-mono text-slate-600">********</span>
        <button
          type="button"
          onClick={() => setNoticeOpen((open) => !open)}
          title="查看密码说明"
          aria-label={`查看管理员 ${displayName} 的密码说明`}
          aria-expanded={noticeOpen}
          className="rounded p-1.5 text-sky-700 hover:bg-sky-50"
        >
          <Eye aria-hidden="true" className="size-4" />
        </button>
      </div>
      {noticeOpen ? (
        <p className="max-w-60 text-xs text-slate-500" role="status">
          当前密码以不可逆哈希保存，无法还原。可通过右侧“编辑”设置新密码。
        </p>
      ) : null}
      <p className="text-xs text-slate-400">原密码不可查看，可在编辑时重置</p>
    </div>
  );
}
