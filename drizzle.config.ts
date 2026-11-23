import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

/**
 * TiDB hands out `?ssl={"rejectUnauthorized":true}` in its connection string.
 * drizzle-kit needs explicit credentials to apply it, so parse the URL here
 * rather than trusting it to infer TLS.
 */
function credentialsFromUrl(raw: string) {
  const parsed = new URL(raw);
  const isTiDbCloud = parsed.hostname.endsWith("tidbcloud.com");

  let ssl: Record<string, unknown> | undefined;
  const sslParam = parsed.searchParams.get("ssl");
  if (sslParam) {
    try {
      const decoded: unknown = JSON.parse(sslParam);
      ssl =
        typeof decoded === "object" && decoded !== null
          ? (decoded as Record<string, unknown>)
          : { rejectUnauthorized: true };
    } catch {
      ssl = { rejectUnauthorized: true };
    }
  } else if (isTiDbCloud) {
    ssl = { minVersion: "TLSv1.2", rejectUnauthorized: true };
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    ssl,
  };
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: credentialsFromUrl(connectionString),
});
