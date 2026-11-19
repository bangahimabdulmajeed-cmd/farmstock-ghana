import type { CropType } from "../../drizzle/schema";

export type BenchmarkUnit =
  /** Quoted in US cents per bushel, e.g. CBOT corn. */
  | "cents_per_bushel"
  /** Quoted in US dollars per metric tonne, e.g. ICE cocoa. */
  | "usd_per_tonne"
  /** Quoted in US cents per pound, e.g. ICE sugar and coffee. */
  | "cents_per_pound"
  /** Quoted in US dollars per hundredweight (100 lb), e.g. CBOT rough rice. */
  | "usd_per_cwt";

export type Benchmark = {
  cropType: CropType;
  /** Yahoo Finance continuous front-month symbol. */
  symbol: string;
  exchange: string;
  unit: BenchmarkUnit;
  /** Kilograms per quoted unit. Only meaningful for bushel/cwt quotes. */
  kgPerUnit: number;
  /** Human readable unit, shown in the UI for auditability. */
  displayUnit: string;
};

const KG_PER_TONNE = 1000;
const KG_PER_POUND = 0.45359237;

/**
 * Exchange benchmarks we can read from a free, keyless source.
 *
 * Only three of the ten supported crops have a liquid global reference market.
 * The rest (cassava, plantain, tomato, pepper, groundnut, shea) are domestic
 * markets with no futures contract, so they rely on the national price table.
 * We deliberately do not invent a proxy for them.
 */
export const BENCHMARKS: Benchmark[] = [
  {
    cropType: "maize",
    symbol: "ZC=F",
    exchange: "CBOT",
    unit: "cents_per_bushel",
    kgPerUnit: 25.4012, // 56 lb bushel of corn
    displayUnit: "US¢/bu",
  },
  {
    cropType: "cocoa",
    symbol: "CC=F",
    exchange: "ICE",
    unit: "usd_per_tonne",
    kgPerUnit: KG_PER_TONNE,
    displayUnit: "USD/t",
  },
  {
    cropType: "rice",
    symbol: "ZR=F",
    exchange: "CBOT",
    unit: "usd_per_cwt",
    kgPerUnit: 45.359237, // 100 lb
    displayUnit: "USD/cwt",
  },
];

export const FX_SYMBOL = "USDGHS=X";

/**
 * Convert a native quote into US dollars per metric tonne.
 * Kept pure so it is trivially unit-testable.
 */
export function nativeToUsdPerTonne(benchmark: Pick<Benchmark, "unit" | "kgPerUnit">, price: number): number {
  switch (benchmark.unit) {
    case "usd_per_tonne":
      return price;
    case "cents_per_bushel":
      return price / 100 / (benchmark.kgPerUnit / KG_PER_TONNE);
    case "cents_per_pound":
      return (price / 100) * (KG_PER_TONNE / KG_PER_POUND);
    case "usd_per_cwt":
      return price / (benchmark.kgPerUnit / KG_PER_TONNE);
    default:
      return Number.NaN;
  }
}

/** GH¢ per kg from a native quote and a USD→GHS rate. */
export function nativeToGhsPerKg(
  benchmark: Pick<Benchmark, "unit" | "kgPerUnit">,
  price: number,
  fxRateGhsPerUsd: number,
): number {
  const usdPerTonne = nativeToUsdPerTonne(benchmark, price);
  return (usdPerTonne * fxRateGhsPerUsd) / KG_PER_TONNE;
}

export function benchmarkFor(cropType: CropType): Benchmark | undefined {
  return BENCHMARKS.find(b => b.cropType === cropType);
}
