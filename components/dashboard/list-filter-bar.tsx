"use client";

import { RotateCcw, Search, X } from "lucide-react";
import React, { useId, type KeyboardEvent } from "react";

export interface ListFilterOption {
  value: string;
  label: string;
}

export interface ListFilterSelect {
  /** 唯一键，用于 id 与 React key */
  key: string;
  /** 控件上方的字段名，例如「状态」 */
  label: string;
  /** 当前选中值，空字符串代表「全部」 */
  value: string;
  /** 「全部」选项文案，例如「全部状态」 */
  allLabel: string;
  options: ListFilterOption[];
  onChange: (value: string) => void;
}

interface ListFilterBarProps {
  keyword: string;
  onKeywordChange: (value: string) => void;
  /** 搜索框上方的字段名，例如「搜索班级」 */
  searchLabel: string;
  searchPlaceholder: string;
  /** 可搜索范围说明，直接告诉用户关键字覆盖哪些字段 */
  searchScope: string;
  filters: ListFilterSelect[];
  onReset: () => void;
  isFiltered: boolean;
  /** 由 describeFilterSummary 生成，同时用于视觉提示与 aria-live 播报 */
  summary: string;
}

/**
 * 列表页统一的「搜索 + 筛选」工具栏。
 *
 * 班级管理与课程管理必须表现一致：同一套栅格、同一套焦点环、同一套
 * 「输入即筛选 / 一键重置 / 结果实时播报」逻辑，所以收成一个组件。
 * 纯前端本地过滤，数据量级是「一个教师的班级 / 课程」，无需请求服务端。
 */
export function ListFilterBar({
  keyword,
  onKeywordChange,
  searchLabel,
  searchPlaceholder,
  searchScope,
  filters,
  onReset,
  isFiltered,
  summary,
}: ListFilterBarProps) {
  const baseId = useId();
  const searchId = `${baseId}-search`;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Esc 只清空关键词、保留其他筛选条件，避免误清全部条件
    if (event.key === "Escape" && keyword.length > 0) {
      event.preventDefault();
      onKeywordChange("");
    }
  }

  return (
    <section
      aria-label="搜索与筛选"
      className="bg-card space-y-3 rounded-xl border p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:items-end">
        <form
          className="min-w-0 sm:col-span-2 lg:flex-1"
          onSubmit={(event) => event.preventDefault()}
          role="search"
        >
          <label className="block space-y-1" htmlFor={searchId}>
            <span className="text-muted-foreground block text-xs font-medium">
              {searchLabel}
            </span>
            <span className="relative block">
              <Search
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
              />
              <input
                autoComplete="off"
                className="bg-card focus-visible:border-brand focus-visible:outline-brand w-full rounded-lg border py-2 ps-9 pe-9 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-search-cancel-button]:hidden"
                id={searchId}
                maxLength={80}
                onChange={(event) => onKeywordChange(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                type="search"
                value={keyword}
              />
              {keyword.length > 0 ? (
                <button
                  aria-label="清除搜索关键词"
                  className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-brand absolute end-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors focus-visible:outline-2"
                  onClick={() => onKeywordChange("")}
                  type="button"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </span>
          </label>
        </form>

        {filters.map((filter) => {
          const selectId = `${baseId}-${filter.key}`;
          return (
            <label
              className="block space-y-1 lg:w-44 lg:shrink-0"
              htmlFor={selectId}
              key={filter.key}
            >
              <span className="text-muted-foreground block text-xs font-medium">
                {filter.label}
              </span>
              <select
                className="bg-card focus-visible:border-brand focus-visible:outline-brand w-full rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                id={selectId}
                onChange={(event) => filter.onChange(event.target.value)}
                value={filter.value}
              >
                <option value="">{filter.allLabel}</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}

        <button
          className="text-foreground hover:bg-muted focus-visible:outline-brand inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent sm:col-span-2 lg:col-span-1 lg:shrink-0"
          disabled={!isFiltered}
          onClick={onReset}
          type="button"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          重置筛选
        </button>
      </div>

      <p aria-live="polite" className="text-muted-foreground text-xs leading-5">
        {summary}
      </p>
      <p className="text-muted-foreground text-xs leading-5">
        可搜索范围：{searchScope}
      </p>
    </section>
  );
}
