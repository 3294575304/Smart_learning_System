import { z } from "zod";

export const studentCourseMasteryPathSchema = z
  .object({
    courseId: z.string().cuid("课程 ID 格式无效"),
  })
  .strict();

export const teacherStudentCourseMasteryPathSchema = z
  .object({
    courseId: z.string().cuid("课程 ID 格式无效"),
    studentId: z.string().cuid("学生 ID 格式无效"),
  })
  .strict();
