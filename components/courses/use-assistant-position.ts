"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

const positionKey = "zhixue:teacher-assistant:position:v1";
export const ASSISTANT_SIZE = 52;
const margin = 12;
const dockDistance = 22;
type Point = { x: number; y: number };
type Viewport = { width: number; height: number; left: number; top: number };

function viewport(): Viewport {
  const visible = window.visualViewport;
  return {
    width: visible?.width ?? window.innerWidth,
    height: visible?.height ?? window.innerHeight,
    left: visible?.offsetLeft ?? 0,
    top: visible?.offsetTop ?? 0,
  };
}

function bounds(view: Viewport) {
  const left = view.left + margin;
  const top = view.top + margin;
  return {
    left,
    top,
    width: Math.max(0, view.width - ASSISTANT_SIZE - margin * 2),
    height: Math.max(0, view.height - ASSISTANT_SIZE - margin * 2),
  };
}

function clamp(point: Point, view: Viewport): Point {
  const box = bounds(view);
  return {
    x: Math.min(Math.max(point.x, box.left), box.left + box.width),
    y: Math.min(Math.max(point.y, box.top), box.top + box.height),
  };
}

function dockSide(point: Point, view: Viewport) {
  const box = bounds(view);
  const leftDistance = point.x - box.left;
  const rightDistance = box.left + box.width - point.x;
  if (leftDistance > dockDistance && rightDistance > dockDistance) return null;
  return leftDistance < rightDistance ? "left" : "right";
}

export function useAssistantPosition() {
  const [layout, setLayout] = useState<{
    position: Point;
    viewport: Viewport;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");
  const ratio = useRef<Point>({ x: 1, y: 0.5 });
  const latest = useRef<Point>({ x: 0, y: 0 });
  const view = useRef<Viewport>({ width: 0, height: 0, left: 0, top: 0 });
  const gesture = useRef<{
    id: number;
    origin: Point;
    start: Point;
    moved: boolean;
  } | null>(null);
  const frame = useRef<number | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(positionKey) ?? "null",
      );
      if (
        saved &&
        typeof saved === "object" &&
        "x" in saved &&
        "y" in saved &&
        typeof saved.x === "number" &&
        typeof saved.y === "number" &&
        Number.isFinite(saved.x) &&
        Number.isFinite(saved.y)
      ) {
        ratio.current = {
          x: Math.max(0, Math.min(1, saved.x)),
          y: Math.max(0, Math.min(1, saved.y)),
        };
      }
    } catch {
      /* The default position also works when browser storage is unavailable. */
    }
    const resize = () => {
      view.current = viewport();
      const box = bounds(view.current);
      latest.current = {
        x: box.left + ratio.current.x * box.width,
        y: box.top + ratio.current.y * box.height,
      };
      if (gesture.current) {
        gesture.current = null;
        suppressClick.current = true;
        setDragging(false);
      }
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      setLayout({ position: latest.current, viewport: view.current });
    };
    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  function commit(point: Point) {
    const next = clamp(point, view.current);
    latest.current = next;
    const box = bounds(view.current);
    ratio.current = {
      x: box.width ? (next.x - box.left) / box.width : 0,
      y: box.height ? (next.y - box.top) / box.height : 0,
    };
    let persisted = true;
    try {
      localStorage.setItem(positionKey, JSON.stringify(ratio.current));
    } catch {
      persisted = false;
    }
    setLayout({ position: next, viewport: view.current });
    setStatus(
      persisted ? "小助手位置已保存。" : "位置已调整，浏览器暂时无法保存位置。",
    );
  }

  function finish(
    event: ReactPointerEvent<HTMLButtonElement>,
    allowTap = false,
  ) {
    if (gesture.current?.id !== event.pointerId) return false;
    const moved = gesture.current.moved;
    const touchTap = allowTap && !moved && event.pointerType === "touch";
    if (touchTap) suppressClick.current = true;
    gesture.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    if (moved) {
      const next = latest.current;
      const side = dockSide(next, view.current);
      const box = bounds(view.current);
      commit({
        x:
          side === "left"
            ? box.left
            : side === "right"
              ? box.left + box.width
              : next.x,
        y: next.y,
      });
    }
    return touchTap;
  }

  return {
    layout,
    dragging,
    dock:
      layout && !dragging ? dockSide(layout.position, layout.viewport) : null,
    status,
    reset() {
      const box = bounds(view.current);
      commit({ x: box.left + box.width, y: box.top + box.height * 0.5 });
    },
    consumeClick(detail: number) {
      if (detail === 0) return false;
      const suppressed = suppressClick.current;
      suppressClick.current = false;
      return suppressed;
    },
    onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
      if (!event.isPrimary || event.button !== 0 || gesture.current) return;
      suppressClick.current = false;
      gesture.current = {
        id: event.pointerId,
        origin: latest.current,
        start: { x: event.clientX, y: event.clientY },
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setStatus("");
    },
    onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.start.x;
      const dy = event.clientY - current.start.y;
      if (!current.moved && Math.hypot(dx, dy) < 6) return;
      if (!current.moved) {
        current.moved = true;
        suppressClick.current = true;
        setDragging(true);
      }
      latest.current = clamp(
        { x: current.origin.x + dx, y: current.origin.y + dy },
        view.current,
      );
      if (frame.current === null)
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          setLayout({ position: latest.current, viewport: view.current });
        });
    },
    onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
      return finish(event, true);
    },
    onPointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
      finish(event);
    },
    onLostPointerCapture(event: ReactPointerEvent<HTMLButtonElement>) {
      finish(event);
    },
    onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
      const deltas: Record<string, Point> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const delta = deltas[event.key];
      if (delta) {
        event.preventDefault();
        const distance = event.shiftKey ? 32 : 16;
        commit({
          x: latest.current.x + delta.x * distance,
          y: latest.current.y + delta.y * distance,
        });
      }
    },
  };
}
