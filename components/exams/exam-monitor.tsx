"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function ExamMonitor({
  submissionId,
  endsAt,
  allowedSwitches,
}: {
  submissionId: string;
  endsAt: string;
  allowedSwitches: number;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(0);
  const [switches, setSwitches] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let away = false;
    let active = true;
    const submitExpired = async () => {
      const response = await fetch(`/api/student/exams/auto-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      if (response.ok)
        router.replace(`/student/submissions/${submissionId}/result`);
    };
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000),
      );
      setRemaining(seconds);
      if (seconds === 0) void submitExpired();
    };
    const leave = async () => {
      if (away || Date.now() >= new Date(endsAt).getTime()) return;
      away = true;
      try {
        const response = await fetch("/api/student/exams/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId, eventKey: crypto.randomUUID() }),
          keepalive: true,
        });
        const result = await response.json();
        if (!response.ok || !result.success)
          throw new Error(result.error ?? "切屏记录失败");
        if (!active) return;
        setSwitches(result.data.count);
        if (result.data.shouldSubmit)
          router.replace(`/student/submissions/${submissionId}/result`);
        else
          setMessage(
            `切屏已记录：${result.data.count} 次，超过 ${allowedSwitches} 次将自动交卷。`,
          );
      } catch {
        if (active) setMessage("切屏记录未送达，请检查网络连接。");
      }
    };
    const enter = () => {
      if (document.visibilityState === "visible" && document.hasFocus())
        away = false;
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") void leave();
      else enter();
    };
    const blur = () => void leave();
    const interval = window.setInterval(tick, 1000);
    tick();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", enter);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", enter);
    };
  }, [submissionId, endsAt, allowedSwitches, router]);
  return (
    <div className="sticky top-0 z-20 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      <strong>
        考试倒计时：{Math.floor(remaining / 60)}:
        {String(remaining % 60).padStart(2, "0")}
      </strong>
      <span className="ml-3">
        切屏 {switches}/{allowedSwitches}
      </span>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
