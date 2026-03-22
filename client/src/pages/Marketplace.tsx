import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  TrendingUp,
  Zap,
  Search,
  Filter,
  ChevronRight,
  Loader2,
  Plus,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";

export default function Marketplace() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedShare, setSelectedShare] = useState<number | null>(null);
  const [buyQuantity, setBuyQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [showListForm, setShowListForm] = useState(false);
  const [listFormData, setListFormData] = useState({
    investmentId: 0,
    quantity: 1,
    pricePerShare: "",
  });

  // Fetch marketplace listings
  const { data: listings, isLoading: listingsLoading } = trpc.marketplace.getMarketplaceListings.useQuery({
    limit: 50,
    offset: 0,
  });

  const buySharesMutation = trpc.marketplace.buySharesFromMarketplace.useMutation();
  const listSharesMutation = trpc.marketplace.listSharesForSale.useMutation();

  const handleBuyShares = async (shareId: number) => {
    if (buyQuantity < 1) {
      toast.error("Please enter a valid quantity");
      return;
    }

    setIsLoading(true);
    try {
      await buySharesMutation.mutateAsync({
        marketplaceListingId: shareId,
        shareQuantity: buyQuantity,
      });
      toast.success("Shares purchased successfully!");
      setSelectedShare(null);
      setBuyQuantity(1);
    } catch (error) {
      toast.error("Failed to purchase shares");
    } finally {
      setIsLoading(false);
    }
  };

  const handleListShares = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!listFormData.pricePerShare || listFormData.quantity < 1) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsLoading(true);
    try {
      await listSharesMutation.mutateAsync({
        investmentId: listFormData.investmentId,
        shareQuantity: listFormData.quantity,
        pricePerShare: listFormData.pricePerShare,
      });
      toast.success("Shares listed successfully!");
      setShowListForm(false);
      setListFormData({ investmentId: 0, quantity: 1, pricePerShare: "" });
    } catch (error) {
      toast.error("Failed to list shares");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredListings = listings?.filter(
    (listing) =>
      listing.status === "active" &&
      (listing.id.toString().includes(searchTerm.toLowerCase()) ||
        listing.investmentId.toString().includes(searchTerm.toLowerCase()))
  );

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
            {listingsLoading ? (
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
                      <h3 className="text-lg font-semibold mb-1">Farm Produce Shares</h3>
                      <p className="text-sm text-muted-foreground">From local farmer</p>
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
                        <p className="text-xs text-muted-foreground">Seller</p>
                        <p className="text-sm font-medium">Investor</p>
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
                      onClick={() => setSelectedShare(listing.id)}
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
          </TabsContent>
        </Tabs>
      </div>

      {/* Buy Shares Modal */}
      {selectedShare && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md card-elevated">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Purchase Shares</h2>
                <p className="text-muted-foreground">
                  How many shares would you like to buy?
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Number of Shares</label>
                <Input
                  type="number"
                  min="1"
                  value={buyQuantity}
                  onChange={(e) => setBuyQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Total: {formatCurrency(buyQuantity * 100)} (estimated)
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
                <Button
                  onClick={() => handleBuyShares(selectedShare)}
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
                  <select
                    value={listFormData.investmentId}
                    onChange={(e) =>
                      setListFormData({ ...listFormData, investmentId: parseInt(e.target.value) })
                    }
                    className="input-field"
                    required
                  >
                    <option value="">Select an investment</option>
                    <option value="1">Maize Investment - 50 shares</option>
                    <option value="2">Cocoa Investment - 30 shares</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Quantity to Sell *</label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="10"
                    value={listFormData.quantity}
                    onChange={(e) =>
                      setListFormData({ ...listFormData, quantity: parseInt(e.target.value) || 1 })
                    }
                    required
                  />
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
