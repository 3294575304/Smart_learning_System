import { StudentBackLink } from "@/components/dashboard/student-back-link";
import {
  studentTaskHref,
  type StudentTaskScope,
} from "@/services/student-experience/task-scope";

/**
 * 问卷详情的返回入口。
 *
 * 之前这里误用了 `StudentAssignmentListBackLink`，导致学生从「课程问卷」点进来，
 * 左上角写的却是「返回作业列表」——面包屑指错了模块。问卷与作业是两个平行列表，
 * 各自回到各自的列表。
 */
export function StudentSurveyListBackLink({
  scope,
}: {
  scope: StudentTaskScope;
}) {
  return (
    <StudentBackLink href={studentTaskHref("/student/surveys", scope)}>
      返回课程问卷
    </StudentBackLink>
  );
}
