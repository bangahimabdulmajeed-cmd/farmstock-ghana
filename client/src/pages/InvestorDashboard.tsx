import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import {
  TrendingUp,
  TrendingDown,
  Leaf,
  ShoppingCart,
  Wallet,
  Search,
  Filter,
  ChevronRight,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn, formatCurrency } from "@/lib/utils";
import type { Valuation } from "@shared/prices";

/** Market context attached to every listing by the API. */
type MarketInfo = {
  pricePerKgGhs: number | null;
  listedPricePerKgGhs: number | null;
  appreciationPct: number | null;
  direction: "up" | "down" | "flat" | "unknown";
  source: string | null;
  observedAt: string | null;
  basis: "national" | "global" | null;
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof TRPCClientError) {
    return error.message || fallback;
  }
  return fallback;
}

/** "12%", "8.3%" — no trailing .0. */
function percentLabel(pct: number): string {
  const abs = Math.abs(pct);
  const value = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return `${value.replace(/\.0$/, "")}%`;
}

/** "2 Mar" for the price timestamp. */
function formatShortDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GH", { day: "numeric", month: "short" });
}

/** "valued at GH¢5.20/kg · operator · 2 Mar" for a holding. */
function marketSmallPrint(valuation: Valuation | null): string {
  const marketPerKg = valuation?.marketPerKgGhs ?? null;
  if (marketPerKg === null) {
    return "no market price yet — showing cost basis";
  }
  const source = valuation?.priceSource ?? null;
  const observedOn = formatShortDate(valuation?.priceObservedAt ?? null);
  return `valued at ${formatCurrency(marketPerKg)}/kg${source ? ` · ${source}` : ""}${
    observedOn ? ` · ${observedOn}` : ""
  }`;
}

/** "Market GH¢5.20/kg · 12% above ask" — or a muted fallback. */
function MarketChip({ market }: { market: MarketInfo | null }) {
  if (!market || market.pricePerKgGhs === null) {
    return <p className="text-xs text-muted-foreground">no market price yet</p>;
  }

  const pct = market.appreciationPct;
  if (pct === null) {
    return (
      <p className="text-xs text-muted-foreground">
        Market {formatCurrency(market.pricePerKgGhs)}/kg · no ask comparison
      </p>
    );
  }

  const up = pct > 0;
  return (
    <p
      className={cn(
        "text-xs font-medium flex items-center gap-1",
        up ? "text-green-600 dark:text-green-400" : pct < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
      )}
    >
      {up ? <TrendingUp className="w-3 h-3" /> : pct < 0 ? <TrendingDown className="w-3 h-3" /> : null}
      Market {formatCurrency(market.pricePerKgGhs)}/kg · {percentLabel(pct)} {up ? "above" : pct < 0 ? "below" : "level with"} ask
    </p>
  );
}

/** Green/red gain-or-loss badge, e.g. "+4.2%" / "-4.2%". */
function GainLossBadge({ pct }: { pct: number | null }) {
  if (pct === null || !Number.isFinite(pct)) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        not priced
      </Badge>
    );
  }

  const up = pct > 0;
  const flat = Math.abs(pct) < 0.05;
  return (
    <Badge
      variant="outline"
      className={cn(
        flat
          ? "text-muted-foreground"
          : up
            ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900"
            : "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900"
      )}
    >
      {up ? <TrendingUp className="w-3 h-3 mr-1" /> : flat ? null : <TrendingDown className="w-3 h-3 mr-1" />}
      {`${up ? "+" : ""}${pct.toFixed(1)}%`}
    </Badge>
  );
}

function RetryCard({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <Card className="card-subtle text-center py-12">
      <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground mb-4">Something went wrong while loading this data.</p>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="w-4 h-4 mr-2" />
        Try again
      </Button>
    </Card>
  );
}

