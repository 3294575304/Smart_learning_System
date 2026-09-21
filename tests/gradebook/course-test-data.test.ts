import assert from "node:assert/strict";
import test from "node:test";
import { AttendanceStatus } from "@prisma/client";
import {
  classDates,
  gradeDefinitions,
  studentTestData,
  testDataId,
} from "../../scripts/course-test-data";
import { calculateAttendanceRate } from "../../services/attendance/calculation";

test("course fixtures are stable across roster ordering and contain all requested observations", () => {
  const original = studentTestData("student-001");
  studentTestData("student-002");
  assert.deepEqual(studentTestData("student-001"), original);
  assert.equal(original.attendance.length, 24);
  assert.equal(original.experiments.length, 8);
  assert.equal(original.assignments.length, 8);
  assert.equal(gradeDefinitions.length, 19);
  assert.equal(new Set(gradeDefinitions.map((d) => d.key)).size, 19);
  assert.match(testDataId("batch"), /^c[a-f0-9]{24}$/);
  assert.notEqual(testDataId("batch"), testDataId("other"));
});

test("96-student fixtures cover attendance variations and low/high bounded scores", () => {
  const students = Array.from({ length: 96 }, (_, i) =>
    studentTestData(`student-${i}`),
  );
  const statuses = new Set(students.flatMap((student) => student.attendance));
  assert.deepEqual(
    [...statuses].sort(),
    [
      AttendanceStatus.PRESENT,
      AttendanceStatus.ABSENT,
      AttendanceStatus.LEAVE,
      AttendanceStatus.LATE,
      AttendanceStatus.EARLY_LEAVE,
    ].sort(),
  );
  const scores = students.flatMap((s) => [
    ...s.experiments,
    ...s.assignments,
    s.midterm,
    s.final,
  ]);
  assert.equal(scores.length, 96 * 18);
  assert.ok(scores.every((s) => Number.isFinite(s) && s >= 0 && s <= 100));
  assert.ok(scores.some((s) => s < 60));
  assert.ok(scores.some((s) => s >= 90));
  for (const student of students)
    assert.notEqual(calculateAttendanceRate(student.attendance).rate, null);
});

test("class dates span 12 weeks with two classes per week and reject invalid dates", () => {
  const dates = classDates("2026-03-02");
  assert.equal(dates.length, 24);
  assert.equal(new Set(dates.map((d) => d.getTime())).size, 24);
  assert.equal(dates[0].toISOString(), "2026-03-02T00:00:00.000Z");
  assert.equal(dates[23].toISOString(), "2026-05-21T00:00:00.000Z");
  assert.throws(() => classDates("2026-02-30"));
  assert.throws(() => classDates("invalid"));
});
