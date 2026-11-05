import { z } from "zod";

export const schoolBindingNameSchema = z
  .string()
  .trim()
  .min(2, "请输入学校名称")
  .max(120, "学校名称不能超过 120 个字符");
