export const ASSIGNMENT_STATE_REVISION = "zhixue.assignment-state.revision";
export const TEACHER_WORKSPACE_DIRTY = "zhixue.teacher-workspace.dirty";
export function markTeacherWorkspaceDirty() {
  try {
    const revision = `${Date.now()}:${Math.random()}`;
    window.localStorage.setItem(TEACHER_WORKSPACE_DIRTY, revision);
    window.localStorage.setItem(ASSIGNMENT_STATE_REVISION, revision);
  } catch {
    /* Server revalidation still applies when storage is unavailable. */
  }
}
