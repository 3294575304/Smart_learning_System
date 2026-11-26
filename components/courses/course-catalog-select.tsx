"use client";

import { BookMarked, Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { normalizeCourseNo } from "@/lib/course-no";
import type { TeacherCourseCategoryOption } from "@/services/courses/types";

interface Props {
  id: string;
  options: TeacherCourseCategoryOption[];
  value: string;
  onSelect: (option: TeacherCourseCategoryOption) => void;
  disabled?: boolean;
  describedBy?: string;
}

function matchesQuery(option: TeacherCourseCategoryOption, query: string) {
  const keyword = query.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
  if (!keyword) return true;
  const nameMatched = option.name
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .includes(keyword);
  const courseNo = option.courseNo ?? "";
  return (
    nameMatched ||
    (courseNo !== "" && courseNo.includes(normalizeCourseNo(keyword)))
  );
}

/**
 * 课程目录选择器：按课程号或课程名称搜索，选中后由调用方带出课程号与名称。
 * 交互参照系统配置里的省级地区下拉，键盘可用、点击外部关闭、空间不足时向上展开。
 */
export function CourseCatalogSelect({
  id,
  options,
  value,
  onSelect,
  disabled = false,
  describedBy,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [above, setAbove] = useState(false);
  const [listHeight, setListHeight] = useState(288);

  const selectedIndex = options.findIndex((option) => option.id === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;
  const filtered = options.filter((option) => matchesQuery(option, query));
  const active = filtered[activeIndex] ?? null;

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus({ preventScroll: true });
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document
      .getElementById(`${listId}-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId, open]);

  function showOptions() {
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (bounds) {
      const below = window.innerHeight - bounds.bottom;
      const showAbove = below < 320 && bounds.top > below;
      setAbove(showAbove);
      setListHeight(
        Math.max(120, Math.min(320, (showAbove ? bounds.top : below) - 96)),
      );
    }
    setQuery("");
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  }

  function choose(option: TeacherCourseCategoryOption) {
    onSelect(option);
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  const disabledReason = options.length === 0;

  return (
    <div
      ref={rootRef}
      className="relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        aria-controls={open ? listId : undefined}
        aria-describedby={describedBy}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex min-h-11 w-full items-center gap-2.5 rounded-xl border bg-white px-3 py-2 text-left text-sm shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60 ${
          open
            ? "border-sky-400 ring-2 ring-sky-100"
            : "border-sky-100 hover:border-sky-300"
        }`}
        disabled={disabled || disabledReason}
        id={id}
        onClick={() => (open ? setOpen(false) : showOptions())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            showOptions();
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <BookMarked
          aria-hidden="true"
          className="size-4 shrink-0 text-sky-600"
        />
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected ? (
            <>
              {selected.courseNo ? (
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                  {selected.courseNo}
                </span>
              ) : (
                <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                  无课程号
                </span>
              )}
              <span className="truncate text-slate-800">{selected.name}</span>
            </>
          ) : (
            <span className="truncate text-slate-500">
              {disabledReason
                ? "暂无可用课程目录"
                : "按课程号或课程名称搜索课程"}
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          className={`absolute right-0 left-0 z-50 overflow-hidden rounded-xl border border-sky-100 bg-white p-1.5 shadow-xl shadow-slate-900/10 ${
            above ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
            <Search
              aria-hidden="true"
              className="size-4 shrink-0 text-slate-400"
            />
            <input
              aria-activedescendant={
                active ? `${listId}-${activeIndex}` : undefined
              }
              aria-autocomplete="list"
              aria-controls={listId}
              aria-expanded="true"
              aria-label="搜索课程号或课程名称"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                  triggerRef.current?.focus({ preventScroll: true });
                } else if (
                  event.key === "ArrowDown" ||
                  event.key === "ArrowUp"
                ) {
                  event.preventDefault();
                  setActiveIndex((current) =>
                    Math.max(
                      0,
                      Math.min(
                        filtered.length - 1,
                        current + (event.key === "ArrowDown" ? 1 : -1),
                      ),
                    ),
                  );
                } else if (event.key === "Home") {
                  event.preventDefault();
                  setActiveIndex(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  setActiveIndex(Math.max(0, filtered.length - 1));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  if (active) choose(active);
                }
              }}
              placeholder="输入课程号或课程名称，如 CS101"
              ref={searchRef}
              role="combobox"
              value={query}
            />
          </div>
          <div
            aria-label="课程目录"
            className="[scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] overflow-y-auto overscroll-contain"
            id={listId}
            role="listbox"
            style={{ maxHeight: listHeight }}
          >
            {filtered.map((option, index) => (
              <button
                aria-selected={option.id === value}
                className={`my-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  option.id === value
                    ? "bg-sky-50 font-medium text-sky-700"
                    : activeIndex === index
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-600 hover:bg-slate-50"
                }`}
                id={`${listId}-${index}`}
                key={option.id}
                onClick={() => choose(option)}
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={() => setActiveIndex(index)}
                role="option"
                tabIndex={-1}
                type="button"
              >
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                {option.courseNo ? (
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                    {option.courseNo}
                  </span>
                ) : (
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                    无课程号
                  </span>
                )}
                {option.id === value ? (
                  <Check
                    aria-hidden="true"
                    className="size-4 shrink-0 text-sky-600"
                  />
                ) : null}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <p
              className="px-3 py-6 text-center text-sm text-slate-500"
              role="status"
            >
              没有匹配的课程，请换一个课程号或名称。
            </p>
          ) : (
            <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
              共 {filtered.length} 门课程
              {query ? `，已按「${query.trim()}」筛选` : ""}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
