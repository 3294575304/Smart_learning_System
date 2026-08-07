import { AttendanceStatus } from "@prisma/client";
import { z } from "zod";

export const attendanceSessionIdSchema = z
  .string()
  .cuid("签到场次 ID 格式无效");
export const attendanceRecordIdSchema = z.string().cuid("出勤记录 ID 格式无效");
export const createAttendanceSessionSchema = z
  .object({
    classroomId: z.string().cuid(),
    title: z.string().trim().min(1).max(120),
    startsAt: z.coerce.date(),
    signInOpensAt: z.coerce.date(),
    lateAfter: z.coerce.date(),
    signInClosesAt: z.coerce.date(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!(
      value.signInOpensAt <= value.startsAt &&
      value.startsAt <= value.lateAfter &&
      value.lateAfter <= value.signInClosesAt
    ))
      context.addIssue({
        code: "custom",
        path: ["signInClosesAt"],
        message: "时间必须满足开放 ≤ 上课 ≤ 迟到线 ≤ 截止",
      });
  });
export const updateAttendanceSessionSchema = z
  .object({
    action: z.enum(["OPEN", "CLOSE", "CANCEL"]),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export const correctAttendanceRecordSchema = z
  .object({
    status: z
      .nativeEnum(AttendanceStatus)
      .refine(
        (value) => value !== AttendanceStatus.PENDING,
        "教师纠正不能设为待确认",
      ),
    reason: z.string().trim().min(1).max(500),
    expectedRevisionNumber: z.number().int().nonnegative(),
  })
  .strict();
