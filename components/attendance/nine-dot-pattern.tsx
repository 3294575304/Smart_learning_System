"use client";

import { useRef, useState, type PointerEvent } from "react";

const DOTS = [50, 150, 250];

function dotPoint(index: number) {
  return { x: DOTS[index % 3]!, y: DOTS[Math.floor(index / 3)]! };
}

function greatestCommonDivisor(first: number, second: number): number {
  return second === 0 ? first : greatestCommonDivisor(second, first % second);
}

function dotsBetween(start: number, end: number) {
  const startColumn = start % 3;
  const startRow = Math.floor(start / 3);
  const columnDelta = (end % 3) - startColumn;
  const rowDelta = Math.floor(end / 3) - startRow;
  const steps = greatestCommonDivisor(
    Math.abs(columnDelta),
    Math.abs(rowDelta),
  );
  if (steps < 2) return [];
  return Array.from({ length: steps - 1 }, (_, offset) => {
    const step = offset + 1;
    return (
      (startRow + (rowDelta / steps) * step) * 3 +
      startColumn +
      (columnDelta / steps) * step
    );
  });
}

function patternPoints(pattern: number[]) {
  return pattern.map((index) => {
    const point = dotPoint(index);
    return `${point.x},${point.y}`;
  });
}

function PatternSvg({
  pattern,
  interactive = false,
  drawing,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  pattern: number[];
  interactive?: boolean;
  drawing?: boolean;
  onPointerDown?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: () => void;
}) {
  const points = patternPoints(pattern);
  return (
    <svg
      aria-label={interactive ? "在九点阵上绘制签到图形" : "九点阵签到图形"}
      className={`mx-auto block w-full max-w-64 select-none ${interactive ? "cursor-crosshair touch-none" : ""}`}
      role={interactive ? "application" : "img"}
      viewBox="0 0 300 300"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <rect x="1" y="1" width="298" height="298" rx="24" fill="#f8fafc" />
      {points.length > 1 && (
        <polyline
          fill="none"
          points={points.join(" ")}
          stroke="#0284c7"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="9"
        />
      )}
      {Array.from({ length: 9 }, (_, index) => {
        const point = dotPoint(index);
        const order = pattern.indexOf(index);
        return (
          <g key={index}>
            <circle
              cx={point.x}
              cy={point.y}
              r={order >= 0 ? 21 : 16}
              fill={order >= 0 ? "#0284c7" : "#cbd5e1"}
              stroke="white"
              strokeWidth="4"
            />
            {order >= 0 && !interactive && (
              <text
                x={point.x}
                y={point.y + 5}
                fill="white"
                fontSize="15"
                fontWeight="700"
                textAnchor="middle"
              >
                {order + 1}
              </text>
            )}
          </g>
        );
      })}
      {interactive && drawing && (
        <text x="150" y="285" fill="#0369a1" fontSize="12" textAnchor="middle">
          松开手指完成
        </text>
      )}
    </svg>
  );
}

export function NineDotPatternDisplay({ pattern }: { pattern: number[] }) {
  return <PatternSvg pattern={pattern} />;
}

export function NineDotPatternInput({
  value,
  onChange,
  disabled = false,
  label = "绘制九点阵签到图形",
}: {
  value: number[];
  onChange: (pattern: number[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [drawing, setDrawing] = useState(false);
  const patternRef = useRef(value);
  patternRef.current = value;

  function addNearestDot(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const scale = 300 / bounds.width;
    const x = (event.clientX - bounds.left) * scale;
    const y = (event.clientY - bounds.top) * scale;
    let nearest: { index: number; distance: number } | null = null;
    for (let index = 0; index < 9; index += 1) {
      const point = dotPoint(index);
      const distance = Math.hypot(point.x - x, point.y - y);
      if (!nearest || distance < nearest.distance)
        nearest = { index, distance };
    }
    if (
      nearest &&
      nearest.distance <= 36 &&
      !patternRef.current.includes(nearest.index)
    ) {
      const previous = patternRef.current.at(-1);
      const intermediate =
        previous === undefined ? [] : dotsBetween(previous, nearest.index);
      const next = [
        ...patternRef.current,
        ...intermediate.filter((index) => !patternRef.current.includes(index)),
        nearest.index,
      ];
      patternRef.current = next;
      onChange(next);
    }
  }

  return (
    <div>
      <p className="mb-2 text-sm text-slate-600">
        {label}，按住并依次连接至少 4 个点。
      </p>
      <PatternSvg
        pattern={value}
        interactive
        drawing={drawing}
        onPointerDown={(event) => {
          if (disabled) return;
          event.preventDefault();
          patternRef.current = [];
          onChange([]);
          setDrawing(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          addNearestDot(event);
        }}
        onPointerMove={(event) => {
          if (!drawing || disabled) return;
          addNearestDot(event);
        }}
        onPointerUp={() => setDrawing(false)}
      />
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>已连接 {value.length} 个点</span>
        <button
          className="rounded border px-2 py-1 disabled:opacity-50"
          disabled={disabled || value.length === 0}
          onClick={() => {
            patternRef.current = [];
            onChange([]);
          }}
          type="button"
        >
          清除重画
        </button>
      </div>
    </div>
  );
}
