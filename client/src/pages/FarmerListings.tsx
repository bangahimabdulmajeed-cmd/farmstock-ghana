import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import { CROP_LABELS } from "@shared/prices";
import {
  Plus,
  Leaf,
  TrendingUp,
  TrendingDown,
  Loader2,
  Edit2,
  Trash2,
  Calendar,
  MapPin,
  DollarSign,
  AlertCircle,
  RefreshCw,
  Lock,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn, formatCurrency } from "@/lib/utils";

const CROP_OPTIONS = [
  "maize",
  "cocoa",
  "cassava",
  "plantain",
  "rice",
  "tomato",
  "pepper",
  "groundnut",
  "shea",
  "other",
] as const;

type CropOption = (typeof CROP_OPTIONS)[number];

type MarketInfo = {
  pricePerKgGhs: number | null;
  listedPricePerKgGhs: number | null;
  appreciationPct: number | null;
  direction: "up" | "down" | "flat" | "unknown";
  source: string | null;
  observedAt: string | null;
  basis: "national" | "global" | null;
};

/** The fields the edit modal needs; any listing row satisfies this shape. */
type EditableListing = {
  id: number;
  pricePerShare: string;
  harvestDate: Date;
  location: string;
  sharesSold: number | null;
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof TRPCClientError) {
    return error.message || fallback;
  }
  return fallback;
}

function percentLabel(pct: number): string {
  const abs = Math.abs(pct);
  const value = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return `${value.replace(/\.0$/, "")}%`;
}

