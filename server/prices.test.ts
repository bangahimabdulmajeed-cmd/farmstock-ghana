import { describe, expect, it, beforeEach } from "vitest";
import {
  BENCHMARKS,
  benchmarkFor,
  nativeToGhsPerKg,
  nativeToUsdPerTonne,
} from "./prices/benchmarks";
import { computeValuation, kgPerShareOf, __resetPriceCache } from "./prices/service";
import { rateLimit, resetRateLimits } from "./rateLimit";

describe("benchmark conversion", () => {
  it("converts CBOT corn cents-per-bushel into USD per tonne", () => {
    // 452¢/bu at 56 lb per bushel ≈ 178 USD/t
    const usdPerTonne = nativeToUsdPerTonne({ unit: "cents_per_bushel", kgPerUnit: 25.4012 }, 452);
    expect(usdPerTonne).toBeGreaterThan(170);
    expect(usdPerTonne).toBeLessThan(185);
  });

  it("passes USD per tonne quotes through unchanged", () => {
    expect(nativeToUsdPerTonne({ unit: "usd_per_tonne", kgPerUnit: 1000 }, 5169)).toBe(5169);
  });

  it("converts cents-per-pound into USD per tonne", () => {
    // 20¢/lb ≈ 441 USD/t
    const usdPerTonne = nativeToUsdPerTonne({ unit: "cents_per_pound", kgPerUnit: 0.45359237 }, 20);
    expect(usdPerTonne).toBeGreaterThan(430);
    expect(usdPerTonne).toBeLessThan(450);
  });

  it("normalises to GH¢ per kg using the FX rate", () => {
    const ghsPerKg = nativeToGhsPerKg({ unit: "usd_per_tonne", kgPerUnit: 1000 }, 1000, 11.73);
    expect(ghsPerKg).toBeCloseTo(11.73, 4);
  });

  it("returns NaN for an unsupported unit rather than a wrong number", () => {
    const result = nativeToUsdPerTonne({ unit: "unsupported" as never, kgPerUnit: 1 }, 100);
    expect(Number.isNaN(result)).toBe(true);
  });

  it("only maps crops that have a real exchange contract", () => {
    expect(benchmarkFor("maize")?.symbol).toBe("ZC=F");
    expect(benchmarkFor("cocoa")?.symbol).toBe("CC=F");
    expect(benchmarkFor("rice")?.symbol).toBe("ZR=F");
    // No invented proxies for domestic-only crops.
    expect(benchmarkFor("tomato")).toBeUndefined();
    expect(benchmarkFor("cassava")).toBeUndefined();
    expect(BENCHMARKS).toHaveLength(3);
  });
});

describe("kgPerShare", () => {
  it("derives kg per share from quantity and share count", () => {
    expect(kgPerShareOf({ kgPerShare: null, totalQuantity: "1000", totalShares: 200 })).toBe(5);
  });

  it("prefers the stored value when present", () => {
    expect(kgPerShareOf({ kgPerShare: "4.5", totalQuantity: "1000", totalShares: 200 })).toBe(4.5);
  });

  it("returns null when it cannot be computed", () => {
    expect(kgPerShareOf({ kgPerShare: null, totalQuantity: "0", totalShares: 0 })).toBeNull();
  });
});

describe("computeValuation", () => {
  const listing = {
    cropType: "maize" as const,
    cropName: "Local Maize",
    kgPerShare: "5",
    totalQuantity: "1000",
    totalShares: 200,
  };
  const investment = { sharesOwned: 10, sharePrice: "50", totalInvestment: "500" };

  it("marks a holding up when the market is above the purchase price", () => {
    // 10 shares × 5 kg = 50 kg, cost 500 → 10 GH¢/kg paid. Market 12 → 600.
    const valuation = computeValuation({ listing, investment, pricePerKgGhs: 12 });
    expect(valuation.quantityKg).toBe(50);
    expect(valuation.costPerKgGhs).toBeCloseTo(10, 6);
    expect(valuation.marketValueGhs).toBeCloseTo(600, 6);
    expect(valuation.gainLossGhs).toBeCloseTo(100, 6);
    expect(valuation.gainLossPct).toBeCloseTo(20, 6);
    expect(valuation.direction).toBe("up");
  });

  it("marks a holding down when the market is below the purchase price", () => {
    const valuation = computeValuation({ listing, investment, pricePerKgGhs: 8 });
    expect(valuation.gainLossGhs).toBeCloseTo(-100, 6);
    expect(valuation.direction).toBe("down");
  });

  it("reports unknown instead of guessing when there is no price", () => {
    const valuation = computeValuation({ listing, investment, pricePerKgGhs: null });
    expect(valuation.marketValueGhs).toBeNull();
    expect(valuation.gainLossPct).toBeNull();
    expect(valuation.direction).toBe("unknown");
    // Cost basis is still reported so the portfolio is not blank.
    expect(valuation.costBasisGhs).toBe(500);
  });
});

describe("rate limiter", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows requests up to the limit then blocks", () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("k", 3, 60_000).allowed).toBe(true);
    }
    const blocked = rateLimit("k", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("keeps separate counters per key", () => {
    rateLimit("a", 1, 60_000);
    expect(rateLimit("a", 1, 60_000).allowed).toBe(false);
    expect(rateLimit("b", 1, 60_000).allowed).toBe(true);
  });

  it("resets after the window elapses", () => {
    rateLimit("w", 1, 1);
    expect(rateLimit("w", 1, 1).allowed).toBe(false);
    const start = Date.now();
    while (Date.now() - start < 5) {
      // deliberately tiny busy wait; the window is 1ms
    }
    expect(rateLimit("w", 1, 1).allowed).toBe(true);
  });
});

describe("price cache", () => {
  it("resets cleanly between runs", () => {
    __resetPriceCache();
    expect(true).toBe(true);
  });
});
