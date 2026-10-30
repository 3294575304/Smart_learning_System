import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getTeacherReportingScope } from "@/services/assignment-results/scope";
import { hundredPointScore } from "./presentation";
import {
  type TeacherStudentQuery,
  teacherStudentDetailQuerySchema,
} from "./student-query";

// Prisma raw Date parameters are timestamptz; domain DateTime columns store UTC without a zone.
function utcTimestamp(value: Date) {
  return Prisma.sql`${value.toISOString()}::timestamp`;
}
function assignmentScope(query: TeacherStudentQuery, now: Date) {
  const section =
    query.section === "ALL"
      ? Prisma.sql`true`
      : query.section === "CURRENT"
        ? Prisma.sql`c.status = 'ACTIVE' AND a.status NOT IN ('CLOSED','ARCHIVED')`
        : Prisma.sql`(c.status <> 'ACTIVE' OR a.status IN ('CLOSED','ARCHIVED'))`;
  return Prisma.sql`a.status IN ('PUBLISHED','CLOSED','ARCHIVED') AND a."publishedAt" <= ${utcTimestamp(now)} AND ${section}`;
}
function cte(teacherId: string, query: TeacherStudentQuery, now: Date) {
  return Prisma.sql`WITH rooms AS (
    SELECT c.* FROM "Classroom" c WHERE c."teacherId" = ${teacherId}
    ${query.courseId ? Prisma.sql`AND c."courseId" = ${query.courseId}` : Prisma.empty}
    ${query.classroomId ? Prisma.sql`AND c.id = ${query.classroomId}` : Prisma.empty}
    AND ${query.section === "ALL" ? Prisma.sql`true` : query.section === "CURRENT" ? Prisma.sql`c.status = 'ACTIVE'` : Prisma.sql`(c.status <> 'ACTIVE' OR EXISTS (SELECT 1 FROM "Assignment" a WHERE a."classroomId" = c.id AND a."teacherId" = ${teacherId} AND ${assignmentScope(query, now)}))`}
  ), tasks AS (
    SELECT a.* FROM "Assignment" a JOIN rooms c ON c.id = a."classroomId"
    WHERE a."teacherId" = ${teacherId} AND ${assignmentScope(query, now)}
  ), latest AS (
    SELECT DISTINCT ON (s."assignmentId", s."studentId") s.* FROM "Submission" s JOIN tasks a ON a.id = s."assignmentId"
    WHERE s.status IN ('SUBMITTED','PENDING_REVIEW','GRADED','PUBLISHED')
    ORDER BY s."assignmentId", s."studentId", s."attemptNumber" DESC, s."submittedAt" DESC NULLS LAST, s.id DESC
  ), students AS (
    SELECT m."studentId", c.id AS "classroomId", c.name AS "classroomName", c."courseId", p."studentNo",
      COALESCE(p."displayName", '未设置姓名') AS name, m.status = 'ACTIVE' AS active,
      COUNT(a.id)::int AS expected, COUNT(s.id)::int AS submitted,
      COUNT(a.id) FILTER (WHERE s.id IS NULL)::int AS unsubmitted,
      COUNT(a.id) FILTER (WHERE s.id IS NULL AND a."dueAt" <= ${utcTimestamp(now)})::int AS overdue,
      COUNT(s.id) FILTER (WHERE s.status = 'PENDING_REVIEW')::int AS pending
    FROM rooms c JOIN "ClassMembership" m ON m."classroomId" = c.id
    LEFT JOIN "UserProfile" p ON p."userId" = m."studentId"
    LEFT JOIN tasks a ON a."classroomId" = c.id
    LEFT JOIN latest s ON s."assignmentId" = a.id AND s."studentId" = m."studentId"
    GROUP BY m."studentId", m.status, c.id, c.name, c."courseId", p."studentNo", p."displayName"
    HAVING m.status = 'ACTIVE' OR COUNT(s.id) > 0
  )`;
}
export interface TeacherStudentRow {
  studentId: string;
  classroomId: string;
  classroomName: string;
  courseId: string | null;
  studentNo: string | null;
  name: string;
  active: boolean;
  expected: number | null;
  submitted: number;
  unsubmitted: number | null;
  overdue: number | null;
  pending: number;
}
type DatabaseRow = Omit<
  TeacherStudentRow,
  "expected" | "unsubmitted" | "overdue"
