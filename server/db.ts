import { eq, and, desc, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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
  return result;
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

  return await db.insert(investment).values(data);
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
    .select()
    .from(investment)
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

  return await db.insert(shareMarketplace).values(data);
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

  return await db.insert(marketplaceTransaction).values(data);
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

  return await db.insert(payoutRequest).values(data);
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

  return await db.insert(harvestUpdate).values(data);
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
