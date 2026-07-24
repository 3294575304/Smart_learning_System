const PRODUCTION_ENVIRONMENTS = new Set(["production"]);
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const PRODUCTION_TARGET_PATTERN =
  /(^|[^a-z0-9])(prod|production|stage|staging)([^a-z0-9]|$)/iu;
const SAFE_DATABASE_NAME_PATTERN =
  /(^|[^a-z0-9])(dev|development|local|test|demo)([^a-z0-9]|$)/iu;

function environmentValue(
  environment: Record<string, string | undefined>,
  name: string,
): string {
  return environment[name]?.trim().toLowerCase() ?? "";
}

function parseDatabaseUrl(databaseUrl: string): URL {
  try {
    return new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }
}

function normalizedDatabaseName(parsedUrl: URL): string {
  return decodeURIComponent(parsedUrl.pathname.replace(/^\/+/u, ""));
}

export function assertSafeSeedDatabase(
  environment: Record<string, string | undefined> = process.env,
): void {
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before running demo seed.");
  }

  const nodeEnv = environmentValue(environment, "NODE_ENV");
  const vercelEnv = environmentValue(environment, "VERCEL_ENV");
  if (
    PRODUCTION_ENVIRONMENTS.has(nodeEnv) ||
    PRODUCTION_ENVIRONMENTS.has(vercelEnv)
  ) {
    throw new Error("Refusing to run demo seed in a production environment.");
  }

  const parsedUrl = parseDatabaseUrl(databaseUrl);
  if (!["postgresql:", "postgres:"].includes(parsedUrl.protocol)) {
    throw new Error("DATABASE_URL must use PostgreSQL for demo seed.");
  }

  const host = parsedUrl.hostname.toLowerCase();
  const databaseName = normalizedDatabaseName(parsedUrl).toLowerCase();
  const schemaName = parsedUrl.searchParams.get("schema")?.toLowerCase() ?? "";
  const targetLabel = `${host} ${databaseName} ${schemaName}`;

  if (PRODUCTION_TARGET_PATTERN.test(targetLabel)) {
    throw new Error(
      "Refusing to run demo seed against a production or staging target.",
    );
  }

  if (
    !LOCAL_DATABASE_HOSTS.has(host) &&
    !SAFE_DATABASE_NAME_PATTERN.test(databaseName)
  ) {
    throw new Error(
      "Refusing to run demo seed against a remote database without a dev, local, test, or demo database name.",
    );
  }
}
