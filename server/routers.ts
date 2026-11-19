import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { PriceDirection } from "@shared/prices";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { CROP_TYPES, type CropType, type ProduceListing, type User } from "../drizzle/schema";
import { createOrUpdateOTP, verifyOTP } from "./otp";
import { rateLimit } from "./rateLimit";
import * as db from "./db";
import {
  getPriceHistory,
  getPrices,
  getReferencePrice,
  kgPerShareOf,
  refreshGlobalPrices,
  valueHoldings,
} from "./prices/service";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const cropTypeSchema = z.enum(CROP_TYPES as unknown as [CropType, ...CropType[]]);

/** Never leak credentials or bank details through `auth.me`. */
function publicUser(user: User | null) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: user.role,
    isPhoneVerified: user.isPhoneVerified,
    location: user.location,
    profileImage: user.profileImage,
    bio: user.bio,
    loginMethod: user.loginMethod,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastSignedIn: user.lastSignedIn,
  };
}

const FAILURE_TO_TRPC: Record<db.FailureCode, TRPCError["code"]> = {
  NOT_FOUND: "NOT_FOUND",
  NOT_ACTIVE: "BAD_REQUEST",
  INSUFFICIENT_SHARES: "BAD_REQUEST",
  SELF_PURCHASE: "BAD_REQUEST",
  NOT_OWNER: "FORBIDDEN",
  INVALID_STATE: "BAD_REQUEST",
  EXIT_OPTION_MISMATCH: "BAD_REQUEST",
  DUPLICATE_PAYOUT: "CONFLICT",
  DB_UNAVAILABLE: "INTERNAL_SERVER_ERROR",
  CONFLICT: "CONFLICT",
};

/** Turn a data-layer failure into the matching tRPC error. */
function throwFailure(failure: db.Failure): never {
  throw new TRPCError({ code: FAILURE_TO_TRPC[failure.code] ?? "INTERNAL_SERVER_ERROR", message: failure.message });
}

function clientIp(req: { ip?: string; socket?: { remoteAddress?: string } } | undefined): string {
  return req?.ip ?? req?.socket?.remoteAddress ?? "unknown";
}

