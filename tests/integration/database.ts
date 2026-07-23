import { PrismaClient } from "@prisma/client";

const TEST_DATABASE_NAME_PATTERN = /(^|[^a-z0-9])test([^a-z0-9]|$)/iu;
const PRODUCTION_MARKER_PATTERN =
  /(^|[^a-z0-9])(prod|production|stage|staging)([^a-z0-9]|$)/iu;
const ISOLATED_SCHEMA_PATTERN = /^[a-z][a-z0-9_]*_it_[a-z0-9_]+$/u;

function databaseIdentity(value: string): string {
  const url = new URL(value);
  const port = url.port || "5432";
  return `${url.protocol}//${url.hostname.toLowerCase()}:${port}${url.pathname}`;
}

export function validateTestDatabaseUrl(
  value: string | undefined,
  developmentDatabaseUrl = process.env.DATABASE_URL,
): URL {
  if (!value) {
    throw new Error(
      "TEST_DATABASE_URL is required. Integration tests never fall back to DATABASE_URL.",
    );
  }

  const url = new URL(value);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("TEST_DATABASE_URL must use PostgreSQL.");
  }

  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!TEST_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      `Unsafe test database name "${databaseName}": use a dedicated database whose name contains a separate "test" marker.`,
    );
  }

  const targetLabel = `${url.hostname} ${databaseName}`;
  if (PRODUCTION_MARKER_PATTERN.test(targetLabel)) {
    throw new Error(
      "TEST_DATABASE_URL must not point to an obvious production or staging target.",
    );
  }

  if (
    developmentDatabaseUrl &&
    databaseIdentity(value) === databaseIdentity(developmentDatabaseUrl)
  ) {
    throw new Error(
      "TEST_DATABASE_URL must not point to the same database as DATABASE_URL.",
    );
  }

  return url;
}

export function isolatedDatabaseUrl(baseUrl: URL, schema: string): string {
  if (!ISOLATED_SCHEMA_PATTERN.test(schema)) {
    throw new Error(`Unsafe integration test schema name "${schema}".`);
  }

  const isolatedUrl = new URL(baseUrl);
  isolatedUrl.searchParams.set("schema", schema);
  return isolatedUrl.toString();
}

export function assertIsolatedIntegrationEnvironment(markerName: string): void {
  const schema = process.env[markerName];
  const databaseUrl = process.env.DATABASE_URL;
  if (!schema || !databaseUrl) {
    throw new Error(
      `HTTP integration tests must be started through the protected npm runner (${markerName} is missing).`,
    );
  }

  const url = new URL(databaseUrl);
  if (
    !ISOLATED_SCHEMA_PATTERN.test(schema) ||
    url.searchParams.get("schema") !== schema
  ) {
    throw new Error("Integration test database isolation is invalid.");
  }
}

export async function dropIsolatedSchema(
  baseUrl: URL,
  schema: string,
): Promise<void> {
  if (!ISOLATED_SCHEMA_PATTERN.test(schema)) {
    throw new Error(`Refusing to drop unsafe schema name "${schema}".`);
  }

  const cleanupUrl = new URL(baseUrl);
  cleanupUrl.searchParams.set("schema", "public");
  const cleanupClient = new PrismaClient({
    datasourceUrl: cleanupUrl.toString(),
  });

  try {
    await cleanupClient.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
    );
  } finally {
    await cleanupClient.$disconnect();
  }
}
