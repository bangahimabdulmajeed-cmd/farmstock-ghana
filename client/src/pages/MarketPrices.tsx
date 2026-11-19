import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw, Info, LineChart } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { CropQuote } from "@shared/prices";

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) {
    return <div className="h-8" />;
  }

  const width = 140;
  const height = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const rising = values[values.length - 1] >= values[0];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("h-9 w-full", className)} preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={rising ? "text-emerald-500" : "text-rose-500"}
      />
    </svg>
  );
}

function DirectionBadge({ quote }: { quote: CropQuote }) {
  const pct = quote.changePct;
  if (pct === null) {
    return (
      <Badge variant="secondary" className="gap-1 font-normal">
        <Minus className="h-3 w-3" /> no change data
      </Badge>
    );
  }

  const up = pct > 0.01;
  const down = pct < -0.01;

  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 font-medium",
        up && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
        down && "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
      )}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : down ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {up || down ? `${pct.toFixed(2)}%` : "flat"}
    </Badge>
  );
}

export default function MarketPrices() {
  const quotesQuery = trpc.prices.getQuotes.useQuery(undefined, { refetchInterval: 60_000 });

  const quotes = quotesQuery.data?.quotes ?? [];
  const withPrice = useMemo(() => quotes.filter(quote => quote.pricePerKgGhs !== null), [quotes]);
  const withoutPrice = useMemo(() => quotes.filter(quote => quote.pricePerKgGhs === null), [quotes]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gradient">
            <LineChart className="h-6 w-6 text-primary" />
            Market Prices
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live exchange benchmarks for global crops, plus Ghana market prices entered by the platform operator.
            All figures are normalised to GH¢ per kilogram.
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {quotesQuery.data?.fetchedAt && <p>Updated {formatDate(quotesQuery.data.fetchedAt)}</p>}
          {quotesQuery.data?.fxRateGhsPerUsd ? (
            <p>USD/GHS {quotesQuery.data.fxRateGhsPerUsd.toFixed(2)}</p>
          ) : null}
        </div>
      </div>

      {quotesQuery.data?.stale && (
        <Alert className="mb-6 border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <Info className="h-4 w-4" />
          <AlertTitle>Showing stored prices</AlertTitle>
          <AlertDescription>
            The upstream price feed could not be reached, so these are the last known values. They may be a few hours
            old.
          </AlertDescription>
        </Alert>
      )}

      {quotesQuery.isError && (
        <Card className="mb-6 p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">Could not load market prices.</p>
          <Button variant="outline" size="sm" onClick={() => quotesQuery.refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </Card>
      )}

      {quotesQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="p-5">
              <Skeleton className="mb-3 h-5 w-24" />
              <Skeleton className="mb-2 h-8 w-32" />
              <Skeleton className="h-9 w-full" />
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {withPrice.map(quote => (
              <Card key={quote.cropType} className="p-5">
                <div className="mb-1 flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold">{quote.label}</h2>
                    <p className="text-xs text-muted-foreground">
                      {quote.basis === "national" ? quote.nationalMarket : quote.globalMarket}
                      {quote.basis ? ` · ${quote.basis}` : ""}
                    </p>
                  </div>
                  <DirectionBadge quote={quote} />
                </div>

                <p className="mt-3 text-2xl font-bold">
                  {formatCurrency(quote.pricePerKgGhs ?? 0)}
                  <span className="text-sm font-normal text-muted-foreground">/kg</span>
                </p>

                <Sparkline values={quote.sparkline} className="mt-2" />

                <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {quote.globalPricePerKgGhs !== null && (
                    <div className="flex justify-between">
                      <dt>Global ({quote.globalMarket})</dt>
                      <dd>{formatCurrency(quote.globalPricePerKgGhs)}/kg</dd>
                    </div>
                  )}
                  {quote.nationalPricePerKgGhs !== null && (
                    <div className="flex justify-between">
                      <dt>Ghana ({quote.nationalMarket})</dt>
                      <dd>{formatCurrency(quote.nationalPricePerKgGhs)}/kg</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt>Source</dt>
                    <dd className="truncate pl-2 text-right">{quote.source ?? "—"}</dd>
                  </div>
                  {quote.observedAt && (
                    <div className="flex justify-between">
                      <dt>Observed</dt>
                      <dd>{formatDate(quote.observedAt)}</dd>
                    </div>
                  )}
                </dl>
              </Card>
            ))}
          </div>

          {withoutPrice.length > 0 && (
            <Card className="mt-6 p-5">
              <h2 className="mb-1 font-semibold">No market reference yet</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                These crops have no liquid global futures contract, so they only carry a price once the operator enters
                a Ghana market price.
              </p>
              <div className="flex flex-wrap gap-2">
                {withoutPrice.map(quote => (
                  <Badge key={quote.cropType} variant="outline" className="font-normal">
                    {quote.label}
                  </Badge>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <Card className="mt-8 p-5">
        <h2 className="mb-2 font-semibold">How these numbers are produced</h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
          <li>
            Global prices come from exchange futures (corn on CBOT, cocoa on ICE, rough rice on CBOT), converted from the
            quoted unit —
            cents per bushel, US dollars per tonne, dollars per hundredweight — into US dollars per tonne.
          </li>
          <li>
            That figure is converted to GH¢ with the live USD/GHS rate and divided by 1,000 to give GH¢ per kilogram.
          </li>
          <li>
            Ghana market prices are entered by an operator, because the country has no free public farmgate price API.
            A national price replaces the global one for valuation while it is less than 45 days old.
          </li>
          <li>
            A share is worth one <em>kgPerShare</em> of produce, so a listing trading below the market GH¢/kg is
            undervalued — that is what the appreciation figure on your portfolio measures.
          </li>
        </ul>
      </Card>
    </div>
  );
}
