import { z } from "zod";

export const schoolAdminDirectorySchema = z
  .object({
    view: z.enum(["SCHOOLS", "ADMINS"]).default("SCHOOLS"),
    keyword: z
      .string()
      .trim()
      .max(100, "搜索内容不能超过 100 个字符")
      .default(""),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();

export type SchoolAdminDirectoryQuery = z.output<
  typeof schoolAdminDirectorySchema
>;

export function directoryHref(
  query: SchoolAdminDirectoryQuery,
  page = 1,
): string {
  const params = new URLSearchParams({ view: query.view, page: String(page) });
  if (query.keyword) params.set("keyword", query.keyword);
  return `/super-admin/schools?${params.toString()}`;
}