export default function InvestorDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedListing, setSelectedListing] = useState<number | null>(null);
  const [shareQuantity, setShareQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const utils = trpc.useUtils();

  // Fetch data
  const {
    data: listings,
    isLoading: listingsLoading,
    isError: listingsError,
    refetch: refetchListings,
  } = trpc.investor.browseListings.useQuery({
    limit: 20,
    offset: 0,
  });

  // Get the selected listing details
  const selectedListingData = listings?.find((l) => l.id === selectedListing);

  const {
    data: portfolio,
    isLoading: portfolioLoading,
    isError: portfolioError,
    refetch: refetchPortfolio,
  } = trpc.investor.getPortfolio.useQuery();
  const purchaseSharesMutation = trpc.investor.purchaseShares.useMutation();

  const handlePurchaseShares = async () => {
    if (selectedListing === null) return;

    const listing = listings?.find((l) => l.id === selectedListing);
    if (!listing) {
      toast.error("That listing is no longer available.");
      return;
    }

    const available = listing.sharesAvailable;
    if (!Number.isInteger(shareQuantity) || shareQuantity < 1) {
      toast.error("Please enter a whole number of shares.");
      return;
    }
    if (shareQuantity > available) {
      toast.error(`Only ${available} share(s) available.`);
      return;
    }

    setIsLoading(true);
    try {
      await purchaseSharesMutation.mutateAsync({
        produceListingId: selectedListing,
        shareQuantity,
        exitOption: "cash_payout",
      });
      toast.success("Shares purchased successfully!");
      await Promise.all([
        utils.investor.getPortfolio.invalidate(),
        utils.investor.browseListings.invalidate(),
        utils.investor.getListingById.invalidate(),
      ]);
      setSelectedListing(null);
      setShareQuantity(1);
    } catch (error) {
      toast.error(errorMessage(error, "Failed to purchase shares"));
    } finally {
      setIsLoading(false);
    }
  };

  const filteredListings = listings?.filter(
    (listing) =>
      listing.cropName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      listing.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalValue = portfolio?.totalValue ?? 0;
  const totalGainLossPct = portfolio?.totalGainLossPct ?? null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border-b border-border p-6">
        <div className="container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gradient mb-2">Investor Dashboard</h1>
              <p className="text-muted-foreground">Discover and invest in agricultural opportunities</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Portfolio Value</p>
              <p className="text-3xl font-bold text-primary">{formatCurrency(totalValue)}</p>
              {portfolioError ? (
                <p className="text-xs text-destructive">Could not load portfolio</p>
              ) : totalGainLossPct !== null ? (
                <div className="flex justify-end mt-1">
                  <GainLossBadge pct={totalGainLossPct} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container py-8">
        <Tabs defaultValue="browse" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="browse">Browse Listings</TabsTrigger>
            <TabsTrigger value="portfolio">My Portfolio</TabsTrigger>
            <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
          </TabsList>

          {/* Browse Listings Tab */}
          <TabsContent value="browse" className="space-y-6">
            {/* Search & Filter */}
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="Search by crop or location..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button variant="outline" size="lg">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
            </div>

            {/* Listings Grid */}
            {listingsError ? (
              <RetryCard title="Could not load listings" onRetry={() => void refetchListings()} />
            ) : listingsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredListings?.length === 0 ? (
              <Card className="card-subtle text-center py-12">
                <Leaf className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Listings Found</h3>
                <p className="text-muted-foreground">Try a different search term.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredListings?.map((listing) => (
                  <Card key={listing.id} className="card-subtle hover:shadow-lg transition-all cursor-pointer">
                    {/* Crop Image Placeholder */}
                    <div className="w-full h-40 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-lg mb-4 flex items-center justify-center">
                      <Leaf className="w-12 h-12 text-primary/40" />
                    </div>

                    {/* Listing Info */}
                    <h3 className="text-lg font-semibold mb-2">{listing.cropName}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{listing.location}</p>

                    {/* Key Details */}
                    <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-border">
                      <div>
                        <p className="text-xs text-muted-foreground">Price per Share</p>
                        <p className="text-lg font-semibold text-primary">
                          {formatCurrency(Number(listing.pricePerShare))}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Shares Available</p>
                        <p className="text-lg font-semibold">{listing.sharesAvailable}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Harvest Date</p>
                        <p className="text-sm font-medium">
                          {new Date(listing.harvestDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Funded</p>
                        <div className="w-full bg-border rounded-full h-2 mt-1">
                          <div
                            className="bg-primary h-2 rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                (Number(listing.fundedAmount) / (Number(listing.pricePerShare) * listing.totalShares)) * 100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Live market comparison */}
                    <div className="mb-4">
                      <MarketChip market={listing.market} />
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center justify-between mb-4">
                      <Badge variant="outline">{listing.fundingStatus}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {listing.sharesSold} / {listing.totalShares} sold
                      </span>
                    </div>

                    {/* Action Button */}
                    <Button
                      onClick={() => setSelectedListing(listing.id)}
                      className="w-full"
                      disabled={listing.sharesAvailable === 0}
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      {listing.sharesAvailable === 0 ? "Fully Funded" : "Invest Now"}
                      <ChevronRight className="w-4 h-4 ml-auto" />
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Portfolio Tab */}
          <TabsContent value="portfolio" className="space-y-6">
            {portfolioError ? (
              <RetryCard title="Could not load your portfolio" onRetry={() => void refetchPortfolio()} />
            ) : portfolioLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : portfolio?.investments.length === 0 ? (
              <Card className="card-subtle text-center py-12">
                <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Investments Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start investing in agricultural opportunities to build your portfolio
                </p>
                <Button onClick={() => setSearchTerm("")}>Browse Listings</Button>
              </Card>
            ) : (
              <div className="space-y-4">
                {portfolio?.investments.map(({ investment, listing, valuation }) => {
                  const costBasis = valuation?.costBasisGhs ?? Number(investment.totalInvestment);
                  const marketValue = valuation?.marketValueGhs ?? null;
                  const gainLossPct = valuation?.gainLossPct ?? null;
                  const gainLossGhs = valuation?.gainLossGhs ?? null;
                  const kgPerShare = valuation?.kgPerShare ?? null;
                  const quantityKg = valuation?.quantityKg ?? null;

                  return (
                    <Card key={investment.id} className="card-subtle p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex-1 min-w-[240px]">
                          <div className="flex items-center gap-3 mb-3">
                            <h3 className="text-lg font-semibold">
                              {valuation?.cropName ?? listing?.cropName ?? "Holding"}
                            </h3>
                            <GainLossBadge pct={gainLossPct} />
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Shares Owned</p>
                              <p className="font-semibold">{valuation?.sharesOwned ?? investment.sharesOwned}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Cost Basis</p>
                              <p className="font-semibold">{formatCurrency(costBasis)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Market Value</p>
                              <p className="font-semibold">
                                {marketValue !== null ? formatCurrency(marketValue) : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Gain / Loss</p>
                              <p
                                className={cn(
                                  "font-semibold",
                                  gainLossGhs === null
                                    ? "text-muted-foreground"
                                    : gainLossGhs > 0
                                      ? "text-green-600 dark:text-green-400"
                                      : gainLossGhs < 0
                                        ? "text-red-600 dark:text-red-400"
                                        : ""
                                )}
                              >
                                {gainLossGhs !== null
                                  ? `${gainLossGhs > 0 ? "+" : ""}${formatCurrency(gainLossGhs)}`
                                  : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">kg per Share</p>
                              <p className="font-semibold">
                                {kgPerShare !== null ? `${kgPerShare.toFixed(3)} kg` : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Quantity</p>
                              <p className="font-semibold">
                                {quantityKg !== null ? `${quantityKg.toFixed(1)} kg` : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Status</p>
                              <Badge variant="outline" className="mt-1">
                                {investment.status}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Exit Option</p>
                              <p className="font-semibold text-xs">{investment.exitOption.replace(/_/g, " ")}</p>
                            </div>
                          </div>

                          <p className="text-xs text-muted-foreground mt-3">
                            {marketSmallPrint(valuation)}
                          </p>
                        </div>
                        <Button variant="outline" size="sm">
                          Details
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Marketplace Tab */}
          <TabsContent value="marketplace" className="space-y-6">
            <Card className="card-subtle text-center py-12">
              <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Share Marketplace</h3>
              <p className="text-muted-foreground">
                Trade shares with other investors coming soon
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Purchase Modal */}
      {selectedListing !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md card-elevated">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Purchase Shares</h2>
                <p className="text-muted-foreground">
                  How many shares would you like to purchase?
                </p>
                {selectedListingData ? (
                  <p className="text-sm font-medium mt-1">
                    {selectedListingData.cropName} · {formatCurrency(Number(selectedListingData.pricePerShare))} per share
                  </p>
                ) : null}
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Number of Shares</label>
                <Input
                  type="number"
                  min="1"
                  max={selectedListingData?.sharesAvailable ?? 1}
                  value={shareQuantity}
                  onChange={(e) => setShareQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Total: {formatCurrency(shareQuantity * Number(selectedListingData?.pricePerShare || 0))} (estimated)
                </p>
                <p className="text-xs text-muted-foreground">
                  Available: {selectedListingData?.sharesAvailable ?? 0} shares
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setSelectedListing(null)}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button onClick={() => void handlePurchaseShares()} disabled={isLoading} className="flex-1">
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      Confirm Purchase
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
