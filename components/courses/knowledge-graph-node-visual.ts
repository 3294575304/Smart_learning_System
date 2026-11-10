import * as THREE from "three";
import SpriteText from "three-spritetext";
import { chineseGraphLabel } from "@/components/courses/knowledge-graph-presentation";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

interface VisualNode {
  id: string;
  name: string;
  type: KnowledgeGraphStructure["nodes"][number]["type"];
  color: string;
}

export interface GraphNodeAppearance {
  selected: boolean;
  emphasized: boolean;
  showLabel: boolean;
  questionCount?: number;
}

type GraphLabel = THREE.Sprite & { text: string };

function createLabel(node: VisualNode): GraphLabel {
  const isPoint = node.type === "KNOWLEDGE_POINT";
  const isChapter = node.type === "CHAPTER";
  const textHeight = isPoint ? 0.013 : isChapter ? 0.015 : 0.018;
  // 先配置空标签，最后写入正文，避免反复绘制高分辨率长文本。
  const label = new SpriteText("", textHeight, "#e2e8f0");
  label.fontSize = 52;
  label.fontFace =
    '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
  label.fontWeight = "normal";
  label.backgroundColor = false;
  // SpriteText 的边距、圆角、边框与 textHeight 使用相同的场景单位。
  // 必须随字号缩放，否则 0.1 的边距就会比 0.016 的文字大数倍。
  label.padding = [
    textHeight * (isChapter ? 0.24 : 0.16),
    textHeight * (isChapter ? 0.12 : 0.08),
  ];
  label.borderRadius = textHeight * (isChapter ? 0.42 : 0.15);
  label.borderWidth = 0;
  label.borderColor = "#334155";
  label.material.sizeAttenuation = false;
  label.material.depthWrite = false;
  label.center.set(0.5, -0.15);
  return label;
}

/** 交互只更新材质与可见性；几何体和文字纹理在节点存续期间复用。 */
export class KnowledgeGraphNodeVisual extends THREE.Group {
  readonly sphere: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhongMaterial>;
  private readonly baseColor: THREE.Color;
  private label?: GraphLabel;

  constructor(
    private readonly node: VisualNode,
    private readonly labelFactory: (
      node: VisualNode,
    ) => GraphLabel = createLabel,
  ) {
    super();
    const radius =
      node.type === "COURSE" ? 20 : node.type === "CHAPTER" ? 13 : 7;
    this.baseColor = new THREE.Color(
      node.type === "COURSE" ? "#38bdf8" : node.color,
    ).lerp(new THREE.Color("#ffffff"), 0.14);
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 20, 14),
      new THREE.MeshPhongMaterial({
        color: this.baseColor,
        transparent: true,
        shininess: 24,
        specular: "#475569",
        emissive: "#000000",
      }),
    );
    this.add(this.sphere);
  }

  updateAppearance({ showLabel, questionCount }: GraphNodeAppearance) {
    this.sphere.material.color.copy(this.baseColor);
    this.sphere.material.opacity = 1;
    this.sphere.scale.setScalar(1);
    if (showLabel && !this.label) {
      this.label = this.labelFactory(this.node);
      this.label.position.set(0, this.sphere.geometry.parameters.radius + 3, 0);
      this.add(this.label);
    }
    if (!this.label) return;
    this.label.visible = showLabel;
    this.label.material.opacity = 1;
    if (!showLabel) return;
    const countText =
      this.node.type === "KNOWLEDGE_POINT" &&
      questionCount !== undefined &&
      questionCount > 0
        ? ` · ${questionCount}题`
        : "";
    const text = `${chineseGraphLabel(this.node.name, this.node.type === "COURSE" ? 16 : 12)}${countText}`;
    // SpriteText 的 setter 每次都会重画 canvas，只在内容变化时更新。
    if (this.label.text !== text) this.label.text = text;
  }
}
