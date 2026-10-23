import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { prisma } from "../../lib/prisma";
import { withClassroomQuery } from "../../lib/course-classroom";
import { ResourceNotFoundError } from "../../services/auth/policy";
import { getTeacherCourseClassroom } from "../../services/courses/classroom-context";
import { courseClassroomQuerySchema } from "../../services/courses/schemas";
import { getTeacherGradebookOverview } from "../../services/gradebook/service";

const classroomId = "cl000000000000000000000001";

function mockQuery<T extends object>(
  t: TestContext,
  delegate: T,
  method: keyof T,
  implementation: (...args: unknown[]) => Promise<unknown>,
) {
  const original = delegate[method];
  const replacement = t.mock.fn(implementation);
  // Prisma delegates expose methods through a proxy rather than own descriptors.
  Reflect.set(delegate, method, replacement);
  assert.equal(delegate[method], replacement);
  t.after(() => {
    Reflect.set(delegate, method, original);
  });
  return replacement;
}

test("班级参数保留其他筛选和锚点，并替换旧班级", () => {
  assert.equal(
    withClassroomQuery(
      "/teacher/courses/course-a/gradebook?view=overview&classroomId=old#details",
      classroomId,
    ),
    `/teacher/courses/course-a/gradebook?view=overview&classroomId=${classroomId}#details`,
  );
  assert.equal(
    withClassroomQuery("/teacher/courses/course-a", undefined),
    "/teacher/courses/course-a",
  );
  assert.equal(
    courseClassroomQuerySchema.safeParse({ classroomId }).success,
    true,
  );
  assert.equal(
    courseClassroomQuerySchema.safeParse({ classroomId: [classroomId] })
      .success,
    false,
  );
});

test("班级上下文同时校验教师和课程归属，不接受其他课程或教师的班级", async (t) => {
  const lookup = mockQuery(
    t,
    prisma.classroom,
    "findFirst",
    async (args: unknown) => {
      assert.deepEqual(args, {
        where: {
          id: classroomId,
          courseId: "course-a",
          teacherId: "teacher-a",
          course: { teacherId: "teacher-a" },
        },
        select: { id: true, name: true, status: true },
      });
      return null;
    },
  );
  await assert.rejects(
    getTeacherCourseClassroom("teacher-a", "course-a", classroomId),
    ResourceNotFoundError,
  );
  assert.equal(lookup.mock.callCount(), 1);
});

test("无筛选保持课程范围，非法班级参数在查询前拒绝", async (t) => {
  const lookup = mockQuery(t, prisma.classroom, "findFirst", async () => {
    throw new Error("不应查询数据库");
  });
  assert.equal(await getTeacherCourseClassroom("teacher-a", "course-a"), null);
  await assert.rejects(
    getTeacherCourseClassroom("teacher-a", "course-a", "invalid"),
    ResourceNotFoundError,
  );
  await assert.rejects(
    getTeacherCourseClassroom("teacher-a", "course-a", [classroomId]),
    ResourceNotFoundError,
  );
  assert.equal(lookup.mock.callCount(), 0);
});

test("所选班级无台账时保持该班级空台账，不返回其他班级台账", async (t) => {
  mockQuery(t, prisma.course, "findFirst", async () => ({
    id: "course-a",
    currentPublishedAssessmentSchemeId: null,
  }));
  mockQuery(t, prisma.classroom, "findFirst", async () => ({
    id: classroomId,
    name: "二班",
    status: "ACTIVE",
  }));
  mockQuery(t, prisma.classroom, "findMany", async (args: unknown) => {
    assert.ok(JSON.stringify(args).includes(`"id":"${classroomId}"`));
    return [
      {
        id: classroomId,
        name: "二班",
        status: "ACTIVE",
        _count: { memberships: 0 },
      },
    ];
  });
  mockQuery(t, prisma.courseGradebook, "findMany", async (args: unknown) => {
    assert.ok(JSON.stringify(args).includes(`"classroomId":"${classroomId}"`));
    return [];
  });
  const result = await getTeacherGradebookOverview(
    "teacher-a",
    "course-a",
    classroomId,
  );
  assert.deepEqual(result.gradebooks, []);
  assert.deepEqual(
    result.classrooms.map((item) => item.id),
    [classroomId],
  );
});
