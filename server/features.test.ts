import { describe, expect, it, beforeEach, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { TRPCError } from "@trpc/server";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(user: Partial<AuthenticatedUser> = {}): TrpcContext {
  const defaultUser: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "otp",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...user,
  };

  return {
    user: defaultUser,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("Investor Features", () => {
  describe("browseListings", () => {
    it("should return active produce listings", async () => {
      const ctx = createContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.investor.browseListings({
        limit: 20,
        offset: 0,
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getPortfolio", () => {
    it("should reject non-investors", async () => {
      const ctx = createContext({ role: "farmer" });
      const caller = appRouter.createCaller(ctx);

      await expect(caller.investor.getPortfolio()).rejects.toThrow(
        expect.objectContaining({
          code: "FORBIDDEN",
        })
      );
    });

    it("should return portfolio for investors", async () => {
      const ctx = createContext({ role: "investor" });
      const caller = appRouter.createCaller(ctx);

      const result = await caller.investor.getPortfolio();

      expect(result).toHaveProperty("investments");
      expect(result).toHaveProperty("totalValue");
      expect(result).toHaveProperty("totalShares");
      expect(Array.isArray(result.investments)).toBe(true);
    });
  });

  describe("purchaseShares", () => {
    it("should reject non-investors", async () => {
      const ctx = createContext({ role: "farmer" });
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.investor.purchaseShares({
          produceListingId: 1,
          shareQuantity: 10,
          exitOption: "cash_payout",
        })
      ).rejects.toThrow(
        expect.objectContaining({
          code: "FORBIDDEN",
        })
      );
    });

    it("should validate positive quantity", async () => {
      const ctx = createContext({ role: "investor" });
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.investor.purchaseShares({
          produceListingId: 1,
          shareQuantity: 0,
          exitOption: "cash_payout",
        })
      ).rejects.toThrow();
    });
  });
});

describe("Farmer Features", () => {
  describe("createListing", () => {
    it("should reject non-farmers", async () => {
      const ctx = createContext({ role: "investor" });
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.farmer.createListing({
          cropType: "maize",
          cropName: "Local Maize",
          description: "High quality maize",
          totalQuantity: 1000,
          pricePerShare: 10,
          totalShares: 100,
          harvestDate: new Date("2026-12-31"),
          location: "Ashanti Region",
        })
      ).rejects.toThrow(
        expect.objectContaining({
          code: "FORBIDDEN",
        })
      );
    });

    it("should validate required fields", async () => {
      const ctx = createContext({ role: "farmer" });
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.farmer.createListing({
          cropType: "maize",
          cropName: "",
          totalQuantity: 1000,
          pricePerShare: 10,
          totalShares: 100,
          harvestDate: new Date("2026-12-31"),
          location: "Ashanti Region",
        })
      ).rejects.toThrow();
    });

    it("should validate positive quantities", async () => {
      const ctx = createContext({ role: "farmer" });
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.farmer.createListing({
          cropType: "maize",
          cropName: "Local Maize",
          totalQuantity: -100,
          pricePerShare: 10,
          totalShares: 100,
          harvestDate: new Date("2026-12-31"),
          location: "Ashanti Region",
        })
      ).rejects.toThrow();
    });

    // Writing a listing requires a live database. Skip (rather than fail) when
    // the suite runs without DATABASE_URL, which is the default in CI.
    it.skipIf(!process.env.DATABASE_URL)("should create listing successfully", async () => {
      const ctx = createContext({ role: "farmer" });
      const caller = appRouter.createCaller(ctx);

      const result = await caller.farmer.createListing({
        cropType: "maize",
        cropName: "Local Maize",
        description: "High quality maize",
        totalQuantity: 1000,
        pricePerShare: 10,
        totalShares: 100,
        harvestDate: new Date("2026-12-31"),
        location: "Ashanti Region",
      });

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("listingId");
      expect(result.kgPerShare).toBeCloseTo(10, 6);
    });
  });

  describe("getMyListings", () => {
    it("should reject non-farmers", async () => {
      const ctx = createContext({ role: "investor" });
      const caller = appRouter.createCaller(ctx);

      await expect(caller.farmer.getMyListings()).rejects.toThrow(
        expect.objectContaining({
          code: "FORBIDDEN",
        })
      );
    });

    it("should return farmer listings", async () => {
      const ctx = createContext({ role: "farmer" });
      const caller = appRouter.createCaller(ctx);

      const result = await caller.farmer.getMyListings();

      expect(Array.isArray(result)).toBe(true);
    });
  });
});

describe("Marketplace Features", () => {
  describe("listShares", () => {
    it("should validate positive share quantity", async () => {
      const ctx = createContext({ role: "investor" });
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.marketplace.listShares({
          investmentId: 1,
          shareQuantity: 0,
          pricePerShare: 15,
        })
      ).rejects.toThrow();
    });

    it("should reject listing shares for a nonexistent investment", async () => {
      const ctx = createContext({ role: "investor" });
      const caller = appRouter.createCaller(ctx);

      await expect(caller.marketplace.listShares({
        investmentId: 1,
        shareQuantity: 10,
        pricePerShare: 15,
      })).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
    });
  });

  describe("getMarketplaceListings", () => {
    it("should return marketplace listings", async () => {
      const ctx = createContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.marketplace.getMarketplaceListings();

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("buyShares", () => {
    it("should validate positive share quantity", async () => {
      const ctx = createContext({ role: "investor" });
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.marketplace.buyShares({
          marketplaceListingId: 1,
          shareQuantity: 0,
        })
      ).rejects.toThrow();
    });
  });
});

describe("Payout Features", () => {
  describe("requestPayout", () => {
    it("should validate payout type", async () => {
      const ctx = createContext({ role: "investor" });
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.payout.requestPayout({
          investmentId: 1,
          payoutType: "invalid" as any,
        })
      ).rejects.toThrow();
    });

    it("should reject payout requests for a nonexistent investment", async () => {
      const ctx = createContext({ role: "investor" });
      const caller = appRouter.createCaller(ctx);

      await expect(caller.payout.requestPayout({
        investmentId: 1,
        payoutType: "cash",
      })).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
    });
  });

  describe("getPayoutRequests", () => {
    it("should return payout requests for investor", async () => {
      const ctx = createContext({ role: "investor" });
      const caller = appRouter.createCaller(ctx);

      const result = await caller.payout.getPayoutRequests();

      expect(Array.isArray(result)).toBe(true);
    });
  });
});

describe("Transaction History", () => {
  describe("getTransactionHistory", () => {
    it("should return transaction history", async () => {
      const ctx = createContext({ role: "investor" });
      const caller = appRouter.createCaller(ctx);

      const result = await caller.investor.getTransactionHistory({
        limit: 50,
        offset: 0,
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it("should support pagination", async () => {
      const ctx = createContext({ role: "investor" });
      const caller = appRouter.createCaller(ctx);

      const result = await caller.investor.getTransactionHistory({
        limit: 10,
        offset: 5,
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
