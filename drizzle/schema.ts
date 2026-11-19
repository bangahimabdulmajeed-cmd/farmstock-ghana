import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  datetime,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

import type { CropType as SharedCropType } from "../shared/crops";

/** Crop types supported across listings, prices and benchmarks. */
export const CROP_TYPES = [
  "maize",
  "cocoa",
  "cassava",
  "plantain",
  "rice",
  "tomato",
  "pepper",
  "groundnut",
  "shea",
  "other",
] as const;

export type CropType = (typeof CROP_TYPES)[number];

// Compile-time guard: this list and shared/crops.ts must not drift apart.
const _CROP_PARITY: readonly SharedCropType[] = CROP_TYPES;

/**
 * Core user table backing auth flow.
 * Extended with role-based fields for farmers and investors.
 */
export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    phoneNumber: varchar("phoneNumber", { length: 20 }).unique(),
    role: mysqlEnum("role", ["user", "admin", "farmer", "investor"]).default("user").notNull(),
    loginMethod: varchar("loginMethod", { length: 64 }),

    // OTP verification fields
    otpCode: varchar("otpCode", { length: 6 }),
    otpExpiresAt: timestamp("otpExpiresAt"),
    otpAttempts: int("otpAttempts").default(0).notNull(),
    isPhoneVerified: boolean("isPhoneVerified").default(false),

    // Profile fields
    location: text("location"), // District/Region in Ghana
    profileImage: text("profileImage"), // CDN URL
    bio: text("bio"),
    bankAccountName: text("bankAccountName"),
    bankAccountNumber: varchar("bankAccountNumber", { length: 50 }),
    bankName: varchar("bankName", { length: 100 }),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => [index("idx_users_role").on(table.role)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Produce listings created by farmers
 */
export const produceListing = mysqlTable(
  "produceListing",
  {
    id: int("id").autoincrement().primaryKey(),
    farmerId: int("farmerId").notNull(),

    // Produce details
    cropType: mysqlEnum("cropType", CROP_TYPES).notNull(),
    cropName: varchar("cropName", { length: 100 }).notNull(),
    description: text("description"),

    // Investment details
    totalQuantity: decimal("totalQuantity", { precision: 10, scale: 2 }).notNull(), // in kg
    quantityUnit: varchar("quantityUnit", { length: 20 }).default("kg"),
    // How many kg of produce one share represents: totalQuantity / totalShares.
    // This is what makes a share fungible and lets us value it against market prices.
    kgPerShare: decimal("kgPerShare", { precision: 12, scale: 6 }),
    pricePerShare: decimal("pricePerShare", { precision: 10, scale: 2 }).notNull(), // GH¢
    totalShares: int("totalShares").notNull(),
    sharesAvailable: int("sharesAvailable").notNull(),
    sharesSold: int("sharesSold").default(0),

    // Harvest information
    harvestDate: datetime("harvestDate").notNull(),
    location: text("location").notNull(), // District/Region

    // Funding progress
    fundingStatus: mysqlEnum("fundingStatus", ["active", "fully_funded", "harvested", "completed", "cancelled"])
      .default("active")
      .notNull(),
    fundedAmount: decimal("fundedAmount", { precision: 15, scale: 2 }).default("0"),

    // Exit options configuration
    exitOptions: json("exitOptions").$type<{
      cashPayout: boolean;
      physicalDelivery: boolean;
      shareTrading: boolean;
    }>(),

    // Images
    images: json("images").$type<string[]>(), // Array of CDN URLs

    // Harvest & payout tracking
    harvestStatus: mysqlEnum("harvestStatus", ["pending", "in_progress", "completed"]).default("pending"),
    payoutStatus: mysqlEnum("payoutStatus", ["pending", "processing", "completed"]).default("pending"),
    payoutDate: datetime("payoutDate"),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("idx_listing_farmer").on(table.farmerId),
    index("idx_listing_status").on(table.fundingStatus, table.createdAt),
    index("idx_listing_crop").on(table.cropType),
  ],
);

export type ProduceListing = typeof produceListing.$inferSelect;
export type InsertProduceListing = typeof produceListing.$inferInsert;

/**
 * Investment records - tracks share purchases by investors
 */
export const investment = mysqlTable(
  "investment",
  {
    id: int("id").autoincrement().primaryKey(),
    investorId: int("investorId").notNull(),
    produceListingId: int("produceListingId").notNull(),

    // Share details
    sharesOwned: int("sharesOwned").notNull(),
    sharePrice: decimal("sharePrice", { precision: 10, scale: 2 }).notNull(), // GH¢ per share at purchase
    pricePerKgAtPurchase: decimal("pricePerKgAtPurchase", { precision: 12, scale: 4 }), // GH¢/kg implied at purchase
    totalInvestment: decimal("totalInvestment", { precision: 15, scale: 2 }).notNull(), // GH¢

    // Exit option chosen
    exitOption: mysqlEnum("exitOption", ["cash_payout", "physical_delivery", "share_trading"]).notNull(),

    // Status tracking
    status: mysqlEnum("status", ["active", "pending_payout", "completed", "cancelled"]).default("active").notNull(),
    payoutReceived: boolean("payoutReceived").default(false),
    payoutAmount: decimal("payoutAmount", { precision: 15, scale: 2 }),
    payoutDate: datetime("payoutDate"),

    // Shares moved out of this lot via the peer-to-peer marketplace
    sharesTransferred: int("sharesTransferred").default(0).notNull(),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("idx_investment_investor").on(table.investorId, table.createdAt),
    index("idx_investment_listing").on(table.produceListingId),
  ],
);

export type Investment = typeof investment.$inferSelect;
export type InsertInvestment = typeof investment.$inferInsert;

/**
 * Peer-to-peer share marketplace
 */
export const shareMarketplace = mysqlTable(
  "shareMarketplace",
  {
    id: int("id").autoincrement().primaryKey(),
    sellerId: int("sellerId").notNull(),
    investmentId: int("investmentId").notNull(), // Original investment

    // Listing details
    sharesForSale: int("sharesForSale").notNull(),
    pricePerShare: decimal("pricePerShare", { precision: 10, scale: 2 }).notNull(), // GH¢
    totalPrice: decimal("totalPrice", { precision: 15, scale: 2 }).notNull(), // GH¢

    // Status
    status: mysqlEnum("status", ["active", "sold", "cancelled"]).default("active").notNull(),
    sharesSold: int("sharesSold").default(0),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("idx_marketplace_seller").on(table.sellerId),
    index("idx_marketplace_status").on(table.status, table.createdAt),
    index("idx_marketplace_investment").on(table.investmentId),
  ],
);

export type ShareMarketplace = typeof shareMarketplace.$inferSelect;
export type InsertShareMarketplace = typeof shareMarketplace.$inferInsert;

/**
 * Marketplace transactions - when investors buy shares from other investors
 */
export const marketplaceTransaction = mysqlTable(
  "marketplaceTransaction",
  {
    id: int("id").autoincrement().primaryKey(),
    buyerId: int("buyerId").notNull(),
    sellerId: int("sellerId"),
    marketplaceListingId: int("marketplaceListingId").notNull(),
    buyerInvestmentId: int("buyerInvestmentId"),
    sellerInvestmentId: int("sellerInvestmentId"),

    // Transaction details
    sharesPurchased: int("sharesPurchased").notNull(),
    pricePerShare: decimal("pricePerShare", { precision: 10, scale: 2 }).notNull(), // GH¢
    totalAmount: decimal("totalAmount", { precision: 15, scale: 2 }).notNull(), // GH¢

    // Status
    status: mysqlEnum("status", ["completed", "pending", "cancelled"]).default("pending").notNull(),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("idx_marketplace_tx_buyer").on(table.buyerId), index("idx_marketplace_tx_listing").on(table.marketplaceListingId)],
);

export type MarketplaceTransaction = typeof marketplaceTransaction.$inferSelect;
export type InsertMarketplaceTransaction = typeof marketplaceTransaction.$inferInsert;

/**
 * Transaction history for all financial activities
 */
export const transaction = mysqlTable(
  "transaction",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),

    // Transaction details
    type: mysqlEnum("type", ["share_purchase", "marketplace_purchase", "payout", "refund"]).notNull(),
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(), // GH¢
    currency: varchar("currency", { length: 3 }).default("GHS"),

    // Reference
    produceListingId: int("produceListingId"),
    investmentId: int("investmentId"),
    marketplaceListingId: int("marketplaceListingId"),

    // Status
    status: mysqlEnum("status", ["pending", "completed", "failed"]).default("pending").notNull(),
    description: text("description"),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("idx_transaction_user").on(table.userId, table.createdAt), index("idx_transaction_type").on(table.type)],
);

