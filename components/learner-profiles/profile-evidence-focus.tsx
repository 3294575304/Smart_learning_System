"use client";
import { useEffect } from "react";

/** Native hash navigation may run before a streamed profile has arrived. */
export function ProfileEvidenceFocus({ conceptId }: { conceptId?: string }) {
  useEffect(() => {
    if (!conceptId) return;
    const target = document.getElementById(`profile-concept-${conceptId}`);
    if (!target) return;
    target.scrollIntoView({ block: "start", behavior: "instant" });
    target.focus({ preventScroll: true });
  }, [conceptId]);
  return null;
}
