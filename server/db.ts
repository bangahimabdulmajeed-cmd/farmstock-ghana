import { eq, and, or, like, desc, asc, gte, lte, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { readFileSync } from "node:fs";
import { 
  InsertUser, 
  users, 
  produceListing, 
  investment, 
  transaction,
  shareMarketplace,
  marketplaceTransaction,
  payoutRequest,
  harvestUpdate,
  commodityPrice,
  InsertCommodityPrice,
  CommodityPrice,
  ProduceListing,
  Investment,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

function getInsertId(result: unknown): number | null {
  if (result && typeof result === "object" && "insertId" in result) {
    const insertId = Number((result as { insertId?: unknown }).insertId);
    return Number.isFinite(insertId) && insertId > 0 ? insertId : null;
  }

  if (Array.isArray(result) && result[0] && typeof result[0] === "object" && "insertId" in result[0]) {
    const insertId = Number((result[0] as { insertId?: unknown }).insertId);
    return Number.isFinite(insertId) && insertId > 0 ? insertId : null;
  }

  return null;
}

/**
 * Turn a DATABASE_URL into explicit mysql2 options.
 *
 * TiDB connection strings hand you `?ssl={"rejectUnauthorized":true}`. Passed
 * through naively that stays a string, and the driver either ignores it (silent
 * plaintext attempt) or throws. Parsing it here, and defaulting to TLS for any
 * tidbcloud.com host, makes the documented TiDB string work as-is.
 */
function connectionConfigFromUrl(url: string) {
  const parsed = new URL(url);
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

  // TiDB's console offers a downloadable CA bundle. Only needed when the
  // platform certificate is not in the system trust store (in which case Node
  // raises UNABLE_TO_VERIFY_LEAF_SIGNATURE).
  const caPath = process.env.DATABASE_CA_CERT;
  if (ssl && caPath) {
    try {
      ssl = { ...ssl, ca: readFileSync(caPath, "utf8") };
    } catch (error) {
      console.warn(`[Database] Could not read DATABASE_CA_CERT at ${caPath}:`, error);
    }
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || undefined,
    ssl,
    connectionLimit: 10,
  };
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(createPool(connectionConfigFromUrl(process.env.DATABASE_URL)));
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "phoneNumber", "location", "profileImage", "bio", "bankAccountName", "bankAccountNumber", "bankName"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByPhoneNumber(phoneNumber: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Produce Listing queries
export async function createProduceListing(data: typeof produceListing.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(produceListing).values(data);
  const insertId = getInsertId(result);
  if (!insertId) throw new Error("Failed to determine created listing id");

  const created = await getProduceListingById(insertId);
  if (!created) throw new Error("Created listing could not be loaded");
  return created;
}

export async function getProduceListingById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(produceListing).where(eq(produceListing.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getProduceListingsByFarmerId(farmerId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(produceListing).where(eq(produceListing.farmerId, farmerId)).orderBy(desc(produceListing.createdAt));
}

export async function getActiveProduceListings(limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(produceListing)
    .where(eq(produceListing.fundingStatus, "active"))
    .orderBy(desc(produceListing.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function updateProduceListing(id: number, data: Partial<typeof produceListing.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.update(produceListing).set(data).where(eq(produceListing.id, id));
}

// Investment queries
export async function createInvestment(data: typeof investment.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(investment).values(data);
  const insertId = getInsertId(result);
  if (!insertId) throw new Error("Failed to determine created investment id");

  const created = await getInvestmentById(insertId);
  if (!created) throw new Error("Created investment could not be loaded");
  return created;
}

export async function getInvestmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(investment).where(eq(investment.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getInvestmentsByInvestorId(investorId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select({ investment, produceListing })
    .from(investment)
    .leftJoin(produceListing, eq(investment.produceListingId, produceListing.id))
    .where(eq(investment.investorId, investorId))
    .orderBy(desc(investment.createdAt));
}

export async function getInvestmentsByProduceListingId(produceListingId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(investment)
    .where(eq(investment.produceListingId, produceListingId));
}

// Transaction queries
export async function createTransaction(data: typeof transaction.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.insert(transaction).values(data);
}

export async function getTransactionsByUserId(userId: number, limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(transaction)
    .where(eq(transaction.userId, userId))
    .orderBy(desc(transaction.createdAt))
    .limit(limit)
    .offset(offset);
}

// Share Marketplace queries
export async function createShareMarketplaceListing(data: typeof shareMarketplace.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(shareMarketplace).values(data);
  const insertId = getInsertId(result);
  if (!insertId) throw new Error("Failed to determine created marketplace listing id");

  const created = await getShareMarketplaceListingById(insertId);
  if (!created) throw new Error("Created marketplace listing could not be loaded");
  return created;
}

export async function getShareMarketplaceListings(limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(shareMarketplace)
    .where(eq(shareMarketplace.status, "active"))
    .orderBy(desc(shareMarketplace.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getShareMarketplaceListingById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(shareMarketplace).where(eq(shareMarketplace.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateShareMarketplaceListing(id: number, data: Partial<typeof shareMarketplace.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.update(shareMarketplace).set(data).where(eq(shareMarketplace.id, id));
}

// Marketplace Transaction queries
export async function createMarketplaceTransaction(data: typeof marketplaceTransaction.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(marketplaceTransaction).values(data);
  const insertId = getInsertId(result);
  if (!insertId) throw new Error("Failed to determine created marketplace transaction id");

  const created = await db
    .select()
    .from(marketplaceTransaction)
    .where(eq(marketplaceTransaction.id, insertId))
    .limit(1);
  if (!created[0]) throw new Error("Created marketplace transaction could not be loaded");
  return created[0];
}

export async function getMarketplaceTransactionsByBuyerId(buyerId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(marketplaceTransaction)
    .where(eq(marketplaceTransaction.buyerId, buyerId))
    .orderBy(desc(marketplaceTransaction.createdAt));
}

// Payout Request queries
export async function createPayoutRequest(data: typeof payoutRequest.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(payoutRequest).values(data);
  const insertId = getInsertId(result);
  if (!insertId) throw new Error("Failed to determine created payout request id");

  const created = await getPayoutRequestById(insertId);
  if (!created) throw new Error("Created payout request could not be loaded");
  return created;
}

export async function getPayoutRequestsByInvestorId(investorId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(payoutRequest)
    .where(eq(payoutRequest.investorId, investorId))
    .orderBy(desc(payoutRequest.createdAt));
}

export async function getPayoutRequestById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(payoutRequest).where(eq(payoutRequest.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updatePayoutRequest(id: number, data: Partial<typeof payoutRequest.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.update(payoutRequest).set(data).where(eq(payoutRequest.id, id));
}

// Harvest Update queries
export async function createHarvestUpdate(data: typeof harvestUpdate.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(harvestUpdate).values(data);
  const insertId = getInsertId(result);
  if (!insertId) throw new Error("Failed to determine created harvest update id");

  const created = await db
    .select()
    .from(harvestUpdate)
    .where(eq(harvestUpdate.id, insertId))
    .limit(1);
  if (!created[0]) throw new Error("Created harvest update could not be loaded");
  return created[0];
}

export async function getHarvestUpdatesByProduceListingId(produceListingId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(harvestUpdate)
    .where(eq(harvestUpdate.produceListingId, produceListingId))
    .orderBy(desc(harvestUpdate.createdAt));
}

// ---------------------------------------------------------------------------
// Commodity prices
// ---------------------------------------------------------------------------

export async function insertPricePointsIgnore(rows: InsertCommodityPrice[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(commodityPrice).values(rows).ignore();
}

export async function deleteGlobalPricePointsSince(cropType: CommodityPrice["cropType"], since: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(commodityPrice)
    .where(
      and(eq(commodityPrice.cropType, cropType), eq(commodityPrice.scope, "global"), gte(commodityPrice.observedAt, since)),
    );
}

/**
 * Most recent observation per crop for a given scope.
 * TiDB in this deployment cannot be assumed to support window functions across
 * versions, so the newest-first scan is de-duplicated in JS. The row count is
 * bounded, and only the latest per crop is returned.
 */
export async function getLatestPriceByCrop(scope: "global" | "national"): Promise<CommodityPrice[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(commodityPrice)
    .where(eq(commodityPrice.scope, scope))
    .orderBy(desc(commodityPrice.observedAt))
    .limit(500);

  const seen = new Set<string>();
  const latest: CommodityPrice[] = [];
  for (const row of rows) {
    if (seen.has(row.cropType)) continue;
    seen.add(row.cropType);
    latest.push(row);
  }
  return latest;
}

export async function getPriceHistory(
  cropType: CommodityPrice["cropType"],
  scope: "global" | "national",
  days = 90,
): Promise<Array<{ observedAt: Date; pricePerKgGhs: number; market: string; scope: string }>> {
  const db = await getDb();
  if (!db) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(commodityPrice)
    .where(and(eq(commodityPrice.cropType, cropType), eq(commodityPrice.scope, scope), gte(commodityPrice.observedAt, since)))
    .orderBy(asc(commodityPrice.observedAt))
    .limit(400);

  return rows.map(row => ({
    observedAt: row.observedAt,
    pricePerKgGhs: Number(row.pricePerKgGhs),
    market: row.market,
    scope: row.scope,
  }));
}

/** Operator-entered Ghana market price. Same day + market overwrites in place. */
export async function upsertNationalPrice(data: InsertCommodityPrice): Promise<CommodityPrice | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .insert(commodityPrice)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        pricePerKgGhs: data.pricePerKgGhs,
        priceNative: data.priceNative ?? null,
        source: data.source,
        fxRateGhsPerUsd: data.fxRateGhsPerUsd ?? null,
      },
    });

  // Read back the newest row for this market rather than matching the exact
  // datetime value, which is sensitive to driver timezone conversion.
  const [row] = await db
    .select()
    .from(commodityPrice)
    .where(
      and(
        eq(commodityPrice.cropType, data.cropType),
        eq(commodityPrice.scope, "national"),
        eq(commodityPrice.market, data.market),
      ),
    )
    .orderBy(desc(commodityPrice.observedAt))
    .limit(1);

  return row;
}

// ---------------------------------------------------------------------------
// Atomic money operations
//
// The original implementation read a row, checked it in JS, then wrote back a
// value computed from that stale read. Two concurrent requests could both pass
// the check and oversell the same shares. Everything below runs inside a real
// transaction, uses conditional UPDATE ... WHERE guards + affected-row checks,
// and locks the rows it reads with SELECT ... FOR UPDATE.
// ---------------------------------------------------------------------------

export type FailureCode =
  | "NOT_FOUND"
  | "NOT_ACTIVE"
  | "INSUFFICIENT_SHARES"
  | "SELF_PURCHASE"
  | "NOT_OWNER"
  | "INVALID_STATE"
  | "EXIT_OPTION_MISMATCH"
  | "DUPLICATE_PAYOUT"
  | "DB_UNAVAILABLE"
  | "CONFLICT";

export type Failure = { ok: false; code: FailureCode; message: string };

class Rollback extends Error {
  failure: Failure;
  constructor(failure: Failure) {
    super(failure.message);
    this.failure = failure;
  }
}

function affectedRows(result: unknown): number {
  if (Array.isArray(result)) {
    const header = result[0] as { affectedRows?: number } | undefined;
    return header?.affectedRows ?? 0;
  }
  return (result as { affectedRows?: number } | null)?.affectedRows ?? 0;
}

function kgPerShareFor(listing: Pick<ProduceListing, "kgPerShare" | "totalQuantity" | "totalShares">): number | null {
  if (listing.kgPerShare) {
    const stored = Number(listing.kgPerShare);
    if (Number.isFinite(stored) && stored > 0) return stored;
  }
  const quantity = Number(listing.totalQuantity);
  const shares = Number(listing.totalShares);
  if (!Number.isFinite(quantity) || !Number.isFinite(shares) || shares <= 0) return null;
  return quantity / shares;
}

export type PurchaseResult = Failure | {
  ok: true;
  investmentId: number;
  amountGhs: number;
  sharesAvailable: number;
  fundingStatus: string;
};

export async function purchaseSharesAtomic(input: {
  investorId: number;
  produceListingId: number;
  shareQuantity: number;
  exitOption: "cash_payout" | "physical_delivery" | "share_trading";
}): Promise<PurchaseResult> {
  const db = await getDb();
  if (!db) return { ok: false, code: "DB_UNAVAILABLE", message: "Database is not available" };

  try {
    return await db.transaction(async tx => {
      const [listing] = await tx
        .select()
        .from(produceListing)
        .where(eq(produceListing.id, input.produceListingId))
        .for("update");

      if (!listing) throw new Rollback({ ok: false, code: "NOT_FOUND", message: "Listing not found" });
      if (listing.fundingStatus !== "active") {
        throw new Rollback({ ok: false, code: "NOT_ACTIVE", message: "This listing is no longer accepting investments" });
      }
      if (listing.farmerId === input.investorId) {
        throw new Rollback({ ok: false, code: "SELF_PURCHASE", message: "You cannot invest in your own listing" });
      }
      if (listing.sharesAvailable < input.shareQuantity) {
        throw new Rollback({
          ok: false,
          code: "INSUFFICIENT_SHARES",
          message: `Only ${listing.sharesAvailable} share(s) left on this listing`,
        });
      }

      const amount = Number(listing.pricePerShare) * input.shareQuantity;
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Rollback({ ok: false, code: "INVALID_STATE", message: "Listing has an invalid share price" });
      }

      const updated = await tx
        .update(produceListing)
        .set({
          sharesAvailable: sql`${produceListing.sharesAvailable} - ${input.shareQuantity}`,
          sharesSold: sql`coalesce(${produceListing.sharesSold}, 0) + ${input.shareQuantity}`,
          fundedAmount: sql`coalesce(${produceListing.fundedAmount}, 0) + ${amount.toFixed(2)}`,
        })
        .where(
          and(eq(produceListing.id, listing.id), gte(produceListing.sharesAvailable, input.shareQuantity)),
        );

      if (affectedRows(updated) !== 1) {
        throw new Rollback({
          ok: false,
          code: "INSUFFICIENT_SHARES",
          message: "Not enough shares available",
        });
      }

      const [after] = await tx
        .select({ sharesAvailable: produceListing.sharesAvailable })
        .from(produceListing)
        .where(eq(produceListing.id, listing.id));

      const remaining = after?.sharesAvailable ?? 0;
      if (remaining <= 0) {
        await tx.update(produceListing).set({ fundingStatus: "fully_funded" }).where(eq(produceListing.id, listing.id));
      }

      const kgPerShare = kgPerShareFor(listing);
      const pricePerKgAtPurchase = kgPerShare !== null && kgPerShare > 0 ? amount / (kgPerShare * input.shareQuantity) : null;

      const inserted = await tx.insert(investment).values({
        investorId: input.investorId,
        produceListingId: listing.id,
        sharesOwned: input.shareQuantity,
        sharePrice: listing.pricePerShare,
        totalInvestment: amount.toFixed(2),
        pricePerKgAtPurchase: pricePerKgAtPurchase !== null ? pricePerKgAtPurchase.toFixed(4) : null,
        exitOption: input.exitOption,
        status: "active",
      });
      const investmentId = getInsertId(inserted);
      if (!investmentId) throw new Rollback({ ok: false, code: "CONFLICT", message: "Could not record the investment" });

      await tx.insert(transaction).values({
        userId: input.investorId,
        type: "share_purchase",
        amount: amount.toFixed(2),
        status: "completed",
        produceListingId: listing.id,
        investmentId,
        description: `Purchased ${input.shareQuantity} shares of ${listing.cropName}`,
      });

      return {
        ok: true as const,
        investmentId,
        amountGhs: amount,
        sharesAvailable: remaining,
        fundingStatus: remaining <= 0 ? "fully_funded" : "active",
      };
    });
  } catch (error) {
    if (error instanceof Rollback) return error.failure;
    console.error("[db] purchaseSharesAtomic failed:", error);
    return { ok: false, code: "CONFLICT", message: "Could not complete the purchase" };
  }
}

export type BuySharesResult = Failure | {
  ok: true;
  transactionId: number;
  buyerInvestmentId: number;
  amountGhs: number;
};

/**
 * Peer-to-peer transfer. The original code moved money but left the seller's
 * investment untouched and never created anything for the buyer, so the buyer
 * paid and received nothing. This moves ownership as part of the same
 * transaction.
 */
export async function buySharesAtomic(input: {
  buyerId: number;
  marketplaceListingId: number;
  shareQuantity: number;
}): Promise<BuySharesResult> {
  const db = await getDb();
  if (!db) return { ok: false, code: "DB_UNAVAILABLE", message: "Database is not available" };

  try {
    return await db.transaction(async tx => {
      const [listing] = await tx
        .select()
        .from(shareMarketplace)
        .where(eq(shareMarketplace.id, input.marketplaceListingId))
        .for("update");

      if (!listing) throw new Rollback({ ok: false, code: "NOT_FOUND", message: "Marketplace listing not found" });
      if (listing.status !== "active") {
        throw new Rollback({ ok: false, code: "NOT_ACTIVE", message: "This listing is no longer available" });
      }
      if (listing.sellerId === input.buyerId) {
        throw new Rollback({ ok: false, code: "SELF_PURCHASE", message: "You cannot buy your own listing" });
      }
      if (listing.sharesForSale < input.shareQuantity) {
        throw new Rollback({
          ok: false,
          code: "INSUFFICIENT_SHARES",
          message: `Only ${listing.sharesForSale} share(s) available on this listing`,
        });
      }

      const [sellerLot] = await tx
        .select()
        .from(investment)
        .where(eq(investment.id, listing.investmentId))
        .for("update");

      if (!sellerLot) {
        throw new Rollback({ ok: false, code: "INVALID_STATE", message: "The underlying investment is missing" });
      }
      if (sellerLot.sharesOwned < input.shareQuantity) {
        throw new Rollback({
          ok: false,
          code: "INSUFFICIENT_SHARES",
          message: "The seller no longer holds enough shares",
        });
      }

      const amount = Number(listing.pricePerShare) * input.shareQuantity;
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Rollback({ ok: false, code: "INVALID_STATE", message: "Listing has an invalid price" });
      }

      const sellerRemaining = sellerLot.sharesOwned - input.shareQuantity;
      const sellerUpdated = await tx
        .update(investment)
        .set({
          sharesOwned: sql`${investment.sharesOwned} - ${input.shareQuantity}`,
          sharesTransferred: sql`coalesce(${investment.sharesTransferred}, 0) + ${input.shareQuantity}`,
          status: sellerRemaining <= 0 ? "completed" : "active",
        })
        .where(and(eq(investment.id, sellerLot.id), gte(investment.sharesOwned, input.shareQuantity)));

      if (affectedRows(sellerUpdated) !== 1) {
        throw new Rollback({ ok: false, code: "CONFLICT", message: "Could not transfer the shares, please retry" });
      }

      const [produce] = await tx
        .select()
        .from(produceListing)
        .where(eq(produceListing.id, sellerLot.produceListingId))
        .limit(1);

      const kgPerShare = produce ? kgPerShareFor(produce) : null;
      const pricePerKg = kgPerShare !== null && kgPerShare > 0 ? amount / (kgPerShare * input.shareQuantity) : null;

      // The buyer gets a real lot, at the p2p price they paid.
      const buyerInsert = await tx.insert(investment).values({
        investorId: input.buyerId,
        produceListingId: sellerLot.produceListingId,
        sharesOwned: input.shareQuantity,
        sharePrice: listing.pricePerShare,
        totalInvestment: amount.toFixed(2),
        pricePerKgAtPurchase: pricePerKg !== null ? pricePerKg.toFixed(4) : null,
        exitOption: "share_trading",
        status: "active",
      });
      const buyerInvestmentId = getInsertId(buyerInsert);
      if (!buyerInvestmentId) {
        throw new Rollback({ ok: false, code: "CONFLICT", message: "Could not record the buyer's shares" });
      }

      const remaining = listing.sharesForSale - input.shareQuantity;
      const marketUpdated = await tx
        .update(shareMarketplace)
        .set({
          sharesForSale: sql`${shareMarketplace.sharesForSale} - ${input.shareQuantity}`,
          sharesSold: sql`coalesce(${shareMarketplace.sharesSold}, 0) + ${input.shareQuantity}`,
          status: remaining <= 0 ? "sold" : "active",
        })
        .where(and(eq(shareMarketplace.id, listing.id), gte(shareMarketplace.sharesForSale, input.shareQuantity)));

      if (affectedRows(marketUpdated) !== 1) {
        throw new Rollback({ ok: false, code: "CONFLICT", message: "Could not update the marketplace listing" });
      }

      const txInsert = await tx.insert(marketplaceTransaction).values({
        buyerId: input.buyerId,
        sellerId: listing.sellerId,
        marketplaceListingId: listing.id,
        buyerInvestmentId,
        sellerInvestmentId: sellerLot.id,
        sharesPurchased: input.shareQuantity,
        pricePerShare: listing.pricePerShare,
        totalAmount: amount.toFixed(2),
        status: "completed",
      });
      const transactionId = getInsertId(txInsert);
      if (!transactionId) {
        throw new Rollback({ ok: false, code: "CONFLICT", message: "Could not record the marketplace transaction" });
      }

      await tx.insert(transaction).values({
        userId: input.buyerId,
        type: "marketplace_purchase",
        amount: amount.toFixed(2),
        marketplaceListingId: listing.id,
        investmentId: buyerInvestmentId,
        status: "completed",
        description: `Bought ${input.shareQuantity} share(s) from the marketplace`,
      });

      // The seller's proceeds are a real ledger entry, so their history is complete.
      await tx.insert(transaction).values({
        userId: listing.sellerId,
        type: "payout",
        amount: amount.toFixed(2),
        marketplaceListingId: listing.id,
        investmentId: sellerLot.id,
        status: "completed",
        description: `Sold ${input.shareQuantity} share(s) on the marketplace`,
      });

      return { ok: true as const, transactionId, buyerInvestmentId, amountGhs: amount };
    });
  } catch (error) {
    if (error instanceof Rollback) return error.failure;
    console.error("[db] buySharesAtomic failed:", error);
    return { ok: false, code: "CONFLICT", message: "Could not complete the purchase" };
  }
}

export type RequestPayoutResult = Failure | {
  ok: true;
  payoutId: number;
  amountGhs: number;
  valuationAmount: number | null;
  quantityKg: number | null;
};

/**
 * One open payout per investment. The investment moves to `pending_payout`
 * inside the same transaction, which is what stops the original
 * unlimited-repeat-payout bug.
 */
export async function requestPayoutAtomic(input: {
  investorId: number;
  investmentId: number;
  payoutType: "cash" | "physical_delivery";
  deliveryAddress?: string;
  deliveryPhone?: string;
  pricePerKgGhs: number | null;
  priceSource?: string | null;
}): Promise<RequestPayoutResult> {
  const db = await getDb();
  if (!db) return { ok: false, code: "DB_UNAVAILABLE", message: "Database is not available" };

  try {
    return await db.transaction(async tx => {
      const [lot] = await tx.select().from(investment).where(eq(investment.id, input.investmentId)).for("update");

      if (!lot) throw new Rollback({ ok: false, code: "NOT_FOUND", message: "Investment not found" });
      if (lot.investorId !== input.investorId) {
        throw new Rollback({ ok: false, code: "NOT_OWNER", message: "You can only request a payout for your own investment" });
      }
      if (lot.status !== "active") {
        throw new Rollback({
          ok: false,
          code: "INVALID_STATE",
          message: "This investment is not available for payout, it may already be pending or settled",
        });
      }

      // The exit option the investor bought is a contract, not a suggestion.
      const allowed =
        input.payoutType === "cash"
          ? lot.exitOption === "cash_payout" || lot.exitOption === "share_trading"
          : lot.exitOption === "physical_delivery";
      if (!allowed) {
        throw new Rollback({
          ok: false,
          code: "EXIT_OPTION_MISMATCH",
          message:
            input.payoutType === "cash"
              ? "This investment was bought for physical delivery and cannot be cashed out"
              : "This investment was bought for a cash payout and cannot be taken as physical delivery",
        });
      }

      const [open] = await tx
        .select({ id: payoutRequest.id })
        .from(payoutRequest)
        .where(
          and(
            eq(payoutRequest.investmentId, lot.id),
            inArray(payoutRequest.status, ["pending", "approved", "processing"]),
          ),
        )
        .limit(1);
      if (open) {
        throw new Rollback({
          ok: false,
          code: "DUPLICATE_PAYOUT",
          message: "A payout request for this investment is already in progress",
        });
      }

      const [produce] = await tx
        .select()
        .from(produceListing)
        .where(eq(produceListing.id, lot.produceListingId))
        .limit(1);

      const kgPerShare = produce ? kgPerShareFor(produce) : null;
      const quantityKg = kgPerShare !== null ? kgPerShare * lot.sharesOwned : null;
      const marketValue =
        quantityKg !== null && input.pricePerKgGhs !== null ? quantityKg * input.pricePerKgGhs : null;

      const costBasis = Number(lot.totalInvestment) || 0;
      const amount = marketValue ?? costBasis;

      const inserted = await tx.insert(payoutRequest).values({
        investorId: lot.investorId,
        investmentId: lot.id,
        amount: amount.toFixed(2),
        payoutType: input.payoutType,
        valuationAmount: marketValue !== null ? marketValue.toFixed(2) : null,
        pricePerKgAtRequest: input.pricePerKgGhs !== null ? input.pricePerKgGhs.toFixed(4) : null,
        quantityKg: quantityKg !== null ? quantityKg.toFixed(3) : null,
        status: "pending",
        deliveryAddress: input.deliveryAddress ?? null,
        deliveryPhone: input.deliveryPhone ?? null,
      });
      const payoutId = getInsertId(inserted);
      if (!payoutId) throw new Rollback({ ok: false, code: "CONFLICT", message: "Could not create the payout request" });

      await tx.update(investment).set({ status: "pending_payout" }).where(eq(investment.id, lot.id));

      return {
        ok: true as const,
        payoutId,
        amountGhs: amount,
        valuationAmount: marketValue,
        quantityKg,
      };
    });
  } catch (error) {
    if (error instanceof Rollback) return error.failure;
    if (error instanceof Error && /Duplicate entry/i.test(error.message)) {
      return { ok: false, code: "DUPLICATE_PAYOUT", message: "A payout request for this investment is already in progress" };
    }
    console.error("[db] requestPayoutAtomic failed:", error);
    return { ok: false, code: "CONFLICT", message: "Could not submit the payout request" };
  }
}

export type ResolvePayoutResult = Failure | { ok: true; status: string };

/** Operator decisions on a payout request, with the ledger entry written on completion. */
export async function resolvePayoutAtomic(input: {
  adminId: number;
  payoutId: number;
  action: "approve" | "reject" | "complete";
  reason?: string;
}): Promise<ResolvePayoutResult> {
  const db = await getDb();
  if (!db) return { ok: false, code: "DB_UNAVAILABLE", message: "Database is not available" };

  try {
    return await db.transaction(async tx => {
      const [payout] = await tx.select().from(payoutRequest).where(eq(payoutRequest.id, input.payoutId)).for("update");
      if (!payout) throw new Rollback({ ok: false, code: "NOT_FOUND", message: "Payout request not found" });

      const nextStatus = input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "completed";

      const legal =
        (input.action === "approve" && payout.status === "pending") ||
        (input.action === "reject" && ["pending", "approved"].includes(payout.status)) ||
        (input.action === "complete" && payout.status === "approved");
      if (!legal) {
        throw new Rollback({
          ok: false,
          code: "INVALID_STATE",
          message: `Cannot ${input.action} a payout that is ${payout.status}`,
        });
      }

      await tx
        .update(payoutRequest)
        .set({
          status: nextStatus,
          reviewedBy: input.adminId,
          reviewedAt: new Date(),
          rejectionReason: input.action === "reject" ? input.reason ?? "Not specified" : null,
        })
        .where(eq(payoutRequest.id, payout.id));

      if (input.action === "reject") {
        await tx.update(investment).set({ status: "active" }).where(eq(investment.id, payout.investmentId));
      }

      if (input.action === "complete") {
        await tx
          .update(investment)
          .set({
            status: "completed",
            payoutReceived: true,
            payoutAmount: payout.amount,
            payoutDate: new Date(),
          })
          .where(eq(investment.id, payout.investmentId));

        await tx.insert(transaction).values({
          userId: payout.investorId,
          type: "payout",
          amount: payout.amount,
          status: "completed",
          investmentId: payout.investmentId,
          description: `Payout settled (${payout.payoutType})`,
        });
      }

      return { ok: true as const, status: nextStatus };
    });
  } catch (error) {
    if (error instanceof Rollback) return error.failure;
    console.error("[db] resolvePayoutAtomic failed:", error);
    return { ok: false, code: "CONFLICT", message: "Could not update the payout request" };
  }
}

/** Shares already escrowed on the marketplace for a lot, so it cannot be double-listed. */
export async function getActiveListedShares(investmentId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const rows = await db
    .select({ sharesForSale: shareMarketplace.sharesForSale })
    .from(shareMarketplace)
    .where(and(eq(shareMarketplace.investmentId, investmentId), eq(shareMarketplace.status, "active")));

  return rows.reduce((sum, row) => sum + (Number(row.sharesForSale) || 0), 0);
}

export async function getPortfolioRows(investorId: number) {
  return getInvestmentsByInvestorId(investorId);
}

// ---------------------------------------------------------------------------
// Small user + listing helpers
// ---------------------------------------------------------------------------

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}

export async function setUserRole(userId: number, role: "user" | "farmer" | "investor" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function setPhoneVerified(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ isPhoneVerified: true }).where(eq(users.id, userId));
}

export async function searchActiveProduceListings(input: {
  limit: number;
  offset: number;
  cropType?: ProduceListing["cropType"];
  search?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  const filters = [eq(produceListing.fundingStatus, "active")];
  if (input.cropType) filters.push(eq(produceListing.cropType, input.cropType));
  const term = input.search?.trim();
  if (term) {
    const pattern = `%${term}%`;
    const match = or(like(produceListing.cropName, pattern), like(produceListing.location, pattern));
    if (match) filters.push(match);
  }

  return db
    .select()
    .from(produceListing)
    .where(and(...filters))
    .orderBy(desc(produceListing.createdAt))
    .limit(input.limit)
    .offset(input.offset);
}

export async function getShareMarketplaceListingsBySeller(sellerId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(shareMarketplace)
    .where(eq(shareMarketplace.sellerId, sellerId))
    .orderBy(desc(shareMarketplace.createdAt));
}

/** Marketplace listings enriched with the underlying produce, for the browse UI. */
export async function getShareMarketplaceListingsDetailed(limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      marketplace: shareMarketplace,
      investment: investment,
      listing: produceListing,
    })
    .from(shareMarketplace)
    .leftJoin(investment, eq(shareMarketplace.investmentId, investment.id))
    .leftJoin(produceListing, eq(investment.produceListingId, produceListing.id))
    .where(eq(shareMarketplace.status, "active"))
    .orderBy(desc(shareMarketplace.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map(row => ({
    id: row.marketplace.id,
    sellerId: row.marketplace.sellerId,
    investmentId: row.marketplace.investmentId,
    sharesForSale: row.marketplace.sharesForSale,
    sharesSold: row.marketplace.sharesSold,
    pricePerShare: row.marketplace.pricePerShare,
    totalPrice: row.marketplace.totalPrice,
    status: row.marketplace.status,
    createdAt: row.marketplace.createdAt,
    produceListingId: row.listing?.id ?? null,
    cropName: row.listing?.cropName ?? null,
    cropType: row.listing?.cropType ?? null,
    location: row.listing?.location ?? null,
    harvestDate: row.listing?.harvestDate ?? null,
    kgPerShare: row.listing?.kgPerShare ?? null,
    originalSharePrice: row.investment?.sharePrice ?? null,
  }));
}

export async function listPayoutRequests(input: {
  status?: "pending" | "approved" | "processing" | "completed" | "rejected";
  limit?: number;
} = {}) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      payout: payoutRequest,
      user: users,
      listing: produceListing,
    })
    .from(payoutRequest)
    .leftJoin(users, eq(payoutRequest.investorId, users.id))
    .leftJoin(investment, eq(payoutRequest.investmentId, investment.id))
    .leftJoin(produceListing, eq(investment.produceListingId, produceListing.id))
    .where(input.status ? eq(payoutRequest.status, input.status) : undefined)
    .orderBy(desc(payoutRequest.createdAt))
    .limit(input.limit ?? 100);

  return rows.map(row => ({
    ...row.payout,
    investorName: row.user?.name ?? null,
    investorPhone: row.user?.phoneNumber ?? null,
    cropName: row.listing?.cropName ?? null,
  }));
}