> & { expected: number; unsubmitted: number; overdue: number };
export async function listTeacherStudentAssignments(
  teacherId: string,
  query: TeacherStudentQuery,
  now = new Date(),
) {
  const classrooms = await getTeacherReportingScope(teacherId, query, now);
  const keyword = query.studentKeyword.replace(/[\\%_]/g, "\\$&");
  const match = keyword
    ? Prisma.sql`AND (name ILIKE ${`%${keyword}%`} OR "studentNo" ILIKE ${`%${keyword}%`})`
    : Prisma.empty;
  const filter =
    query.submissionFilter === "ALL"
      ? Prisma.empty
      : query.submissionFilter === "PENDING_REVIEW"
        ? Prisma.sql`AND active AND pending > 0`
        : query.submissionFilter === "OVERDUE"
          ? Prisma.sql`AND active AND overdue > 0`
          : Prisma.sql`AND active AND unsubmitted > 0`;
  const prefix = cte(teacherId, query, now);
  const [totals, rows] = await prisma.$transaction(
    [
      prisma.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`${prefix} SELECT COUNT(*) AS total FROM students WHERE true ${match} ${filter}`,
      ),
      prisma.$queryRaw<
        DatabaseRow[]
      >(Prisma.sql`${prefix} SELECT * FROM students WHERE true ${match} ${filter}
      ORDER BY CASE WHEN "studentNo" = ${query.studentKeyword} AND ${query.studentKeyword} <> '' THEN 0 ELSE 1 END, name, "studentNo" NULLS LAST, "classroomId", "studentId"
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  const total = Number(totals[0]?.total ?? 0);
  return {
    classrooms,
    items: rows.map((row) => ({
      ...row,
      expected: row.active ? row.expected : null,
      unsubmitted: row.active ? row.unsubmitted : null,
      overdue: row.active ? row.overdue : null,
      pending: row.active ? row.pending : 0,
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}
interface DetailRow {
  id: string;
  historical: boolean;
  title: string;
  dueAt: Date | null;
  submissionId: string | null;
  status: string | null;
  submittedAt: Date | null;
  score: Prisma.Decimal | null;
  maxScore: Prisma.Decimal | null;
}
export async function getTeacherStudentAssignments(
  teacherId: string,
  studentId: string,
  query: ReturnType<typeof teacherStudentDetailQuerySchema.parse>,
  now = new Date(),
) {
  await getTeacherReportingScope(teacherId, query, now);
  const identity = await prisma.classMembership.findFirst({
    where: {
      studentId,
      classroomId: query.classroomId,
      classroom: { teacherId },
    },
    select: {
      status: true,
      student: {
        select: { profile: { select: { displayName: true, studentNo: true } } },
      },
      classroom: { select: { name: true, courseId: true } },
    },
  });
  if (!identity) throw new ResourceNotFoundError("学生不存在");
  const prefix = cte(teacherId, query, now);
  const active = identity.status === "ACTIVE";
  const eligible = active ? Prisma.empty : Prisma.sql`AND s.id IS NOT NULL`;
  if (!active) {
    const evidence = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`${prefix} SELECT s.id FROM latest s WHERE s."studentId" = ${studentId} LIMIT 1`,
    );
    if (!evidence.length) throw new ResourceNotFoundError("学生不存在");
  }
  const keyword = query.assignmentKeyword.replace(/[\\%_]/g, "\\$&");
  const filter =
    query.submissionFilter === "ALL"
      ? Prisma.empty
      : query.submissionFilter === "PENDING_REVIEW"
        ? active
          ? Prisma.sql`AND s.status = 'PENDING_REVIEW'`
          : Prisma.sql`AND false`
        : !active
          ? Prisma.sql`AND false`
          : query.submissionFilter === "OVERDUE"
            ? Prisma.sql`AND s.id IS NULL AND a."dueAt" <= ${utcTimestamp(now)}`
            : Prisma.sql`AND s.id IS NULL`;
  const base = Prisma.sql`FROM tasks a LEFT JOIN latest s ON s."assignmentId"=a.id AND s."studentId"=${studentId} WHERE a."classroomId"=${query.classroomId} ${eligible} ${keyword ? Prisma.sql`AND a.title ILIKE ${`%${keyword}%`}` : Prisma.empty} ${filter}`;
  const [totals, rows] = await prisma.$transaction(
    [
      prisma.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`${prefix} SELECT COUNT(*) AS total ${base}`,
      ),
      prisma.$queryRaw<DetailRow[]>(
        Prisma.sql`${prefix} SELECT a.id,a.title,a."dueAt",(a.status IN ('CLOSED','ARCHIVED') OR (SELECT c.status FROM rooms c WHERE c.id = a."classroomId") <> 'ACTIVE') AS historical,s.id AS "submissionId",s.status,s."submittedAt",s.score,s."maxScore" ${base} ORDER BY a."publishedAt" DESC,a.id DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
      ),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  const grants = await prisma.assignmentMakeupGrant.findMany({
    where: { assignmentId: { in: rows.map((r) => r.id) }, studentId },
    orderBy: { createdAt: "desc" },
  });
  return {
    studentId,
    active,
    name: identity.student.profile?.displayName ?? "未设置姓名",
    studentNo: identity.student.profile?.studentNo,
    classroomName: identity.classroom.name,
    courseId: identity.classroom.courseId,
    items: rows.map((row) => ({
      ...row,
      makeupLabel: (() => {
        const g = grants.find(
          (g) =>
            g.assignmentId === row.id &&
            ((g.status === "USED" && g.submissionId === row.submissionId) ||
              (g.status === "ACTIVE" &&
                g.expiresAt > now &&
                active &&
                !row.historical)),
        );
        return g
          ? g.status === "USED"
            ? g.kind === "REDO"
              ? "重做已提交"
              : "补交已提交"
            : g.kind === "REDO"
              ? "重做开放"
              : "补交开放"
          : null;
      })(),
      percentage:
        row.status === "GRADED" || row.status === "PUBLISHED"
          ? hundredPointScore(
              row.score?.toNumber() ?? null,
              row.maxScore?.toNumber() ?? null,
            )
          : null,
      overdue: !row.submissionId && row.dueAt !== null && row.dueAt <= now,
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: Number(totals[0]?.total ?? 0),
      totalPages: Math.ceil(Number(totals[0]?.total ?? 0) / query.pageSize),
    },
  };
}
