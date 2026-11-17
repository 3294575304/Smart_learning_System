import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StatFunnel } from "../../components/ui/stat-funnel";

Object.assign(globalThis, { React });

test("三项知识统计显示课程覆盖、记录充分程度和掌握情况", () => {
  const html = renderToStaticMarkup(
    React.createElement(StatFunnel, {
      steps: [
        {
          key: "evidence-coverage",
          label: "有评分记录",
          numerator: 11,
          denominator: 83,
          value: 13.25,
          detail: "作业、考试和练习已有评分的知识点",
        },
        {
          key: "stable-conclusions",
          label: "记录较充分",
          numerator: 11,
          denominator: 11,
          value: 100,
          detail: "每个知识点至少有 3 条评分记录",
        },
        {
          key: "mastered-concepts",
          label: "已掌握",
          numerator: 2,
          denominator: 11,
          value: 18.18,
          detail: "记录较充分，且掌握度达到 80%",
        },
      ],
    }),
  );

  assert.match(html, /有评分记录/u);
  assert.match(html, /已掌握/u);
  assert.match(html, /\/ 83/u);
  assert.match(html, /width:13%/u);
  assert.match(html, /width:100%/u);
  assert.match(html, /width:18%/u);
  assert.equal([...html.matchAll(/<li\b/gu)].length, 3);
  assert.doesNotMatch(html, /已授|四级口径|稳定结论|达到门槛/u);
});

test("没有可统计的知识点时显示暂无数据", () => {
  const html = renderToStaticMarkup(
    React.createElement(StatFunnel, {
      steps: [
        {
          key: "evidence-coverage",
          label: "有评分记录",
          numerator: 0,
          denominator: 0,
          value: null,
          detail: "教师发布课程知识图谱后就能查看",
        },
      ],
    }),
  );

  assert.match(html, /暂无数据/u);
  // 进度条宽度留空即可，但可见文案不能出现 0%，否则会被读成"一个都没掌握"
  assert.doesNotMatch(html, />0%</u);
});

test("知识点点阵按已掌握数填充，并给出剩余数量说明", () => {
  const html = renderToStaticMarkup(
    React.createElement(StatFunnel, {
      steps: [
        {
          key: "mastered-concepts",
          label: "已掌握",
          numerator: 2,
          denominator: 11,
          value: 18,
          detail: "记录较充分，且掌握度达到 80%",
        },
      ],
      dots: {
        total: 11,
        filled: 2,
        caption: "11 个记录较充分的知识点中，2 个已掌握，9 个还需巩固。",
      },
    }),
  );

  // 1 个步骤 li + 11 个点阵 li
  assert.equal([...html.matchAll(/<li\b/gu)].length, 12);
  assert.match(html, /2 个已掌握，9 个还需巩固/u);
  assert.equal([...html.matchAll(/bg-ok/gu)].length, 2);
});
