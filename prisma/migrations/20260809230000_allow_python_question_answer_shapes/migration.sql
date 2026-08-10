-- Python programming answers are stored in immutable configuration revisions,
-- so the legacy scalar answer columns must remain empty on the question and
-- assignment snapshots.
BEGIN;

ALTER TABLE "Question"
DROP CONSTRAINT "Question_answer_shape_check";

ALTER TABLE "Question"
ADD CONSTRAINT "Question_answer_shape_check" CHECK (
  "status" <> 'ACTIVE'
  OR ("type" IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE') AND "correctBoolean" IS NULL AND "referenceAnswer" IS NULL AND cardinality("acceptableAnswers") = 0)
  OR ("type" = 'TRUE_FALSE' AND "correctBoolean" IS NOT NULL AND "referenceAnswer" IS NULL AND cardinality("acceptableAnswers") = 0)
  OR ("type" = 'FILL_BLANK' AND "correctBoolean" IS NULL AND "referenceAnswer" IS NULL AND cardinality("acceptableAnswers") > 0)
  OR ("type" = 'SHORT_ANSWER' AND "correctBoolean" IS NULL AND "referenceAnswer" IS NOT NULL AND cardinality("acceptableAnswers") = 0)
  OR ("type" = 'PYTHON_PROGRAMMING' AND "correctBoolean" IS NULL AND "referenceAnswer" IS NULL AND cardinality("acceptableAnswers") = 0)
);

ALTER TABLE "AssignmentQuestion"
DROP CONSTRAINT "AssignmentQuestion_answer_shape_check";

ALTER TABLE "AssignmentQuestion"
ADD CONSTRAINT "AssignmentQuestion_answer_shape_check" CHECK (
  ("typeSnapshot" IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE') AND "correctBooleanSnapshot" IS NULL AND "referenceAnswerSnapshot" IS NULL AND cardinality("acceptableAnswersSnapshot") = 0)
  OR ("typeSnapshot" = 'TRUE_FALSE' AND "correctBooleanSnapshot" IS NOT NULL AND "referenceAnswerSnapshot" IS NULL AND cardinality("acceptableAnswersSnapshot") = 0)
  OR ("typeSnapshot" = 'FILL_BLANK' AND "correctBooleanSnapshot" IS NULL AND "referenceAnswerSnapshot" IS NULL AND cardinality("acceptableAnswersSnapshot") > 0)
  OR ("typeSnapshot" = 'SHORT_ANSWER' AND "correctBooleanSnapshot" IS NULL AND "referenceAnswerSnapshot" IS NOT NULL AND cardinality("acceptableAnswersSnapshot") = 0)
  OR ("typeSnapshot" = 'PYTHON_PROGRAMMING' AND "correctBooleanSnapshot" IS NULL AND "referenceAnswerSnapshot" IS NULL AND cardinality("acceptableAnswersSnapshot") = 0)
);

COMMIT;
