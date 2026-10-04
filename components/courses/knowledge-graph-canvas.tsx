"use client";

import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ForceGraphMethods, ForceGraphProps } from "react-force-graph-3d";
import * as THREE from "three";
import { chapterGraphLayout } from "@/components/courses/knowledge-graph-presentation";
import { KnowledgeGraphNodeVisual } from "@/components/courses/knowledge-graph-node-visual";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

type GraphNode = KnowledgeGraphStructure["nodes"][number];
type GraphEdge = KnowledgeGraphStructure["edges"][number];
interface ForceNode {
  id: string;
  code: string;
  name: string;
  type: GraphNode["type"];
  color: string;
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}
interface ForceLink {
  id: string;
  source: string | ForceNode;
  target: string | ForceNode;
  type: GraphEdge["type"];
  color: string;
}
type FGMethods = ForceGraphMethods<ForceNode, ForceLink>;
type ForceGraphWithRefProps = ForceGraphProps<ForceNode, ForceLink> & {
  graphRef: RefObject<FGMethods | undefined>;
  onReady: () => void;
};
const ForceGraph3D = dynamic<ForceGraphWithRefProps>(
  async () => {
    const { default: Graph } = await import("react-force-graph-3d");
    // 通过普通属性传递 ref，避免动态组件截获相机和缩放方法。
    return function ForceGraphWithRef({
      graphRef,
      onReady,
      ...props
    }: ForceGraphWithRefProps) {
      useEffect(() => onReady(), [onReady]);
      return <Graph<ForceNode, ForceLink> {...props} ref={graphRef} />;
    };
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        正在加载三维知识图谱…
      </div>
    ),
  },
);
const relationColor: Record<GraphEdge["type"], string> = {
  CONTAINS: "#94a3b8",
  PREREQUISITE: "#d97706",
  RELATED: "#7c3aed",
};
const relationLabel: Record<GraphEdge["type"], string> = {
  CONTAINS: "包含",
  PREREQUISITE: "先修",
  RELATED: "相关",
};
const linkLabel = (link: ForceLink) => relationLabel[link.type];
const linkArrowLength = (link: ForceLink) =>
  link.type === "PREREQUISITE" ? 6 : 0;

