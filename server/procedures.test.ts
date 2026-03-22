import { describe, it, expect, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock context for authenticated users
function createMockContext(overrides?: Partial<TrpcContext>): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      phoneNumber: "+233501234567",
      loginMethod: "otp",
      role: "investor",
      isPhoneVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
    ...overrides,
  };
}

describe("FarmStock Ghana API Procedures", () => {
  describe("Auth Procedures", () => {
    it("should return current user with me query", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const user = await caller.auth.me();

      expect(user).toBeDefined();
      expect(user?.id).toBe(1);
      expect(user?.phoneNumber).toBe("+233501234567");
    });

    it("should logout successfully", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);
      
      const result = await caller.auth.logout();

      expect(result.success).toBe(true);
      expect(ctx.res.clearCookie).toHaveBeenCalled();
    });
  });

  describe("Investor Procedures", () => {
    it("should browse active listings", async () => {
      const caller = appRouter.createCaller(createMockContext());
      
      const listings = await caller.investor.browseListings({
        limit: 20,
        offset: 0,
      });

      expect(listings).toBeDefined();
      expect(Array.isArray(listings)).toBe(true);
    });

    it("should get investor portfolio", async () => {
      const caller = appRouter.createCaller(createMockContext());
      
      const portfolio = await caller.investor.getPortfolio();

      expect(portfolio).toBeDefined();
      expect(portfolio.investments).toBeDefined();
      expect(Array.isArray(portfolio.investments)).toBe(true);
      expect(portfolio.totalValue).toBeDefined();
      expect(typeof portfolio.totalValue).toBe("number");
    });

    it("should require authentication for portfolio", async () => {
      const ctx = createMockContext({ user: undefined });
      const caller = appRouter.createCaller(ctx);
      
      try {
        await caller.investor.getPortfolio();
        expect.fail("Should have thrown UNAUTHORIZED error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
      }
    });
  });

  describe("Transaction Procedures", () => {
    it("should retrieve transaction history", async () => {
      const caller = appRouter.createCaller(createMockContext());
      
      const transactions = await caller.transactions.getHistory({
        limit: 20,
        offset: 0,
      });

      expect(transactions).toBeDefined();
      expect(Array.isArray(transactions)).toBe(true);
    });

    it("should require authentication for transaction history", async () => {
      const ctx = createMockContext({ user: undefined });
      const caller = appRouter.createCaller(ctx);
      
      try {
        await caller.transactions.getHistory({
          limit: 20,
          offset: 0,
        });
        expect.fail("Should have thrown UNAUTHORIZED error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
      }
    });
  });

  describe("Payout Procedures", () => {
    it("should retrieve payout requests", async () => {
      const caller = appRouter.createCaller(createMockContext());
      
      const requests = await caller.payout.getPayoutRequests();

      expect(requests).toBeDefined();
      expect(Array.isArray(requests)).toBe(true);
    });

    it("should require authentication for payout requests", async () => {
      const ctx = createMockContext({ user: undefined });
      const caller = appRouter.createCaller(ctx);
      
      try {
        await caller.payout.getPayoutRequests();
        expect.fail("Should have thrown UNAUTHORIZED error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
      }
    });
  });

  describe("Marketplace Procedures", () => {
    it("should retrieve marketplace listings", async () => {
      const caller = appRouter.createCaller(createMockContext());
      
      const listings = await caller.marketplace.getMarketplaceListings({
        limit: 20,
        offset: 0,
      });

      expect(listings).toBeDefined();
      expect(Array.isArray(listings)).toBe(true);
    });

    it("should allow public access to marketplace listings", async () => {
      const ctx = createMockContext({ user: undefined });
      const caller = appRouter.createCaller(ctx);
      
      const listings = await caller.marketplace.getMarketplaceListings({
        limit: 20,
        offset: 0,
      });
      
      expect(listings).toBeDefined();
      expect(Array.isArray(listings)).toBe(true);
    });
  });

  describe("Authorization & Security", () => {
    it("should protect procedures requiring authentication", async () => {
      const publicCtx = createMockContext({ user: undefined });
      const publicCaller = appRouter.createCaller(publicCtx);
      
      try {
        await publicCaller.investor.getPortfolio();
        expect.fail("Should have thrown UNAUTHORIZED error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
      }
    });
  });
});
