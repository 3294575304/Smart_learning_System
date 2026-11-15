"use client";

import {
  Expand,
  Focus,
  Layers3,
  Maximize2,
  Minus,
  Network,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ForceGraphMethods, ForceGraphProps } from "react-force-graph-3d";
import * as THREE from "three";
import type { TrackballControls } from "three/addons/controls/TrackballControls.js";
import {
  expandableSphereLayout,
  sphereNodeVisible,
  wheelExpansion,
} from "@/components/courses/knowledge-graph-expandable-layout";
import {
  hobermanMotion,
  scissorPairPose,
} from "@/components/courses/knowledge-graph-hoberman-motion";
import { chapterGraphLayout } from "@/components/courses/knowledge-graph-presentation";
import { KnowledgeGraphNodeVisual } from "@/components/courses/knowledge-graph-node-visual";
import {
  frameGraphNodes,
  focusGraphNode,
  graphNeighborhoods,
} from "@/components/courses/knowledge-graph-exploration";
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
      <div
        className="flex h-full items-center justify-center text-sm text-slate-400"
        role="status"
      >
        正在加载三维知识图谱…
      </div>
    ),
  },
);
const relationColor: Record<GraphEdge["type"], string> = {
  CONTAINS: "#64748b",
  PREREQUISITE: "#fbbf24",
  RELATED: "#a78bfa",
};
const relationLabel: Record<GraphEdge["type"], string> = {
  CONTAINS: "包含",
  PREREQUISITE: "先修",
  RELATED: "相关",
};
const linkLabel = (link: ForceLink) => relationLabel[link.type];
const linkArrowLength = (link: ForceLink) =>
  link.type === "PREREQUISITE" ? 6 : 0;
const linkEndpoint = (node: string | ForceNode) =>
  typeof node === "string" ? node : node.id;
const toolbarButton =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-2.5 text-xs text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-default disabled:opacity-35";

