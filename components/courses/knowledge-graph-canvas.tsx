"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

type GraphNode = KnowledgeGraphStructure["nodes"][number];
type GraphEdge = KnowledgeGraphStructure["edges"][number];

const columnByType: Record<GraphNode["type"], number> = {
  COURSE: 140,
  CHAPTER: 470,
  KNOWLEDGE_POINT: 800,
};
const colorByType: Record<GraphNode["type"], string> = {
  COURSE: "#0f172a",
  CHAPTER: "#0369a1",
  KNOWLEDGE_POINT: "#047857",
};
const relationColor: Record<GraphEdge["type"], string> = {
  CONTAINS: "#94a3b8",
  PREREQUISITE: "#d97706",
  RELATED: "#7c3aed",
};

function shortened(value: string) {
  return value.length > 16 ? value.slice(0, 15) + "…" : value;
}

export function KnowledgeGraphCanvas({
  nodes,
  edges,
  selectedKey,
  onSelect,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{
    pointerX: number;
    pointerY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const layout = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const grouped = {
      COURSE: nodes.filter((node) => node.type === "COURSE"),
      CHAPTER: nodes.filter((node) => node.type === "CHAPTER"),
      KNOWLEDGE_POINT: nodes.filter((node) => node.type === "KNOWLEDGE_POINT"),
    };
    let maxRows = 1;
    (Object.keys(grouped) as GraphNode["type"][]).forEach((type) => {
      maxRows = Math.max(maxRows, grouped[type].length);
      grouped[type].forEach((node, index) => {
        positions.set(node.key, {
          x: columnByType[type],
          y: 80 + index * 78,
        });
      });
    });
    return {
      positions,
      height: Math.max(420, 150 + maxRows * 78),
    };
  }, [nodes]);
  const nodeKeys = useMemo(
    () => new Set(nodes.map((node) => node.key)),
    [nodes],
  );
  const visibleEdges = edges.filter(
    (edge) => nodeKeys.has(edge.from) && nodeKeys.has(edge.to),
  );

  function zoom(delta: number) {
    setViewport((value) => ({
      ...value,
      scale: Math.min(2.2, Math.max(0.55, value.scale + delta)),
    }));
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-slate-50">
      <div className="flex items-center justify-between border-b bg-white px-3 py-2">
        <div className="flex flex-wrap gap-3 text-xs text-gray-600">
          <span>● 课程</span>
          <span className="text-sky-700">● 章节</span>
          <span className="text-emerald-700">● 知识点</span>
          <span className="text-amber-700">— 先修</span>
          <span className="text-violet-700">— 相关</span>
        </div>
        <div className="flex gap-1">
          <button
            aria-label="缩小图谱"
            className="rounded border p-1.5"
            onClick={() => zoom(-0.15)}
            type="button"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            aria-label="放大图谱"
            className="rounded border p-1.5"
            onClick={() => zoom(0.15)}
            type="button"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            aria-label="重置图谱视图"
            className="rounded border p-1.5"
            onClick={() => setViewport({ x: 0, y: 0, scale: 1 })}
            type="button"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {nodes.length ? (
        <svg
          aria-label="课程知识图谱，可拖动平移并使用按钮缩放"
          className="h-[520px] w-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              pointerX: event.clientX,
              pointerY: event.clientY,
              originX: viewport.x,
              originY: viewport.y,
            };
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            setViewport((value) => ({
              ...value,
              x: drag.current!.originX + event.clientX - drag.current!.pointerX,
              y: drag.current!.originY + event.clientY - drag.current!.pointerY,
            }));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          role="img"
          viewBox={"0 0 960 " + layout.height}
        >
          <defs>
            <marker
              id="graph-arrow"
              markerHeight="7"
              markerWidth="7"
              orient="auto-start-reverse"
              refX="6"
              refY="3.5"
            >
              <path d="M 0 0 L 7 3.5 L 0 7 z" fill="#64748b" />
            </marker>
          </defs>
          <g
            transform={
              "translate(" +
              viewport.x +
              " " +
              viewport.y +
              ") scale(" +
              viewport.scale +
              ")"
            }
          >
            {visibleEdges.map((edge) => {
              const from = layout.positions.get(edge.from);
              const to = layout.positions.get(edge.to);
              if (!from || !to) return null;
              return (
                <line
                  key={edge.key}
                  markerEnd={
                    edge.type === "RELATED" ? undefined : "url(#graph-arrow)"
                  }
                  stroke={relationColor[edge.type]}
                  strokeDasharray={edge.type === "RELATED" ? "6 5" : undefined}
                  strokeWidth="2"
                  x1={from.x}
                  x2={to.x}
                  y1={from.y}
                  y2={to.y}
                />
              );
            })}
            {nodes.map((node) => {
              const position = layout.positions.get(node.key)!;
              const selected = node.key === selectedKey;
              return (
                <g
                  aria-label={node.code + " " + node.name}
                  className="cursor-pointer"
                  key={node.key}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(node.key);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(node.key);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  transform={
                    "translate(" +
                    (position.x - 92) +
                    " " +
                    (position.y - 27) +
                    ")"
                  }
                >
                  <rect
                    fill="white"
                    height="54"
                    rx="10"
                    stroke={colorByType[node.type]}
                    strokeWidth={selected ? "4" : "2"}
                    width="184"
                  />
                  <text
                    fill={colorByType[node.type]}
                    fontSize="12"
                    fontWeight="700"
                    x="12"
                    y="21"
                  >
                    {node.code}
                  </text>
                  <text fill="#334155" fontSize="12" x="12" y="40">
                    {shortened(node.name)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      ) : (
        <p className="p-8 text-center text-sm text-gray-500">
          当前筛选条件下没有节点。
        </p>
      )}
    </div>
  );
}
