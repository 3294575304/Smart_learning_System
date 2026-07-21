import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

if (!process.env.RECOMMENDATION_INTEGRATION_SCHEMA) {
  throw new Error(
    "Recommendation integration tests must be started through npm run test:integration.",
  );
}

export const integrationPrisma = new PrismaClient();

export function testPrefix(label: string): string {
  return `it_${label.replace(/[^a-z0-9]/giu, "_")}_${randomUUID().replaceAll("-", "")}`;
}
