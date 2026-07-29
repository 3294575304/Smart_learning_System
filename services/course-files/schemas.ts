import { z } from "zod";

export const courseFileIdSchema = z.string().cuid("文件 ID 格式无效");
