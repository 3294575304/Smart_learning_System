import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("个人中心位于右上角并与通知入口并列", async () => {
  const source = await readFile(
    new URL("../../components/dashboard/dashboard-shell.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /accountMenuOpen/u);
  assert.match(source, /aria-label="账号菜单"/u);
  assert.match(source, /aria-expanded=\{accountMenuOpen\}/u);
  assert.match(source, /aria-haspopup="dialog"/u);
  assert.match(source, /setAccountMenuOpen\(\(open\) => !open\)/u);
  assert.match(source, /event\.key === "Escape"/u);
  assert.match(source, /LogoutButton/u);
  assert.match(source, /className="ml-auto flex items-center gap-2"/u);
  assert.match(source, /aria-label=\{`\$\{userName\}个人中心`\}/u);
  assert.match(source, /top-\[calc\(100%\+0\.5rem\)\] right-0/u);
  assert.doesNotMatch(source, /max-w-52 text-right text-sm/u);
  assert.doesNotMatch(source, /bottom-\[calc\(100%\+0\.5rem\)\]/u);
});

test("学生从个人中心菜单打开加入班级窗口", async () => {
  const [shell, studentHome, studentCourses] = await Promise.all([
    readFile(
      new URL(
        "../../components/dashboard/dashboard-shell.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../../app/(protected)/student/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../app/(protected)/student/courses/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(shell, /user\.role === Role\.STUDENT/u);
  assert.match(shell, /joinClassroomDialogOpen/u);
  assert.match(shell, /setJoinClassroomDialogOpen\(true\)/u);
  assert.match(shell, /aria-label="加入班级窗口"/u);
  assert.match(shell, /inputId="join-classroom-dialog-code"/u);
  assert.match(shell, /<JoinClassroomForm/u);
  assert.doesNotMatch(studentHome, /JoinClassroomForm|加入班级/u);
  assert.doesNotMatch(studentCourses, /JoinClassroomForm/u);
  assert.match(studentCourses, /从右上角个人中心输入教师提供的邀请码/u);
});
