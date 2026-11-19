import { useState } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import {
  Leaf,
  MapPin,
  Calendar,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn, formatCurrency } from "@/lib/utils";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof TRPCClientError) {
    return error.message || fallback;
  }
  return fallback;
}

function formatShortDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GH", { day: "numeric", month: "short" });
}

export default function ListingDetail() {
  const [, params] = useRoute("/listing/:id");
  const listingId = params?.id ? parseInt(params.id) : null;

  const [shareQuantity, setShareQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const utils = trpc.useUtils();

  // Fetch listing details
  const {
    data: selectedListing,
    isLoading: listingLoading,
    isError: listingError,
    refetch: refetchListing,
  } = trpc.investor.getListingById.useQuery(
    { listingId: listingId ?? 0 },
    { enabled: listingId !== null }
  );
  const purchaseSharesMutation = trpc.investor.purchaseShares.useMutation();

  const handlePurchase = async () => {
    if (!selectedListing) {
      toast.error("This listing is not available.");
      return;
    }
    if (!Number.isInteger(shareQuantity) || shareQuantity < 1) {
      toast.error("Please enter a whole number of shares.");
      return;
    }
    if (shareQuantity > selectedListing.sharesAvailable) {
      toast.error(`Only ${selectedListing.sharesAvailable} share(s) available.`);
      return;
    }

    setIsLoading(true);
    try {
      await purchaseSharesMutation.mutateAsync({
        produceListingId: selectedListing.id,
        shareQuantity,
        exitOption: "cash_payout",
      });
      toast.success("Shares purchased successfully!");
      await Promise.all([
        utils.investor.getPortfolio.invalidate(),
        utils.investor.getListingById.invalidate({ listingId: selectedListing.id }),
      ]);
      setShareQuantity(1);
    } catch (error) {
      toast.error(errorMessage(error, "Failed to purchase shares"));
    } finally {
      setIsLoading(false);
    }
  };

  if (listingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (listingError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="card-subtle p-8 text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Could Not Load Listing</h2>
          <p className="text-muted-foreground mb-6">
            Something went wrong while loading this listing.
          </p>
          <Button onClick={() => void refetchListing()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  if (!selectedListing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="card-subtle p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">Listing Not Found</h2>
          <p className="text-muted-foreground mb-6">The listing you're looking for doesn't exist.</p>
          <Button onClick={() => window.history.back()}>Go Back</Button>
        </Card>
      </div>
    );
  }

  const fundingPercentage =
    (Number(selectedListing.fundedAmount) /
      (Number(selectedListing.pricePerShare) * selectedListing.totalShares)) *
    100;
  const totalCost = shareQuantity * Number(selectedListing.pricePerShare);

  const market = selectedListing.market;
  const marketPerKg = market?.pricePerKgGhs ?? null;
  const listedPerKg = market?.listedPricePerKgGhs ?? null;
  const appreciationPct = market?.appreciationPct ?? null;
  const marketSource = market?.source ?? null;
  const marketObservedOn = formatShortDate(market?.observedAt ?? null);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border-b border-border p-6">
        <div className="container">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.back()}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-gradient">{selectedListing.cropName}</h1>
          <p className="text-muted-foreground mt-2">Investment Opportunity</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="container py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Listing Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Crop Image */}
            <Card className="card-subtle overflow-hidden">
              <div className="w-full h-64 bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                <Leaf className="w-24 h-24 text-primary/40" />
              </div>
            </Card>

            {/* Market Comparison */}
            <Card className="card-subtle p-6">
              <h2 className="text-xl font-bold mb-4">Market Value</h2>
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground">Current Market Price</p>
                  <p className="font-semibold text-lg">
                    {marketPerKg !== null ? `${formatCurrency(marketPerKg)}/kg` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">This Listing Implies</p>
                  <p className="font-semibold text-lg">
                    {listedPerKg !== null ? `${formatCurrency(listedPerKg)}/kg` : "—"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground mb-1">Appreciation vs Market</p>
                  {appreciationPct !== null ? (
                    <p
                      className={cn(
                        "font-semibold text-lg flex items-center gap-2",
                        appreciationPct > 0
                          ? "text-green-600 dark:text-green-400"
                          : appreciationPct < 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-muted-foreground"
                      )}
                    >
                      {appreciationPct > 0 ? (
                        <TrendingUp className="w-5 h-5" />
                      ) : appreciationPct < 0 ? (
                        <TrendingDown className="w-5 h-5" />
                      ) : null}
                      {`${appreciationPct > 0 ? "+" : ""}${appreciationPct.toFixed(1)}%`}
                      <span className="text-xs font-normal text-muted-foreground">
                        {appreciationPct > 0
                          ? "cheaper than the market price"
                          : appreciationPct < 0
                            ? "above the market price"
                            : "in line with the market"}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">no market price yet</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    {marketPerKg !== null
                      ? `${market?.basis === "national" ? "Ghana market" : "global benchmark"} price${
                          marketSource ? ` from ${marketSource}` : ""
                        }${marketObservedOn ? ` · ${marketObservedOn}` : ""}`
                      : "A reference price is not available for this crop yet."}
                  </p>
                </div>
              </div>
            </Card>

            {/* Description & Details */}
            <Card className="card-subtle p-6 space-y-6">
              <div>
                <h2 className="text-xl font-bold mb-4">About This Listing</h2>
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-muted-foreground">Location</p>
                      <p className="font-semibold">{selectedListing.location}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Calendar className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-muted-foreground">Harvest Date</p>
                      <p className="font-semibold">
                        {new Date(selectedListing.harvestDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="font-bold mb-4">Funding Progress</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Funded</span>
                    <span className="font-semibold">{fundingPercentage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-border rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-primary to-secondary h-3 rounded-full transition-all"
                      style={{ width: `${Math.min(fundingPercentage, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{selectedListing.sharesSold} shares sold</span>
                    <span>{selectedListing.sharesAvailable} shares available</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="font-bold mb-4">Key Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total Shares</p>
                    <p className="font-semibold text-lg">{selectedListing.totalShares}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Minimum Investment</p>
                    <p className="font-semibold text-lg">{formatCurrency(Number(selectedListing.pricePerShare))}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Funding Goal</p>
                    <p className="font-semibold text-lg">
                      {formatCurrency(Number(selectedListing.pricePerShare) * selectedListing.totalShares)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <Badge variant="outline" className="mt-1">
                      {selectedListing.fundingStatus}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">kg per Share</p>
                    <p className="font-semibold text-lg">
                      {selectedListing.kgPerShare !== null
                        ? `${Number(selectedListing.kgPerShare).toFixed(3)} kg`
                        : selectedListing.totalShares > 0
                          ? `${(Number(selectedListing.totalQuantity) / selectedListing.totalShares).toFixed(3)} kg`
                          : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column - Purchase Form */}
          <div className="lg:col-span-1">
            <Card className="card-elevated p-6 sticky top-6 space-y-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Price per Share</p>
                <p className="text-3xl font-bold text-primary">
                  {formatCurrency(Number(selectedListing.pricePerShare))}
                </p>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium">Number of Shares</label>
                <Input
                  type="number"
                  min="1"
                  max={selectedListing.sharesAvailable}
                  value={shareQuantity}
                  onChange={(e) =>
                    setShareQuantity(Math.max(1, Math.min(selectedListing.sharesAvailable, parseInt(e.target.value) || 1)))
                  }
                  disabled={isLoading || selectedListing.sharesAvailable === 0}
                  className="text-lg"
                />
                <p className="text-xs text-muted-foreground">
                  Available: {selectedListing.sharesAvailable} shares
                </p>
              </div>

              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">{formatCurrency(totalCost)}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between">
                  <span className="font-semibold">Total</span>
                  <span className="text-lg font-bold text-primary">{formatCurrency(totalCost)}</span>
                </div>
              </div>

              <Button
                onClick={() => void handlePurchase()}
                disabled={isLoading || selectedListing.sharesAvailable === 0}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : selectedListing.sharesAvailable === 0 ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Fully Funded
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Purchase Shares
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                By purchasing, you agree to our terms and conditions
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
