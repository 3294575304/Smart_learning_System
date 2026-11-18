import { StudentBackLink } from "@/components/dashboard/student-back-link";
import { withAssignmentTaskReturn } from "@/services/student-experience/activity-query";
import {
  studentTaskHref,
  type StudentTaskScope,
} from "@/services/student-experience/task-scope";

export function StudentAssignmentListBackLink({
  scope,
  returnTo,
}: {
  scope: StudentTaskScope;
  returnTo?: string;
}) {
  return (
    <StudentBackLink
      href={withAssignmentTaskReturn(
        studentTaskHref("/student/assignments", scope),
        returnTo,
      )}
    >
      返回作业列表
    </StudentBackLink>
  );
}
