import assert from "node:assert/strict";
import test from "node:test";

import { isolatedDatabaseUrl, validateTestDatabaseUrl } from "./database";

const developmentUrl =
  "postgresql://developer:password@localhost:5432/smart_learning";

test("integration tests require an explicit PostgreSQL test database", () => {
  assert.throws(
    () => validateTestDatabaseUrl(undefined, developmentUrl),
    /TEST_DATABASE_URL is required/u,
  );
  assert.throws(
    () =>
      validateTestDatabaseUrl(
        "mysql://root:password@localhost/smart_learning_test",
        developmentUrl,
      ),
    /must use PostgreSQL/u,
  );
  assert.doesNotThrow(() =>
    validateTestDatabaseUrl(
      "postgresql://tester:password@localhost:5432/smart_learning_test",
      developmentUrl,
    ),
  );
});

test("integration tests reject development and obvious production targets", () => {
  assert.throws(
    () =>
      validateTestDatabaseUrl(
        "postgresql://other:password@localhost:5432/smart_learning",
        developmentUrl,
      ),
    /separate "test" marker/u,
  );
  assert.throws(
    () =>
      validateTestDatabaseUrl(
        "postgresql://other:password@localhost:5432/smart_learning_test",
        "postgresql://developer:password@localhost:5432/smart_learning_test",
      ),
    /same database/u,
  );
  assert.throws(
    () =>
      validateTestDatabaseUrl(
        "postgresql://tester:password@prod-db:5432/smart_learning_test",
        developmentUrl,
      ),
    /production or staging/u,
  );
  assert.throws(
    () =>
      validateTestDatabaseUrl(
        "postgresql://tester:password@localhost:5432/production_test",
        developmentUrl,
      ),
    /production or staging/u,
  );
});

test("isolated schemas are explicit and cannot be replaced with public", () => {
  const baseUrl = new URL(
    "postgresql://tester:password@localhost:5432/smart_learning_test?schema=public",
  );
  assert.match(
    isolatedDatabaseUrl(baseUrl, "http_it_1234_abcd"),
    /schema=http_it_1234_abcd/u,
  );
  assert.throws(
    () => isolatedDatabaseUrl(baseUrl, "public"),
    /Unsafe integration test schema/u,
  );
});
