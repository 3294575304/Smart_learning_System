import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { studentProfileFocusSchema } from "@/services/learner-profiles/schemas";
import { studentKnowledgeStatus } from "@/services/learner-profiles/knowledge-status";
import { learnerProfileEvidenceState } from "@/services/learner-profiles/calculation";
import { HomeKnowledgeMatrix } from "@/components/dashboard/home-knowledge-matrix";

test("学生掌握状态先判证据门槛，再判60与80分，不改历史评分", () => {
  for (const [count, score, status] of [
    [0, 100, "NO_EVIDENCE"],
    [1, 100, "INSUFFICIENT"],
    [2, 100, "INSUFFICIENT"],
    [3, 59, "NEEDS_SUPPORT"],
    [3, 60, "DEVELOPING"],
    [3, 79, "DEVELOPING"],
    [3, 79.99, "DEVELOPING"],
    [3, 80, "MASTERED"],
    [3, 0, "NEEDS_SUPPORT"],
  ] as const)
    assert.equal(
      studentKnowledgeStatus({
        evidenceState: learnerProfileEvidenceState(count),
        masteryScore: score,
      }),
      status,
    );
  assert.equal(studentKnowledgeStatus(null), "NO_EVIDENCE");
  assert.equal(
    studentKnowledgeStatus({ evidenceState: "CONCLUSIVE", masteryScore: null }),
    "INSUFFICIENT",
  );
});

test("11章全部保留，缺少评估的多个知识点不合并，证据入口带本班上下文", () => {
  const chapters = Array.from({ length: 11 }, (_, i) => ({
    key: `chapter${i}`,
    name: `第${i + 1}章 测试章节`,
    concepts: [
      {
        key: `point-${i}-a`,
        name: "知识点甲",
        status: "NO_EVIDENCE" as const,
        evidenceCount: 0,
        masteryScore: null,
      },
      {
        key: `point-${i}-b`,
        name: "知识点乙",
        status: "INSUFFICIENT" as const,
        evidenceCount: 2,
        masteryScore: 100,
      },
    ],
  }));
  const html = renderToStaticMarkup(
    React.createElement(HomeKnowledgeMatrix, {
      chapters,
      profileHref: "/student/courses/c/profile?classroomId=k",
      generatedAt: null,
      profileRevision: null,
    }),
  );
  assert.match(html, /共 11 章 · 22 个知识点/);
  assert.match(html, /第11章 测试章节/);
  assert.match(html, /overflow-y-auto/);
  assert.match(html, /知识状态分布/);
  assert.match(html, /展开全部/);
  assert.match(html, /计算依据/);
  assert.match(html, /classroomId=k/);
  assert.doesNotMatch(html, /100\.0 分|NaN|Infinity/);
  assert.match(html, /画像版本：暂无/);
});

test("评分依据定位仅接受单个合法知识点ID，入口保留班级并携带定位锚点", () => {
  const conceptId = "c000000000000000000000001";
  assert.equal(
    studentProfileFocusSchema.safeParse({ conceptId }).success,
    true,
  );
  assert.equal(
    studentProfileFocusSchema.safeParse({ conceptId: [conceptId] }).success,
    false,
  );
  assert.equal(
    studentProfileFocusSchema.safeParse({ conceptId: "../other" }).success,
    false,
  );
  const html = renderToStaticMarkup(
    React.createElement(HomeKnowledgeMatrix, {
      chapters: [
        {
          key: "c",
          name: "章节",
          concepts: [
            {
              key: "k",
              conceptId,
              name: "知识",
              status: "MASTERED",
              evidenceCount: 3,
              masteryScore: 80,
            },
          ],
        },
      ],
      profileHref: "/student/courses/c/profile?classroomId=k",
      generatedAt: null,
      profileRevision: null,
    }),
  );
  assert.match(
    html,
    /classroomId=k&amp;conceptId=c000000000000000000000001#profile-concept-c000000000000000000000001/,
  );
  assert.match(html, /aria-label="查看评分依据：知识"/);
});
