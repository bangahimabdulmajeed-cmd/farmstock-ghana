import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Upload,
  Calendar,
  TrendingUp,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/utils";

export default function HarvestUpdate() {
  const [selectedListing, setSelectedListing] = useState<number | null>(null);
  const [updateData, setUpdateData] = useState({
    harvestStatus: "in_progress" as "in_progress" | "completed" | "delayed",
    estimatedYield: "",
    actualYield: "",
    notes: "",
    photoUrl: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch farmer's listings
  const { data: listings, isLoading: listingsLoading, refetch } =
    trpc.farmer.getMyListings.useQuery();
  const updateHarvestMutation = trpc.farmer.updateHarvest.useMutation();

  // Harvest reporting is useful from the moment a listing is funded, and stays
  // open after completion (the server moves it to `harvested`).
  const activeListings =
    listings?.filter((l) => ["fully_funded", "harvested", "completed"].includes(l.fundingStatus)) || [];

  const updatesQuery = trpc.farmer.getHarvestUpdates.useQuery(
    { produceListingId: selectedListing ?? 0 },
    { enabled: selectedListing !== null },
  );

  const handleSubmitUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedListing) {
      toast.error("Please select a listing");
      return;
    }

    // Actual yield only makes sense for a completed harvest; progress and delay
    // reports are allowed without it.
    if (updateData.harvestStatus === "completed" && !updateData.actualYield) {
      toast.error("Please enter the actual yield for a completed harvest");
      return;
    }

    setIsSubmitting(true);
    try {
      const parsedYield = updateData.actualYield ? parseFloat(updateData.actualYield) : NaN;

      await updateHarvestMutation.mutateAsync({
        produceListingId: selectedListing,
        status: updateData.harvestStatus,
        // Only send a quantity when we actually have one; an empty field would
        // otherwise become NaN and fail validation.
        ...(Number.isFinite(parsedYield) ? { actualQuantity: parsedYield } : {}),
        description: [
          updateData.estimatedYield ? `Estimated yield: ${updateData.estimatedYield}` : "",
          updateData.notes,
        ].filter(Boolean).join("\n") || undefined,
        images: updateData.photoUrl ? [updateData.photoUrl] : undefined,
      });

      toast.success("Harvest update submitted successfully!");
      setUpdateData({
        harvestStatus: "in_progress",
        estimatedYield: "",
        actualYield: "",
        notes: "",
        photoUrl: "",
      });
      setSelectedListing(null);
      refetch();
      await updatesQuery.refetch();
    } catch (error) {
      toast.error("Failed to submit harvest update");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (listingsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border-b border-border p-6">
        <div className="container">
          <div className="flex items-center gap-3">
            <Upload className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Harvest Updates</h1>
              <p className="text-muted-foreground">
                Track and report your harvest progress
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container py-8">
        {selectedListing !== null && (
          <Card className="mb-8 p-6">
            <h2 className="mb-1 text-lg font-semibold">Update history</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              What investors see when they follow this listing.
            </p>
            {updatesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (updatesQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No updates posted yet.</p>
            ) : (
              <ol className="space-y-3">
                {(updatesQuery.data ?? []).map(update => (
                  <li key={update.id} className="flex gap-3 border-l-2 border-primary/30 pl-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">
                          {update.status.replace("_", " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(update.createdAt)}</span>
                      </div>
                      {update.description && (
                        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{update.description}</p>
                      )}
                      {update.actualQuantity && (
                        <p className="mt-1 text-sm">Actual yield: {Number(update.actualQuantity).toFixed(0)} kg</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Listings Sidebar */}
          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-20">
              <h2 className="text-lg font-semibold mb-4">Your Listings</h2>
              <div className="space-y-2">
                {activeListings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active listings to update
                  </p>
                ) : (
                  activeListings.map((listing) => (
                    <button
                      key={listing.id}
                      onClick={() => setSelectedListing(listing.id)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                        selectedListing === listing.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="font-medium text-sm">{listing.cropName}</p>
                      <p className="text-xs text-muted-foreground">
                        {listing.totalQuantity} units
                      </p>
                      <Badge variant="outline" className="mt-2 text-xs">
                        {listing.fundingStatus}
                      </Badge>
                    </button>
                  ))
                )}
              </div>
            </Card>
          </div>

          {/* Update Form */}
          <div className="lg:col-span-2">
            {selectedListing ? (
              <Card className="p-8">
                <form onSubmit={handleSubmitUpdate} className="space-y-6">
                  {/* Status Selection */}
                  <div>
                    <label className="text-sm font-semibold mb-3 block">
                      Harvest Status
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {
                          value: "in_progress" as const,
                          label: "In Progress",
                          icon: TrendingUp,
                        },
                        {
                          value: "completed" as const,
                          label: "Completed",
                          icon: CheckCircle,
                        },
                        {
                          value: "delayed" as const,
                          label: "Delayed",
                          icon: AlertCircle,
                        },
                      ].map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            setUpdateData({ ...updateData, harvestStatus: value })
                          }
                          className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                            updateData.harvestStatus === value
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="text-xs font-medium">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Yield Information */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold mb-2 block">
                        Estimated Yield (units)
                      </label>
                      <Input
                        type="number"
                        placeholder="Enter estimated yield"
                        value={updateData.estimatedYield}
                        onChange={(e) =>
                          setUpdateData({
                            ...updateData,
                            estimatedYield: e.target.value,
                          })
                        }
                        className="border-border"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold mb-2 block">
                        Actual Yield (units) *
                      </label>
                      <Input
                        type="number"
                        placeholder="Enter actual yield"
                        value={updateData.actualYield}
                        onChange={(e) =>
                          setUpdateData({
                            ...updateData,
                            actualYield: e.target.value,
                          })
                        }
                        className="border-border"
                        required
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="text-sm font-semibold mb-2 block">
                      Additional Notes
                    </label>
                    <Textarea
                      placeholder="Share any important details about the harvest (weather conditions, challenges, etc.)"
                      value={updateData.notes}
                      onChange={(e) =>
                        setUpdateData({ ...updateData, notes: e.target.value })
                      }
                      className="border-border min-h-24"
                    />
                  </div>

                  {/* Photo URL */}
                  <div>
                    <label className="text-sm font-semibold mb-2 block">
                      Photo URL (optional)
                    </label>
                    <Input
                      type="url"
                      placeholder="https://example.com/photo.jpg"
                      value={updateData.photoUrl}
                      onChange={(e) =>
                        setUpdateData({
                          ...updateData,
                          photoUrl: e.target.value,
                        })
                      }
                      className="border-border"
                    />
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Submit Harvest Update
                      </>
                    )}
                  </Button>
                </form>
              </Card>
            ) : (
              <Card className="p-8 text-center">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  Select a listing from the left to submit a harvest update
                </p>
                {activeListings.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    You don't have any fully funded listings yet
                  </p>
                )}
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
