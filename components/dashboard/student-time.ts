/**
 * 学生端首屏的时间文案。三处都在用同一套说法：
 * 页头"最近一次练习在 2 小时前"、任务行"明天 23:59 / 已逾期 1 天"、
 * 错题本"3 天前复习"。集中在这里，避免三个组件各写一套中文时间。
 */
const DAY = 86_400_000;

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const hourFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function shanghaiDay(date: Date) {
  return dayFormat.format(date);
}

/** 以"上海自然日"为单位算相差天数：今天 0、明天 1、昨天 -1。 */
export function dayOffset(target: Date, now: Date) {
  const [ty, tm, td] = shanghaiDay(target).split("-").map(Number);
  const [ny, nm, nd] = shanghaiDay(now).split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(ny, nm - 1, nd)) / DAY,
  );
}

export function clockTime(date: Date) {
  return hourFormat.format(date);
}

/** 截止时间：今天/明天/后天说相对日，其余说月日，都带时分。 */
export function dueLabel(date: Date, now: Date) {
  const offset = dayOffset(date, now);
  const clock = clockTime(date);
  if (offset === 0) return `今天 ${clock}`;
  if (offset === 1) return `明天 ${clock}`;
  if (offset === -1) return `昨天 ${clock}`;
  if (offset === 2) return `后天 ${clock}`;
  const [, month, day] = shanghaiDay(date).split("-");
  return `${Number(month)}-${day} ${clock}`;
}

export function overdueDays(date: Date, now: Date) {
  return Math.max(1, -dayOffset(date, now));
}

export function monthDay(date: Date) {
  const [, month, day] = shanghaiDay(date).split("-");
  return `${Number(month)}-${day}`;
}

/** "2 小时前 / 3 天前 / 刚刚"，超过一周给月日。 */
export function relativeTime(date: Date, now: Date) {
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - date.getTime()) / 60_000),
  );
  if (minutes < 2) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24 && dayOffset(date, now) === 0) return `${hours} 小时前`;
  const days = Math.max(1, -dayOffset(date, now));
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return monthDay(date);
}

export function greeting(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 13) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

/** 页头 kicker：周日 11-15。 */
export function kickerDate(now: Date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("weekday")} ${pick("month")}-${pick("day")}`.trim();
}
