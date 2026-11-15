"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * 顶栏搜索。只搜学生有权看到的三类东西：课程、作业/考试、题库题目。
 * 结果页是 /student/search，输入框在结果页会保留当前关键词，改词直接再搜。
 */
export function WorkspaceSearch({ action }: { action: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [value, setValue] = useState(initial);
  return (
    <form
      action={action}
      className="hidden min-w-0 flex-1 items-center md:flex md:max-w-[420px]"
      onSubmit={(event) => {
        event.preventDefault();
        const keyword = value.trim();
        if (!keyword) return;
        router.push(`${action}?${new URLSearchParams({ q: keyword })}`);
      }}
      role="search"
    >
      <label className="sr-only" htmlFor="workspace-search">
        搜索课程、题目、知识点
      </label>
      <span className="workspace-search-field workspace-topbar-search flex w-full items-center gap-2">
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none size-3.5 shrink-0"
        />
        <input
          className="placeholder:text-muted-foreground min-w-0 flex-1 text-xs"
          id="workspace-search"
          name="q"
          onChange={(event) => setValue(event.target.value)}
          placeholder="搜索课程、题目、知识点"
          type="search"
          autoComplete="off"
          value={value}
        />
      </span>
    </form>
  );
}
