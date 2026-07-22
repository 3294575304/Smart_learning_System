export function logNotificationFailure(event: string, sourceId: string): void {
  console.error(
    JSON.stringify({
      level: "error",
      event: "notification_write_failed",
      notificationEvent: event,
      sourceId,
    }),
  );
}