function toDateInputValue(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
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

function RetryCard({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <Card className="card-subtle text-center py-12">
      <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground mb-4">Something went wrong while loading your listings.</p>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="w-4 h-4 mr-2" />
        Try again
      </Button>
    </Card>
  );
}

export default function FarmerListings() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [cropType, setCropType] = useState<CropOption>("maize");
  const [cropName, setCropName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [totalShares, setTotalShares] = useState("");
  const [pricePerShare, setPricePerShare] = useState("");
  const [harvestDate, setHarvestDate] = useState("");
  const [location, setLocation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit modal
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ pricePerShare: "", harvestDate: "", location: "" });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Fetch farmer's listings
  const {
    data: listings,
    isLoading,
    isError: listingsError,
    refetch,
  } = trpc.farmer.getMyListings.useQuery();
  const createListingMutation = trpc.farmer.createListing.useMutation();
  const updateListingMutation = trpc.farmer.updateListing.useMutation();
  const deleteListingMutation = trpc.farmer.deleteListing.useMutation();

  const editingListing = listings?.find((listing) => listing.id === editingId) ?? null;
  const editPriceLocked = (editingListing?.sharesSold ?? 0) > 0;

  const quantityNumber = parseFloat(quantity);
  const sharesNumber = Number(totalShares);
  const kgPerSharePreview =
    Number.isFinite(quantityNumber) && quantityNumber > 0 && Number.isInteger(sharesNumber) && sharesNumber > 0
      ? quantityNumber / sharesNumber
      : null;

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cropName || !quantity || !pricePerShare || !totalShares || !harvestDate || !location) {
      toast.error("Please fill in all fields");
      return;
    }

    const totalQuantity = parseFloat(quantity);
    if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) {
      toast.error("Total quantity must be a number greater than zero");
      return;
    }

    if (!Number.isInteger(sharesNumber) || sharesNumber <= 0) {
      toast.error("Total shares must be a whole number greater than zero");
      return;
    }

    const price = parseFloat(pricePerShare);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("Price per share must be a number greater than zero");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createListingMutation.mutateAsync({
        cropType,
        cropName,
        totalQuantity,
        pricePerShare: price,
        totalShares: sharesNumber,
        harvestDate: new Date(harvestDate),
        location,
      });
      toast.success(`Listing created — ${result.kgPerShare.toFixed(3)} kg per share`);
      setCropName("");
      setQuantity("");
      setTotalShares("");
      setPricePerShare("");
      setHarvestDate("");
      setLocation("");
      setShowCreateForm(false);
      await refetch();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to create listing"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteListing = async (listingId: number, sharesSold: number) => {
    if (sharesSold > 0) {
      toast.error("Investors already own shares in this listing, so it cannot be cancelled.");
      return;
    }
    if (!confirm("Are you sure you want to delete this listing?")) return;

    try {
      await deleteListingMutation.mutateAsync({ listingId });
      toast.success("Listing deleted successfully!");
      await refetch();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to delete listing"));
    }
  };

  const openEdit = (listing: EditableListing) => {
    setEditingId(listing.id);
    setEditForm({
      pricePerShare: Number(listing.pricePerShare).toFixed(2),
      harvestDate: toDateInputValue(listing.harvestDate),
      location: listing.location,
    });
  };

  const handleUpdateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingListing) return;

    if (!editForm.harvestDate) {
      toast.error("Please choose a harvest date");
      return;
    }
    if (!editForm.location.trim()) {
      toast.error("Please enter a location");
      return;
    }

    const payload: { listingId: number; pricePerShare?: number; harvestDate: Date; location: string } = {
      listingId: editingListing.id,
      harvestDate: new Date(editForm.harvestDate),
      location: editForm.location.trim(),
    };

    if (!editPriceLocked) {
      const price = parseFloat(editForm.pricePerShare);
      if (!Number.isFinite(price) || price <= 0) {
        toast.error("Price per share must be a number greater than zero");
        return;
      }
      payload.pricePerShare = price;
    }

    setIsSavingEdit(true);
    try {
      await updateListingMutation.mutateAsync(payload);
      toast.success("Listing updated successfully!");
      setEditingId(null);
      await refetch();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to update listing"));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const activeListings = listings?.filter((l) => l.fundingStatus === "active") || [];
  const fundedListings = listings?.filter((l) => l.fundingStatus === "fully_funded") || [];
  const harvestedListings = listings?.filter((l) => l.fundingStatus === "harvested") || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border-b border-border p-6">
        <div className="container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gradient mb-2">My Listings</h1>
              <p className="text-muted-foreground">Manage your farm produce listings</p>
            </div>
            <Button
              onClick={() => setShowCreateForm(!showCreateForm)}
              size="lg"
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Listing
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container py-8">
        {/* Create Form */}
        {showCreateForm && (
          <Card className="card-elevated p-6 mb-8">
            <h2 className="text-2xl font-bold mb-6">Create New Listing</h2>
            <form onSubmit={handleCreateListing} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Crop Type</label>
                  <select
                    value={cropType}
                    onChange={(e) => {
                      const value = e.target.value as CropOption;
                      setCropType(value);
                      setCropName((current) => (current.trim() === "" ? CROP_LABELS[value] : current));
                    }}
                    className="input-field"
                    disabled={isSubmitting}
                  >
                    {CROP_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {CROP_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Crop Name</label>
                  <Input
                    placeholder="e.g., Maize, Cocoa, Cassava"
                    value={cropName}
                    onChange={(e) => setCropName(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Total Quantity (kg)</label>
                  <Input
                    type="number"
                    placeholder="e.g., 1000"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Total Shares</label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g., 100"
                    value={totalShares}
                    onChange={(e) => setTotalShares(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    {kgPerSharePreview !== null
                      ? `${kgPerSharePreview.toFixed(3)} kg per share`
                      : "How many shares the harvest is split into"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Price per Share (GH₵)</label>
                  <Input
                    type="number"
                    placeholder="e.g., 50"
                    step="0.01"
                    value={pricePerShare}
                    onChange={(e) => setPricePerShare(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Harvest Date</label>
                  <Input
                    type="date"
                    value={harvestDate}
                    onChange={(e) => setHarvestDate(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium mb-2 block">Location</label>
                  <Input
                    placeholder="e.g., Ashanti Region, Kumasi"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="flex-1">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Listing
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Listings Tabs */}
        {listingsError ? (
          <RetryCard title="Could not load your listings" onRetry={() => void refetch()} />
        ) : (
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-8">
              <TabsTrigger value="active">
                Active ({activeListings.length})
              </TabsTrigger>
              <TabsTrigger value="funded">
                Funded ({fundedListings.length})
              </TabsTrigger>
              <TabsTrigger value="harvested">
                Harvested ({harvestedListings.length})
              </TabsTrigger>
            </TabsList>

            {/* Active Listings */}
            <TabsContent value="active" className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : activeListings.length === 0 ? (
                <Card className="card-subtle text-center py-12">
                  <Leaf className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Active Listings</h3>
                  <p className="text-muted-foreground mb-4">
                    Create a new listing to start receiving investments
                  </p>
                  <Button onClick={() => setShowCreateForm(true)}>Create Listing</Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {activeListings.map((listing) => {
                    const sharesSold = listing.sharesSold ?? 0;
                    const kgPerShare =
                      listing.kgPerShare !== null
                        ? Number(listing.kgPerShare)
                        : listing.totalShares > 0
                          ? Number(listing.totalQuantity) / listing.totalShares
                          : null;

                    return (
                      <Card key={listing.id} className="card-subtle p-6 space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-lg font-bold">{listing.cropName}</h3>
                            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                              <MapPin className="w-4 h-4" />
                              {listing.location}
                            </p>
                          </div>
                          <Badge>Active</Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Price per Share</p>
                            <p className="font-semibold text-lg">
                              {formatCurrency(Number(listing.pricePerShare))}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Harvest Date</p>
                            <p className="font-semibold">
                              {new Date(listing.harvestDate).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">kg per Share</p>
                            <p className="font-semibold">
                              {kgPerShare !== null && Number.isFinite(kgPerShare)
                                ? `${kgPerShare.toFixed(3)} kg`
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Total Shares</p>
                            <p className="font-semibold">{listing.totalShares}</p>
                          </div>
                        </div>

                        <MarketChip market={listing.market} />

                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Funding Progress</p>
                          <div className="w-full bg-border rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (Number(listing.fundedAmount) / (Number(listing.pricePerShare) * listing.totalShares)) *
                                    100
                                )}%`,
                              }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {listing.sharesSold} / {listing.totalShares} shares sold
                          </p>
                        </div>

                        <div className="flex gap-2 pt-4">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => openEdit(listing)}
                          >
                            <Edit2 className="w-4 h-4 mr-2" />
                            Edit
                          </Button>
                          <div className="flex-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn("w-full", sharesSold > 0 ? "text-muted-foreground" : "text-red-600")}
                              disabled={sharesSold > 0}
                              title={
                                sharesSold > 0
                                  ? "Investors already own shares, so this listing cannot be deleted"
                                  : "Delete this listing"
                              }
                              onClick={() => void handleDeleteListing(listing.id, sharesSold)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </Button>
                            {sharesSold > 0 ? (
                              <p className="text-xs text-muted-foreground mt-1 text-center">
                                Locked — {sharesSold} share(s) sold
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Funded Listings */}
            <TabsContent value="funded" className="space-y-4">
              {fundedListings.length === 0 ? (
                <Card className="card-subtle text-center py-12">
                  <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Funded Listings</h3>
                  <p className="text-muted-foreground">
                    Listings will move here once they reach their funding goal
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {fundedListings.map((listing) => (
                    <Card key={listing.id} className="card-subtle p-6 space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-bold">{listing.cropName}</h3>
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="w-4 h-4" />
                            {listing.location}
                          </p>
                        </div>
                        <Badge className="bg-green-100 text-green-800">Funded</Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Total Raised</p>
                          <p className="font-semibold">
                            {formatCurrency(Number(listing.fundedAmount))}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Harvest Date</p>
                          <p className="font-semibold">
                            {new Date(listing.harvestDate).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <MarketChip market={listing.market} />

                      <Button className="w-full">
                        <Calendar className="w-4 h-4 mr-2" />
                        Post Harvest Update
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Harvested Listings */}
            <TabsContent value="harvested" className="space-y-4">
              {harvestedListings.length === 0 ? (
                <Card className="card-subtle text-center py-12">
                  <Leaf className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Harvested Listings</h3>
                  <p className="text-muted-foreground">
                    Completed listings will appear here
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {harvestedListings.map((listing) => (
                    <Card key={listing.id} className="card-subtle p-6 space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-bold">{listing.cropName}</h3>
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="w-4 h-4" />
                            {listing.location}
                          </p>
                        </div>
                        <Badge className="bg-blue-100 text-blue-800">Harvested</Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Total Raised</p>
                          <p className="font-semibold">
                            {formatCurrency(Number(listing.fundedAmount))}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Harvest Date</p>
                          <p className="font-semibold">
                            {new Date(listing.harvestDate).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <MarketChip market={listing.market} />

                      <Button className="w-full" variant="outline">
                        <DollarSign className="w-4 h-4 mr-2" />
                        View Payout Details
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Edit Listing Modal */}
      {editingListing !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <Card className="w-full max-w-md card-elevated my-8">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Edit Listing</h2>
                <p className="text-muted-foreground">{editingListing.cropName}</p>
              </div>

              <form onSubmit={handleUpdateListing} className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Price per Share (GH¢)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.pricePerShare}
                    onChange={(e) => setEditForm({ ...editForm, pricePerShare: e.target.value })}
                    disabled={isSavingEdit || editPriceLocked}
                  />
                  {editPriceLocked ? (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Price is locked once shares are sold
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Harvest Date</label>
                  <Input
                    type="date"
                    value={editForm.harvestDate}
                    onChange={(e) => setEditForm({ ...editForm, harvestDate: e.target.value })}
                    disabled={isSavingEdit}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Location</label>
                  <Input
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    disabled={isSavingEdit}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingId(null)}
                    disabled={isSavingEdit}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSavingEdit} className="flex-1">
                    {isSavingEdit ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
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
