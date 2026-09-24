import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import { KnowledgeGraphNodeVisual } from "@/components/courses/knowledge-graph-node-visual";
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
      emphasized: index % 3 === 0,
      showLabel: index % 4 === 0,
    });
  }
  assert.equal(createdLabels, 1);
  assert.equal(label.redraws, 1);
  assert.equal(label.text, "循环结构 · 3题");
  assert.equal(visual.sphere.geometry, geometry);
  assert.equal(visual.sphere.material, material);
  assert.equal(visual.children.length, 2, "题量合并到名称，不创建额外精灵");

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
  assert.equal(visual.sphere.scale.x, 1);
  geometry.dispose();
  material.dispose();
  label.material.dispose();
});

test("真实 SpriteText 的背景边距随字号缩放，长标题保持紧凑且使用浅色底", () => {
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
      assert.ok(label.scale.y < 0.04, "两行标签不应膨胀为遮挡图谱的大块背景");
      assert.ok(label.scale.x < 0.2, "标题宽度保持紧凑");
      assert.equal(label.color, "#0369a1", "浅色背景使用深色文字");
      if (type === "KNOWLEDGE_POINT")
        assert.equal(label.backgroundColor, false);
      else {
        assert.ok(label.backgroundColor);
        const background = new THREE.Color(label.backgroundColor);
        assert.ok(Math.min(background.r, background.g, background.b) > 0.8);
      }
      assert.ok(visual.sphere.geometry.parameters.radius <= 11);
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
  points.forEach((point, index) => {
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
