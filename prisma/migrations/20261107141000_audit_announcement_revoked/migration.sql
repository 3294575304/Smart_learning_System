-- 课程通知撤回需要独立审计动作，便于按「撤回」筛选操作记录。
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ANNOUNCEMENT_REVOKED';
