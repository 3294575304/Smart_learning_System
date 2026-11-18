import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import {
  KnowledgeGraphNodeVisual,
  knowledgeNodeRadius,
} from "@/components/courses/knowledge-graph-node-visual";
import {
  chapterGraphLayout,
  graphChapterColors,
} from "@/components/courses/knowledge-graph-presentation";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

class TestLabel extends THREE.Sprite {
  private value = "";
  redraws = 0;
  get text() {
    return this.value;
  }
  set text(value: string) {
    this.value = value;
    this.redraws++;
  }
}

test("反复选择、悬停和切换名称复用节点与文字纹理，只有正文变化才重绘", () => {
  const label = new TestLabel();
  let createdLabels = 0;
  const visual = new KnowledgeGraphNodeVisual(
    {
      id: "point",
      name: "循环结构",
      type: "KNOWLEDGE_POINT",
      color: "#047857",
    },
    () => {
      createdLabels++;
      return label;
    },
  );
  const geometry = visual.sphere.geometry;
  const material = visual.sphere.material;
  const initialColor = material.color.getHexString();
  assert.ok(
    material.emissiveIntensity <= 0.1,
    "浅色画布上自发光只作微弱补光，亮度交给灯光",
  );
  const appearance = {
    selected: false,
    emphasized: true,
    showLabel: false,
    questionCount: 3,
  };
  visual.updateAppearance(appearance);
  assert.equal(createdLabels, 0, "隐藏名称不预先分配文字纹理");
  for (let index = 0; index < 100; index++) {
    visual.updateAppearance({
      ...appearance,
      selected: index % 2 === 0,
      showLabel: index % 4 === 0,
    });
    assert.equal(material.opacity, 1, "悬停与选择不压暗其他节点");
  }
  assert.equal(createdLabels, 1);
  assert.equal(label.redraws, 1);
  assert.equal(label.text, "循环结构 · 3题");
  assert.equal(visual.sphere.geometry, geometry);
  assert.equal(visual.sphere.material, material);
  assert.equal(
    visual.children.length,
    3,
    "只由球体、光晕与名称精灵组成，题量并入名称不再拆分",
  );

  visual.updateAppearance({ ...appearance, showLabel: true, questionCount: 5 });
  visual.updateAppearance({ ...appearance, showLabel: true, questionCount: 5 });
  assert.equal(label.redraws, 2);
  assert.equal(label.text, "循环结构 · 5题");
  visual.updateAppearance({
    ...appearance,
    showLabel: true,
    questionCount: undefined,
  });
  assert.equal(label.text, "循环结构");
  assert.equal(visual.sphere.material.opacity, 1);
  assert.equal(visual.sphere.material.color.getHexString(), initialColor);
  assert.equal(
    visual.sphere.scale.x,
    knowledgeNodeRadius("KNOWLEDGE_POINT"),
    "取消选中后回到知识点基准半径",
  );
  // 淡化只由“取消强调”触发；选中态本身不影响其他节点的透明度。
  visual.updateAppearance({ ...appearance, emphasized: false });
  assert.ok(material.opacity < 1, "取消强调的节点淡出但仍保留轮廓");
  geometry.dispose();
  material.dispose();
  label.material.dispose();
});

