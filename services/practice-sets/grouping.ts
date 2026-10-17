import type { QuestionType, RecommendationStatus } from "@prisma/client";
import { practiceSetEntry, practiceSetStatus, type PracticeSet } from "./types";
export interface PracticeSetRecord {
  id: string;
  status: RecommendationStatus;
  createdAt: Date;
  courseCycle: {
    course: { id: string; name: string };
    requestSnapshot: unknown;
  } | null;
  conceptSnapshots: Array<{ resolvedNode: { name: string } }>;
  question: {
    title: string;
    type: QuestionType;
    knowledgePointLinks: Array<{ knowledgePoint: { name: string } }>;
  };
}
export function buildPracticeSet(records: PracticeSetRecord[]): PracticeSet {
  const first = records[0];
  if (!first) throw new Error("练习组不能为空");
  const questions = records.map((record) => ({
    id: record.id,
    title: record.question.title,
    type: record.question.type,
    status: record.status,
  }));
  const snapshot = first.courseCycle?.requestSnapshot;
  const test =
    snapshot &&
    typeof snapshot === "object" &&
    !Array.isArray(snapshot) &&
    "mode" in snapshot &&
    snapshot.mode === "TEST";
  return {
    id: first.id,
    courseId: first.courseCycle?.course.id ?? null,
    courseName: first.courseCycle?.course.name ?? "通用个性化练习",
    title: first.courseCycle
      ? test
        ? "章节综合测试"
        : "课程专项练习"
      : "个性化推荐练习",
    generatedAt: first.createdAt.toISOString(),
    status: practiceSetStatus(questions.map((item) => item.status)),
    total: questions.length,
    completed: questions.filter((item) => item.status === "COMPLETED").length,
    entryId: practiceSetEntry(questions),
    questions,
    knowledgePoints: [
      ...new Set(
        records.flatMap((record) =>
          record.conceptSnapshots.length
            ? record.conceptSnapshots.map((entry) => entry.resolvedNode.name)
            : record.question.knowledgePointLinks.map(
                (entry) => entry.knowledgePoint.name,
              ),
        ),
      ),
    ].slice(0, 5),
  };
}
