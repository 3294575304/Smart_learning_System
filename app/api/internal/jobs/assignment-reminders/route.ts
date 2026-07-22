import { apiError, apiSuccess } from "@/lib/api-response";
import {
  assertNotificationJobRequest,
  NotificationJobAuthenticationError,
} from "@/services/notifications/job-auth";
import { runAssignmentDueReminders } from "@/services/notifications/reminders";

export async function POST(request: Request) {
  try {
    assertNotificationJobRequest(request);
    return apiSuccess(await runAssignmentDueReminders());
  } catch (error: unknown) {
    if (error instanceof NotificationJobAuthenticationError) {
      return apiError(error.message, error.status);
    }
    console.error("Assignment reminder job failed");
    return apiError("截止提醒任务执行失败", 500);
  }
}