export type Transaction = typeof transaction.$inferSelect;
export type InsertTransaction = typeof transaction.$inferInsert;

/**
 * Payout requests from investors
 */
export const payoutRequest = mysqlTable(
  "payoutRequest",
  {
    id: int("id").autoincrement().primaryKey(),
    investorId: int("investorId").notNull(),
    investmentId: int("investmentId").notNull(),

    // Payout details
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(), // GH¢
    payoutType: mysqlEnum("payoutType", ["cash", "physical_delivery"]).notNull(),
    // Market value of the underlying produce at the time of the request (GH¢)
    valuationAmount: decimal("valuationAmount", { precision: 15, scale: 2 }),
    pricePerKgAtRequest: decimal("pricePerKgAtRequest", { precision: 12, scale: 4 }),
    quantityKg: decimal("quantityKg", { precision: 12, scale: 3 }),

    // Status
    status: mysqlEnum("status", ["pending", "approved", "processing", "completed", "rejected"])
      .default("pending")
      .notNull(),
    reviewedBy: int("reviewedBy"),
    reviewedAt: datetime("reviewedAt"),
    rejectionReason: text("rejectionReason"),

    // Physical delivery details (if applicable)
    deliveryAddress: text("deliveryAddress"),
    deliveryPhone: varchar("deliveryPhone", { length: 20 }),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("idx_payout_investor").on(table.investorId, table.createdAt),
    index("idx_payout_status").on(table.status),
    // A given investment can only have one open payout request at a time.
    uniqueIndex("uq_payout_open_investment").on(table.investmentId, table.status),
  ],
);

