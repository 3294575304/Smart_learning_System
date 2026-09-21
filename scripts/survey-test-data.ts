import { randomInt, randomUUID } from "node:crypto";
import type { CourseSurveyQuestionType } from "@prisma/client";
import { submitCourseSurveySchema } from "@/services/course-surveys/schemas";

const benefits = [
  "【模拟意见】课堂案例和逐步演示帮助我理解循环与函数。",
  "【模拟意见】八次实验让我熟悉了 Python 调试和文件处理。",
  "【模拟意见】课后练习与作业反馈有助于发现薄弱知识点。",
  "【模拟意见】列表、字典与数据处理案例对实践最有帮助。",
  "【模拟意见】课堂互动和答疑增强了独立解决问题的信心。",
  "【模拟意见】课程内容由浅入深，考试范围与教学目标一致。",
];
const suggestions = [
  "【模拟意见】建议增加分层练习，为基础薄弱的同学提供更多入门案例。",
  "【模拟意见】函数与面向对象部分进度偏快，希望增加讲解和演示。",
  "【模拟意见】建议实验前提供操作清单，实验后增加常见错误讲解。",
  "【模拟意见】希望作业评分标准更具体，并缩短反馈等待时间。",
  "【模拟意见】建议增加综合项目和真实数据处理实践。",
  "【模拟意见】希望集中整理课件、答疑记录和复习资源。",
  "【模拟意见】整体安排合理，建议继续保留课堂互动与阶段测验。",
  "【模拟意见】建议期中考试后安排针对性的复习与补充练习。",
];

// Samples are generated independently of student IDs, roster order and grades.
export function syntheticSurveyAnswers(
  questions: ReadonlyArray<{ id: string; type: CourseSurveyQuestionType }>,
  draw: (max: number) => number = randomInt,
) {
  let textIndex = 0;
  return submitCourseSurveySchema.parse({
    idempotencyKey: randomUUID(),
    answers: questions.map((question) => {
      if (question.type === "OPEN_TEXT") {
        const choices = textIndex++ % 2 === 0 ? benefits : suggestions;
        return {
          questionId: question.id,
          kind: "TEXT",
          value: choices[draw(choices.length)],
        };
      }
      const value = draw(100);
      return {
        questionId: question.id,
        kind: "SCALE",
        value:
          value < 3 ? 1 : value < 10 ? 2 : value < 30 ? 3 : value < 72 ? 4 : 5,
      };
    }),
  }).answers;
}
