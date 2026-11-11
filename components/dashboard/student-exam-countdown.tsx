"use client";

import React, { useEffect, useState } from "react";

export function StudentExamCountdown({
  targetAt,
  renderedAt,
  canEnter,
}: {
  targetAt: number;
  renderedAt: number;
  canEnter: boolean;
}) {
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [targetAt]);
  const seconds = Math.max(0, Math.ceil((targetAt - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const clock = [
    Math.floor(seconds / 3600) % 24,
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
  return (
    <p
      role="timer"
      aria-live="off"
      className="text-sm font-medium text-neutral-300 tabular-nums"
    >
      {canEnter ? "距截止" : "距开考"}{" "}
      <span className="whitespace-nowrap">
        {days > 0 ? `${days} 天 ` : ""}
        {clock}
      </span>
    </p>
  );
}
