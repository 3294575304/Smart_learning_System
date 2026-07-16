import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAccuracy,
  selectFrequentWrongQuestions,
} from "../../services/assignment-results/statistics";
import type { QuestionAccuracy } from "../../services/assignment-results/types";

function question(
  sortOrder: number,
  wrongCount: number,
  accuracy: number | null,
): QuestionAccuracy {
  return {
    assignmentQuestionId: `question-${sortOrder}`,
    sortOrder,
    title: `第 ${sortOrder} 题`,
    points: 10,
    judgedCount: 10,
    correctCount: 10 - wrongCount,
    wrongCount,
    accuracy,
  };
}

test("accuracy returns null for empty data and keeps two decimal places", () => {
  assert.equal(calculateAccuracy(0, 0), null);
  assert.equal(calculateAccuracy(2, 3), 66.67);
  assert.equal(calculateAccuracy(1.5, 2), 75);
});

test("frequent wrong questions ignore zero errors and sort deterministically", () => {
  const result = selectFrequentWrongQuestions([
    question(1, 0, 100),
    question(2, 3, 70),
    question(3, 4, 60),
    question(4, 3, 50),
  ]);
  assert.deepEqual(
    result.map((item) => item.sortOrder),
    [3, 4, 2],
  );
});

test("frequent wrong questions support an empty result and a result limit", () => {
  assert.deepEqual(selectFrequentWrongQuestions([question(1, 0, null)]), []);
  assert.equal(
    selectFrequentWrongQuestions([question(1, 3, 70), question(2, 2, 80)], 1)
      .length,
    1,
  );
});
