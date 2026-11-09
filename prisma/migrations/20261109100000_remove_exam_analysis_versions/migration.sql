-- Historical exam analysis snapshots are intentionally removed. Back up the
-- database and record SELECT COUNT(*) FROM "ExamAnalysis" before deployment.
-- A rollback requires restoring this table from that backup; current grades
-- cannot reconstruct the original versions.
DROP TABLE "ExamAnalysis";
