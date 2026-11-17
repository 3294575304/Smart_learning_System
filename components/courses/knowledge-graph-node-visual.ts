import * as THREE from "three";
import SpriteText from "three-spritetext";
import { chineseGraphLabel } from "@/components/courses/knowledge-graph-presentation";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

interface VisualNode {
  id: string;
  name: string;
  type: KnowledgeGraphStructure["nodes"][number]["type"];
  color: string;
  isKeyTopic?: boolean;
  isDifficultTopic?: boolean;
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
  const textHeight = isPoint ? 0.012 : isChapter ? 0.014 : 0.016;
  // 先配置空标签，最后写入正文，避免反复绘制高分辨率长文本。
  const label = new SpriteText("", textHeight, "#e8eef7");
  label.fontSize = 52;
  label.fontFace =
    '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
  label.fontWeight = "normal";
  // 深色底片让标签压在星云与连杆上仍然可读。
  label.backgroundColor = "rgba(8, 15, 30, 0.72)";
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
  // 不开启透明时 opacity 完全不生效，避让与淡化都会失效，标签会一直叠在一起。
  label.material.transparent = true;
  label.material.depthWrite = false;
  // 标签作为前景叠在节点上方，避免被连杆或相邻节点遮挡。
  label.material.depthTest = false;
  label.renderOrder = 10;
  label.center.set(0.5, 0.5);
  return label;
}

/** 知识点主球半径：类型决定基准，重点/难点与题库覆盖继续分级。 */
export function knowledgeNodeRadius(
  type: VisualNode["type"],
  {
    isKeyTopic,
    isDifficultTopic,
    questionCount,
  }: {
    isKeyTopic?: boolean;
    isDifficultTopic?: boolean;
    questionCount?: number;
  } = {},
) {
  if (type === "COURSE") return 16;
  if (type === "CHAPTER") return 9.2;
  let radius = 4.3;
  if (isKeyTopic) radius += 0.85;
  if (isDifficultTopic) radius += 0.55;
  if (questionCount && questionCount > 0)
    radius += Math.min(2.2, 0.13 * questionCount);
  return radius;
}

/** 交互只更新材质与可见性；几何体和文字纹理在节点存续期间复用。 */
export class KnowledgeGraphNodeVisual extends THREE.Group {
  readonly sphere: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly aura: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly baseColor: THREE.Color;
  private readonly baseRadius: number;
  private label?: GraphLabel;
  private labelOpacity = 1;
  private labelFacing = 1;

  constructor(
    private readonly node: VisualNode,
    private readonly labelFactory: (
      node: VisualNode,
    ) => GraphLabel = createLabel,
  ) {
    super();
    this.baseRadius = knowledgeNodeRadius(node.type, {
      isKeyTopic: node.isKeyTopic,
      isDifficultTopic: node.isDifficultTopic,
    });
    this.baseColor = new THREE.Color(
      node.type === "COURSE" ? "#22d3ee" : node.color,
    ).offsetHSL(0, 0.06, 0.06);
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 24),
      new THREE.MeshStandardMaterial({
        color: this.baseColor,
        roughness: node.type === "CHAPTER" ? 0.32 : 0.42,
        metalness: 0.12,
        emissive: this.baseColor,
        emissiveIntensity: node.type === "KNOWLEDGE_POINT" ? 0.16 : 0.1,
      }),
    );
    this.sphere.scale.setScalar(this.baseRadius);
    this.aura = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 18),
      new THREE.MeshBasicMaterial({
        color: this.baseColor,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    );
    this.aura.scale.setScalar(this.baseRadius * 1.9);
    this.aura.visible = false;
    this.add(this.sphere, this.aura);
  }

  updateAppearance({
    selected,
    emphasized,
    showLabel,
    questionCount,
  }: GraphNodeAppearance) {
    const radius = knowledgeNodeRadius(this.node.type, {
      isKeyTopic: this.node.isKeyTopic,
      isDifficultTopic: this.node.isDifficultTopic,
      questionCount,
    });
    this.sphere.scale.setScalar(radius);
    this.aura.scale.setScalar(radius * 1.9);
    // 有题库支撑的知识点带一圈微光，覆盖缺口不必点开就能看出来。
    this.aura.visible = !selected && (questionCount ?? 0) > 0;

    const dimmed = !emphasized && !selected;
    this.sphere.material.color.copy(this.baseColor);
    this.sphere.material.emissive.copy(this.baseColor);
    this.sphere.material.emissiveIntensity = selected
      ? 0.5
      : dimmed
        ? 0.04
        : 0.16;
    this.sphere.material.opacity = dimmed ? 0.28 : 1;
    this.sphere.material.transparent = dimmed;
    this.sphere.material.depthWrite = !dimmed;
    this.aura.material.opacity = dimmed ? 0.05 : 0.16;
    this.sphere.scale.setScalar(radius * (selected ? 1.18 : 1));

    this.labelOpacity = dimmed ? 0.12 : 1;
    if (showLabel && !this.label) {
      this.label = this.labelFactory(this.node);
      this.label.position.set(0, radius + 9, 0);
      this.add(this.label);
    }
    if (!this.label) return;
    this.label.visible = showLabel;
    this.applyLabelOpacity();
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

  /** 屏幕避让需要按节点记忆上一帧是否可见，用来给已显示的标签保留优先权。 */
  get nodeId() {
    return this.node.id;
  }

  /** 标签相对节点的世界高度：屏幕避让要用标签真实位置，而不是节点中心。 */
  get labelAnchorY() {
    return this.label ? this.label.position.y : 0;
  }

  /** 按节点朝向淡化背面标签，避免球体前后两层文字叠在一起。 */
  setLabelFacing(facing: number, hidden = false) {
    // 背向镜头的章节标签完全隐藏，正面的按朝向 60%→100% 渐显。
    this.labelFacing =
      hidden || facing < 0 ? 0 : Math.min(1, 0.6 + facing * 0.4);
    this.applyLabelOpacity();
  }

  private applyLabelOpacity() {
    if (!this.label) return;
    this.label.material.opacity = this.labelOpacity * this.labelFacing;
  }
}
