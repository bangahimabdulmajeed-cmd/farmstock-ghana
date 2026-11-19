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
  Zap,
  Search,
  Filter,
  ChevronRight,
  Loader2,
  Plus,
  AlertCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof TRPCClientError) {
    return error.message || fallback;
  }
  return fallback;
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

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">active</Badge>;
    case "sold":
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">sold</Badge>;
    case "cancelled":
      return <Badge variant="outline" className="text-muted-foreground">cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function Marketplace() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedShare, setSelectedShare] = useState<number | null>(null);
  const [buyQuantity, setBuyQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showListForm, setShowListForm] = useState(false);
  const [listFormData, setListFormData] = useState<{
    investmentId: number | null;
    quantity: number;
    pricePerShare: string;
  }>({
    investmentId: null,
    quantity: 1,
    pricePerShare: "",
  });

  const utils = trpc.useUtils();

  // Fetch marketplace listings
  const {
    data: listings,
    isLoading: listingsLoading,
    isError: listingsError,
    refetch: refetchListings,
  } = trpc.marketplace.getMarketplaceListings.useQuery();

  // The seller's own listings
  const {
    data: myListings,
    isLoading: myListingsLoading,
    isError: myListingsError,
    refetch: refetchMyListings,
  } = trpc.marketplace.getMyMarketplaceListings.useQuery();

  // Real investments to choose from when listing shares
  const {
    data: portfolio,
    isLoading: portfolioLoading,
    isError: portfolioError,
    refetch: refetchPortfolio,
  } = trpc.investor.getPortfolio.useQuery();

  const buySharesMutation = trpc.marketplace.buyShares.useMutation();
  const listSharesMutation = trpc.marketplace.listShares.useMutation();
  const cancelListingMutation = trpc.marketplace.cancelListing.useMutation();

  const refreshMarketData = async () => {
    await Promise.all([
      utils.marketplace.getMarketplaceListings.invalidate(),
      utils.investor.getPortfolio.invalidate(),
      utils.payout.getPayoutRequests.invalidate(),
      utils.marketplace.getMyMarketplaceListings.invalidate(),
    ]);
  };

  const selectedBuyListing = listings?.find((listing) => listing.id === selectedShare) ?? null;

  const selectedInvestment =
    listFormData.investmentId === null
      ? null
      : portfolio?.investments.find((row) => row.investment.id === listFormData.investmentId) ?? null;

  // Shares already escrowed in active marketplace listings for this investment.
  const alreadyListed = (myListings ?? [])
    .filter((row) => row.investmentId === listFormData.investmentId && row.status === "active")
    .reduce((sum, row) => sum + row.sharesForSale, 0);

  const availableToSell = selectedInvestment
    ? Math.max(0, selectedInvestment.investment.sharesOwned - alreadyListed)
    : 0;

  const handleBuyShares = async () => {
    if (selectedShare === null) return;

    const listing = listings?.find((row) => row.id === selectedShare);
    if (!listing) {
      toast.error("That listing is no longer available.");
      return;
    }

    if (!Number.isInteger(buyQuantity) || buyQuantity < 1) {
      toast.error("Please enter a whole number of shares.");
      return;
    }
    if (buyQuantity > listing.sharesForSale) {
      toast.error(`Only ${listing.sharesForSale} share(s) available.`);
      return;
    }

    setIsLoading(true);
    try {
      await buySharesMutation.mutateAsync({
        marketplaceListingId: selectedShare,
        shareQuantity: buyQuantity,
      });
      toast.success("Shares purchased successfully!");
      await refreshMarketData();
      setSelectedShare(null);
      setBuyQuantity(1);
    } catch (error) {
      toast.error(errorMessage(error, "Failed to purchase shares"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleListShares = async (e: React.FormEvent) => {
    e.preventDefault();

    const investmentId = listFormData.investmentId;
    if (investmentId === null) {
      toast.error("Please select an investment to list shares from.");
      return;
    }

    if (!selectedInvestment) {
      toast.error("That investment could not be found in your portfolio.");
      return;
    }

    if (selectedInvestment.investment.exitOption === "physical_delivery") {
      toast.error("This investment was bought for physical delivery and cannot be traded.");
      return;
    }

    if (selectedInvestment.investment.status !== "active") {
      toast.error("This investment is not available to trade.");
      return;
    }

    if (!Number.isInteger(listFormData.quantity) || listFormData.quantity < 1) {
      toast.error("Quantity must be a whole number greater than zero.");
      return;
    }

    if (availableToSell === 0) {
      toast.error("You have no shares available to list from this investment.");
      return;
    }

    if (listFormData.quantity > availableToSell) {
      toast.error(`You have ${availableToSell} share(s) available to list.`);
      return;
    }

    const price = parseFloat(listFormData.pricePerShare);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("Please enter a price per share greater than zero.");
      return;
    }

    setIsLoading(true);
    try {
      await listSharesMutation.mutateAsync({
        investmentId,
        shareQuantity: listFormData.quantity,
        pricePerShare: price,
      });
      toast.success("Shares listed successfully!");
      setShowListForm(false);
      setListFormData({ investmentId: null, quantity: 1, pricePerShare: "" });
      await refreshMarketData();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to list shares"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelListing = async (marketplaceListingId: number) => {
    if (!window.confirm("Cancel this share listing? Your shares stop being offered for sale.")) return;

    setIsLoading(true);
    try {
      await cancelListingMutation.mutateAsync({ marketplaceListingId });
      toast.success("Listing cancelled successfully!");
      await refreshMarketData();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to cancel the listing"));
    } finally {
      setIsLoading(false);
    }
  };

  const filteredListings = listings?.filter((listing) => {
    const term = searchTerm.toLowerCase();
    return (
      listing.status === "active" &&
      ((listing.cropName ?? "").toLowerCase().includes(term) ||
        (listing.location ?? "").toLowerCase().includes(term) ||
        listing.investmentId.toString().includes(term))
    );
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border-b border-border p-6">
        <div className="container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gradient mb-2">Share Marketplace</h1>
              <p className="text-muted-foreground">Buy and sell farm produce shares with other investors</p>
            </div>
            <Button onClick={() => setShowListForm(true)} size="lg" className="gap-2">
              <Plus className="w-5 h-5" />
              List Shares
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container py-8">
        <Tabs defaultValue="browse" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="browse">Browse Shares</TabsTrigger>
            <TabsTrigger value="my-listings">My Listings</TabsTrigger>
          </TabsList>

          {/* Browse Tab */}
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
              <RetryCard title="Could not load marketplace listings" onRetry={() => void refetchListings()} />
            ) : listingsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredListings?.length === 0 ? (
              <Card className="card-subtle text-center py-12">
                <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Shares Available</h3>
                <p className="text-muted-foreground">
                  Check back soon for available share listings
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredListings?.map((listing) => (
                  <Card key={listing.id} className="card-subtle hover:shadow-lg transition-all">
                    {/* Header */}
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold mb-1">{listing.cropName ?? "Farm Produce Shares"}</h3>
                      <p className="text-sm text-muted-foreground">{listing.location ?? "Ghana"}</p>
                    </div>

                    {/* Key Details */}
                    <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-border">
                      <div>
                        <p className="text-xs text-muted-foreground">Price per Share</p>
                        <p className="text-lg font-semibold text-primary">
                          {formatCurrency(Number(listing.pricePerShare))}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Available</p>
                        <p className="text-lg font-semibold">{listing.sharesForSale}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Original Share Price</p>
                        <p className="text-sm font-medium">
                          {listing.originalSharePrice !== null
                            ? formatCurrency(Number(listing.originalSharePrice))
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Listed</p>
                        <p className="text-sm font-medium">
                          {new Date(listing.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center justify-between mb-4">
                      <Badge variant="outline" className="bg-secondary/10">
                        <TrendingUp className="w-3 h-3 mr-1" />
                        {listing.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Total: {formatCurrency(Number(listing.totalPrice))}
                      </span>
                    </div>

                    {/* Action Button */}
                    <Button
                      onClick={() => {
                        setSelectedShare(listing.id);
                        setBuyQuantity(1);
                      }}
                      className="w-full"
                      disabled={listing.sharesForSale === 0}
                    >
                      Buy Shares
                      <ChevronRight className="w-4 h-4 ml-auto" />
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* My Listings Tab */}
          <TabsContent value="my-listings" className="space-y-6">
            {myListingsError ? (
              <RetryCard title="Could not load your listings" onRetry={() => void refetchMyListings()} />
            ) : myListingsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : !myListings || myListings.length === 0 ? (
              <Card className="card-subtle text-center py-12">
                <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Your Share Listings</h3>
                <p className="text-muted-foreground mb-4">
                  Manage your active share listings here
                </p>
                <Button onClick={() => setShowListForm(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  List Shares for Sale
                </Button>
              </Card>
            ) : (
              <div className="space-y-4">
                {myListings.map((listing) => {
                  const holding = portfolio?.investments.find(
                    (row) => row.investment.id === listing.investmentId
                  );
                  const cropName =
                    holding?.listing?.cropName ?? holding?.valuation?.cropName ?? "Investment";

                  return (
                    <Card key={listing.id} className="card-subtle p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex-1 min-w-[240px]">
                          <div className="flex items-center gap-3 mb-3">
                            <h3 className="text-lg font-semibold">{cropName}</h3>
                            <StatusBadge status={listing.status} />
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Price per Share</p>
                              <p className="font-semibold">{formatCurrency(Number(listing.pricePerShare))}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Shares for Sale</p>
                              <p className="font-semibold">{listing.sharesForSale}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Shares Sold</p>
                              <p className="font-semibold">{listing.sharesSold ?? 0}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Total Value</p>
                              <p className="font-semibold">{formatCurrency(Number(listing.totalPrice))}</p>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-3">
                            Listed {new Date(listing.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600"
                          disabled={listing.status !== "active" || isLoading}
                          title={
                            listing.status === "active"
                              ? "Cancel this listing"
                              : "Only active listings can be cancelled"
                          }
                          onClick={() => void handleCancelListing(listing.id)}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Buy Shares Modal */}
      {selectedShare !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md card-elevated">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Purchase Shares</h2>
                <p className="text-muted-foreground">
                  How many shares would you like to buy?
                </p>
                {selectedBuyListing ? (
                  <p className="text-sm font-medium mt-1">
                    {selectedBuyListing.cropName ?? "Farm produce"} ·{" "}
                    {formatCurrency(Number(selectedBuyListing.pricePerShare))} per share
                  </p>
                ) : null}
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Number of Shares</label>
                <Input
                  type="number"
                  min="1"
                  max={selectedBuyListing?.sharesForSale ?? 1}
                  value={buyQuantity}
                  onChange={(e) => setBuyQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Total:{" "}
                  {formatCurrency(buyQuantity * Number(selectedBuyListing?.pricePerShare ?? 0))} (estimated)
                </p>
                <p className="text-xs text-muted-foreground">
                  Available: {selectedBuyListing?.sharesForSale ?? 0} shares
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setSelectedShare(null)}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button onClick={() => void handleBuyShares()} disabled={isLoading} className="flex-1">
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-4 h-4 mr-2" />
                      Buy Now
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* List Shares Modal */}
      {showListForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <Card className="w-full max-w-md card-elevated my-8">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">List Shares for Sale</h2>
                <p className="text-muted-foreground">
                  Sell your shares to other investors
                </p>
              </div>

              <form onSubmit={handleListShares} className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Investment *</label>
                  {portfolioError ? (
                    <div className="p-3 border border-border rounded-lg text-sm">
                      <p className="text-destructive mb-2">Could not load your investments.</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void refetchPortfolio()}
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Try again
                      </Button>
                    </div>
                  ) : (
                    <select
                      value={listFormData.investmentId === null ? "" : String(listFormData.investmentId)}
                      onChange={(e) =>
                        setListFormData({
                          ...listFormData,
                          investmentId: e.target.value === "" ? null : parseInt(e.target.value),
                        })
                      }
                      className="input-field"
                      disabled={portfolioLoading || isLoading}
                      required
                    >
                      <option value="">Select an investment</option>
                      {(portfolio?.investments ?? []).map((row) => (
                        <option key={row.investment.id} value={row.investment.id}>
                          {`${row.listing?.cropName ?? row.valuation?.cropName ?? "Investment"} — ${
                            row.investment.sharesOwned
                          } shares`}
                        </option>
                      ))}
                    </select>
                  )}
                  {selectedInvestment ? (
                    <p className="text-xs text-muted-foreground mt-2">
                      Exit option: {selectedInvestment.investment.exitOption.replace(/_/g, " ")}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Quantity to Sell *</label>
                  <Input
                    type="number"
                    min="1"
                    max={availableToSell > 0 ? availableToSell : undefined}
                    placeholder="10"
                    value={listFormData.quantity}
                    onChange={(e) =>
                      setListFormData({ ...listFormData, quantity: parseInt(e.target.value) || 1 })
                    }
                    disabled={isLoading}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Available to list: {availableToSell} shares
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Price per Share (GH¢) *</label>
                  <Input
                    type="number"
                    placeholder="55"
                    value={listFormData.pricePerShare}
                    onChange={(e) =>
                      setListFormData({ ...listFormData, pricePerShare: e.target.value })
                    }
                    disabled={isLoading}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Total: {formatCurrency(
                      listFormData.quantity * (parseFloat(listFormData.pricePerShare) || 0)
                    )}
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowListForm(false)}
                    disabled={isLoading}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading} className="flex-1">
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Listing...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        List Shares
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
