-- 课程分类目录增加课程号：可空以兼容存量分类；不自动回填（同一分类可能对应多个历史课程号）。
ALTER TABLE "QuestionCourseCategory" ADD COLUMN "courseNo" VARCHAR(50);

-- 同校课程号唯一：仅约束「已归属学校 + 已填课程号」的行。
-- 与 Course_active_teacherId_courseNo_term_key 同属业务部分唯一索引，
-- 故意不写入 schema.prisma，请勿对本项目执行 prisma db pull（会覆盖 schema）。
CREATE UNIQUE INDEX "QuestionCourseCategory_schoolId_courseNo_key"
ON "QuestionCourseCategory"("schoolId", "courseNo")
WHERE "courseNo" IS NOT NULL AND "schoolId" IS NOT NULL;
