const dateKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const clock = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const monthDay = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "long",
  day: "numeric",
});

const fullDate = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  dateStyle: "medium",
  timeStyle: "short",
});

function dayOffset(date: Date, now: Date) {
  const [year, month, day] = dateKey.format(date).split("-").map(Number);
  const [nowYear, nowMonth, nowDay] = dateKey
    .format(now)
    .split("-")
    .map(Number);
  const target = Date.UTC(year, month - 1, day);
  const base = Date.UTC(nowYear, nowMonth - 1, nowDay);
  return Math.round((target - base) / 86_400_000);
}

/** 列表用的相对时间：今天/明天只在 7 天内出现，其余给具体日期。 */
export function formatExamMoment(date: Date, now: Date) {
  const offset = dayOffset(date, now);
  if (offset === 0) return `今天 ${clock.format(date)}`;
  if (offset === 1) return `明天 ${clock.format(date)}`;
  if (offset === -1) return `昨天 ${clock.format(date)}`;
  if (offset > 1 && offset <= 6)
    return `${offset} 天后 ${monthDay.format(date)} ${clock.format(date)}`;
  return `${monthDay.format(date)} ${clock.format(date)}`;
}

/** 完整时间，用于 title 与详情页。 */
export function formatExamFullTime(date: Date) {
  return fullDate.format(date);
}

export function examDurationMinutes(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

export function formatExamWindow(start: Date, end: Date, now: Date) {
  if (dateKey.format(start) === dateKey.format(end))
    return `${formatExamMoment(start, now)}–${clock.format(end)}`;
  return `${formatExamMoment(start, now)} – ${formatExamMoment(end, now)}`;
}

/**
 * 学期键：9 月—次年 1 月为秋季学期，2—7 月为春季学期，8 月并入当年秋季。
 * 用开考时间推导，避免依赖课程 `term` 字段是否填写。
 */
export function examTermKey(date: Date) {
  const [year, month] = dateKey.format(date).split("-").map(Number);
  if (month === 1) return `${year - 1}-秋`;
  if (month >= 2 && month <= 7) return `${year}-春`;
  return `${year}-秋`;
}

export function examTermLabel(date: Date) {
  const [year, season] = examTermKey(date).split("-");
  return `${year} 学年${season === "春" ? "春季" : "秋季"}学期`;
}
