import { z } from "zod";
import { classroomIdSchema, courseIdSchema } from "@/services/courses/schemas";
import type { EvaluationAssistantResult } from "./evaluation-assistant-schemas";
import {
  assistantTopics,
  type AssistantTopic,
} from "./teacher-assistant-catalog";

export const assistantTopicSchema = z.enum(assistantTopics);

export const teacherAssistantRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(240),
    topic: assistantTopicSchema.optional(),
    previousTopic: assistantTopicSchema.optional(),
    area: assistantTopicSchema.optional(),
    courseId: courseIdSchema.optional(),
    selectedCourseId: courseIdSchema.optional(),
    classroomId: classroomIdSchema.optional(),
  })
  .strict();

export type TeacherAssistantRequest = z.input<
  typeof teacherAssistantRequestSchema
>;
export type AssistantCard = { label: string; href: string; detail: string };
export type AssistantCourse = {
  id: string;
  name: string;
  courseNo: string;
  term: string;
};
export type TeacherAssistantResult = {
  topic?: AssistantTopic;
  message: string;
  cards?: AssistantCard[];
  topics?: AssistantTopic[];
  courses?: AssistantCourse[];
  evaluation?: {
    courseId: string;
    state: Extract<
      EvaluationAssistantResult,
      { status: "REVIEW" | "CHOOSE_CLASSROOM" }
    >;
  };
};
