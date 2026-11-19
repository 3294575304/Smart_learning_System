import assert from "node:assert/strict";
import test from "node:test";
import { QuestionType } from "@prisma/client";
import {
  examKnowledgePoints,
  groupExamKnowledgePoints,
} from "@/services/exams/student-report-knowledge";
import {
  examReportHref,
  examReportReturn,
  examReviewAnchor,
  examReviewPage,
  readExamReviewQuery,
  type ExamReviewStatus,
} from "@/services/exams/student-report-review";

const scope = {
  courseId: "cm00000000000000000000001",
  classroomId: "cm00000000000000000000002",
};
const examId = "cm00000000000000000000003";
const assignmentId = "cm00000000000000000000004";

test("错题按组合条件筛选，每页八题，历史页码自动收紧", () => {
  const wrong: {
    number: number;
    type: QuestionType;
    status: ExamReviewStatus;
  }[] = Array.from({ length: 18 }, (_, index) => ({
    number: index + 1,
    type:
      index < 10 ? QuestionType.SINGLE_CHOICE : QuestionType.PYTHON_PROGRAMMING,
    status: index < 10 ? "UNANSWERED" : "PARTIAL",
  }));
  const secondPage = readExamReviewQuery({
    questionType: "SINGLE_CHOICE",
    reviewStatus: "UNANSWERED",
    reviewPage: "2",
  });
  const result = examReviewPage(wrong, secondPage);
  assert.deepEqual(
    result.items.map(({ number }) => number),
    [9, 10],
  );
  assert.equal(result.pagination.total, 10);
  const exact = examReviewPage(wrong, { ...secondPage, questionNumber: 9 });
  assert.equal(exact.pagination.page, 1);
  assert.deepEqual(
    exact.items.map(({ number }) => number),
    [9],
  );
  assert.equal(
    examReviewPage(wrong, { ...secondPage, questionNumber: 13 }).pagination
      .total,
    0,
  );
  assert.deepEqual(
    readExamReviewQuery({
      questionType: ["SINGLE_CHOICE"],
      reviewStatus: "other",
      questionNumber: "-4",
      reviewPage: "0",
    }),
    {
      questionType: undefined,
      reviewStatus: undefined,
      questionNumber: undefined,
      reviewPage: 1,
    },
  );
});

test("答卷只恢复同场、同班报告的筛选和页码", () => {
  const query = readExamReviewQuery({
    questionType: "PYTHON_PROGRAMMING",
    reviewStatus: "PARTIAL",
    reviewPage: "2",
  });
  const safeList = `/student/exams?status=SUBMITTED&focus=${assignmentId}#exam-${assignmentId}`;
  const href =
    examReportHref(examId, scope, safeList, query) + examReviewAnchor;
  assert.equal(examReportReturn(href, examId, assignmentId, scope), href);
  assert.equal(
    examReportReturn(href, assignmentId, assignmentId, scope),
    undefined,
  );
  assert.equal(
    examReportReturn(href, examId, assignmentId, {
      ...scope,
      classroomId: assignmentId,
    }),
    undefined,
  );
  assert.equal(
    examReportReturn("https://example.com" + href, examId, assignmentId, scope),
    undefined,
  );
  assert.equal(
    examReportReturn(
      href.replace(examReviewAnchor, "#other"),
      examId,
      assignmentId,
      scope,
    ),
    undefined,
  );
  const disguised = examReportHref(examId, scope, "https://example.com", query);
  assert.doesNotMatch(
    examReportReturn(disguised, examId, assignmentId, scope) ?? "",
    /example\.com/,
  );
});

test("考试知识点按发布章节和编号排列，课程与章节节点不计入", () => {
  const chapter = (number: number) => ({
    conceptId: `chapter-${number}`,
    code: `CH-${number}`,
    name: `第 ${number} 章`,
    sortOrder: 0,
  });
  const snapshot = (
    conceptId: string,
    code: string,
    nodeType: string,
    number?: number,
  ) => ({
    conceptId,
    resolvedNode: null,
    sourceNode: {
      id: conceptId,
      code,
      name: conceptId,
      nodeType,
      sortOrder: 0,
      graphVersion: { versionNumber: 1 },
      incomingEdges:
        number === undefined ? [] : [{ fromNode: chapter(number) }],
    },
  });
  const points = examKnowledgePoints([
    snapshot("Python 程序设计", "COURSE", "COURSE"),
    snapshot("章节", "CH-2", "CHAPTER"),
    snapshot("第十章知识点", "KP-10-1", "KNOWLEDGE_POINT", 10),
    snapshot("第二章第十个知识点", "KP-2-10", "KNOWLEDGE_POINT", 2),
    snapshot("未分章", "KP-0-1", "KNOWLEDGE_POINT"),
    snapshot("第二章第二个知识点", "KP-2-2", "KNOWLEDGE_POINT", 2),
  ]);
  assert.deepEqual(
    groupExamKnowledgePoints(points).map((group) => [
      group.name,
      group.points.map((point) => point.name),
    ]),
    [
      ["第 2 章", ["第二章第二个知识点", "第二章第十个知识点"]],
      ["第 10 章", ["第十章知识点"]],
      ["未分章知识点", ["未分章"]],
    ],
  );
});
