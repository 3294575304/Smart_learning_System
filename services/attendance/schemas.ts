import { AttendanceSignInMethod, AttendanceStatus } from "@prisma/client";
import { z } from "zod";
const signInPatternSchema = z
  .array(z.number().int().min(0).max(8))
  .min(4)
  .max(9)
  .refine((value) => new Set(value).size === value.length);
export const attendanceQuerySchema = z.object({
  classroomId: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.string().cuid().optional(),
  ),
});

export const attendanceSessionIdSchema = z
  .string()
  .cuid("签到场次 ID 格式无效");
export const attendanceRecordIdSchema = z.string().cuid("出勤记录 ID 格式无效");
export const createAttendanceSessionSchema = z
  .object({
    classroomId: z.string().cuid(),
    title: z.string().trim().min(1).max(120),
    signInMethod: z
      .nativeEnum(AttendanceSignInMethod)
      .default(AttendanceSignInMethod.DIRECT),
    signInCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{4,12}$/)
      .optional(),
    signInPattern: signInPatternSchema.optional(),
    locationLatitude: z.number().min(-90).max(90).optional(),
    locationLongitude: z.number().min(-180).max(180).optional(),
    locationRadiusMeters: z.number().int().min(25).max(1000).optional(),
    startsAt: z.coerce.date(),
    signInOpensAt: z.coerce.date(),
    lateAfter: z.coerce.date(),
    signInClosesAt: z.coerce.date(),
  })
  .strict()
  .superRefine((value, context) => {
    const locationValues = [
      value.locationLatitude,
      value.locationLongitude,
      value.locationRadiusMeters,
    ];
    if (value.signInMethod === AttendanceSignInMethod.LOCATION) {
      if (locationValues.some((item) => item === undefined))
        context.addIssue({
          code: "custom",
          path: ["locationLatitude"],
          message: "位置签到需要设置签到中心和范围。",
        });
    } else if (locationValues.some((item) => item !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["signInMethod"],
        message: "只有位置签到可以设置地理围栏。",
      });
    }
    if (
      value.signInMethod === AttendanceSignInMethod.CODE &&
      value.signInCode === undefined
    )
      context.addIssue({
        code: "custom",
        path: ["signInCode"],
        message: "请设置 4 至 12 位字母或数字签到码。",
      });
    if (
      value.signInMethod !== AttendanceSignInMethod.CODE &&
      value.signInCode !== undefined
    )
      context.addIssue({
        code: "custom",
        path: ["signInCode"],
        message: "只有签到码方式可以设置签到码。",
      });
    if (
      value.signInMethod === AttendanceSignInMethod.GRAPHIC &&
      value.signInPattern === undefined
    )
      context.addIssue({
        code: "custom",
        path: ["signInPattern"],
        message: "请在九点阵上绘制至少 4 个点的签到图形。",
      });
    if (
      value.signInMethod !== AttendanceSignInMethod.GRAPHIC &&
      value.signInPattern !== undefined
    )
      context.addIssue({
        code: "custom",
        path: ["signInPattern"],
        message: "只有图形签到可以设置九点阵图形。",
      });
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
    action: z.enum(["OPEN", "CLOSE", "CANCEL", "ROTATE_CHALLENGE"]),
    expectedRevision: z.number().int().nonnegative(),
    signInCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{4,12}$/)
      .optional(),
    signInPattern: signInPatternSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.action !== "ROTATE_CHALLENGE" &&
      (value.signInCode !== undefined || value.signInPattern !== undefined)
    )
      context.addIssue({
        code: "custom",
        path: ["action"],
        message: "只有更换签到口令时可以提交新的签到凭据。",
      });
  });
export const studentAttendanceSignInSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal(AttendanceSignInMethod.DIRECT) }).strict(),
  z
    .object({
      method: z.literal(AttendanceSignInMethod.LOCATION),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracyMeters: z.number().positive().max(1000),
    })
    .strict(),
  z
    .object({
      method: z.literal(AttendanceSignInMethod.CODE),
      code: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9]{4,12}$/),
    })
    .strict(),
  z
    .object({
      method: z.literal(AttendanceSignInMethod.GRAPHIC),
      pattern: signInPatternSchema,
    })
    .strict(),
]);
export type StudentAttendanceSignInInput = z.infer<
  typeof studentAttendanceSignInSchema
>;
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