function assertPositiveInt(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${field} must be a whole number greater than zero` });
  }
  return value;
}

type ListingLike = {
  cropType: CropType;
  pricePerShare: string | number;
  kgPerShare?: string | number | null;
  totalQuantity: string | number;
  totalShares: number;
};

export type MarketContext = {
  pricePerKgGhs: number | null;
  /** GH¢ per kg implied by the listing's own price per share. */
  listedPricePerKgGhs: number | null;
  /** How the listing is priced versus today's market: positive means cheap. */
  appreciationPct: number | null;
  direction: PriceDirection;
  source: string | null;
  observedAt: string | null;
  basis: "national" | "global" | null;
};

/**
 * Attach live market context to listing rows so the UI can show whether a
 * share is trading above or below the underlying produce.
 */
async function withMarketContext<T extends ListingLike>(rows: T[]): Promise<Array<T & { market: MarketContext | null }>> {
  if (rows.length === 0) return [];

  let quotes: Awaited<ReturnType<typeof getPrices>>["quotes"] = [];
  try {
    quotes = (await getPrices()).quotes;
  } catch (error) {
    console.warn("[routers] price context unavailable:", error);
  }
  const byCrop = new Map(quotes.map(quote => [quote.cropType, quote]));

  return rows.map(row => {
    const quote = byCrop.get(row.cropType);
    const kgPerShare = kgPerShareOf(row as unknown as ProduceListing);
    const pricePerShare = Number(row.pricePerShare);
    const listedPricePerKgGhs =
      kgPerShare !== null && kgPerShare > 0 && Number.isFinite(pricePerShare) ? pricePerShare / kgPerShare : null;
    const marketPerKg = quote?.pricePerKgGhs ?? null;
    const appreciationPct =
      marketPerKg !== null && listedPricePerKgGhs !== null && listedPricePerKgGhs > 0
        ? ((marketPerKg - listedPricePerKgGhs) / listedPricePerKgGhs) * 100
        : null;

    return {
      ...row,
      market:
        quote && quote.pricePerKgGhs !== null
          ? {
              pricePerKgGhs: quote.pricePerKgGhs,
              listedPricePerKgGhs,
              appreciationPct,
              direction: appreciationPct === null ? "unknown" : appreciationPct > 0.01 ? "up" : appreciationPct < -0.01 ? "down" : "flat",
              source: quote.source,
              observedAt: quote.observedAt,
              basis: quote.basis,
            }
          : listedPricePerKgGhs !== null
            ? {
                pricePerKgGhs: null,
                listedPricePerKgGhs,
                appreciationPct: null,
                direction: "unknown",
                source: null,
                observedAt: null,
                basis: null,
              }
            : null,
    };
  });
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => publicUser(opts.ctx.user)),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),

    // OTP-based phone authentication
    requestOTP: publicProcedure
      .input(
        z.object({
          phoneNumber: z.string().regex(/^\+?[0-9]{10,15}$/, "Invalid phone number"),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const ip = clientIp(ctx.req);
        const byIp = rateLimit(`otp:ip:${ip}`, 10, 10 * 60_000);
        if (!byIp.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many verification requests. Try again in ${Math.ceil(byIp.retryAfterMs / 1000)}s.`,
          });
        }
        const byPhone = rateLimit(`otp:phone:${input.phoneNumber}`, 3, 10 * 60_000);
        if (!byPhone.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many codes requested for this number. Try again in ${Math.ceil(byPhone.retryAfterMs / 1000)}s.`,
          });
        }

        const result = await createOrUpdateOTP(input.phoneNumber);
        if (!result) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "Could not send a verification code right now. Please try again shortly.",
          });
        }

        // The code is ONLY echoed outside production. In production it is
        // delivered by SMS and must never appear in an API response.
        const isProduction = process.env.NODE_ENV === "production";

        return {
          success: true as const,
          message: "OTP sent to your phone number",
          expiresIn: 5 * 60,
          ...(isProduction ? {} : { demoOtp: result.otpCode }),
        };
      }),

    verifyOTPAndLogin: publicProcedure
      .input(
        z.object({
          phoneNumber: z.string().regex(/^\+?[0-9]{10,15}$/, "Invalid phone number"),
          otpCode: z.string().length(6, "OTP must be 6 digits"),
          userRole: z.enum(["farmer", "investor"]).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const byIp = rateLimit(`otp:verify:${clientIp(ctx.req)}`, 20, 10 * 60_000);
        if (!byIp.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many attempts. Try again in ${Math.ceil(byIp.retryAfterMs / 1000)}s.`,
          });
        }

        const otpResult = await verifyOTP(input.phoneNumber, input.otpCode);
        if (!otpResult.success || !otpResult.openId) {
          const message = otpResult.lockedOut
            ? "That code is no longer valid. Request a new one."
            : typeof otpResult.attemptsRemaining === "number"
              ? `Incorrect code. ${otpResult.attemptsRemaining} attempt(s) remaining.`
              : "Invalid or expired OTP";
          throw new TRPCError({ code: "UNAUTHORIZED", message });
        }

        let user = await db.getUserByPhoneNumber(input.phoneNumber);
        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }

        // New accounts pick their role once; an existing account keeps the role
        // it already has, so the client tab cannot change it.
        let roleChanged = false;
        if (input.userRole && user.role === "user") {
          await db.setUserRole(user.id, input.userRole);
          user = { ...user, role: input.userRole, isPhoneVerified: true };
          roleChanged = true;
        }

        if (!user.isPhoneVerified) {
          await db.setPhoneVerified(user.id);
          user = { ...user, isPhoneVerified: true };
        }

        const cookieOptions = getSessionCookieOptions(ctx.req);
        const { sdk } = await import("./_core/sdk");
        const sessionToken = await sdk.createSessionToken(otpResult.openId, {
          name: user.name || "OTP User",
          expiresInMs: ONE_YEAR_MS,
        });
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return {
          success: true as const,
          message: "Phone verified successfully",
          userId: user.id,
          phoneVerified: user.isPhoneVerified,
          role: user.role,
          roleChanged,
        };
      }),
  }),

  // -------------------------------------------------------------------------
  // Live + national commodity prices
  // -------------------------------------------------------------------------
  prices: router({
    /** Latest price per crop with change, sparkline and staleness flag. */
    getQuotes: publicProcedure.query(async () => {
      return getPrices();
    }),

    getHistory: publicProcedure
      .input(
        z.object({
          cropType: cropTypeSchema,
          days: z.number().int().min(7).max(365).default(90),
        }),
      )
      .query(async ({ input }) => {
        const points = await getPriceHistory(input.cropType, input.days);
        return points.map(point => ({
          observedAt: point.observedAt,
          pricePerKgGhs: point.pricePerKgGhs,
          market: point.market,
          scope: point.scope,
        }));
      }),

    /** Valuation of one listing: what a share costs versus what the produce is worth. */
    getListingValuation: publicProcedure
      .input(z.object({ listingId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const listing = await db.getProduceListingById(input.listingId);
        if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });

        const reference = await getReferencePrice(listing.cropType);
        const kgPerShare = kgPerShareOf(listing);
        const pricePerShare = Number(listing.pricePerShare);
        const listedPricePerKgGhs =
          kgPerShare !== null && kgPerShare > 0 ? pricePerShare / kgPerShare : null;
        const appreciationPct =
          reference.pricePerKgGhs !== null && listedPricePerKgGhs !== null && listedPricePerKgGhs > 0
            ? ((reference.pricePerKgGhs - listedPricePerKgGhs) / listedPricePerKgGhs) * 100
            : null;

        return {
          listingId: listing.id,
          cropType: listing.cropType,
          kgPerShare,
          pricePerShare,
          listedPricePerKgGhs,
          marketPricePerKgGhs: reference.pricePerKgGhs,
          market: reference.market,
          source: reference.source,
          observedAt: reference.observedAt,
          appreciationPct,
          direction:
            appreciationPct === null
              ? ("unknown" as const)
              : appreciationPct > 0.01
                ? ("up" as const)
                : appreciationPct < -0.01
                  ? ("down" as const)
                  : ("flat" as const),
        };
      }),

    /** Force an upstream refresh. Admin only, and internally throttled. */
    refresh: adminProcedure.mutation(async () => {
      const refreshed = await refreshGlobalPrices(true);
      return { success: Boolean(refreshed) };
    }),
  }),

  // Farmer procedures
  farmer: router({
    createListing: protectedProcedure
      .input(
        z.object({
          cropType: cropTypeSchema,
          cropName: z.string().min(1, "Crop name is required").max(100),
          description: z.string().max(2000).optional(),
          totalQuantity: z.number().positive("Quantity must be positive"),
          pricePerShare: z.number().positive("Price must be positive"),
          totalShares: z.number().int().positive("Total shares must be a whole number"),
          harvestDate: z.date(),
          location: z.string().min(1, "Location is required").max(200),
          exitOptions: z
            .object({
              cashPayout: z.boolean(),
              physicalDelivery: z.boolean(),
              shareTrading: z.boolean(),
            })
            .optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "farmer" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only farmers can create listings" });
        }

        const kgPerShare = input.totalQuantity / input.totalShares;
        if (!Number.isFinite(kgPerShare) || kgPerShare <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Total quantity and total shares must produce a positive kg-per-share",
          });
        }

        const created = await db.createProduceListing({
          farmerId: ctx.user.id,
          cropType: input.cropType,
          cropName: input.cropName,
          description: input.description,
          totalQuantity: input.totalQuantity.toString(),
          kgPerShare: kgPerShare.toFixed(6),
          pricePerShare: input.pricePerShare.toString(),
          totalShares: input.totalShares,
          sharesAvailable: input.totalShares,
          location: input.location,
          harvestDate: input.harvestDate,
          exitOptions: input.exitOptions ?? { cashPayout: true, physicalDelivery: true, shareTrading: true },
        });

        return {
          success: true as const,
          listingId: created.id,
          kgPerShare,
          message: "Listing created successfully",
        };
      }),

    getMyListings: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "farmer" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only farmers can view their listings" });
      }
      const listings = await db.getProduceListingsByFarmerId(ctx.user.id);
      return await withMarketContext(listings);
    }),

    /**
     * Edit a listing. Missing from the original build even though the UI
     * rendered an Edit button.
     */
    updateListing: protectedProcedure
      .input(
        z.object({
          listingId: z.number().int().positive(),
          cropName: z.string().min(1).max(100).optional(),
          description: z.string().max(2000).optional(),
          pricePerShare: z.number().positive().optional(),
          harvestDate: z.date().optional(),
          location: z.string().min(1).max(200).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const listing = await db.getProduceListingById(input.listingId);
        if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
        if (ctx.user.role !== "admin" && listing.farmerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own listings" });
        }
        if (listing.fundingStatus === "cancelled" || listing.fundingStatus === "harvested") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This listing can no longer be edited" });
        }
        if (input.pricePerShare !== undefined && (listing.sharesSold ?? 0) > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The price is locked once investors have bought shares",
          });
        }

        await db.updateProduceListing(input.listingId, {
          ...(input.cropName !== undefined ? { cropName: input.cropName } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.pricePerShare !== undefined ? { pricePerShare: input.pricePerShare.toString() } : {}),
          ...(input.harvestDate !== undefined ? { harvestDate: input.harvestDate } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
        });

        return { success: true as const, listingId: input.listingId };
      }),

    deleteListing: protectedProcedure
      .input(z.object({ listingId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const listing = await db.getProduceListingById(input.listingId);
        if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
        if (ctx.user.role !== "admin" && listing.farmerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own listings" });
        }
        if ((listing.sharesSold ?? 0) > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Investors already own shares in this listing, so it cannot be cancelled",
          });
        }

        await db.updateProduceListing(input.listingId, { fundingStatus: "cancelled" });
        return { success: true as const, listingId: input.listingId };
      }),

    updateHarvest: protectedProcedure
      .input(
        z.object({
          produceListingId: z.number().int().positive(),
          status: z.enum(["in_progress", "completed", "delayed"]),
          description: z.string().max(2000).optional(),
          actualQuantity: z.number().positive().optional(),
          harvestDate: z.date().optional(),
          images: z.array(z.string().url()).max(10).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "farmer" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only farmers can post harvest updates" });
        }

        const listing = await db.getProduceListingById(input.produceListingId);
        if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
        if (ctx.user.role !== "admin" && listing.farmerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only update your own listings" });
        }
        if (listing.fundingStatus === "cancelled") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This listing was cancelled" });
        }

        const update = await db.createHarvestUpdate({
          produceListingId: input.produceListingId,
          farmerId: listing.farmerId,
          status: input.status,
          description: input.description,
          actualQuantity: input.actualQuantity?.toString(),
          harvestDate: input.harvestDate,
          images: input.images,
        });

        if (input.status === "completed") {
          await db.updateProduceListing(input.produceListingId, {
            harvestStatus: "completed",
            fundingStatus: "harvested",
          });
        } else {
          await db.updateProduceListing(input.produceListingId, {
            harvestStatus: input.status === "delayed" ? "in_progress" : "in_progress",
          });
        }

        return { success: true as const, updateId: update.id, message: "Harvest update submitted successfully" };
      }),

    getHarvestUpdates: protectedProcedure
      .input(z.object({ produceListingId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const listing = await db.getProduceListingById(input.produceListingId);
        if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });

        // Farmers see their own; investors backing the listing have a right to
        // the progress feed too — that is the whole trust mechanism.
        const isOwner = ctx.user.role === "admin" || listing.farmerId === ctx.user.id;
        if (!isOwner) {
          const investments = await db.getInvestmentsByProduceListingId(input.produceListingId);
          const isInvestor = investments.some(row => row.investorId === ctx.user.id);
          if (!isInvestor) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You are not part of this listing" });
          }
        }

        return db.getHarvestUpdatesByProduceListingId(input.produceListingId);
      }),
  }),

  // Investor procedures
  investor: router({
    browseListings: publicProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(100).default(20),
          offset: z.number().int().min(0).default(0),
          cropType: cropTypeSchema.optional(),
          search: z.string().max(100).optional(),
        }),
      )
      .query(async ({ input }) => {
        const listings = await db.searchActiveProduceListings({
          limit: input.limit,
          offset: input.offset,
          cropType: input.cropType,
          search: input.search,
        });
        return await withMarketContext(listings);
      }),

    getListingById: publicProcedure
      .input(z.object({ listingId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const listing = await db.getProduceListingById(input.listingId);
        if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });

        if (listing.fundingStatus !== "active") {
          // Fully funded / harvested listings stay visible to the people who
          // are already part of them, instead of 404ing after funding closes.
          const isOwner = ctx.user && (ctx.user.role === "admin" || listing.farmerId === ctx.user.id);
          let isInvestor = false;
          if (!isOwner && ctx.user) {
            const investments = await db.getInvestmentsByProduceListingId(listing.id);
            isInvestor = investments.some(row => row.investorId === ctx.user!.id);
          }
          if (!isOwner && !isInvestor) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
          }
        }

        const [priced] = await withMarketContext([listing]);
        return priced;
      }),

    getPortfolio: protectedProcedure
      .input(
        z
          .object({
            limit: z.number().int().min(1).max(200).default(100),
            offset: z.number().int().min(0).default(0),
          })
          .optional(),
      )
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "investor" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only investors can view portfolio" });
        }

        const rows = await db.getPortfolioRows(ctx.user.id);
        // A left join can yield a null listing; drop those before valuation so
        // indices stay aligned between rows and valuations.
        const usable = rows.filter(
          (row): row is typeof row & { produceListing: NonNullable<typeof row.produceListing> } =>
            row.produceListing !== null && row.produceListing !== undefined,
        );
        const limited = usable.slice(input?.offset ?? 0, (input?.offset ?? 0) + (input?.limit ?? 100));

        const valuations = await valueHoldings(
          limited.map(row => ({ listing: row.produceListing, investment: row.investment })),
        );

        const investments = limited.map((row, index) => ({
          investment: row.investment,
          listing: row.produceListing,
          valuation: valuations[index] ?? null,
        }));

        const totalCost = valuations.reduce((sum, valuation) => sum + valuation.costBasisGhs, 0);
        const priced = valuations.filter((valuation): valuation is typeof valuation & { marketValueGhs: number } =>
          valuation.marketValueGhs !== null,
        );
        const totalMarketValue = priced.reduce((sum, valuation) => sum + valuation.marketValueGhs, 0);
        const totalGainLoss = priced.length > 0 ? totalMarketValue - priced.reduce((s, v) => s + v.costBasisGhs, 0) : null;

        return {
          investments,
          totalValue: totalMarketValue,
          totalCostBasis: totalCost,
          totalGainLoss,
          totalGainLossPct:
            totalGainLoss !== null && totalCost > 0 ? (totalGainLoss / totalCost) * 100 : null,
          totalShares: valuations.reduce((sum, valuation) => sum + valuation.sharesOwned, 0),
          totalQuantityKg: valuations.reduce((sum, valuation) => sum + (valuation.quantityKg ?? 0), 0),
          pricedHoldings: priced.length,
          holdings: valuations.length,
        };
      }),

    purchaseShares: protectedProcedure
      .input(
        z.object({
          produceListingId: z.number().int().positive(),
          shareQuantity: z.number().int().positive("Quantity must be a whole number"),
          exitOption: z.enum(["cash_payout", "physical_delivery", "marketplace"]),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "investor" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only investors can purchase shares" });
        }
        assertPositiveInt(input.shareQuantity, "Share quantity");

        const result = await db.purchaseSharesAtomic({
          investorId: ctx.user.id,
          produceListingId: input.produceListingId,
          shareQuantity: input.shareQuantity,
          exitOption: input.exitOption === "marketplace" ? "share_trading" : input.exitOption,
        });

        if (!result.ok) throwFailure(result);

        return {
          success: true as const,
          investmentId: result.investmentId,
          amountGhs: result.amountGhs,
          sharesAvailable: result.sharesAvailable,
          message: "Shares purchased successfully",
        };
      }),

    getTransactionHistory: protectedProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(100).default(50),
          offset: z.number().int().min(0).default(0),
        }),
      )
      .query(async ({ input, ctx }) => {
        const transactions = await db.getTransactionsByUserId(ctx.user.id, input.limit, input.offset);
        return transactions;
      }),
  }),

  // Marketplace procedures
  marketplace: router({
    /**
     * Escrow shares for sale. The original version never checked what was
     * already listed, so the same investment could be listed repeatedly and
     * oversold.
     */
    listShares: protectedProcedure
      .input(
        z.object({
          investmentId: z.number().int().positive(),
          shareQuantity: z.number().int().positive(),
          pricePerShare: z.number().positive(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "investor" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only investors can list shares" });
        }

        const investment = await db.getInvestmentById(input.investmentId);
        if (!investment) throw new TRPCError({ code: "NOT_FOUND", message: "Investment not found" });
        if (ctx.user.role !== "admin" && investment.investorId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only list your own investments" });
        }
        if (investment.status !== "active") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This investment is not available to trade" });
        }
        if (investment.exitOption === "physical_delivery") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This investment was bought for physical delivery and cannot be traded",
          });
        }

        const alreadyListed = await db.getActiveListedShares(investment.id);
        const available = investment.sharesOwned - alreadyListed;
        if (input.shareQuantity > available) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `You have ${available} share(s) available to list`,
          });
        }

        const listing = await db.createShareMarketplaceListing({
          sellerId: ctx.user.id,
          investmentId: investment.id,
          sharesForSale: input.shareQuantity,
          pricePerShare: input.pricePerShare.toString(),
          totalPrice: (input.shareQuantity * input.pricePerShare).toFixed(2),
        });

        return {
          success: true as const,
          listingId: listing.id,
          message: "Shares listed successfully",
        };
      }),

    getMarketplaceListings: publicProcedure
      .input(
        z
          .object({
            limit: z.number().int().min(1).max(100).default(50),
            offset: z.number().int().min(0).default(0),
          })
          .optional(),
      )
      .query(async ({ input }) => {
        return db.getShareMarketplaceListingsDetailed(input?.limit ?? 50, input?.offset ?? 0);
      }),

    getMyMarketplaceListings: protectedProcedure.query(async ({ ctx }) => {
      return db.getShareMarketplaceListingsBySeller(ctx.user.id);
    }),

    cancelListing: protectedProcedure
      .input(z.object({ marketplaceListingId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const listing = await db.getShareMarketplaceListingById(input.marketplaceListingId);
        if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
        if (ctx.user.role !== "admin" && listing.sellerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only cancel your own listing" });
        }
        if (listing.status !== "active") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only active listings can be cancelled" });
        }
        await db.updateShareMarketplaceListing(listing.id, { status: "cancelled", sharesForSale: 0 });
        return { success: true as const };
      }),

    buyShares: protectedProcedure
      .input(
        z.object({
          marketplaceListingId: z.number().int().positive(),
          shareQuantity: z.number().int().positive(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "investor" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only investors can buy shares" });
        }

        const result = await db.buySharesAtomic({
          buyerId: ctx.user.id,
          marketplaceListingId: input.marketplaceListingId,
          shareQuantity: input.shareQuantity,
        });
        if (!result.ok) throwFailure(result);

        return {
          success: true as const,
          transactionId: result.transactionId,
          investmentId: result.buyerInvestmentId,
          amountGhs: result.amountGhs,
          message: "Shares purchased successfully",
        };
      }),
  }),

  // Payout procedures
  payout: router({
    requestPayout: protectedProcedure
      .input(
        z.object({
          investmentId: z.number().int().positive(),
          payoutType: z.enum(["cash", "physical_delivery"]),
          deliveryAddress: z.string().max(500).optional(),
          deliveryPhone: z.string().max(20).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "investor" && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only investors can request payouts" });
        }
        if (input.payoutType === "physical_delivery" && (!input.deliveryAddress || !input.deliveryPhone)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Delivery address and phone are required for physical delivery",
          });
        }

        const investment = await db.getInvestmentById(input.investmentId);
        if (!investment) throw new TRPCError({ code: "NOT_FOUND", message: "Investment not found" });

        const listing = await db.getProduceListingById(investment.produceListingId);
        const reference = listing
          ? await getReferencePrice(listing.cropType)
          : { pricePerKgGhs: null, market: null, source: null, observedAt: null };

        const result = await db.requestPayoutAtomic({
          investorId: ctx.user.id,
          investmentId: input.investmentId,
          payoutType: input.payoutType,
          deliveryAddress: input.deliveryAddress,
          deliveryPhone: input.deliveryPhone,
          pricePerKgGhs: reference.pricePerKgGhs,
          priceSource: reference.source,
        });
        if (!result.ok) throwFailure(result);

        return {
          success: true as const,
          payoutId: result.payoutId,
          amountGhs: result.amountGhs,
          valuationAmount: result.valuationAmount,
          quantityKg: result.quantityKg,
          pricePerKgGhs: reference.pricePerKgGhs,
          message: "Payout request submitted",
        };
      }),

    getPayoutRequests: protectedProcedure.query(async ({ ctx }) => {
      return db.getPayoutRequestsByInvestorId(ctx.user.id);
    }),
  }),

  // Operator console
  admin: router({
    listPayouts: adminProcedure
      .input(
        z
          .object({
            status: z.enum(["pending", "approved", "processing", "completed", "rejected"]).optional(),
            limit: z.number().int().min(1).max(200).default(100),
          })
          .optional(),
      )
      .query(async ({ input }) => {
        return db.listPayoutRequests({ status: input?.status, limit: input?.limit ?? 100 });
      }),

    resolvePayout: adminProcedure
      .input(
        z.object({
          payoutId: z.number().int().positive(),
          action: z.enum(["approve", "reject", "complete"]),
          reason: z.string().max(500).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const result = await db.resolvePayoutAtomic({
          adminId: ctx.user.id,
          payoutId: input.payoutId,
          action: input.action,
          reason: input.reason,
        });
        if (!result.ok) throwFailure(result);
        return { success: true as const, status: result.status };
      }),

    /** Set a Ghana market price. This is the national leg of the price feed. */
    setNationalPrice: adminProcedure
      .input(
        z.object({
          cropType: cropTypeSchema,
          market: z.string().min(1).max(100),
          pricePerKgGhs: z.number().positive(),
          effectiveAt: z.date().optional(),
          source: z.string().max(64).default("operator"),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const observedAt = input.effectiveAt ?? new Date();
        // Normalise to the day so repeats update the same observation.
        observedAt.setUTCHours(0, 0, 0, 0);

        const row = await db.upsertNationalPrice({
          cropType: input.cropType,
          scope: "national",
          market: input.market,
          pricePerKgGhs: input.pricePerKgGhs.toFixed(4),
          priceNative: input.pricePerKgGhs.toFixed(4),
          nativeCurrency: "GHS",
          nativeUnit: "GHS/kg",
          fxRateGhsPerUsd: null,
          source: input.source,
          sourceSymbol: null,
          observedAt,
        });

        return {
          success: true as const,
          priceId: row?.id ?? null,
          enteredBy: ctx.user.id,
        };
      }),

    setUserRole: adminProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          role: z.enum(["user", "farmer", "investor", "admin"]),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const dbUser = await db.getUserById(input.userId);
        if (!dbUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        if (dbUser.id === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot change your own role" });
        }
        await db.setUserRole(input.userId, input.role);
        return { success: true as const };
      }),
  }),
});

export type AppRouter = typeof appRouter;
