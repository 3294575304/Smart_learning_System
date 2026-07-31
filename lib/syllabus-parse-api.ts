import { apiError } from "@/lib/api-response";
import {
  syllabusParseErrorStatus,
  syllabusParseSafeMessage,
} from "@/services/syllabus-parsing/errors";

export function syllabusParseApiError(error: unknown) {
  const status = syllabusParseErrorStatus(error);
  if (status >= 500) {
    console.error("Syllabus parse API request failed", error);
  }
  return apiError(syllabusParseSafeMessage(error), status);
}
