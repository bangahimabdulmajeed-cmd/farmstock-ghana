import { CROP_LABELS, type CropType } from "./crops";

export { CROP_LABELS, CROP_TYPES } from "./crops";
export type { CropType } from "./crops";

export type PriceDirection = "up" | "down" | "flat" | "unknown";

/** A single normalised price observation, always in GH¢ per kg. */
export type PricePoint = {
  cropType: CropType;
  scope: "global" | "national";
  market: string;
  pricePerKgGhs: number;
  /** Original quote as published, e.g. 452 cents per bushel. */
  priceNative: number | null;
  nativeCurrency: string | null;
  nativeUnit: string | null;
  fxRateGhsPerUsd: number | null;
  source: string;
  observedAt: string;
};

/** Latest quote for a crop, with enough context to show appreciation. */
export type CropQuote = {
  cropType: CropType;
  label: string;
  /** Best available GH¢/kg: national market price when present, else global benchmark. */
  pricePerKgGhs: number | null;
  /** Which leg `pricePerKgGhs` came from. Null when there is no usable price. */
  basis: "national" | "global" | null;
  nationalPricePerKgGhs: number | null;
  nationalMarket: string | null;
  globalPricePerKgGhs: number | null;
  globalMarket: string | null;
  /** Percentage change against the previous observation for the same series. */
  changePct: number | null;
  direction: PriceDirection;
  /** Last 30 observations of the series backing `pricePerKgGhs`, oldest first. */
  sparkline: number[];
  source: string | null;
  observedAt: string | null;
  /** True when we are serving stored data because the upstream feed failed. */
  stale: boolean;
};

export type PricesPayload = {
  quotes: CropQuote[];
  fxRateGhsPerUsd: number | null;
  fetchedAt: string;
  stale: boolean;
};

/** Per-holding appreciation, used on the portfolio and listing pages. */
export type Valuation = {
  cropType: CropType;
  cropName: string;
  /** GH¢ per kg the investor effectively paid. */
  costPerKgGhs: number | null;
  /** Current GH¢ per kg, null when no usable price exists. */
  marketPerKgGhs: number | null;
  /** kg represented by one share of the listing. */
  kgPerShare: number | null;
  sharesOwned: number;
  quantityKg: number | null;
  /** What the holding cost. */
  costBasisGhs: number;
  /** What those kg are worth at the current price. */
  marketValueGhs: number | null;
  /** marketValueGhs - costBasisGhs. */
  gainLossGhs: number | null;
  /** Signed percentage, e.g. -4.21 means down 4.21%. */
  gainLossPct: number | null;
  direction: PriceDirection;
  priceSource: string | null;
  priceObservedAt: string | null;
};
