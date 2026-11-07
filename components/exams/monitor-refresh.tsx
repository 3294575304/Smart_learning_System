"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function MonitorRefresh() {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(id);
  }, [router]);
  return <p className="text-sm text-slate-500">每 10 秒刷新一次监考状态。</p>;
}
