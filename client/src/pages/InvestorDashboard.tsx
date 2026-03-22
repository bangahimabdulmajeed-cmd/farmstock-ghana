import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  TrendingUp,
  Leaf,
  ShoppingCart,
  Wallet,
  Search,
  Filter,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";

export default function InvestorDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedListing, setSelectedListing] = useState<number | null>(null);
  const [shareQuantity, setShareQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch data
  const { data: listings, isLoading: listingsLoading } = trpc.investor.browseListings.useQuery({
    limit: 20,
    offset: 0,
  });

  const { data: portfolio, isLoading: portfolioLoading } = trpc.investor.getPortfolio.useQuery();
  const purchaseSharesMutation = trpc.investor.purchaseShares.useMutation();

  const handlePurchaseShares = async (produceListingId: number) => {
    if (shareQuantity < 1) {
      toast.error("Please enter a valid quantity");
      return;
    }

    setIsLoading(true);
    try {
      await purchaseSharesMutation.mutateAsync({
        produceListingId,
        shareQuantity,
        exitOption: "cash_payout",
      });
      toast.success("Shares purchased successfully!");
      setSelectedListing(null);
      setShareQuantity(1);
    } catch (error) {
      toast.error("Failed to purchase shares");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredListings = listings?.filter(
    (listing) =>
      listing.cropName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      listing.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              <p className="text-3xl font-bold text-primary">
                {formatCurrency(portfolio?.totalValue || 0)}
              </p>
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
            {listingsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
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
                              width: `${(Number(listing.fundedAmount) / (Number(listing.pricePerShare) * listing.totalShares)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
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
            {portfolioLoading ? (
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
                {portfolio?.investments.map(({ investment, listing }) => (
                  <Card key={investment.id} className="card-subtle p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold mb-2">{listing?.cropName}</h3>
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Shares Owned</p>
                            <p className="font-semibold">{investment.sharesOwned}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Investment</p>
                            <p className="font-semibold">{formatCurrency(Number(investment.totalInvestment))}</p>
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
                      </div>
                      <Button variant="outline" size="sm">
                        Details
                      </Button>
                    </div>
                  </Card>
                ))}
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
      {selectedListing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md card-elevated">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Purchase Shares</h2>
                <p className="text-muted-foreground">
                  How many shares would you like to purchase?
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Number of Shares</label>
                <Input
                  type="number"
                  min="1"
                  value={shareQuantity}
                  onChange={(e) => setShareQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Total: {formatCurrency(shareQuantity * 100)} (estimated)
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
                <Button
                  onClick={() => handlePurchaseShares(selectedListing)}
                  disabled={isLoading}
                  className="flex-1"
                >
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
