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
  const textHeight = isPoint ? 0.012 : 0.016;
  // 先配置空标签，最后写入正文，避免反复绘制高分辨率长文本。
  const label = new SpriteText("", textHeight, node.color);
  label.fontSize = 40;
  label.fontFace =
    '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
  label.fontWeight = isPoint ? "normal" : "bold";
  label.backgroundColor = isPoint
    ? false
    : new THREE.Color(node.color)
        .lerp(new THREE.Color("#ffffff"), 0.85)
        .getStyle();
  // SpriteText 的边距、圆角、边框与 textHeight 使用相同的场景单位。
  // 必须随字号缩放，否则 0.1 的边距就会比 0.016 的文字大数倍。
  label.padding = [
    textHeight * (isChapter ? 0.24 : 0.16),
    textHeight * (isChapter ? 0.12 : 0.08),
  ];
  label.borderRadius = textHeight * (isChapter ? 0.42 : 0.15);
  label.borderWidth = isPoint ? 0 : textHeight * (isChapter ? 0.025 : 0.015);
  label.borderColor = new THREE.Color(node.color)
    .lerp(new THREE.Color("#ffffff"), isChapter ? 0.45 : 0.55)
    .getStyle();
  label.material.sizeAttenuation = false;
  label.material.depthWrite = false;
  label.center.set(0.5, -0.15);
  return label;
}

/** 交互只更新材质与可见性；几何体和文字纹理在节点存续期间复用。 */
export class KnowledgeGraphNodeVisual extends THREE.Group {
  readonly sphere: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
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
      node.type === "COURSE" ? 11 : node.type === "CHAPTER" ? 8 : 4.5;
    this.baseColor = new THREE.Color(node.color).lerp(
      new THREE.Color("#ffffff"),
      0.65,
    );
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 8),
      new THREE.MeshBasicMaterial({ color: this.baseColor, transparent: true }),
    );
    this.add(this.sphere);
  }

  updateAppearance({
    selected,
    emphasized,
    showLabel,
    questionCount,
  }: GraphNodeAppearance) {
    if (selected) this.sphere.material.color.set("#fed7aa");
    else this.sphere.material.color.copy(this.baseColor);
    this.sphere.material.opacity = emphasized ? 1 : 0.25;
    this.sphere.scale.setScalar(selected ? 1.15 : 1);
    if (showLabel && !this.label) {
      this.label = this.labelFactory(this.node);
      this.label.position.set(0, this.sphere.geometry.parameters.radius + 3, 0);
      this.add(this.label);
    }
    if (!this.label) return;
    this.label.visible = showLabel;
    this.label.material.opacity = emphasized ? 1 : 0.4;
    if (!showLabel) return;
    const countText =
      this.node.type === "KNOWLEDGE_POINT" &&
      questionCount !== undefined &&
      questionCount > 0
        ? ` · ${questionCount}题`
        : "";
    const text = `${chineseGraphLabel(this.node.name)}${countText}`;
    // SpriteText 的 setter 每次都会重画 canvas，只在内容变化时更新。
    if (this.label.text !== text) this.label.text = text;
  }
}
