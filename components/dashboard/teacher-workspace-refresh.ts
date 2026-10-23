export const TEACHER_WORKSPACE_DIRTY = "zhixue.teacher-workspace.dirty";
export function markTeacherWorkspaceDirty() {
  try {
    window.localStorage.setItem(TEACHER_WORKSPACE_DIRTY, String(Date.now()));
  } catch {
    /* Server revalidation still applies when storage is unavailable. */
  }
}
