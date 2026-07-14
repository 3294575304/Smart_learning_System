import { apiError } from "@/lib/api-response";
import {
  getClassroomErrorStatus,
  getClassroomSafeErrorMessage,
} from "@/services/classrooms/errors";

export function classroomApiError(error: unknown) {
  const status = getClassroomErrorStatus(error);

  if (status === 500) {
    console.error("Classroom API request failed", error);
  }

  return apiError(getClassroomSafeErrorMessage(error), status);
}
