"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

export const backToTopEvent = "workspace:back-to-top";

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    function update() {
      frame = 0;
      setVisible(window.scrollY >= window.innerHeight * 0.85);
    }
    function scheduleUpdate() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }
    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("pageshow", scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("pageshow", scheduleUpdate);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="返回顶部"
      title="返回顶部"
      className="workspace-back-to-top fixed z-30 flex size-11 items-center justify-center rounded-full border border-slate-300 bg-white text-sky-800 shadow-md transition-colors hover:border-sky-400 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 active:bg-sky-100"
      onClick={() => {
        window.dispatchEvent(new Event(backToTopEvent));
        document
          .getElementById("dashboard-main")
          ?.focus({ preventScroll: true });
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        });
      }}
    >
      <ArrowUp aria-hidden="true" className="size-5" />
    </button>
  );
}