export function KnowledgeGraphCanvas3D({
  nodes,
  edges,
  structure,
  selectedKey,
  onSelect,
  questionCountByPoint,
  nodeColorByKey,
  nodeColorHelp,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  structure?: KnowledgeGraphStructure;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  questionCountByPoint?: Map<string, number>;
  nodeColorByKey?: Map<string, string>;
  nodeColorHelp?: string;
}) {
  const fgRef = useRef<FGMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const needsFit = useRef(true);
  const nodeVisuals = useRef(
    new WeakMap<ForceNode, KnowledgeGraphNodeVisual>(),
  );
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 720 });
  const [graphReady, setGraphReady] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [showPointNames, setShowPointNames] = useState(false);
  const handleGraphReady = useCallback(() => setGraphReady(true), []);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      if (width <= 0 || height <= 0) return;
      setCanvasSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const layout = useMemo(
    () => chapterGraphLayout(structure ?? { nodes, edges }),
    [structure, nodes, edges],
  );
  const graphData = useMemo(() => {
    const visible = new Set(nodes.map((node) => node.key));
    return {
      nodes: nodes.map<ForceNode>((node) => {
        const position = layout.get(node.key) ?? {
          x: 0,
          y: 0,
          z: 0,
          color: "#047857",
        };
        return {
          id: node.key,
          code: node.code,
          name: node.name,
          type: node.type,
          ...position,
          color: nodeColorByKey?.get(node.key) ?? position.color,
        };
      }),
      links: edges
        .filter((edge) => visible.has(edge.from) && visible.has(edge.to))
        .map<ForceLink>((edge) => ({
          id: edge.key,
          source: edge.from,
          target: edge.to,
          type: edge.type,
          color: relationColor[edge.type],
        })),
    };
  }, [nodes, edges, layout, nodeColorByKey]);
  const highlighted = useMemo(() => {
    const keys = new Set<string>();
    if (selectedKey) {
      keys.add(selectedKey);
      edges.forEach((edge) => {
        if (edge.from === selectedKey) keys.add(edge.to);
        if (edge.to === selectedKey) keys.add(edge.from);
      });
    }
    return keys;
  }, [selectedKey, edges]);
  const updateNodeVisuals = useCallback(() => {
    for (const node of graphData.nodes) {
      nodeVisuals.current.get(node)?.updateAppearance({
        selected: node.id === selectedKey,
        emphasized:
          !selectedKey || highlighted.has(node.id) || node.id === hoverKey,
        showLabel:
          node.type !== "KNOWLEDGE_POINT" ||
          showPointNames ||
          graphData.nodes.length <= 40 ||
          highlighted.has(node.id) ||
          node.id === hoverKey,
        questionCount: questionCountByPoint?.get(node.id),
      });
    }
  }, [
    graphData.nodes,
    selectedKey,
    highlighted,
    hoverKey,
    showPointNames,
    questionCountByPoint,
  ]);
  useEffect(updateNodeVisuals, [updateNodeVisuals, graphReady]);
  const nodeThreeObject = useCallback((node: ForceNode) => {
    const visual = new KnowledgeGraphNodeVisual(node);
    nodeVisuals.current.set(node, visual);
    return visual;
  }, []);

  const linkColor = useCallback(
    (link: ForceLink) => {
      const from =
        typeof link.source === "object" ? link.source.id : link.source;
      const to = typeof link.target === "object" ? link.target.id : link.target;
      const focus = hoverKey ?? selectedKey;
      return focus && from !== focus && to !== focus ? "#e2e8f0" : link.color;
    },
    [hoverKey, selectedKey],
  );
  const handleNodeClick = useCallback(
    (node: ForceNode) => onSelect(node.id),
    [onSelect],
  );
  const handleNodeHover = useCallback(
    (node: ForceNode | null) => setHoverKey(node?.id ?? null),
    [],
  );
  const handleNodeDragEnd = useCallback((node: ForceNode) => {
    node.fx = node.x;
    node.fy = node.y;
    node.fz = node.z;
  }, []);

  useEffect(() => {
    const fg = fgRef.current;
    if (!graphReady || !fg) return;
    // 高分屏限制填充像素量；文字纹理仍保留足够阅读分辨率。
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    fg.renderer().setPixelRatio(pixelRatio);
    fg.postProcessingComposer().setPixelRatio(pixelRatio);
  }, [graphReady, canvasSize]);
  useEffect(() => {
    const fg = fgRef.current;
    const container = containerRef.current;
    if (!graphReady || !fg || !container) return;
    let inViewport = true;
    const updateVisibility = () => {
      if (inViewport && !document.hidden) fg.resumeAnimation();
      else fg.pauseAnimation();
    };
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry?.isIntersecting ?? false;
      updateVisibility();
    });
    observer.observe(container);
    document.addEventListener("visibilitychange", updateVisibility);
    updateVisibility();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, [graphReady]);

  const fitNodes = useCallback(
    (visibleNodes: ForceNode[], duration = 500) => {
      const fg = fgRef.current;
      if (!fg || !visibleNodes.length) return;
      const box = new THREE.Box3().setFromPoints(
        visibleNodes.map((node) => new THREE.Vector3(node.x, node.y, node.z)),
      );
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const camera = fg.camera();
      const fov =
        "fov" in camera && typeof camera.fov === "number" ? camera.fov : 50;
      const aspect = Math.max(0.1, canvasSize.width / canvasSize.height);
      const distance = Math.max(
        220,
        Math.max((size.x + 160) / aspect, size.y + 120) /
          (2 * Math.tan((fov * Math.PI) / 360)) +
          size.z / 2 +
          60,
      );
      fg.cameraPosition(
        { x: center.x, y: center.y, z: center.z + distance },
        center,
        duration,
      );
    },
    [canvasSize],
  );
  const fitView = useCallback(
    (duration = 500) => fitNodes(graphData.nodes, duration),
    [fitNodes, graphData.nodes],
  );
  const resetNodeLayout = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    for (const node of graphData.nodes) {
      const position = layout.get(node.id);
      if (!position) continue;
      node.x = position.x;
      node.y = position.y;
      node.z = position.z;
      node.vx = 0;
      node.vy = 0;
      node.vz = 0;
      node.fx = position.x;
      node.fy = position.y;
      node.fz = position.z;
    }
    fg.d3ReheatSimulation();
    fg.refresh();
    needsFit.current = false;
    fitView();
  }, [graphData.nodes, layout, fitView]);
  useEffect(() => {
    needsFit.current = true;
    setHoverKey(null);
    if (graphReady) fitView(0);
  }, [fitView, graphReady]);
  useEffect(() => {
    const fg = fgRef.current;
    const node = graphData.nodes.find((item) => item.id === selectedKey);
    if (!graphReady || !fg || !node) return;
    needsFit.current = false;
    if (node.type === "COURSE") {
      fitView();
      return;
    }
    if (node.type === "CHAPTER") {
      // 章节定位同时容纳其知识点，避免只看到章节球而找不到内容。
      fitNodes(
        graphData.nodes.filter(
          (item) =>
            item.id === node.id ||
            (item.type === "KNOWLEDGE_POINT" && highlighted.has(item.id)),
        ),
      );
      return;
    }
    const target = new THREE.Vector3(node.x, node.y, node.z);
    const direction = fg.camera().position.clone().sub(target);
    if (direction.lengthSq() === 0) direction.set(0, 0, 1);
    fg.cameraPosition(
      direction.normalize().multiplyScalar(360).add(target),
      target,
      500,
    );
  }, [
    graphReady,
    selectedKey,
    graphData.nodes,
    highlighted,
    fitNodes,
    fitView,
  ]);
  function zoomBy(factor: number) {
    const fg = fgRef.current;
    if (!fg) return;
    needsFit.current = false;
    const target = (fg.controls() as { target: THREE.Vector3 }).target;
    const offset = fg.camera().position.clone().sub(target);
    const distance = Math.max(80, Math.min(12000, offset.length() * factor));
    if (offset.lengthSq() === 0) offset.set(0, 0, 1);
    fg.cameraPosition(
      offset.normalize().multiplyScalar(distance).add(target),
      target,
      250,
    );
  }
  const nodeTooltip = useCallback(
    (node: ForceNode) => {
      // 图谱名称可由教师编辑，使用 textContent 避免被引擎当作 HTML 执行。
      const tooltip = document.createElement("div");
      const count = questionCountByPoint?.get(node.id);
      tooltip.textContent = `${node.name}（${node.code}）${count !== undefined ? ` · ${count} 道关联题` : ""} · 点击查看详情`;
      return tooltip.innerHTML;
    },
    [questionCountByPoint],
  );
  const handleEngineStop = useCallback(() => {
    updateNodeVisuals();
    if (needsFit.current) {
      needsFit.current = false;
      fitView(0);
    }
  }, [updateNodeVisuals, fitView]);
  return (
    <div
      className="min-w-0 overflow-hidden rounded-lg border bg-sky-50/60"
      role="figure"
      aria-label="课程知识图谱，可拖动节点、平移并使用按钮缩放"
      onPointerDownCapture={() => {
        needsFit.current = false;
      }}
      onWheelCapture={() => {
        needsFit.current = false;
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-white px-3 py-2">
        <div className="text-xs leading-5 text-gray-600">
          {nodeColorHelp ?? "彩色标题：课程 / 章节 · 同章知识点同色"}
          <br />
          悬停查看名称 · 点击章节展开阅读 · 橙色球为选中节点
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="缩小图谱"
            title="缩小"
            type="button"
            className="rounded border p-1.5"
            onClick={() => zoomBy(1.25)}
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            aria-label="放大图谱"
            title="放大"
            type="button"
            className="rounded border p-1.5"
            onClick={() => zoomBy(0.8)}
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            aria-label="复位节点布局"
            title="复位节点布局"
            type="button"
            className="flex items-center gap-1 rounded border px-2 py-1.5 text-xs"
            onClick={resetNodeLayout}
          >
            <RotateCcw className="h-4 w-4" />
            复位节点
          </button>
          <button
            aria-label="重置图谱视图"
            type="button"
            className="flex items-center gap-1 rounded border px-2 py-1.5 text-xs"
            onClick={() => {
              needsFit.current = false;
              fitView();
            }}
          >
            <Maximize2 className="h-4 w-4" />
            看全图
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs text-gray-500">
        <span>拖动节点移动 · 左键旋转 · 右键平移 · 滚轮缩放</span>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showPointNames}
            onChange={(event) => setShowPointNames(event.target.checked)}
          />
          显示全部知识点名称
        </label>
        <span>
          <span className="text-amber-700">→ 先修</span> ·{" "}
          <span className="text-violet-700">— 相关</span> · <span>— 包含</span>
        </span>
      </div>
      <div className="relative h-[720px] w-full" ref={containerRef}>
        {canvasSize.width > 0 ? (
          <ForceGraph3D
            graphRef={fgRef}
            onReady={handleGraphReady}
            width={canvasSize.width}
            height={canvasSize.height}
            graphData={graphData}
            backgroundColor="#f8fafc"
            nodeThreeObject={nodeThreeObject}
            nodeThreeObjectExtend={false}
            nodeLabel={nodeTooltip}
            enableNodeDrag={true}
            showNavInfo={false}
            linkColor={linkColor}
            linkLabel={linkLabel}
            linkWidth={0}
            linkOpacity={0.7}
            linkDirectionalArrowLength={linkArrowLength}
            linkDirectionalArrowRelPos={0.9}
            onNodeClick={handleNodeClick}
            onNodeDragEnd={handleNodeDragEnd}
            onNodeHover={handleNodeHover}
            warmupTicks={0}
            cooldownTicks={0}
            onEngineStop={handleEngineStop}
          />
        ) : null}
        {!nodes.length ? (
          <p
            role="status"
            className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-gray-500"
          >
            没有匹配节点，请调整章节、类型或搜索条件。
          </p>
        ) : null}
      </div>
    </div>
  );
}
export const KnowledgeGraphCanvas = memo(KnowledgeGraphCanvas3D);