export function KnowledgeGraphCanvas3D({
  nodes,
  edges,
  structure,
  selectedKey,
  onSelect,
  onClearSelection,
  questionCountByPoint,
  nodeColorByKey,
  nodeColorHelp,
  compact = false,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  structure?: KnowledgeGraphStructure;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onClearSelection?: () => void;
  questionCountByPoint?: Map<string, number>;
  nodeColorByKey?: Map<string, string>;
  nodeColorHelp?: string;
  compact?: boolean;
}) {
  const fgRef = useRef<FGMethods | undefined>(undefined);
  const figureRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const needsFit = useRef(true);
  const nodeVisuals = useRef(
    new WeakMap<ForceNode, KnowledgeGraphNodeVisual>(),
  );
  const currentExpansion = useRef(0);
  const previousExpansion = useRef(0);
  const scissorVisuals = useRef<{
    group: THREE.Group;
    rods: THREE.InstancedMesh;
    pivots: THREE.InstancedMesh;
    ends: THREE.InstancedMesh;
  } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 720 });
  const [graphReady, setGraphReady] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [showPointNames, setShowPointNames] = useState(false);
  const [onlyRelated, setOnlyRelated] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const [layoutMode, setLayoutMode] = useState<"CHAPTER" | "SPHERE">("SPHERE");
  const [expansion, setExpansion] = useState(0);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(
        "zhixue:knowledge-graph:layout",
      );
      if (saved === "SPHERE" || saved === "CHAPTER") setLayoutMode(saved);
    } catch {
      /* 浏览器禁用存储时仍可正常切换。 */
    }
  }, []);
  function changeLayout(mode: "CHAPTER" | "SPHERE") {
    setLayoutMode(mode);
    if (mode === "SPHERE") {
      currentExpansion.current = 0;
      setExpansion(0);
    }
    try {
      window.localStorage.setItem("zhixue:knowledge-graph:layout", mode);
    } catch {
      /* 只丢失偏好记忆，不影响图谱交互。 */
    }
  }

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
  const sphere = useMemo(
    () => expandableSphereLayout(structure ?? { nodes, edges }),
    [structure, nodes, edges],
  );
  const layout = useMemo(
    () =>
      layoutMode === "SPHERE"
        ? sphere.expanded
        : chapterGraphLayout(structure ?? { nodes, edges }),
    [structure, nodes, edges, layoutMode, sphere],
  );
  const graphData = useMemo(() => {
    const visible = new Set(nodes.map((node) => node.key));
    return {
      nodes: nodes.map<ForceNode>((node) => {
        const position = (layoutMode === "SPHERE"
          ? sphere.collapsed
          : layout
        ).get(node.key) ?? {
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
  }, [nodes, edges, layout, layoutMode, sphere, nodeColorByKey]);
  const neighborhoods = useMemo(
    () =>
      graphNeighborhoods(
        nodes.map((node) => node.key),
        edges,
      ),
    [nodes, edges],
  );
  const selectedNode = graphData.nodes.find((node) => node.id === selectedKey);
  const selectedNeighbors = selectedNode
    ? neighborhoods.get(selectedNode.id)
    : undefined;
  const focusKey =
    hoverKey ?? (selectedNode?.type === "CHAPTER" ? selectedKey : null);
  const highlighted = focusKey ? neighborhoods.get(focusKey) : undefined;
  const nodeVisible = useCallback(
    (node: ForceNode) =>
      (layoutMode !== "SPHERE" ||
        sphereNodeVisible(node.type, currentExpansion.current)) &&
      (!onlyRelated || !selectedNeighbors || selectedNeighbors.has(node.id)),
    [layoutMode, onlyRelated, selectedNeighbors],
  );
  const linkVisible = useCallback(
    (link: ForceLink) =>
      (layoutMode !== "SPHERE" || currentExpansion.current > 0.45) &&
      (!onlyRelated ||
        !selectedNeighbors ||
        (selectedNeighbors.has(linkEndpoint(link.source)) &&
          selectedNeighbors.has(linkEndpoint(link.target)))),
    [layoutMode, onlyRelated, selectedNeighbors],
  );
  const updateNodeVisuals = useCallback(() => {
    for (const node of graphData.nodes) {
      nodeVisuals.current.get(node)?.updateAppearance({
        selected: node.id === selectedKey,
        emphasized: !focusKey || Boolean(highlighted?.has(node.id)),
        // 聚焦不强制展开整簇名称；密集知识点由悬停或名称开关读取。
        showLabel:
          showPointNames ||
          node.id === selectedKey ||
          node.id === focusKey ||
          node.type !== "KNOWLEDGE_POINT" ||
          graphData.nodes.length <= 24,
        questionCount: questionCountByPoint?.get(node.id),
      });
    }
  }, [
    graphData.nodes,
    selectedKey,
    focusKey,
    highlighted,
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
      const incident =
        linkEndpoint(link.source) === focusKey ||
        linkEndpoint(link.target) === focusKey;
      const color = new THREE.Color(link.color).getStyle();
      const opacity =
        focusKey && incident ? 0.95 : link.type === "CONTAINS" ? 0.45 : 0.6;
      return color.replace("rgb(", "rgba(").replace(")", `,${opacity})`);
    },
    [focusKey],
  );
  const linkWidth = useCallback(
    (link: ForceLink) =>
      focusKey &&
      (linkEndpoint(link.source) === focusKey ||
        linkEndpoint(link.target) === focusKey)
        ? 1.2
        : 0,
    [focusKey],
  );
  const handleNodeClick = useCallback(
    (node: ForceNode) => onSelect(node.id),
    [onSelect],
  );
  const handleNodeHover = useCallback((node: ForceNode | null) => {
    setHoverKey(node?.id ?? null);
    if (containerRef.current)
      containerRef.current.style.cursor = node ? "pointer" : "grab";
  }, []);
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
    if (!graphReady || !fg) return;
    // 柔和主光与冷色轮廓光塑造釉面质感，避免高环境光抹平球体层次。
    const key = new THREE.DirectionalLight("#fff5eb", 2.4);
    key.position.set(-600, 800, 1200);
    const fill = new THREE.DirectionalLight("#93c5fd", 0.55);
    fill.position.set(700, -200, -800);
    const rim = new THREE.DirectionalLight("#c4b5fd", 1.1);
    rim.position.set(200, 500, -700);
    fg.lights([new THREE.AmbientLight("#dbeafe", 0.8), key, fill, rim]);
  }, [graphReady]);
  useEffect(() => {
    const fg = fgRef.current;
    if (!graphReady || !fg) return;
    const controls = fg.controls() as TrackballControls;
    const planar = layoutMode === "CHAPTER";
    controls.noRotate = planar;
    controls.noZoom = !planar;
    controls.panSpeed = planar ? 0.12 : 0.3;
    // 平面阅读取消惯性滑行，松手即停，避免一次轻拖后画布继续漂移。
    controls.staticMoving = planar;
    controls.mouseButtons.LEFT = planar ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    if (planar) fg.camera().up.set(0, 1, 0);
    controls.update();
  }, [graphReady, layoutMode]);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || layoutMode !== "SPHERE") return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      needsFit.current = false;
      setExpansion((value) => wheelExpansion(value, event.deltaY));
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [layoutMode]);
  useEffect(() => {
    const fg = fgRef.current;
    if (
      !graphReady ||
      !fg ||
      layoutMode !== "SPHERE" ||
      !sphere.scissors.length
    )
      return;
    const group = new THREE.Group();
    group.name = "Decorative scissor sphere frame";
    const rodGeometry = new THREE.CylinderGeometry(2.7, 2.7, 1, 7);
    const pivotGeometry = new THREE.SphereGeometry(4.5, 10, 8);
    const endGeometry = new THREE.SphereGeometry(3.1, 8, 6);
    const rodMaterial = new THREE.MeshPhongMaterial({
      color: "#ffffff",
      shininess: 95,
    });
    const jointMaterial = new THREE.MeshPhongMaterial({
      color: "#fb704b",
      shininess: 80,
    });
    const rods = new THREE.InstancedMesh(
      rodGeometry,
      rodMaterial,
      sphere.scissors.length * 4,
    );
    const pivots = new THREE.InstancedMesh(
      pivotGeometry,
      jointMaterial,
      sphere.scissors.length,
    );
    const ends = new THREE.InstancedMesh(
      endGeometry,
      jointMaterial,
      sphere.scissors.length * 4,
    );
    // Instance transforms move each frame; avoid stale bounds hiding the shell.
    rods.frustumCulled = false;
    pivots.frustumCulled = false;
    ends.frustumCulled = false;
    rods.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pivots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    ends.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sphere.scissors.forEach((pair, index) => {
      const color = new THREE.Color(pair.color).lerp(
        new THREE.Color("#ffffff"),
        0.38,
      );
      for (let arm = 0; arm < 4; arm++) rods.setColorAt(index * 4 + arm, color);
    });
    if (rods.instanceColor) rods.instanceColor.needsUpdate = true;
    group.add(rods, pivots, ends);
    fg.scene().add(group);
    scissorVisuals.current = { group, rods, pivots, ends };
    return () => {
      fg.scene().remove(group);
      scissorVisuals.current = null;
      rods.dispose();
      pivots.dispose();
      ends.dispose();
      rodGeometry.dispose();
      pivotGeometry.dispose();
      endGeometry.dispose();
      rodMaterial.dispose();
      jointMaterial.dispose();
    };
  }, [graphReady, layoutMode, sphere]);
  useEffect(() => {
    const fg = fgRef.current;
    if (!graphReady || !fg || layoutMode !== "SPHERE") return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frame = 0;
    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const putRod = (
      rods: THREE.InstancedMesh,
      index: number,
      from: THREE.Vector3,
      to: THREE.Vector3,
    ) => {
      const delta = to.clone().sub(from);
      dummy.position.copy(from).add(to).multiplyScalar(0.5);
      dummy.quaternion.setFromUnitVectors(up, delta.clone().normalize());
      dummy.scale.set(1, delta.length(), 1);
      dummy.updateMatrix();
      rods.setMatrixAt(index, dummy.matrix);
    };
    const putJoint = (
      mesh: THREE.InstancedMesh,
      index: number,
      position: THREE.Vector3,
    ) => {
      dummy.position.copy(position);
      dummy.quaternion.identity();
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    };
    const update = () => {
      const current = currentExpansion.current;
      const next =
        reduced || Math.abs(expansion - current) < 0.002
          ? expansion
          : current + (expansion - current) * 0.18;
      currentExpansion.current = next;
      const motion = hobermanMotion(next);
      for (const node of graphData.nodes) {
        const start = sphere.collapsed.get(node.id);
        const end = sphere.expanded.get(node.id);
        if (!start || !end) continue;
        node.x = node.fx = start.x + (end.x - start.x) * motion.radialFraction;
        node.y = node.fy = start.y + (end.y - start.y) * motion.radialFraction;
        node.z = node.fz = start.z + (end.z - start.z) * motion.radialFraction;
        const visual = nodeVisuals.current.get(node);
        if (visual && node.type === "KNOWLEDGE_POINT")
          visual.scale.setScalar(
            Math.max(0.001, Math.min(1, (next - 0.08) / 0.55)),
          );
      }
      const visuals = scissorVisuals.current;
      if (visuals) {
        visuals.group.visible = graphData.nodes.length > 0;
        sphere.scissors.forEach((pair, index) => {
          const pose = scissorPairPose(pair, next);
          const pivot = new THREE.Vector3(
            pose.pivot.x,
            pose.pivot.y,
            pose.pivot.z,
          );
          const endpoints = pose.ends.map(
            (end) => new THREE.Vector3(end.x, end.y, end.z),
          );
          putRod(visuals.rods, index * 4, endpoints[0], pivot);
          putRod(visuals.rods, index * 4 + 1, pivot, endpoints[1]);
          putRod(visuals.rods, index * 4 + 2, endpoints[2], pivot);
          putRod(visuals.rods, index * 4 + 3, pivot, endpoints[3]);
          putJoint(visuals.pivots, index, pivot);
          endpoints.forEach((end, terminal) =>
            putJoint(visuals.ends, index * 4 + terminal, end),
          );
        });
        visuals.rods.instanceMatrix.needsUpdate = true;
        visuals.pivots.instanceMatrix.needsUpdate = true;
        visuals.ends.instanceMatrix.needsUpdate = true;
      }
      fg.refresh();
      if (next !== expansion) frame = window.requestAnimationFrame(update);
    };
    update();
    return () => window.cancelAnimationFrame(frame);
  }, [graphReady, graphData.nodes, expansion, layoutMode, sphere]);
  useEffect(() => {
    if (layoutMode !== "SPHERE" || !graphReady) return;
    const selected = graphData.nodes.find((node) => node.id === selectedKey);
    if (
      (selected && selected.type !== "CHAPTER") ||
      (graphData.nodes.some((node) => node.type !== "CHAPTER") &&
        !graphData.nodes.some((node) => node.type === "CHAPTER"))
    )
      setExpansion(1);
  }, [graphReady, graphData.nodes, layoutMode, selectedKey]);
  useEffect(() => {
    const wasCollapsing = expansion < previousExpansion.current;
    previousExpansion.current = expansion;
    if (layoutMode !== "SPHERE" || !selectedKey || !wasCollapsing) return;
    const selected = graphData.nodes.find((node) => node.id === selectedKey);
    if (selected && !sphereNodeVisible(selected.type, expansion)) {
      setOnlyRelated(false);
      onClearSelection?.();
    }
  }, [expansion, graphData.nodes, layoutMode, onClearSelection, selectedKey]);
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
    (visibleNodes: ForceNode[], duration = 500, preserveAngle = false) => {
      const fg = fgRef.current;
      if (!fg || !visibleNodes.length) return;
      const camera = fg.camera();
      const fov =
        "fov" in camera && typeof camera.fov === "number" ? camera.fov : 50;
      const direction = preserveAngle
        ? camera.position
            .clone()
            .sub((fg.controls() as { target: THREE.Vector3 }).target)
        : new THREE.Vector3(
            layoutMode === "SPHERE" ? 0.7 : 0,
            layoutMode === "SPHERE" ? 0.3 : 0,
            1,
          );
      const frame = frameGraphNodes(
        layoutMode === "SPHERE"
          ? visibleNodes.map((node) => ({
              ...node,
              ...(sphere.expanded.get(node.id) ?? {}),
            }))
          : visibleNodes,
        canvasSize.width / canvasSize.height,
        fov,
        direction,
      );
      if (frame)
        fg.cameraPosition(
          frame.position,
          frame.target,
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 0
            : duration,
        );
    },
    [canvasSize, layoutMode, sphere],
  );
  const fitView = useCallback(
    (duration = 500) =>
      fitNodes(
        layoutMode === "SPHERE"
          ? graphData.nodes
          : graphData.nodes.filter(nodeVisible),
        duration,
      ),
    [fitNodes, graphData.nodes, nodeVisible, layoutMode],
  );
  const resetNodeLayout = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    for (const node of graphData.nodes) {
      const position =
        layoutMode === "SPHERE"
          ? sphere.collapsed.get(node.id)
          : layout.get(node.id);
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
    if (layoutMode === "SPHERE") {
      currentExpansion.current = 0;
      setExpansion(0);
      setOnlyRelated(false);
      onClearSelection?.();
    }
    fitView();
  }, [graphData.nodes, layout, fitView, layoutMode, sphere, onClearSelection]);
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
    if (onlyRelated) {
      fitView();
      return;
    }
    // 保留章节周围的阅读空间，不把镜头推到球体表面。
    const radius =
      node.type === "COURSE" ? 20 : node.type === "CHAPTER" ? 13 : 7;
    const distance = Math.max(
      node.type === "KNOWLEDGE_POINT" ? 180 : 260,
      radius * 10,
    );
    const direction = fg
      .camera()
      .position.clone()
      .sub((fg.controls() as TrackballControls).target);
    // 二维章节总览的节点聚焦也保持正面，避免沿径向飞入后视角倾斜。
    const { position, target } =
      layoutMode === "CHAPTER"
        ? {
            position: new THREE.Vector3(node.x, node.y, node.z + distance),
            target: new THREE.Vector3(node.x, node.y, node.z),
          }
        : focusGraphNode(
            node.type === "KNOWLEDGE_POINT"
              ? { ...node, ...(sphere.expanded.get(node.id) ?? {}) }
              : node,
            distance,
            direction,
          );
    fg.cameraPosition(
      position,
      target,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 3000,
    );
  }, [
    graphReady,
    selectedKey,
    graphData.nodes,
    selectedNeighbors,
    onlyRelated,
    fitNodes,
    fitView,
    layoutMode,
    sphere,
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
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 250,
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
  function clearSelection() {
    setOnlyRelated(false);
    setHoverKey(null);
    onClearSelection?.();
    fitNodes(graphData.nodes);
  }
  async function toggleFullscreen() {
    setFullscreenError("");
    try {
      if (document.fullscreenElement === figureRef.current)
        await document.exitFullscreen();
      else await figureRef.current?.requestFullscreen();
    } catch {
      setFullscreenError("当前浏览器无法进入全屏，可使用看全图调整视野。");
    }
  }
  return (
    <div
      ref={figureRef}
      className="min-w-0 overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1220] text-slate-200 shadow-lg [&:fullscreen]:flex [&:fullscreen]:flex-col [&:fullscreen]:rounded-none"
      role="figure"
      aria-label="课程知识图谱，可拖动节点、平移并使用按钮缩放"
      onPointerDownCapture={() => {
        needsFit.current = false;
      }}
      onWheelCapture={() => {
        needsFit.current = false;
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 bg-[#111b2d] px-4 py-3">
        <div
          className="inline-flex rounded-xl border border-slate-700/60 bg-slate-950/40 p-1"
          role="group"
          aria-label="图谱显示模式"
        >
          {(
            [
              ["SPHERE", "伸缩球"],
              ["CHAPTER", "章节总览"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={layoutMode === mode}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-sky-400 ${layoutMode === mode ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-100"}`}
              onClick={() => changeLayout(mode)}
            >
              {mode === "SPHERE" ? (
                <Network className="size-3.5" aria-hidden="true" />
              ) : (
                <Layers3 className="size-3.5" aria-hidden="true" />
              )}
              {label}
            </button>
          ))}
        </div>
        <div
          className="flex items-center gap-1.5"
          role="group"
          aria-label="图谱视野控制"
        >
          {layoutMode === "SPHERE" ? (
            <div
              className="mr-2 flex items-center gap-2"
              role="group"
              aria-label="球体伸缩控制"
            >
              <button
                type="button"
                className={toolbarButton}
                aria-label="收起球体"
                onClick={() => setExpansion(0)}
              >
                收起
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(expansion * 100)}
                aria-label="球体展开程度"
                className="w-20 accent-sky-400 sm:w-28"
                onChange={(event) =>
                  setExpansion(Number(event.target.value) / 100)
                }
              />
              <button
                type="button"
                className={toolbarButton}
                aria-label="展开球体"
                onClick={() => setExpansion(1)}
              >
                展开
              </button>
            </div>
          ) : null}
          <button
            aria-label="缩小图谱"
            title="缩小"
            type="button"
            className={toolbarButton}
            onClick={() => zoomBy(1.25)}
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            aria-label="放大图谱"
            title="放大"
            type="button"
            className={toolbarButton}
            onClick={() => zoomBy(0.8)}
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            aria-label="复位节点布局"
            title="复位节点布局"
            type="button"
            className={toolbarButton}
            onClick={resetNodeLayout}
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">复位</span>
          </button>
          <button
            aria-label="重置图谱视图"
            type="button"
            className={toolbarButton}
            onClick={() => {
              needsFit.current = false;
              clearSelection();
            }}
          >
            <Maximize2 className="h-4 w-4" />
            看全图
          </button>
          <button
            type="button"
            className={toolbarButton}
            onClick={toggleFullscreen}
            aria-label="切换图谱全屏"
            title="切换全屏"
          >
            <Expand className="size-4" />
          </button>
        </div>
      </div>
      <div
        style={{
          backgroundImage:
            "radial-gradient(ellipse at center, rgba(5,12,30,0.48), rgba(5,12,30,0.22) 65%, rgba(3,7,18,0.55)), linear-gradient(rgba(6,13,31,0.35), rgba(6,13,31,0.35)), url('/images/knowledge-graph-nebula.webp')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        className={
          compact
            ? "relative h-[480px] w-full cursor-grab sm:h-[620px] [[role=figure]:fullscreen_&]:h-auto [[role=figure]:fullscreen_&]:flex-1"
            : "relative h-[680px] w-full cursor-grab [[role=figure]:fullscreen_&]:h-auto [[role=figure]:fullscreen_&]:flex-1"
        }
        ref={containerRef}
      >
        {canvasSize.width > 0 ? (
          <ForceGraph3D
            graphRef={fgRef}
            onReady={handleGraphReady}
            width={canvasSize.width}
            height={canvasSize.height}
            graphData={graphData}
            backgroundColor="rgba(0,0,0,0)"
            nodeThreeObject={nodeThreeObject}
            nodeThreeObjectExtend={false}
            nodeLabel={nodeTooltip}
            nodeVisibility={nodeVisible}
            enableNodeDrag={true}
            showNavInfo={false}
            linkColor={linkColor}
            linkLabel={linkLabel}
            linkVisibility={linkVisible}
            linkWidth={linkWidth}
            linkOpacity={1}
            linkCurvature={0}
            linkDirectionalArrowLength={linkArrowLength}
            linkDirectionalArrowRelPos={0.9}
            onNodeClick={handleNodeClick}
            onNodeDragEnd={handleNodeDragEnd}
            onNodeHover={handleNodeHover}
            onBackgroundClick={clearSelection}
            warmupTicks={0}
            cooldownTicks={0}
            onEngineStop={handleEngineStop}
          />
        ) : null}
        {nodes.length ? (
          <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-3">
            <div className="max-w-[75%] rounded-xl border border-slate-700/70 bg-[#111b2d]/95 px-3.5 py-3">
              {selectedNode ? (
                <>
                  <div className="flex items-center gap-2 text-[10px] tracking-widest text-slate-400">
                    <Focus className="size-3" aria-hidden="true" />
                    当前聚焦
                  </div>
                  <p
                    className="mt-1.5 truncate text-sm font-medium text-white"
                    title={selectedNode.name}
                  >
                    {selectedNode.name}
                  </p>
                  <button
                    type="button"
                    className="pointer-events-auto mt-2 inline-flex items-center gap-1 text-xs text-sky-300 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
                    onClick={clearSelection}
                  >
                    <X className="size-3" aria-hidden="true" />
                    返回全图
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-slate-200">
                    {layoutMode === "SPHERE"
                      ? "滚轮向上展开球体，查看内部知识点"
                      : "从课程核心探索章节网络"}
                  </p>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    悬停查看关联 · 点击节点聚焦
                  </p>
                </>
              )}
            </div>
            <span
              className="shrink-0 rounded-full border border-slate-700/70 bg-[#111b2d]/95 px-3 py-1.5 text-[11px] text-slate-400"
              role="status"
            >
              {layoutMode === "SPHERE"
                ? graphData.nodes.filter(
                    (node) =>
                      sphereNodeVisible(node.type, expansion) &&
                      (!onlyRelated ||
                        !selectedNeighbors ||
                        selectedNeighbors.has(node.id)),
                  ).length
                : graphData.nodes.filter(nodeVisible).length}{" "}
              节点 /{" "}
              {layoutMode === "SPHERE" && expansion <= 0.45
                ? 0
                : graphData.links.filter((link) =>
                    layoutMode === "SPHERE"
                      ? !onlyRelated ||
                        !selectedNeighbors ||
                        (selectedNeighbors.has(linkEndpoint(link.source)) &&
                          selectedNeighbors.has(linkEndpoint(link.target)))
                      : linkVisible(link),
                  ).length}{" "}
              关系
            </span>
          </div>
        ) : null}
        {!nodes.length ? (
          <p
            role="status"
            className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-400"
          >
            没有匹配节点，请调整章节、类型或搜索条件。
          </p>
        ) : null}
        <a
          href="https://www.eso.org/public/images/eso1105a/"
          target="_blank"
          rel="noreferrer"
          className="absolute right-3 bottom-2 rounded bg-slate-950/70 px-2 py-1 text-[10px] text-slate-300 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
          title="M78 星云 · ESO/Igor Chekalin · CC BY 4.0；已裁切、压缩并叠加暗色遮罩"
        >
          背景：ESO/Igor Chekalin
        </a>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-slate-700/60 bg-[#111b2d] px-4 py-3 text-xs">
        <div
          className="flex flex-wrap items-center gap-4 text-slate-400"
          aria-label="关系图例"
        >
          <span className="flex items-center gap-1.5">
            <span className="h-px w-4 bg-slate-500" />
            包含
          </span>
          <span className="text-amber-300">→ 先修</span>
          <span className="flex items-center gap-1.5 text-violet-300">
            <span className="h-px w-4 bg-violet-400" />
            相关
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-slate-300">
            <input
              className="accent-sky-500"
              type="checkbox"
              checked={showPointNames}
              onChange={(event) => setShowPointNames(event.target.checked)}
            />
            显示全部知识点名称
          </label>
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-35 ${onlyRelated && selectedNode ? "border-sky-700 bg-sky-950 text-sky-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}
            disabled={!selectedNode}
            aria-pressed={onlyRelated && Boolean(selectedNode)}
            onClick={() => setOnlyRelated((value) => !value)}
          >
            <Focus className="size-3.5" aria-hidden="true" />
            只看直接关联
          </button>
        </div>
        <p className="w-full text-[11px] leading-5 text-slate-400">
          {nodeColorHelp ?? "同章节点同色，点击节点平滑飞入查看。"}
          <span className="mx-2 text-slate-600">|</span>
          {layoutMode === "SPHERE"
            ? "彩色骨架仅表示伸缩结构 · 左键旋转 · 右键平移 · 滚轮向上展开、向下收起 · 按钮缩放镜头"
            : "拖动节点移动 · 拖动画布平移 · 滚轮缩放 · 正面视角已锁定"}
        </p>
        {fullscreenError ? (
          <p role="status" className="text-xs text-amber-300">
            {fullscreenError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
export const KnowledgeGraphCanvas = memo(KnowledgeGraphCanvas3D);
