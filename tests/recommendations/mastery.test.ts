import assert from "node:assert/strict";
import test from "node:test";

import { MasteryLevel, MasteryTrend, Prisma } from "@prisma/client";

import {
  calculateMasteryUpdate,
  masteryLevelFor,
} from "../../services/recommendations/mastery";

test("correct and incorrect recommendation answers update cumulative mastery", () => {
  const first = calculateMasteryUpdate(null, new Prisma.Decimal(1), true);
  assert.equal(first.answeredCount, 1);
  assert.equal(first.correctCount, 1);
  assert.equal(first.masteryScore.toNumber(), 100);
  assert.equal(first.level, MasteryLevel.MASTERED);
  assert.equal(first.trend, MasteryTrend.UP);

  const second = calculateMasteryUpdate(first, new Prisma.Decimal(1), false);
  assert.equal(second.answeredCount, 2);
  assert.equal(second.correctCount, 1);
  assert.equal(second.masteryScore.toNumber(), 50);
  assert.equal(second.level, MasteryLevel.DEVELOPING);
  assert.equal(second.trend, MasteryTrend.DOWN);
});

test("mastery score stays within zero and one hundred", () => {
  const over = calculateMasteryUpdate(
    {
      answeredCount: 1,
      correctCount: 1,
      earnedPoints: new Prisma.Decimal(5),
      availablePoints: new Prisma.Decimal(1),
      masteryScore: new Prisma.Decimal(100),
    },
    new Prisma.Decimal(1),
    true,
  );
  assert.equal(over.masteryScore.toNumber(), 100);

  const under = calculateMasteryUpdate(
    {
      answeredCount: 1,
      correctCount: 0,
      earnedPoints: new Prisma.Decimal(-1),
      availablePoints: new Prisma.Decimal(1),
      masteryScore: new Prisma.Decimal(0),
    },
    new Prisma.Decimal(1),
    false,
  );
  assert.equal(under.masteryScore.toNumber(), 0);
});

test("legacy mastery without point totals is bootstrapped from score and attempts", () => {
  const update = calculateMasteryUpdate(
    {
      answeredCount: 5,
      correctCount: 1,
      earnedPoints: new Prisma.Decimal(0),
      availablePoints: new Prisma.Decimal(0),
      masteryScore: new Prisma.Decimal(20),
    },
    new Prisma.Decimal(1),
    true,
  );
  assert.equal(update.availablePoints.toNumber(), 6);
  assert.equal(update.earnedPoints.toNumber(), 2);
  assert.equal(update.masteryScore.toNumber(), 33.33);
});

test("mastery levels use stable bounded thresholds", () => {
  assert.equal(masteryLevelFor(0, 0), MasteryLevel.NOT_STARTED);
  assert.equal(masteryLevelFor(39.99, 1), MasteryLevel.BEGINNER);
  assert.equal(masteryLevelFor(40, 1), MasteryLevel.DEVELOPING);
  assert.equal(masteryLevelFor(60, 1), MasteryLevel.PROFICIENT);
  assert.equal(masteryLevelFor(80, 1), MasteryLevel.MASTERED);
});
