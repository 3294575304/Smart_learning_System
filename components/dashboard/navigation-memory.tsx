"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  parsePageMemory,
  rememberedReturnUrl,
  NAVIGATION_MEMORY_MAX_AGE as MAX_AGE,
  type PageMemory,
} from "./navigation-memory-state";

const MemoryUserContext = createContext("");
export function useNavigationUserId() {
  return useContext(MemoryUserContext);
}
const PREFIX = "learning-navigation:v1:";
function read<T>(key: string): T | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return value as T | null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Navigation works when browser storage is unavailable. */
  }
}

/** Only UI location is remembered: never form values, answers or unsaved edits. */
export function useRememberedSelection<T extends string>(
  name: string,
  initial: T,
  allowed: readonly T[],
) {
  const userId = useContext(MemoryUserContext);
  const pathname = usePathname();
  const key = `${PREFIX}${userId}:selection:${pathname}:${name}`;
  const [value, setValue] = useState<T>(initial);
  const allowedValues = JSON.stringify(allowed);
  useEffect(() => {
    const choices: T[] = JSON.parse(allowedValues);
    const saved = read<{ value: T; at: number }>(key);
    setValue(
      saved && Date.now() - saved.at < MAX_AGE && choices.includes(saved.value)
        ? saved.value
        : initial,
    );
  }, [key, initial, allowedValues]);
  function select(next: T) {
    setValue(next);
    if (userId) write(key, { value: next, at: Date.now() });
  }
  return [value, select] as const;
}

export function NavigationMemoryProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  return (
    <MemoryUserContext.Provider value={userId}>
      {children}
    </MemoryUserContext.Provider>
  );
}

export function NavigationMemory({ userId }: { userId: string }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const router = useRouter();
  useEffect(() => {
    const root = document.getElementById("dashboard-main");
    if (!root) return;
    const url = `${pathname}${query ? `?${query}` : ""}`;
    const key = `${PREFIX}${userId}:page:${url}`;
    const lastKey = `${PREFIX}${userId}:last:${pathname}`;
    const saved = parsePageMemory(read<unknown>(key));
    const detailsKey = (item: HTMLDetailsElement) => {
      if (item.id) return item.id;
      const heading = item.querySelector("summary")?.textContent?.trim() || "";
      const siblings = [...root.querySelectorAll("details")].filter(
        (entry) =>
          !entry.id &&
          entry.querySelector("summary")?.textContent?.trim() === heading,
      );
      return siblings.length > 1
        ? `${heading}:${siblings.indexOf(item)}`
        : heading;
    };
    let restoring = Boolean(
      saved && Date.now() - saved.at < MAX_AGE && !window.location.hash,
    );
    let restoringDetails = restoring;
    const restoredDetails = new WeakSet<HTMLDetailsElement>();
    const restoreNewDetails = () => {
      if (!restoringDetails || !saved) return;
      for (const item of root.querySelectorAll("details")) {
        if (restoredDetails.has(item)) continue;
        restoredDetails.add(item);
        item.open = saved.details.includes(detailsKey(item));
      }
    };
    let frame = 0;
    let timer = 0;
    let disposed = false;
    const started = performance.now();
    const restore = () => {
      if (disposed || !restoring || !saved) return;
      restoreNewDetails();
      window.scrollTo({ top: saved.y, behavior: "instant" });
      if (
        Math.abs(window.scrollY - saved.y) < 2 ||
        performance.now() - started > 2000
      ) {
        restoring = false;
        return;
      }
      frame = requestAnimationFrame(restore);
    };
    frame = requestAnimationFrame(restore);
    // Report panels can arrive after the initial scroll position is restored.
    const observer = new MutationObserver(restoreNewDetails);
    if (restoringDetails)
      observer.observe(root, { childList: true, subtree: true });
    const save = () => {
      if (restoring) return;
      const memory: PageMemory = {
        at: Date.now(),
        y: window.scrollY,
        url,
        details: [...root.querySelectorAll<HTMLDetailsElement>("details[open]")]
          .map(detailsKey)
          .filter(Boolean),
      };
      write(key, memory);
      write(lastKey, memory);
    };
    const scheduleSave = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(save, 150);
    };
    const stopRestoring = () => {
      restoring = false;
      restoringDetails = false;
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest("a");
      if (
        !link ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.target === "_blank"
      )
        return;
      save();
      if (!link.textContent?.includes("返回")) return;
      const target = new URL(link.href, location.origin);
      if (target.origin !== location.origin || target.search || target.hash)
        return;
      const previous = read<PageMemory>(
        `${PREFIX}${userId}:last:${target.pathname}`,
      );
      const remembered = rememberedReturnUrl(previous, target.pathname);
      if (!remembered) return;
      event.preventDefault();
      if (pathname === "/student" || pathname.startsWith("/student/"))
        window.location.assign(remembered);
      else router.push(remembered);
    };
    window.addEventListener("scroll", scheduleSave, { passive: true });
    window.addEventListener("pagehide", save);
    window.addEventListener("wheel", stopRestoring, { passive: true });
    window.addEventListener("pointerdown", stopRestoring, { passive: true });
    window.addEventListener("keydown", stopRestoring);
    root.addEventListener("toggle", scheduleSave, true);
    document.addEventListener("click", click, true);
    return () => {
      disposed = true;
      observer.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleSave);
      window.removeEventListener("pagehide", save);
      window.removeEventListener("wheel", stopRestoring);
      window.removeEventListener("pointerdown", stopRestoring);
      window.removeEventListener("keydown", stopRestoring);
      root.removeEventListener("toggle", scheduleSave, true);
      document.removeEventListener("click", click, true);
    };
  }, [pathname, query, userId, router]);
  return null;
}
