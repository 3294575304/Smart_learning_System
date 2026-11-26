-- 课程模板绑定课程封面（封面库见 lib/course-covers.ts）
-- 现有模板统一先落 engineering，再按模板名称做一次可审查的回填；
-- 回填只改 coverKey，不触碰其它字段，需要回滚时把该列改回 'engineering' 或移除列即可。

ALTER TABLE "CourseTemplate"
  ADD COLUMN "coverKey" VARCHAR(32) NOT NULL DEFAULT 'engineering';

UPDATE "CourseTemplate"
SET "coverKey" = CASE
  WHEN "name" ~ '(数学|物理|化学|生物|复变|积分|概率|统计|实验|电路|力学)'
    THEN 'science'
  WHEN "name" ~ '(语文|历史|哲学|文学|写作|法学|法律|经济|管理|马克思)'
    THEN 'humanities'
  WHEN "name" ~ '(英语|思政|体育|通识|公共|军事|心理健康)'
    THEN 'general'
  ELSE 'engineering'
END;
