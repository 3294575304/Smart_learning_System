import { z } from "zod";

const optionalId = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().cuid().optional(),
);

export const teacherDashboardQuerySchema = z.object({
  courseId: optionalId,
  classroomId: optionalId,
});

export type TeacherDashboardQuery = z.output<
  typeof teacherDashboardQuerySchema
>;
