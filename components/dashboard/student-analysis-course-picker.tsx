"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import {
  useId,
  useOptimistic,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  searchStudentEnrollments,
  studentEnrollmentLabel,
  studentEnrollmentStatus,
  type StudentEnrollmentContext,
} from "@/services/courses/student-enrollment";

export function StudentAnalysisCoursePicker({
  contexts,
  selectedId,
}: {
  contexts: StudentEnrollmentContext[];
  selectedId: string;
}) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(-1);
  const [pending, startNavigation] = useTransition();
  const [nextLabel, setNextLabel] = useOptimistic("");
  const selected = contexts.find(
    ({ classroom }) => classroom.id === selectedId,
  );
  const label = selected ? studentEnrollmentLabel(selected) : "";
  const options = searchStudentEnrollments(contexts, query);
  const optionId = (index: number) => `${id}-option-${index}`;

  function close() {
    setOpen(false);
    setQuery("");
    setCursor(-1);
  }

  function analyticsHref(item: StudentEnrollmentContext) {
    const params = new URLSearchParams({
      courseId: item.course.id,
      classroomId: item.classroom.id,
    });
    const chart = new URLSearchParams(window.location.search).get("chart");
    if (chart) params.set("chart", chart);
    return `/student/analytics?${params}`;
  }

  function prefetch(item: StudentEnrollmentContext) {
    if (item.classroom.id !== selectedId) router.prefetch(analyticsHref(item));
  }

  function openPicker() {
    if (open || pending) return;
    setOpen(true);
    const candidate = contexts.find(
      ({ classroom }) => classroom.id !== selectedId,
    );
    if (candidate) prefetch(candidate);
  }

  function choose(item: StudentEnrollmentContext) {
    close();
    if (item.classroom.id === selectedId) return;
    startNavigation(() => {
      setNextLabel(`${item.course.name} · ${item.classroom.name}`);
      router.push(analyticsHref(item), { scroll: false });
    });
  }

  function handleKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || pending) return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (!options.length) return;
      const index =
        cursor === -1
          ? event.key === "ArrowDown"
            ? 0
            : options.length - 1
          : Math.min(
              options.length - 1,
              Math.max(0, cursor + (event.key === "ArrowDown" ? 1 : -1)),
            );
      setCursor(index);
      prefetch(options[index]);
      requestAnimationFrame(() =>
        document
          .getElementById(optionId(index))
          ?.scrollIntoView({ block: "nearest" }),
      );
    } else if (event.key === "Enter" && open && options.length) {
      event.preventDefault();
      choose(options[cursor] ?? options[0]);
    }
  }

  return (
    <div className="relative min-w-0" aria-busy={pending}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium text-slate-600"
      >
        当前课程
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-sky-700"
          aria-hidden="true"
        />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? `${id}-options` : undefined}
          aria-activedescendant={
            open && options[cursor] ? optionId(cursor) : undefined
          }
          autoComplete="off"
          maxLength={80}
          readOnly={pending}
          title={!open ? label : undefined}
          placeholder="搜索课程、班级或课程号"
          value={open ? query : label}
          onFocus={openPicker}
          onClick={openPicker}
          onBlur={close}
          onChange={(event) => {
            setOpen(true);
            setQuery(event.target.value);
            setCursor(-1);
          }}
          onKeyDown={handleKeys}
          className="min-h-11 w-full rounded-lg border border-sky-200 bg-white ps-9 pe-8 text-sm text-slate-800 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
        />
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute inset-e-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
        />
      </div>
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-lg border border-sky-200 bg-white shadow-lg">
          <ul
            id={`${id}-options`}
            role="listbox"
            aria-label="可选课程和教学班"
            className="max-h-64 overflow-y-auto overscroll-contain p-1"
          >
            {options.map((item, index) => {
              const isSelected = item.classroom.id === selectedId;
              const status = studentEnrollmentStatus(
                item.course.status,
                item.classroom.status,
              );
              return (
                <li
                  key={item.classroom.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") prefetch(item);
                  }}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => choose(item)}
                  className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 hover:bg-sky-50 ${cursor === index ? "bg-sky-100" : ""}`}
                >
                  <div className="min-w-0 [overflow-wrap:anywhere]">
                    <p className="text-sm font-medium text-slate-900">
                      {item.course.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {item.classroom.name} · {item.course.term}
                      {status.readOnly ? ` · ${status.label}` : ""}
                    </p>
                  </div>
                  {isSelected && (
                    <Check
                      className="size-4 shrink-0 text-sky-700"
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <p
            role="status"
            className={
              options.length ? "sr-only" : "px-3 pb-3 text-sm text-slate-600"
            }
          >
            {options.length
              ? `${options.length} 个匹配教学班`
              : "没有匹配的教学班，请换个关键词。"}
          </p>
        </div>
      )}
      {pending && (
        <p role="status" className="mt-1 text-xs text-sky-800">
          {nextLabel ? `正在加载 ${nextLabel}…` : "正在切换课程…"}
        </p>
      )}
    </div>
  );
}
