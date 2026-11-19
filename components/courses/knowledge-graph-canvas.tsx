"use client";

import {
  Expand,
  Focus,
  Layers3,
  Maximize2,
  Minus,
  Orbit,
  Plus,
  RotateCcw,
  Waves,
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
  breathingExpansion,
  breathingPhaseAt,
  hobermanMotion,
  sphereMotionModes,
  spherePosition,
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
  isKeyTopic?: boolean;
  isDifficultTopic?: boolean;
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
const linkEndpoint = (node: string | ForceNode) =>
  typeof node === "string" ? node : node.id;
const toolbarButton =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-default disabled:opacity-40";
const motionToggleButton =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-default disabled:opacity-40";
const motionToggleOn =
  "border-sky-300 bg-sky-100 text-sky-800 hover:border-sky-400 hover:bg-sky-200";
const motionToggleOff =
  "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800";
/**
 * 「3D 图谱」模式图标：线框球体加两个高亮点，避免与自动旋转的轨道图标重复。
 * 细描边保证在浅色工具栏上与 14px 文字同重。
 */
function SphereGraphIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="8" strokeLinecap="round" />
      <ellipse cx="12" cy="12" rx="8" ry="3.2" />
      <ellipse cx="12" cy="12" rx="3.2" ry="8" />
      <circle cx="12" cy="4" fill="currentColor" r="1.5" stroke="none" />
      <circle cx="18.6" cy="15.4" fill="currentColor" r="1.5" stroke="none" />
    </svg>
  );
}
const cameraDirection = new THREE.Vector3();
const projected = new THREE.Vector3();
/** 估算章节标签的屏幕宽度：中文按全角、西文按半角计。 */
function estimateLabelWidth(name: string) {
  let units = 0;
  for (const char of Array.from(name)) {
    units += /[\u0020-\u007e]/u.test(char) ? 0.55 : 1;
  }
  return Math.min(260, units * 12 + 18);
}

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
  const expansionRef = useRef(0);
  /**
   * 唯一的相机动画句柄。
   * 库自带的 cameraPosition 补间与 TrackballControls 每帧回写同一个相机，
   * 两个写者交替覆盖就会闪；这里统一自己插值，任何时刻只有一个写者。
   */
  const cameraTween = useRef(0);
  const courseGlow = useRef<THREE.Sprite | null>(null);
  /** 上一帧成功显示的章节标签：为本帧的避让提供优先权，抑制来回抢位。 */
  const shownLabels = useRef(new Set<string>());
  const rotationAngle = useRef(0);
  const breathPhase = useRef(0);
  const dragging = useRef(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 720 });
  const [graphReady, setGraphReady] = useState(false);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [showPointNames, setShowPointNames] = useState(false);
  const [onlyRelated, setOnlyRelated] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const [layoutMode, setLayoutMode] = useState<"CHAPTER" | "SPHERE">("SPHERE");
  const [expansion, setExpansion] = useState(0);
  const [displayExpansion, setDisplayExpansion] = useState(0);
  // 进入图谱即呈现动态：呼吸与自转默认开启，用户仍可随时独立关闭。
  const [breathing, setBreathing] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [motionVisible, setMotionVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  expansionRef.current = expansion;
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const release = () => {
      dragging.current = false;
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);
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
      setDisplayExpansion(0);
    }
    try {
      window.localStorage.setItem("zhixue:knowledge-graph:layout", mode);
    } catch {
      /* 只丢失偏好记忆，不影响图谱交互。 */
    }
  }
  const setManualExpansion = useCallback((value: number) => {
    setBreathing(false);
    setExpansion(value);
    setDisplayExpansion(value);
  }, []);

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
          isKeyTopic: node.isKeyTopic,
          isDifficultTopic: node.isDifficultTopic,
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
  const nodeVisible = useCallback(
    (node: ForceNode) =>
      (layoutMode !== "SPHERE" ||
        sphereNodeVisible(node.type, currentExpansion.current)) &&
      ((layoutMode === "SPHERE" && node.type === "COURSE") ||
        !onlyRelated ||
        !selectedNeighbors ||
        selectedNeighbors.has(node.id)),
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
        // 只在选中时淡化其余节点；悬停仅高亮关联线，避免鼠标划过时整球闪烁。
        emphasized:
          node.type === "COURSE" ||
          !selectedNeighbors ||
          selectedNeighbors.has(node.id),
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
    selectedNeighbors,
    showPointNames,
    questionCountByPoint,
  ]);
  useEffect(updateNodeVisuals, [updateNodeVisuals, graphReady]);
  /**
   * 同一节点必须复用同一个渲染对象。
   * three-forcegraph 在 graphData 每次替换时都会重新调用 nodeThreeObject，
   * 若每次都 new，标签的透明度会被写到已下线的旧对象上，屏幕上永远不生效。
   */
  const visualCache = useRef(new Map<string, KnowledgeGraphNodeVisual>());
  const nodeThreeObject = useCallback((node: ForceNode) => {
    const cached = visualCache.current.get(node.id);
    if (cached) {
      nodeVisuals.current.set(node, cached);
      return cached;
    }
    const visual = new KnowledgeGraphNodeVisual(node);
    visualCache.current.set(node.id, visual);
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
        focusKey && incident ? 1 : link.type === "CONTAINS" ? 0.55 : 0.7;
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
  const handleRenderFrame = useCallback(() => {
    if (layoutMode !== "SPHERE" || !graphReady) return;
    const fg = fgRef.current;
    if (!fg) return;
    const camera = fg.camera();
    cameraDirection.copy(camera.position).normalize();
    const width = canvasSize.width || 1;
    const height = canvasSize.height || 1;
    const candidates: {
      visual: KnowledgeGraphNodeVisual;
      isCourse: boolean;
      facing: number;
      x: number;
      y: number;
      width: number;
    }[] = [];
    for (const node of graphData.nodes) {
      // 课程核心标签固定在球心，必须参与避让，否则章节名会压在它上面。
      const isCourse = node.type === "COURSE";
      if (node.type !== "CHAPTER" && !isCourse) continue;
      const visual = nodeVisuals.current.get(node);
      if (!visual) continue;
      const length = Math.hypot(node.x, node.y, node.z);
      // 背向镜头的章节标签淡出，避免球体前后两层文字叠在一起。
      const facing =
        length < 1e-3
          ? 1
          : (node.x * cameraDirection.x +
              node.y * cameraDirection.y +
              node.z * cameraDirection.z) /
            length;
      projected
        .set(node.x, node.y + visual.labelAnchorY, node.z)
        .project(camera);
      candidates.push({
        visual,
        isCourse,
        facing,
        x: (projected.x * 0.5 + 0.5) * width,
        y: (-projected.y * 0.5 + 0.5) * height,
        width: estimateLabelWidth(node.name),
      });
    }
    // 屏幕空间避让：上一帧已经显示的标签优先占位，避免镜头微动时两个标签互相顶替。
    const shown = shownLabels.current;
    candidates.sort(
      (a, b) =>
        Number(b.isCourse) - Number(a.isCourse) ||
        Number(shown.has(b.visual.nodeId)) -
          Number(shown.has(a.visual.nodeId)) ||
        b.facing - a.facing,
    );
    const placed: { x: number; y: number; width: number }[] = [];
    for (const candidate of candidates) {
      const blocked =
        !candidate.isCourse &&
        (candidate.facing < 0.12 ||
          placed.some(
            (other) =>
              Math.abs(other.x - candidate.x) <
                (other.width + candidate.width) / 2 + 8 &&
              Math.abs(other.y - candidate.y) < 22,
          ));
      if (blocked) {
        shown.delete(candidate.visual.nodeId);
        candidate.visual.setLabelFacing(0, true);
        continue;
      }
      placed.push(candidate);
      shown.add(candidate.visual.nodeId);
      candidate.visual.setLabelFacing(
        candidate.isCourse ? 1 : candidate.facing,
      );
    }
  }, [canvasSize, graphData.nodes, graphReady, layoutMode]);
  const labelUpdate = useRef(handleRenderFrame);
  labelUpdate.current = handleRenderFrame;
  /** 标签需要重算的标记；由常驻的 rAF 泵消费，镜头每次变动都能在同一帧跟上。 */
  const labelDirty = useRef(true);
  const requestLabelUpdate = useCallback(() => {
    labelDirty.current = true;
  }, []);
  useEffect(() => {
    if (!graphReady || layoutMode !== "SPHERE" || !motionVisible) return;
    let frame = 0;
    const pump = () => {
      frame = window.requestAnimationFrame(pump);
      // 相机与机构是逐帧变的，标签也必须逐帧投影，否则文字会滞后于节点形成抖动。
      if (!labelDirty.current) return;
      labelDirty.current = false;
      labelUpdate.current();
    };
    frame = window.requestAnimationFrame(pump);
    return () => window.cancelAnimationFrame(frame);
  }, [graphReady, layoutMode, motionVisible]);
  /** 打断正在进行的镜头动画，避免用户手势与按钮动画同时改写相机。 */
  const stopZoom = useCallback(() => {
    if (cameraTween.current) window.cancelAnimationFrame(cameraTween.current);
    cameraTween.current = 0;
  }, []);
  /**
   * 把相机搬到指定位置与观察点。
   * 距离与方向分开插值：方向走球面插值，镜头不会穿过球体，也不会在途中突然转身。
   */
  const animateCamera = useCallback(
    (position: THREE.Vector3, target: THREE.Vector3, duration: number) => {
      const fg = fgRef.current;
      if (!fg) return;
      const controls = fg.controls() as TrackballControls;
      const camera = fg.camera();
      stopZoom();
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const total = reduced ? 0 : duration;
      const place = (toPosition: THREE.Vector3, toTarget: THREE.Vector3) => {
        controls.target.copy(toTarget);
        camera.position.copy(toPosition);
        controls.update();
        fg.refresh();
      };
      if (total <= 0) {
        place(position, target);
        requestLabelUpdate();
        return;
      }
      const fromTarget = controls.target.clone();
      const fromOffset = camera.position.clone().sub(fromTarget);
      const toOffset = position.clone().sub(target);
      const fromRadius = Math.max(1e-3, fromOffset.length());
      const toRadius = Math.max(1e-3, toOffset.length());
      const fromDirection = fromOffset.normalize();
      const toDirection = toOffset.normalize();
      // 从当前朝向转到目标朝向：用四元数插值，方向变化再大也是最短路径。
      const turn = new THREE.Quaternion().setFromUnitVectors(
        fromDirection,
        toDirection,
      );
      const turned = new THREE.Quaternion();
      const identity = new THREE.Quaternion();
      const stepDirection = new THREE.Vector3();
      const stepTarget = new THREE.Vector3();
      const stepPosition = new THREE.Vector3();
      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / total);
        // 先慢—中段快—再慢：曲柄匀速带动剪叉时，视觉上的伸缩就是这个节奏。
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        turned.copy(turn).slerp(identity, 1 - eased);
        stepDirection.copy(fromDirection).applyQuaternion(turned);
        stepTarget.lerpVectors(fromTarget, target, eased);
        stepPosition
          .copy(stepTarget)
          .addScaledVector(
            stepDirection,
            fromRadius + (toRadius - fromRadius) * eased,
          );
        place(stepPosition, stepTarget);
        if (t < 1) cameraTween.current = window.requestAnimationFrame(step);
        else {
          cameraTween.current = 0;
          requestLabelUpdate();
        }
      };
      cameraTween.current = window.requestAnimationFrame(step);
    },
    [requestLabelUpdate, stopZoom],
  );
  useEffect(() => {
    const fg = fgRef.current;
    if (!graphReady || !fg || layoutMode !== "SPHERE") return;
    const controls = fg.controls() as TrackballControls;
    const handler = () => requestLabelUpdate();
    // 首屏相机取景与节点对象创建顺序不固定，先标记一次，由泵负责消费。
    requestLabelUpdate();
    controls.addEventListener("change", handler);
    return () => controls.removeEventListener("change", handler);
  }, [graphReady, layoutMode, requestLabelUpdate]);
  useEffect(() => {
    // 切回二维章节总览时恢复全部标签，避免沿用球面的朝向透明度。
    if (layoutMode !== "CHAPTER") return;
    for (const node of graphData.nodes)
      nodeVisuals.current.get(node)?.setLabelFacing(1);
  }, [graphData.nodes, layoutMode]);

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
    // 浅色底不需要自发光撑亮度：主光给高光，冷色补光与紫色轮廓光拉开球体层次。
    const key = new THREE.DirectionalLight("#ffffff", 1.9);
    key.position.set(-600, 800, 1200);
    const fill = new THREE.DirectionalLight("#cfe3f7", 0.55);
    fill.position.set(700, -200, -800);
    const rim = new THREE.DirectionalLight("#e0e7ff", 0.5);
    rim.position.set(200, 500, -700);
    fg.lights([new THREE.AmbientLight("#ffffff", 1.05), key, fill, rim]);
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
      stopZoom();
      setManualExpansion(
        wheelExpansion(currentExpansion.current, event.deltaY),
      );
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [layoutMode, setManualExpansion, stopZoom]);
  useEffect(() => {
    const fg = fgRef.current;
    if (!graphReady || !fg || layoutMode !== "SPHERE") return;
    // 球心一团冷光，给收缩态一个视觉核心，也避免中心显得空。
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return;
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, "rgba(125,211,252,0.55)");
    gradient.addColorStop(0.3, "rgba(56,189,248,0.24)");
    gradient.addColorStop(1, "rgba(14,165,233,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      // 叠加混合在浅色底上会被冲成白色，改用普通混合保留淡蓝光晕。
      opacity: 0.3,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(60);
    fg.scene().add(sprite);
    courseGlow.current = sprite;
    return () => {
      fg.scene().remove(sprite);
      courseGlow.current = null;
      material.dispose();
      texture.dispose();
    };
  }, [graphReady, layoutMode]);
  useEffect(() => {
    const fg = fgRef.current;
    if (
      !graphReady ||
      !fg ||
      layoutMode !== "SPHERE" ||
      !motionVisible ||
      !graphData.nodes.length
    )
      return;
    const automatic = !reduceMotion && !selectedKey;
    let frame = 0;
    let previousTime = 0;
    let lastDisplay = 0;
    if (automatic && breathing)
      breathPhase.current = breathingPhaseAt(currentExpansion.current);
    const apply = (progress: number) => {
      const motion = hobermanMotion(progress);
      for (const node of graphData.nodes) {
        const start = sphere.collapsed.get(node.id);
        const end = sphere.expanded.get(node.id);
        if (!start || !end) continue;
        const position = spherePosition(
          start,
          end,
          progress,
          rotationAngle.current,
        );
        node.x = node.fx = position.x;
        node.y = node.fy = position.y;
        node.z = node.fz = position.z;
        const visual = nodeVisuals.current.get(node);
        if (visual && node.type === "KNOWLEDGE_POINT")
          visual.scale.setScalar(
            Math.max(0.001, Math.min(1, (progress - 0.05) / 0.4)),
          );
      }
      if (courseGlow.current) {
        courseGlow.current.visible = sphereNodeVisible("COURSE", progress);
        courseGlow.current.scale.setScalar(motion.radius * 0.5);
        (courseGlow.current.material as THREE.SpriteMaterial).opacity =
          0.12 + 0.2 * progress;
      }
      fg.refresh();
      requestLabelUpdate();
    };
    const step = (now: number) => {
      const elapsed = previousTime ? Math.min(50, now - previousTime) : 0;
      previousTime = now;
      const modes = sphereMotionModes({
        visible: motionVisible,
        reducedMotion: reduceMotion,
        selected: Boolean(selectedKey),
        dragging: dragging.current,
        breathing,
        autoRotate,
      });
      // 拖拽时冻结机构推进：每帧写回的固定坐标会把手指或鼠标的位移顶回去，
      // 松手后再从当前展开度继续呼吸，不会突然弹回。
      if (dragging.current) {
        frame = window.requestAnimationFrame(step);
        return;
      }
      if (modes.breathe) {
        breathPhase.current += (elapsed / 6000) * Math.PI * 2;
        currentExpansion.current = breathingExpansion(breathPhase.current);
      } else {
        const target = expansionRef.current;
        const difference = target - currentExpansion.current;
        currentExpansion.current =
          reduceMotion || Math.abs(difference) < 0.001
            ? target
            : currentExpansion.current +
              difference * (1 - Math.exp(-elapsed / 190));
      }
      if (modes.rotate)
        rotationAngle.current =
          (rotationAngle.current + (elapsed / 24000) * Math.PI * 2) %
          (Math.PI * 2);
      apply(currentExpansion.current);
      if (automatic && breathing && now - lastDisplay > 100) {
        lastDisplay = now;
        setDisplayExpansion(currentExpansion.current);
      }
      if (
        (automatic && (breathing || autoRotate)) ||
        Math.abs(currentExpansion.current - expansionRef.current) >= 0.001
      )
        frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [
    autoRotate,
    breathing,
    expansion,
    graphData.nodes,
    graphReady,
    layoutMode,
    motionVisible,
    reduceMotion,
    requestLabelUpdate,
    selectedKey,
    sphere,
  ]);
  useEffect(() => {
    if (layoutMode !== "SPHERE" || !graphReady) return;
    const selected = graphData.nodes.find((node) => node.id === selectedKey);
    if (
      (selected && selected.type !== "CHAPTER") ||
      (graphData.nodes.some((node) => node.type !== "CHAPTER") &&
        !graphData.nodes.some((node) => node.type === "CHAPTER"))
    ) {
      setExpansion(1);
      setDisplayExpansion(1);
    }
  }, [graphReady, graphData.nodes, layoutMode, selectedKey]);
  useEffect(() => {
    if (!selectedKey || !breathing || layoutMode !== "SPHERE") return;
    const selected = graphData.nodes.find((node) => node.id === selectedKey);
    if (selected?.type !== "CHAPTER") return;
    setExpansion(currentExpansion.current);
    setDisplayExpansion(currentExpansion.current);
  }, [breathing, graphData.nodes, layoutMode, selectedKey]);
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
      setMotionVisible(inViewport && !document.hidden);
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
    (
      visibleNodes: ForceNode[],
      duration = 500,
      preserveAngle = false,
      atMaxExpansion = false,
    ) => {
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
      // 取景按最大展开半径计算：镜头固定后，收缩—展开才有真实的远近变化。
      const offset = atMaxExpansion
        ? 1
        : hobermanMotion(expansionRef.current).radialFraction;
      const frame = frameGraphNodes(
        layoutMode === "SPHERE"
          ? visibleNodes.map((node) => {
              const start = sphere.collapsed.get(node.id);
              const end = sphere.expanded.get(node.id);
              if (!start || !end) return node;
              return {
                ...node,
                ...spherePosition(start, end, offset, rotationAngle.current),
              };
            })
          : visibleNodes,
        canvasSize.width / canvasSize.height,
        fov,
        direction,
      );
      if (frame) {
        // 保留少量边距，让展开后的章节与知识点名称不贴住画布边缘。
        const position =
          layoutMode === "SPHERE"
            ? frame.position
                .clone()
                .sub(frame.target)
                .multiplyScalar(1.06)
                .add(frame.target)
            : frame.position;
        animateCamera(position, frame.target, duration);
      }
    },
    [animateCamera, canvasSize, layoutMode, sphere],
  );
  const fitView = useCallback(
    (duration = 500) =>
      fitNodes(
        layoutMode === "SPHERE"
          ? graphData.nodes
          : graphData.nodes.filter(nodeVisible),
        duration,
        false,
        layoutMode === "SPHERE",
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
    stopZoom();
    if (layoutMode === "SPHERE") {
      currentExpansion.current = 0;
      rotationAngle.current = 0;
      setBreathing(false);
      setExpansion(0);
      setDisplayExpansion(0);
      setOnlyRelated(false);
      onClearSelection?.();
    }
    fitView();
  }, [
    graphData.nodes,
    layout,
    fitView,
    layoutMode,
    sphere,
    onClearSelection,
    stopZoom,
  ]);
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
      node.type === "COURSE" ? 16 : node.type === "CHAPTER" ? 9.2 : 4;
    const distance = Math.max(
      node.type === "KNOWLEDGE_POINT" ? 300 : 320,
      radius * 12,
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
              ? {
                  ...node,
                  ...spherePosition(
                    sphere.collapsed.get(node.id) ?? node,
                    sphere.expanded.get(node.id) ?? node,
                    1,
                    rotationAngle.current,
                  ),
                }
              : node,
            distance,
            direction,
          );
    animateCamera(position, target, 3000);
  }, [
    animateCamera,
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
    const controls = fg.controls() as TrackballControls;
    const target = controls.target.clone();
    const offset = fg.camera().position.clone().sub(target);
    const from = offset.length();
    if (from < 1e-3) offset.set(0, 0, 1);
    // 远近推到 140~4200：留出贴近单个知识点和退到整球全景的余量。
    const distance = Math.max(140, Math.min(4200, (from || 1) * factor));
    animateCamera(
      target.clone().addScaledVector(offset.normalize(), distance),
      target,
      280,
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
  /**
   * 呼吸开启时球体持续张合，逐帧统计可读节点会让数字不断跳动；
   * 此时改为汇报当前筛选下的全图规模，静态查看时仍显示真实可见数量。
   */
  const autoMotion =
    layoutMode === "SPHERE" && breathing && !reduceMotion && !selectedKey;
  const visibleNodeCount = graphData.nodes.filter((node) =>
    layoutMode === "SPHERE"
      ? sphereNodeVisible(node.type, displayExpansion) &&
        (node.type === "COURSE" ||
          !onlyRelated ||
          !selectedNeighbors ||
          selectedNeighbors.has(node.id))
      : nodeVisible(node),
  ).length;
  const visibleLinkCount =
    layoutMode === "SPHERE" && displayExpansion <= 0.45
      ? 0
      : graphData.links.filter((link) =>
          layoutMode === "SPHERE"
            ? !onlyRelated ||
              !selectedNeighbors ||
              (selectedNeighbors.has(linkEndpoint(link.source)) &&
                selectedNeighbors.has(linkEndpoint(link.target)))
            : linkVisible(link),
        ).length;
  const nodeCount = autoMotion ? graphData.nodes.length : visibleNodeCount;
  const linkCount = autoMotion ? graphData.links.length : visibleLinkCount;
  function clearSelection() {
    setOnlyRelated(false);
    setHoverKey(null);
    onClearSelection?.();
    fitView();
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
      className="min-w-0 overflow-hidden rounded-2xl border border-sky-100 bg-white text-slate-700 shadow-sm [&:fullscreen]:flex [&:fullscreen]:flex-col [&:fullscreen]:rounded-none"
      role="figure"
      aria-label="课程知识图谱，可拖动节点、平移并使用按钮缩放"
      onPointerDownCapture={() => {
        needsFit.current = false;
        stopZoom();
        dragging.current = true;
      }}
      onWheelCapture={() => {
        needsFit.current = false;
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3">
        <div
          className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1"
          role="group"
          aria-label="图谱显示模式"
        >
          {(
            [
              ["SPHERE", "3D 图谱"],
              ["CHAPTER", "章节总览"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={layoutMode === mode}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${layoutMode === mode ? "bg-white text-sky-800 shadow-sm ring-1 ring-sky-100" : "text-slate-500 hover:text-sky-800"}`}
              onClick={() => changeLayout(mode)}
            >
              {mode === "SPHERE" ? (
                <SphereGraphIcon className="size-3.5" />
              ) : (
                <Layers3 className="size-3.5" aria-hidden="true" />
              )}
              {label}
            </button>
          ))}
        </div>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="图谱视野控制"
        >
          {layoutMode === "SPHERE" ? (
            <div
              className="mr-2 flex flex-wrap items-center gap-2"
              role="group"
              aria-label="三维图谱伸缩控制"
            >
              <button
                type="button"
                className={toolbarButton}
                aria-label="收起图谱"
                onClick={() => setManualExpansion(0)}
              >
                收起
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(displayExpansion * 100)}
                aria-label="图谱展开程度"
                className="w-20 accent-sky-600 sm:w-28"
                onChange={(event) =>
                  setManualExpansion(Number(event.target.value) / 100)
                }
              />
              <button
                type="button"
                className={toolbarButton}
                aria-label="展开图谱"
                onClick={() => setManualExpansion(1)}
              >
                展开
              </button>
              <button
                type="button"
                className={`${motionToggleButton} ${breathing ? motionToggleOn : motionToggleOff}`}
                aria-pressed={breathing}
                disabled={reduceMotion}
                title={reduceMotion ? "系统已启用减少动效" : undefined}
                onClick={() => {
                  if (breathing) {
                    setExpansion(currentExpansion.current);
                    setDisplayExpansion(currentExpansion.current);
                  }
                  setBreathing((value) => !value);
                }}
              >
                <Waves className="size-4" aria-hidden="true" />
                呼吸
              </button>
              <button
                type="button"
                className={`${motionToggleButton} ${autoRotate ? motionToggleOn : motionToggleOff}`}
                aria-pressed={autoRotate}
                disabled={reduceMotion}
                title={reduceMotion ? "系统已启用减少动效" : undefined}
                onClick={() => setAutoRotate((value) => !value)}
              >
                <Orbit className="size-4" aria-hidden="true" />
                自动旋转
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
          // 浅色渲染色：中心近白、四周落回页面同族浅蓝，球体才有悬浮的纵深。
          // 点阵网格只做空间提示，对比度压低到不抢节点。
          backgroundImage:
            "radial-gradient(#dceaf6 1px, transparent 1px), radial-gradient(120% 95% at 50% 40%, #ffffff 0%, #f5fafe 46%, #e6f1fa 100%)",
          backgroundSize: "26px 26px, auto",
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
            <div className="max-w-[75%] rounded-xl border border-sky-100 bg-white/92 px-3.5 py-3 shadow-sm backdrop-blur-sm">
              {selectedNode ? (
                <>
                  <div className="flex items-center gap-2 text-[10px] tracking-widest text-sky-700">
                    <Focus className="size-3" aria-hidden="true" />
                    当前聚焦
                  </div>
                  <p
                    className="mt-1.5 truncate text-sm font-medium text-slate-900"
                    title={selectedNode.name}
                  >
                    {selectedNode.name}
                  </p>
                  <button
                    type="button"
                    className="pointer-events-auto mt-2 inline-flex items-center gap-1 text-xs text-sky-700 hover:text-sky-900 focus-visible:outline-2 focus-visible:outline-sky-600"
                    onClick={clearSelection}
                  >
                    <X className="size-3" aria-hidden="true" />
                    返回全图
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-slate-700">
                    {layoutMode === "SPHERE"
                      ? "滚轮向上展开图谱，查看内部知识点"
                      : "从课程核心探索章节网络"}
                  </p>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    悬停查看关联 · 点击节点聚焦
                  </p>
                </>
              )}
            </div>
            <span
              className="shrink-0 rounded-full border border-slate-200 bg-white/92 px-3 py-1.5 text-[11px] text-slate-500 shadow-sm backdrop-blur-sm"
              role="status"
            >
              {autoMotion ? "共 " : ""}
              {nodeCount} 节点 / {linkCount} 关系
            </span>
          </div>
        ) : null}
        {!nodes.length ? (
          <p
            role="status"
            className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-500"
          >
            没有匹配节点，请调整章节、类型或搜索条件。
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-slate-100 bg-white px-4 py-3 text-xs">
        <div
          className="flex flex-wrap items-center gap-4 text-slate-500"
          aria-label="关系图例"
        >
          <span className="flex items-center gap-1.5">
            <span className="h-px w-4 bg-slate-300" />
            包含
          </span>
          <span className="text-amber-700">→ 先修</span>
          <span className="flex items-center gap-1.5 text-violet-700">
            <span className="h-px w-4 bg-violet-400" />
            相关
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-slate-300">
            <input
              className="accent-sky-600"
              type="checkbox"
              checked={showPointNames}
              onChange={(event) => setShowPointNames(event.target.checked)}
            />
            显示全部知识点名称
          </label>
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-40 ${onlyRelated && selectedNode ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            disabled={!selectedNode}
            aria-pressed={onlyRelated && Boolean(selectedNode)}
            onClick={() => setOnlyRelated((value) => !value)}
          >
            <Focus className="size-3.5" aria-hidden="true" />
            只看直接关联
          </button>
        </div>
        <p className="w-full text-[11px] leading-5 text-slate-500">
          {nodeColorHelp ?? "同章节点同色，点击节点平滑飞入查看。"}
          <span className="mx-2 text-slate-300">|</span>
          {layoutMode === "SPHERE"
            ? "左键旋转 · 右键平移 · 滚轮向上展开、向下收起 · 呼吸与自动旋转可独立开启"
            : "拖动节点移动 · 拖动画布平移 · 滚轮缩放 · 正面视角已锁定"}
        </p>
        {fullscreenError ? (
          <p role="status" className="text-xs text-amber-700">
            {fullscreenError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
export const KnowledgeGraphCanvas = memo(KnowledgeGraphCanvas3D);
