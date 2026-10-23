import "server-only";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getTeacherAssignment } from "./service";
import { formatCorrectAnswer } from "./answer-presentation";

/** Read the assignment's own frozen content, independently of student submissions. */
export async function getTeacherAssignmentOverview(
  teacherId: string,
  assignmentId: string,
) {
  const record = await prisma.assignment.findFirst({
    where: { id: assignmentId, teacherId },
    select: {
      questions: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          titleSnapshot: true,
          contentSnapshot: true,
          typeSnapshot: true,
          sortOrder: true,
          points: true,
          correctBooleanSnapshot: true,
          referenceAnswerSnapshot: true,
          acceptableAnswersSnapshot: true,
          explanationSnapshot: true,
          optionSnapshots: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              labelSnapshot: true,
              contentSnapshot: true,
              isCorrectSnapshot: true,
            },
          },
        },
      },
    },
  });
  if (!record) throw new ResourceNotFoundError("作业不存在");
  const assignment = await getTeacherAssignment(teacherId, assignmentId);
  return {
    assignment,
    questions: record.questions.map((question) => ({
      id: question.id,
      title: question.titleSnapshot,
      content: question.contentSnapshot,
      type: question.typeSnapshot,
      order: question.sortOrder,
      points: question.points.toNumber(),
      options: question.optionSnapshots.map((option) => ({
        id: option.id,
        label: option.labelSnapshot,
        content: option.contentSnapshot,
      })),
      correctAnswer: formatCorrectAnswer(question),
      explanation: question.explanationSnapshot,
    })),
  };
}
