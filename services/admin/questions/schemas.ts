import {
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
} from "@prisma/client";
import { z } from "zod";

const optionalQueryValue = (value: unknown) =>
  value === "" ? undefined : value;

export const adminQuestionIdSchema = z.string().cuid("题目 ID 格式无效");

export const adminQuestionListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    keyword: z.preprocess(
      optionalQueryValue,
      z.string().trim().min(1).max(120).optional(),
    ),
    type: z.preprocess(
      optionalQueryValue,
      z.nativeEnum(QuestionType).optional(),
    ),
    knowledgePointId: z.preprocess(
      optionalQueryValue,
      z.string().cuid("知识点 ID 格式无效").optional(),
    ),
    creatorId: z.preprocess(
      optionalQueryValue,
      z.string().cuid("创建者 ID 格式无效").optional(),
    ),
    visibility: z.preprocess(
      optionalQueryValue,
      z.nativeEnum(QuestionVisibility).optional(),
    ),
    status: z.preprocess(
      optionalQueryValue,
      z.nativeEnum(QuestionStatus).optional(),
    ),
  })
  .strict();

export const updateAdminQuestionVisibilitySchema = z
  .object({ visibility: z.nativeEnum(QuestionVisibility) })
  .strict();

export const disableAdminQuestionSchema = z
  .object({ status: z.literal(QuestionStatus.INACTIVE) })
  .strict();

export type AdminQuestionListQuery = z.output<
  typeof adminQuestionListQuerySchema
>;
