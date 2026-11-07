"use client";

import { Check, ChevronDown, MapPin, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { PROVINCES } from "@/services/schools/provinces";

const OPTIONS = [{ code: "", name: "暂未设置" }, ...PROVINCES];

export function ProvinceSelect({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [above, setAbove] = useState(false);
  const [listHeight, setListHeight] = useState(224);
  const options = OPTIONS.filter((option) =>
    option.name.includes(query.trim()),
  );
  const selected =
    OPTIONS.find((option) => option.code === value) ?? OPTIONS[0];

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
      const showAbove = below < 300 && bounds.top > below;
      setAbove(showAbove);
      setListHeight(
        Math.max(96, Math.min(224, (showAbove ? bounds.top : below) - 88)),
      );
    }
    setQuery("");
    setActiveIndex(
      Math.max(
        0,
        OPTIONS.findIndex((option) => option.code === value),
      ),
    );
    setOpen(true);
  }

  function choose(code: string) {
    onChange(code);
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  return (
    <div
      ref={rootRef}
      className="relative min-w-0 self-start"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className={`flex min-h-10 w-full items-center gap-2.5 rounded-xl border bg-white px-3 py-2 text-left text-sm shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-60 ${open ? "border-sky-400 ring-2 ring-sky-100" : "border-sky-100 hover:border-sky-300"}`}
        onClick={() => (open ? setOpen(false) : showOptions())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            showOptions();
          }
        }}
      >
        <MapPin aria-hidden="true" className="size-4 shrink-0 text-sky-600" />
        <span
          className={`flex-1 ${value ? "text-slate-800" : "text-slate-500"}`}
        >
          {selected.name}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          className={`absolute right-0 left-0 z-50 overflow-hidden rounded-xl border border-sky-100 bg-white p-1.5 shadow-xl shadow-slate-900/10 ${above ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
            <Search
              aria-hidden="true"
              className="size-4 shrink-0 text-slate-400"
            />
            <input
              ref={searchRef}
              role="combobox"
              aria-label="搜索省级地区"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls={listId}
              aria-activedescendant={
                options[activeIndex] ? `${listId}-${activeIndex}` : undefined
              }
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              placeholder="搜索省份名称"
              value={query}
              autoComplete="off"
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
                        options.length - 1,
                        current + (event.key === "ArrowDown" ? 1 : -1),
                      ),
                    ),
                  );
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const option = options[activeIndex];
                  if (option) choose(option.code);
                }
              }}
            />
          </div>
          <div
            id={listId}
            role="listbox"
            aria-label="所在省级地区"
            className="[scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] overflow-y-auto overscroll-contain"
            style={{ maxHeight: listHeight }}
          >
            {options.map((option, index) => (
              <button
                id={`${listId}-${index}`}
                key={option.code}
                type="button"
                role="option"
                aria-selected={option.code === value}
                tabIndex={-1}
                className={`my-0.5 flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${option.code === value ? "bg-sky-50 font-medium text-sky-700" : activeIndex === index ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
                onPointerMove={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option.code)}
              >
                {option.name}
                {option.code === value ? (
                  <Check
                    aria-hidden="true"
                    className="size-4 shrink-0 text-sky-600"
                  />
                ) : null}
              </button>
            ))}
          </div>
          {options.length === 0 ? (
            <p
              className="px-3 py-6 text-center text-sm text-slate-500"
              role="status"
            >
              未找到匹配的省份
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
