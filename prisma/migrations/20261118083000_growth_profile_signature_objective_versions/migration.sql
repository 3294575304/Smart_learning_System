-- 画像快照增加廉价失效签名，避免每次读页面都重算掌握度
ALTER TABLE "LearnerProfileSnapshot"
    ADD COLUMN "sourceSignature" CHAR(64);

-- 知识点—目标映射绑定大纲版本，重发大纲后可识别并重建
ALTER TABLE "ConceptObjectiveLink"
    ADD COLUMN "syllabusStructureId" TEXT;

CREATE INDEX "ConceptObjectiveLink_courseId_syllabusStructureId_idx"
    ON "ConceptObjectiveLink"("courseId", "syllabusStructureId");

ALTER TABLE "ConceptObjectiveLink"
    ADD CONSTRAINT "ConceptObjectiveLink_syllabusStructureId_fkey"
    FOREIGN KEY ("syllabusStructureId") REFERENCES "PublishedSyllabusStructure"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
