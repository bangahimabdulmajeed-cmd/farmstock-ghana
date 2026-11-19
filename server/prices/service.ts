import { BENCHMARKS, FX_SYMBOL, benchmarkFor, nativeToGhsPerKg } from "./benchmarks";
import * as db from "../db";
import { CROP_LABELS, type CropQuote, type PriceDirection, type PricesPayload, type Valuation } from "@shared/prices";
import { CROP_TYPES, type CropType, type InsertCommodityPrice, type ProduceListing, type Investment } from "../../drizzle/schema";

const CACHE_TTL_MS = 10 * 60 * 1000;
const MIN_REFRESH_GAP_MS = 60 * 1000;
const HISTORY_DAYS = 30;
const NATIONAL_FRESH_DAYS = 45;

type SeriesPoint = { at: Date; close: number };

type YahooSeries = {
  symbol: string;
  points: SeriesPoint[];
  latest: number;
};

type Cache = {
  quotes: CropQuote[];
  fxRateGhsPerUsd: number | null;
  fetchedAt: number;
};

let cache: Cache | null = null;
let lastRefreshAttempt = 0;

function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function directionOf(changePct: number | null): PriceDirection {
  if (changePct === null || !Number.isFinite(changePct)) return "unknown";
  if (changePct > 0.01) return "up";
  if (changePct < -0.01) return "down";
  return "flat";
}

function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Read a Yahoo Finance chart series. Free and keyless, which is why it is used
 * for the global benchmark leg — but it is an unofficial endpoint, so every
 * failure path is non-fatal: callers fall back to stored prices.
 */
