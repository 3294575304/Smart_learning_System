import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/prisma";

const componentSchema = z.array(
  z.object({
    componentId: z.string(),
    evidence: z.array(
      z.object({
        gradeItemId: z.string(),
        status: z.string(),
        score: z.string().nullable(),
        maxScore: z.string(),
      }),
    ),
  }),
);

export interface PublishedExamScore {
  publicationId: string;
  publicationVersion: number;
  id: string;
  classroomId: string;
  studentId: string;
  assignmentId: string | null;
  title: string;
  type: "MIDTERM" | "FINAL";
  status: string;
  score: number | null;
  maxScore: number;
  publishedAt: Date;
  gradebookId: string;
  courseId: string;
}

/** Read only the immutable revision selected by the classroom's current publication. */
export async function listPublishedExamScores(
  classroomIds: string[],
  studentId?: string,
  now = new Date(),
): Promise<PublishedExamScore[]> {
  if (!classroomIds.length) return [];
  const books = await prisma.courseGradebook.findMany({
    where: {
      classroomId: { in: classroomIds },
      currentPublicationId: { not: null },
    },
    select: {
      id: true,
      courseId: true,
      classroomId: true,
      scheme: { select: { versionNumber: true } },
      gradeItems: {
        where: {
          enabled: true,
          component: { type: { in: ["MIDTERM_EXAM", "FINAL_EXAM"] } },
        },
        select: {
          id: true,
          name: true,
          assignmentId: true,
          componentId: true,
          component: { select: { type: true } },
          assignment: {
            select: {
              examSession: { select: { cancelledAt: true, endsAt: true } },
            },
          },
        },
      },
      currentPublication: {
        select: {
          id: true,
          publishedAt: true,
          versionNumber: true,
          students: {
            ...(studentId ? { where: { studentId } } : {}),
            select: {
              studentId: true,
              gradeRevision: { select: { componentResultsJson: true } },
            },
          },
        },
      },
    },
  });
  const selected = new Map<string, (typeof books)[number]>();
  for (const book of books) {
    const previous = selected.get(book.classroomId);
    if (
      !previous ||
      book.scheme.versionNumber > previous.scheme.versionNumber ||
      (book.scheme.versionNumber === previous.scheme.versionNumber &&
        (book.currentPublication?.versionNumber ?? 0) >
          (previous.currentPublication?.versionNumber ?? 0))
    )
      selected.set(book.classroomId, book);
  }
  return [...selected.values()].flatMap((book) => {
    const publication = book.currentPublication;
    if (!publication) return [];
    return publication.students.flatMap((student) => {
      const parsed = componentSchema.safeParse(
        student.gradeRevision.componentResultsJson,
      );
      if (!parsed.success) return [];
      const evidence = new Map(
        parsed.data.flatMap((component) =>
          component.evidence.map((item) => [item.gradeItemId, item] as const),
        ),
      );
      return book.gradeItems.flatMap((item) => {
        if (
          item.assignment?.examSession &&
          (item.assignment.examSession.cancelledAt ||
            item.assignment.examSession.endsAt > now)
        )
          return [];
        const grade = evidence.get(item.id);
        if (!grade) return [];
        const maxScore = Number(grade.maxScore);
        const score = grade.score === null ? null : Number(grade.score);
        if (
          !Number.isFinite(maxScore) ||
          maxScore <= 0 ||
          (score !== null && !Number.isFinite(score))
        )
          return [];
        return [
          {
            publicationId: publication.id,
            publicationVersion: publication.versionNumber,
            id: item.id,
            classroomId: book.classroomId,
            studentId: student.studentId,
            assignmentId: item.assignmentId,
            title: item.name,
            type:
              item.component.type === "MIDTERM_EXAM"
                ? ("MIDTERM" as const)
                : ("FINAL" as const),
            status: grade.status,
            score,
            maxScore,
            publishedAt: publication.publishedAt,
            gradebookId: book.id,
            courseId: book.courseId,
          },
        ];
      });
    });
  });
}
