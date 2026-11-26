import { z } from "zod";

export const COURSE_NO_MAX_LENGTH = 50;

/**
 * 课程号唯一的标准形态：NFKC → 去零宽字符 → 空白折叠为单空格 → trim → 大写。
 *
 * 入库即规范形态，因此同校唯一索引可以直接按列比较，不需要 CITEXT 或函数索引。
 */
export function normalizeCourseNo(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toUpperCase();
}

/** 必填课程号：空串或纯空白视为未填写。 */
export const courseNoSchema = z
  .string()
  .transform((value) => normalizeCourseNo(value))
  .refine((value) => value.length > 0, "课程号不能为空")
  .refine(
    (value) => value.length <= COURSE_NO_MAX_LENGTH,
    `课程号不能超过 ${COURSE_NO_MAX_LENGTH} 个字符`,
  );

/**
 * 可选课程号：未传字段保持 undefined（便于 PATCH 区分“不改”），
 * 传空串或 null 归一为 null（表示清空）。
 */
export const optionalCourseNoSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return normalizeCourseNo(value) || null;
  })
  .refine(
    (value) =>
      value === undefined ||
      value === null ||
      value.length <= COURSE_NO_MAX_LENGTH,
    `课程号不能超过 ${COURSE_NO_MAX_LENGTH} 个字符`,
  );