async function fetchYahooSeries(symbol: string, range = "1mo"): Promise<YahooSeries | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FarmStockGhana/1.0; +https://farmstock.gh)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.warn(`[Prices] ${symbol} HTTP ${response.status}`);
      return null;
    }
    const payload = (await response.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number };
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: Array<number | null> | null }> };
        }>;
        error?: unknown;
      };
    };
    const result = payload?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const points: SeriesPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      const ts = timestamps[i];
      if (typeof close === "number" && Number.isFinite(close) && typeof ts === "number") {
        points.push({ at: new Date(ts * 1000), close });
      }
    }
    if (points.length === 0) return null;

    const latest = Number(result.meta?.regularMarketPrice ?? points[points.length - 1].close);
    return { symbol, points, latest };
  } catch (error) {
    console.warn(`[Prices] ${symbol} fetch failed:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Pull global benchmarks + FX, normalise to GH¢/kg and persist the series.
 * Returns the quotes that were just built, or null when nothing was usable.
 */
export async function refreshGlobalPrices(force = false): Promise<Cache | null> {
  const now = Date.now();
  if (!force && lastRefreshAttempt !== 0 && now - lastRefreshAttempt < MIN_REFRESH_GAP_MS) {
    return cache;
  }
  lastRefreshAttempt = now;

  const fx = await fetchYahooSeries(FX_SYMBOL, "5d");
  if (!fx) {
    console.warn("[Prices] FX rate unavailable; keeping cached/global prices");
    return null;
  }
  const fxRate = fx.latest;
  const since = startOfDayUtc(new Date(now - HISTORY_DAYS * 24 * 60 * 60 * 1000));

  const byCrop = new Map<
    CropType,
    { pricePerKgGhs: number; points: number[]; market: string; observedAt: Date; source: string }
  >();

  for (const benchmark of BENCHMARKS) {
    const series = await fetchYahooSeries(benchmark.symbol, "1mo");
    if (!series) continue;

    const rows: InsertCommodityPrice[] = [];
    const seen = new Set<number>();

    for (const point of series.points) {
      const observedAt = startOfDayUtc(point.at);
      const key = observedAt.getTime();
      // One row per calendar day; later intraday quotes win.
      if (observedAt < since) continue;
      const pricePerKgGhs = nativeToGhsPerKg(benchmark, point.close, fxRate);
      if (!Number.isFinite(pricePerKgGhs) || pricePerKgGhs <= 0) continue;

      if (seen.has(key)) {
        rows[rows.length - 1] = {
          cropType: benchmark.cropType,
          scope: "global",
          market: benchmark.exchange,
          pricePerKgGhs: pricePerKgGhs.toFixed(4),
          priceNative: point.close.toFixed(4),
          nativeCurrency: "USD",
          nativeUnit: benchmark.displayUnit,
          fxRateGhsPerUsd: fxRate.toFixed(4),
          source: "yahoo",
          sourceSymbol: benchmark.symbol,
          observedAt,
        };
      } else {
        seen.add(key);
        rows.push({
          cropType: benchmark.cropType,
          scope: "global",
          market: benchmark.exchange,
          pricePerKgGhs: pricePerKgGhs.toFixed(4),
          priceNative: point.close.toFixed(4),
          nativeCurrency: "USD",
          nativeUnit: benchmark.displayUnit,
          fxRateGhsPerUsd: fxRate.toFixed(4),
          source: "yahoo",
          sourceSymbol: benchmark.symbol,
          observedAt,
        });
      }
    }

    if (rows.length === 0) continue;

    const latestRow = rows[rows.length - 1];
    byCrop.set(benchmark.cropType, {
      pricePerKgGhs: Number(latestRow.pricePerKgGhs),
      points: rows.slice(-HISTORY_DAYS).map(r => Number(r.pricePerKgGhs)),
      market: benchmark.exchange,
      observedAt: startOfDayUtc(new Date(now)),
      source: `yahoo:${benchmark.symbol}`,
    });

    try {
      await db.deleteGlobalPricePointsSince(benchmark.cropType, since);
      await db.insertPricePointsIgnore(rows);
    } catch (error) {
      console.error(`[Prices] Failed to persist ${benchmark.cropType}:`, error);
    }
  }

  // A live quote beats a stale stored one, so overlay the freshly fetched values.
  const national = await db.getLatestPriceByCrop("national");
  const quotes = buildQuotes(byCrop, national, fxRate, false);

  cache = { quotes, fxRateGhsPerUsd: fxRate, fetchedAt: now };
  return cache;
}

function buildQuotes(
  global: Map<CropType, { pricePerKgGhs: number; points: number[]; market: string; observedAt: Date; source: string }>,
  nationalRows: Awaited<ReturnType<typeof db.getLatestPriceByCrop>>,
  fxRate: number | null,
  stale: boolean,
): CropQuote[] {
  const nationalByCrop = new Map<CropType, (typeof nationalRows)[number]>();
  for (const row of nationalRows) {
    if (!nationalByCrop.has(row.cropType)) nationalByCrop.set(row.cropType, row);
  }

  return CROP_TYPES.map(cropType => {
    const nationalRow = nationalByCrop.get(cropType);
    const globalEntry = global.get(cropType);

    const nationalPrice = nationalRow ? Number(nationalRow.pricePerKgGhs) : null;
    const globalPrice = globalEntry ? globalEntry.pricePerKgGhs : null;

    const useNational =
      nationalPrice !== null &&
      Number.isFinite(nationalPrice) &&
      isFresh(nationalRow?.observedAt ?? null, NATIONAL_FRESH_DAYS);

    const price = useNational ? nationalPrice : globalPrice;
    const market = useNational ? nationalRow?.market ?? null : globalEntry?.market ?? null;
    const observedAt = useNational ? nationalRow?.observedAt ?? null : globalEntry?.observedAt ?? null;
    const source = useNational ? nationalRow?.source ?? null : globalEntry?.source ?? null;

    let changePct: number | null = null;
    if (globalEntry && globalEntry.points.length >= 2) {
      const series = globalEntry.points;
      changePct = pctChange(series[series.length - 1], series[series.length - 2]);
    }

    return {
      cropType,
      label: CROP_LABELS[cropType],
      basis: price === null || !Number.isFinite(price) ? null : useNational ? "national" : "global",
      pricePerKgGhs: price !== null && Number.isFinite(price) ? price : null,
      nationalPricePerKgGhs: nationalPrice,
      nationalMarket: nationalRow?.market ?? null,
      globalPricePerKgGhs: globalPrice,
      globalMarket: globalEntry?.market ?? null,
      changePct,
      direction: directionOf(changePct),
      sparkline: globalEntry?.points.slice(-HISTORY_DAYS) ?? [],
      source,
      observedAt: observedAt ? new Date(observedAt).toISOString() : null,
      stale,
    } satisfies CropQuote;
  });
}

function isFresh(observedAt: Date | string | null, days: number): boolean {
  if (!observedAt) return false;
  const then = new Date(observedAt).getTime();
  if (!Number.isFinite(then)) return false;
  return Date.now() - then <= days * 24 * 60 * 60 * 1000;
}

/**
 * Public entry point for the UI. Never throws: on upstream failure it serves
 * the last persisted prices and flags the payload as stale.
 */
export async function getPrices(): Promise<PricesPayload> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return {
      quotes: cache.quotes,
      fxRateGhsPerUsd: cache.fxRateGhsPerUsd,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
      stale: false,
    };
  }

  const refreshed = await refreshGlobalPrices();
  if (refreshed) {
    return {
      quotes: refreshed.quotes,
      fxRateGhsPerUsd: refreshed.fxRateGhsPerUsd,
      fetchedAt: new Date(refreshed.fetchedAt).toISOString(),
      stale: false,
    };
  }

  const [national, globalRows] = await Promise.all([
    db.getLatestPriceByCrop("national"),
    db.getLatestPriceByCrop("global"),
  ]);
  const global = new Map<
    CropType,
    { pricePerKgGhs: number; points: number[]; market: string; observedAt: Date; source: string }
  >();
  for (const row of globalRows) {
    if (global.has(row.cropType)) continue;
    global.set(row.cropType, {
      pricePerKgGhs: Number(row.pricePerKgGhs),
      points: [],
      market: row.market,
      observedAt: row.observedAt,
      source: row.source,
    });
  }

  return {
    quotes: buildQuotes(global, national, null, true),
    fxRateGhsPerUsd: cache?.fxRateGhsPerUsd ?? null,
    fetchedAt: new Date().toISOString(),
    stale: true,
  };
}

export async function getPriceHistory(cropType: CropType, days = 90) {
  const global = await db.getPriceHistory(cropType, "global", days);
  if (global.length > 0) return global;
  return db.getPriceHistory(cropType, "national", days);
}

/** Best GH¢/kg to value a crop at right now. */
export async function getReferencePrice(cropType: CropType): Promise<{
  pricePerKgGhs: number | null;
  market: string | null;
  source: string | null;
  observedAt: string | null;
}> {
  const payload = await getPrices();
  const quote = payload.quotes.find(q => q.cropType === cropType);
  if (!quote || quote.pricePerKgGhs === null) {
    return { pricePerKgGhs: null, market: null, source: null, observedAt: null };
  }
  return {
    pricePerKgGhs: quote.pricePerKgGhs,
    market: quote.basis === "national" ? quote.nationalMarket : quote.globalMarket,
    source: quote.source,
    observedAt: quote.observedAt,
  };
}

export function kgPerShareOf(listing: Pick<ProduceListing, "kgPerShare" | "totalQuantity" | "totalShares">): number | null {
  if (listing.kgPerShare) {
    const kg = Number(listing.kgPerShare);
    if (Number.isFinite(kg) && kg > 0) return kg;
  }
  const quantity = Number(listing.totalQuantity);
  const shares = Number(listing.totalShares);
  if (!Number.isFinite(quantity) || !Number.isFinite(shares) || shares <= 0) return null;
  const derived = quantity / shares;
  return derived > 0 ? derived : null;
}

/**
 * Value one holding against the current market price.
 * Pure apart from the injected price so it can be unit tested.
 */
export function computeValuation(input: {
  listing: Pick<ProduceListing, "cropType" | "cropName" | "kgPerShare" | "totalQuantity" | "totalShares">;
  investment: Pick<Investment, "sharesOwned" | "sharePrice" | "totalInvestment">;
  pricePerKgGhs: number | null;
  priceSource?: string | null;
  priceObservedAt?: string | null;
}): Valuation {
  const { listing, investment } = input;
  const sharesOwned = Number(investment.sharesOwned) || 0;
  const sharePrice = Number(investment.sharePrice) || 0;
  const kgPerShare = kgPerShareOf(listing);
  const quantityKg = kgPerShare !== null ? kgPerShare * sharesOwned : null;
  const costBasis = Number(investment.totalInvestment) || sharePrice * sharesOwned;

  const marketPerKg = input.pricePerKgGhs;
  const costPerKg = quantityKg !== null && quantityKg > 0 ? costBasis / quantityKg : null;
  const marketValue = quantityKg !== null && marketPerKg !== null ? marketPerKg * quantityKg : null;
  const gainLoss = marketValue !== null ? marketValue - costBasis : null;
  const gainLossPct = gainLoss !== null && costBasis > 0 ? (gainLoss / costBasis) * 100 : null;

  return {
    cropType: listing.cropType,
    cropName: listing.cropName,
    costPerKgGhs: costPerKg,
    marketPerKgGhs: marketPerKg,
    kgPerShare,
    sharesOwned,
    quantityKg,
    costBasisGhs: costBasis,
    marketValueGhs: marketValue,
    gainLossGhs: gainLoss,
    gainLossPct,
    direction: directionOf(gainLossPct),
    priceSource: input.priceSource ?? null,
    priceObservedAt: input.priceObservedAt ?? null,
  };
}

/** Value a portfolio in one pass, reusing a single price payload. */
export async function valueHoldings(
  holdings: Array<{ listing: ProduceListing | null; investment: Investment }>,
): Promise<Valuation[]> {
  const payload = await getPrices();
  const byCrop = new Map(payload.quotes.map(q => [q.cropType, q]));

  const results: Valuation[] = [];
  for (const { listing, investment } of holdings) {
    if (!listing) continue;
    const quote = byCrop.get(listing.cropType);
    results.push(
      computeValuation({
        listing,
        investment,
        pricePerKgGhs: quote?.pricePerKgGhs ?? null,
        priceSource: quote?.source ?? null,
        priceObservedAt: quote?.observedAt ?? null,
      }),
    );
  }
  return results;
}

/** Test hook. */
export function __resetPriceCache() {
  cache = null;
  lastRefreshAttempt = 0;
}