test("真实 SpriteText 的背景边距随字号缩放，浅色画布上的长标题清晰且紧凑", () => {
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  // 仅替代 canvas 绘图 API，保留 SpriteText 真实的纹理尺寸与精灵缩放计算。
  const context = {
    measureText: (text: string) => ({ width: Array.from(text).length * 40 }),
    translate() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    quadraticCurveTo() {},
    closePath() {},
    fill() {},
    fillRect() {},
    fillText() {},
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => ({ width: 0, height: 0, getContext: () => context }),
    },
  });
  try {
    for (const type of ["COURSE", "CHAPTER", "KNOWLEDGE_POINT"] as const) {
      const visual = new KnowledgeGraphNodeVisual({
        id: type,
        name: "第一章 Python 程序设计基础与实践应用",
        type,
        color: "#0369a1",
      });
      visual.updateAppearance({
        selected: false,
        emphasized: true,
        showLabel: true,
      });
      const label = visual.children.find(
        (child) => child instanceof SpriteText,
      );
      assert.ok(label instanceof SpriteText);
      assert.ok(label.scale.y < 0.065, "两行标签不应膨胀为遮挡图谱的大块背景");
      assert.ok(label.scale.x < 0.3, "标题宽度保持紧凑");
      assert.equal(label.color, "#12324d", "浅色画布使用深色文字");
      assert.equal(
        label.backgroundColor,
        "rgba(255, 255, 255, 0.94)",
        "名称使用浅色底片压住网格与连杆",
      );
      assert.ok(label.borderWidth > 0, "底片保留细描边以区分画布底色");
      assert.equal(label.fontWeight, "normal");
      assert.equal(
        label.material.depthTest,
        false,
        "球面标签始终绘制在实体球前方",
      );
      assert.equal(label.material.depthWrite, false);
      assert.equal(label.renderOrder, 10);
      assert.deepEqual(label.center.toArray(), [0.5, 0.5]);
      assert.ok(label.position.y > 0, "标签浮在节点上方，不压住球体");
      assert.ok(visual.sphere.geometry.parameters.radius <= 20);
      visual.sphere.geometry.dispose();
      visual.sphere.material.dispose();
      label.material.map?.dispose();
      label.material.dispose();
    }
  } finally {
    if (previousDocument)
      Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("章节颜色与子知识点一致，重新排列输入或编辑名称不会改变配色与位置", () => {
  type GraphNode = KnowledgeGraphStructure["nodes"][number];
  const node = (
    key: string,
    type: GraphNode["type"],
    sortOrder: number,
  ): GraphNode => ({
    key,
    conceptKey: key,
    code: key,
    name: key,
    type,
    sortOrder,
    description: null,
    importance: null,
    isKeyTopic: false,
    isDifficultTopic: false,
    objectiveMappings: [],
    assessmentMappings: [],
    sourceType: "SYLLABUS",
    sourceRefs: [],
    confidence: null,
    sourcePath: null,
  });
  const chapters = Array.from({ length: 11 }, (_, index) =>
    node(`CH-${index + 1}`, "CHAPTER", index),
  );
  const points = chapters.map((_, index) =>
    node(`KP-${index + 1}`, "KNOWLEDGE_POINT", index),
  );
  const graph: KnowledgeGraphStructure = {
    nodes: [node("COURSE", "COURSE", 0), ...chapters, ...points],
    edges: points.map((point, index) => ({
      key: `edge-${index}`,
      from: chapters[index].key,
      to: point.key,
      type: "CONTAINS",
      description: null,
      sourceType: "SYLLABUS",
      sourceRefs: [],
      confidence: null,
    })),
  };
  const original = structuredClone(graph);
  const colors = graphChapterColors(graph);
  const positions = chapterGraphLayout(graph);
  assert.equal(new Set(colors.values()).size, 11);
  const center = positions.get("COURSE");
  assert.ok(center);
  assert.equal(center.x, 0, "平面网状图的课程核心居中");
  assert.equal(center.y, 0);
  for (const position of positions.values()) assert.equal(position.z, 0);
  const chapterPositions = chapters.map((chapter) => {
    const position = positions.get(chapter.key);
    assert.ok(position);
    return position;
  });
  assert.equal(
    new Set(
      chapterPositions.map(
        (position) => `${Math.sign(position.x)},${Math.sign(position.y)}`,
      ),
    ).size,
    4,
    "章节应围绕核心覆盖四周，不能退回单向树状结构",
  );
  points.forEach((point, index) => {
    const position = positions.get(point.key);
    const chapter = chapterPositions[index];
    assert.ok(position);
    assert.ok(
      Math.hypot(position.x - chapter.x, position.y - chapter.y) <
        Math.hypot(position.x, position.y),
      "知识点保留在所属章节附近",
    );
    assert.equal(
      positions.get(point.key)?.color,
      colors.get(chapters[index].key),
    );
  });
  const edited = {
    ...graph,
    nodes: [...graph.nodes]
      .reverse()
      .map((item) => ({ ...item, name: `${item.name} 修改` })),
  };
  assert.deepEqual(graphChapterColors(edited), colors);
  assert.deepEqual(chapterGraphLayout(edited), positions);
  assert.deepEqual(graph, original);
});
