/**
 * 规则版本变更记录：
 * - v1：出勤 + 客观掌握度两维。
 * - v2：接入活跃度（LearningEvent 近 14 天）、自我反思（已确认自述）、
 *   编程判题（ProgrammingAttempt 汇总）。历史快照的指纹与口径不同，
 *   不可与 v2 直接比较，UI 已标注。
 */
export const LEARNER_PROFILE_RULE_VERSION = "learner-profile-v2";
export const CONCLUSIVE_EVIDENCE_COUNT = 3;
/** 活跃度统计窗口：只描述「最近」，不做累计勤勉分。 */
export const ACTIVITY_WINDOW_DAYS = 14;
