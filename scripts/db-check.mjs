/**
 * Schema doctor.
 *
 *   pnpm db:check
 *
 * Connects with the same parsing/SSL rules as the app and reports what is
 * actually in the database versus what the code expects. Run this when a query
 * fails with "unknown column" or "table doesn't exist": it distinguishes a
 * migration that never ran from one that ran against a different database.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  console.error("Run this from the project root, with .env present (it is loaded below).");
  process.exit(1);
}

function credentialsFromUrl(raw) {
  const parsed = new URL(raw);
  const isTiDbCloud = parsed.hostname.endsWith("tidbcloud.com");

  let ssl;
  const sslParam = parsed.searchParams.get("ssl");
  if (sslParam) {
    try {
      const decoded = JSON.parse(sslParam);
      ssl = typeof decoded === "object" && decoded !== null ? decoded : { rejectUnauthorized: true };
    } catch {
      ssl = { rejectUnauthorized: true };
    }
  } else if (isTiDbCloud) {
    ssl = { minVersion: "TLSv1.2", rejectUnauthorized: true };
  }

  if (ssl && process.env.DATABASE_CA_CERT) {
    try {
      ssl = { ...ssl, ca: readFileSync(process.env.DATABASE_CA_CERT, "utf8") };
    } catch {
      /* system trust store */
    }
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

const expected = {
  users: ["phoneNumber", "otpAttempts", "isPhoneVerified", "role"],
  produceListing: ["kgPerShare", "sharesAvailable", "fundedAmount"],
  investment: ["pricePerKgAtPurchase", "sharesTransferred"],
  shareMarketplace: ["sharesForSale"],
  marketplaceTransaction: ["sellerId", "buyerInvestmentId"],
  payoutRequest: ["valuationAmount", "reviewedBy"],
  harvestUpdate: ["actualQuantity"],
  commodityPrice: ["pricePerKgGhs", "observedAt"],
};

const config = credentialsFromUrl(url);
console.log(`host:     ${config.host}:${config.port}`);
console.log(`database: ${config.database}`);
console.log("");

let connection;
try {
  connection = await mysql.createConnection(config);
} catch (error) {
  console.error("Could not connect to the database.");
  console.error(`  code:    ${error.code ?? "-"}`);
  console.error(`  message: ${error.sqlMessage ?? error.message}`);
  if (error.code === "ER_ACCESS_DENIED_ERROR") {
    console.error("  -> wrong password, or the password was regenerated in the TiDB console");
  }
  process.exit(1);
}

const [tableRows] = await connection.query("SHOW TABLES");
const tables = tableRows.map(row => Object.values(row)[0]);
console.log(`tables found (${tables.length}): ${tables.join(", ") || "(none)"}`);
console.log("");

let problems = 0;

for (const [table, columns] of Object.entries(expected)) {
  if (!tables.includes(table)) {
    console.log(`MISSING TABLE  ${table}`);
    problems++;
    continue;
  }

  const [columnRows] = await connection.query("SHOW COLUMNS FROM ??", [table]);
  const present = columnRows.map(row => row.Field);
  const missing = columns.filter(column => !present.includes(column));

  if (missing.length === 0) {
    console.log(`ok             ${table}`);
  } else {
    problems++;
    console.log(`MISSING COLUMN ${table}: ${missing.join(", ")}`);
  }
}

console.log("");

try {
  const [migrations] = await connection.query(
    "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at",
  );
  console.log(`applied migrations: ${migrations.length}`);
  for (const row of migrations) {
    const when = Number(row.created_at);
    console.log(`  #${row.id}  ${Number.isFinite(when) ? new Date(when).toISOString() : row.created_at}`);
  }
} catch {
  console.log("applied migrations: (no __drizzle_migrations table — nothing has been applied here)");
  problems++;
}

await connection.end();

console.log("");
if (problems === 0) {
  console.log("Schema looks correct.");
} else {
  console.log(`${problems} problem(s) found.`);
  console.log("If tables are missing: run `pnpm db:migrate` and read its output.");
  console.log("If the database name above is not the one you created: check DATABASE_URL.");
  process.exitCode = 1;
}