export type PayoutRequest = typeof payoutRequest.$inferSelect;
export type InsertPayoutRequest = typeof payoutRequest.$inferInsert;

/**
 * Harvest updates from farmers
 */
export const harvestUpdate = mysqlTable(
  "harvestUpdate",
  {
    id: int("id").autoincrement().primaryKey(),
    produceListingId: int("produceListingId").notNull(),
    farmerId: int("farmerId").notNull(),

    // Update details
    status: mysqlEnum("status", ["in_progress", "completed", "delayed"]).notNull(),
    description: text("description"),
    images: json("images").$type<string[]>(), // CDN URLs

    // Actual harvest details
    actualQuantity: decimal("actualQuantity", { precision: 10, scale: 2 }),
    harvestDate: datetime("harvestDate"),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("idx_harvest_listing").on(table.produceListingId, table.createdAt)],
);

export type HarvestUpdate = typeof harvestUpdate.$inferSelect;
export type InsertHarvestUpdate = typeof harvestUpdate.$inferInsert;

/**
 * Observed commodity prices.
 *
 * `scope: "global"` rows are written by the price service from exchange benchmark
 * data (CBOT / ICE futures) and are normalised to GH¢ per kg using the USD/GHS
 * rate at observation time. `scope: "national"` rows are Ghana market prices
 * entered by an operator (the country has no free public farmgate price API),
 * and can later be fed by an Esoko / GCX adapter without changing consumers.
 */
export const commodityPrice = mysqlTable(
  "commodityPrice",
  {
    id: int("id").autoincrement().primaryKey(),
    cropType: mysqlEnum("cropType", CROP_TYPES).notNull(),
    scope: mysqlEnum("scope", ["global", "national"]).notNull(),
    // "CBOT", "ICE", or a Ghana market name such as "Kumasi Central"
    market: varchar("market", { length: 100 }).notNull(),

    // Normalised price used by the app for valuation
    pricePerKgGhs: decimal("pricePerKgGhs", { precision: 12, scale: 4 }).notNull(),

    // Original quote, kept so the number can be audited
    priceNative: decimal("priceNative", { precision: 15, scale: 4 }),
    nativeCurrency: varchar("nativeCurrency", { length: 8 }),
    nativeUnit: varchar("nativeUnit", { length: 24 }),
    fxRateGhsPerUsd: decimal("fxRateGhsPerUsd", { precision: 12, scale: 4 }),

    source: varchar("source", { length: 64 }).notNull(),
    sourceSymbol: varchar("sourceSymbol", { length: 32 }),

    observedAt: datetime("observedAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("uq_price_point").on(table.cropType, table.scope, table.market, table.observedAt),
    index("idx_price_lookup").on(table.cropType, table.scope, table.observedAt),
  ],
);

export type CommodityPrice = typeof commodityPrice.$inferSelect;
export type InsertCommodityPrice = typeof commodityPrice.$inferInsert;
