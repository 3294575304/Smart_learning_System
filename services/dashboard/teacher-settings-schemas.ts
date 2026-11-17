import { z } from "zod";

import { courseIdSchema } from "@/services/courses/schemas";
import { systemConfigValueSchemas } from "@/services/system-config/definitions";

export const teacherTeachingPreferencesSchema = z
  .object({
    assignmentDueDays:
      systemConfigValueSchemas.assignmentDefaultDueDays.nullable(),
    allowAssignmentResubmission: z.boolean(),
    notifyQualityReportReady: z.boolean(),
  })
  .strict();

export type TeacherTeachingPreferences = z.infer<
  typeof teacherTeachingPreferencesSchema
>;

export const teacherSettingsPatchSchema = z.union([
  z.object({ defaultCourseId: courseIdSchema.nullable() }).strict(),
  z.object({ teachingPreferences: teacherTeachingPreferencesSchema }).strict(),
]);
