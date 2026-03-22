import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Leaf,
  TrendingUp,
  Users,
  Calendar,
  MapPin,
  Loader2,
  ChevronRight,
  Edit2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function FarmerDashboard() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    cropType: "maize" as any,
    cropName: "",
    description: "",
    totalQuantity: "",
    pricePerShare: "",
    totalShares: "",
    harvestDate: "",
    location: "",
  });

  // Fetch data
  const { data: listings, isLoading: listingsLoading, refetch } = trpc.farmer.getMyListings.useQuery();
  const createListingMutation = trpc.farmer.createListing.useMutation();

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.cropName || !formData.pricePerShare || !formData.harvestDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      await createListingMutation.mutateAsync({
        ...formData,
        totalShares: parseInt(formData.totalShares),
        harvestDate: new Date(formData.harvestDate),
      });
      toast.success("Listing created successfully!");
      setShowCreateForm(false);
      setFormData({
        cropType: "maize",
        cropName: "",
        description: "",
        totalQuantity: "",
        pricePerShare: "",
        totalShares: "",
        harvestDate: "",
        location: "",
      });
      refetch();
    } catch (error) {
      toast.error("Failed to create listing");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border-b border-border p-6">
        <div className="container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gradient mb-2">Farmer Dashboard</h1>
              <p className="text-muted-foreground">Manage your produce listings and connect with investors</p>
            </div>
            <Button onClick={() => setShowCreateForm(true)} size="lg" className="gap-2">
              <Plus className="w-5 h-5" />
              New Listing
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container py-8">
        <Tabs defaultValue="listings" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="listings">My Listings</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="harvests">Harvest Updates</TabsTrigger>
          </TabsList>

          {/* My Listings Tab */}
          <TabsContent value="listings" className="space-y-6">
            {listingsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : listings?.length === 0 ? (
              <Card className="card-subtle text-center py-12">
                <Leaf className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Listings Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first listing to connect with investors
                </p>
                <Button onClick={() => setShowCreateForm(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Listing
                </Button>
              </Card>
            ) : (
              <div className="space-y-4">
                {listings?.map((listing) => (
                  <Card key={listing.id} className="card-subtle p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold mb-2">{listing.cropName}</h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {listing.location}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {formatDate(listing.harvestDate)}
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline">{listing.fundingStatus}</Badge>
                    </div>

                    {/* Funding Progress */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Funding Progress</span>
                        <span className="text-sm text-muted-foreground">
                          {listing.sharesSold} / {listing.totalShares} shares
                        </span>
                      </div>
                      <div className="w-full bg-border rounded-full h-3">
                        <div
                          className="bg-gradient-to-r from-primary to-secondary h-3 rounded-full transition-all"
                          style={{
                            width: `${((listing.sharesSold || 0) / listing.totalShares) * 100}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Key Metrics */}
                    <div className="grid grid-cols-4 gap-4 mb-4 pb-4 border-b border-border">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Quantity</p>
                        <p className="font-semibold">{listing.totalQuantity} kg</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Price per Share</p>
                        <p className="font-semibold text-primary">
                          {formatCurrency(Number(listing.pricePerShare))}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Funded Amount</p>
                        <p className="font-semibold">{formatCurrency(Number(listing.fundedAmount))}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Investors</p>
                        <p className="font-semibold">{(listing.sharesSold || 0) > 0 ? Math.ceil((listing.sharesSold || 0) / 10) : 0}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Users className="w-4 h-4" />
                        View Investors
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2 ml-auto">
                        Details
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="card-elevated">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Total Listings</h3>
                  <Leaf className="w-5 h-5 text-primary" />
                </div>
                <p className="text-3xl font-bold">{listings?.length || 0}</p>
              </Card>

              <Card className="card-elevated">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Total Funded</h3>
                  <TrendingUp className="w-5 h-5 text-secondary" />
                </div>
                <p className="text-3xl font-bold text-secondary">
                  {formatCurrency(
                    listings?.reduce((sum, l) => sum + Number(l.fundedAmount), 0) || 0
                  )}
                </p>
              </Card>

              <Card className="card-elevated">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Active Investors</h3>
                  <Users className="w-5 h-5 text-accent" />
                </div>
                <p className="text-3xl font-bold text-accent">
                  {listings?.reduce((sum, l) => sum + ((l.sharesSold || 0) > 0 ? 1 : 0), 0) || 0}
                </p>
              </Card>
            </div>
          </TabsContent>

          {/* Harvest Updates Tab */}
          <TabsContent value="harvests" className="space-y-6">
            <Card className="card-subtle text-center py-12">
              <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Harvest Updates</h3>
              <p className="text-muted-foreground">
                Publish harvest updates to keep your investors informed
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Listing Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <Card className="w-full max-w-2xl card-elevated my-8">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Create New Listing</h2>
                <p className="text-muted-foreground">
                  List your produce and connect with investors
                </p>
              </div>

              <form onSubmit={handleCreateListing} className="space-y-6">
                {/* Crop Type */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Crop Type</label>
                  <select
                    value={formData.cropType}
                    onChange={(e) => setFormData({ ...formData, cropType: e.target.value })}
                    className="input-field"
                  >
                    <option value="maize">Maize</option>
                    <option value="cocoa">Cocoa</option>
                    <option value="cassava">Cassava</option>
                    <option value="plantain">Plantain</option>
                    <option value="rice">Rice</option>
                    <option value="tomato">Tomato</option>
                    <option value="pepper">Pepper</option>
                    <option value="groundnut">Groundnut</option>
                    <option value="shea">Shea</option>
                  </select>
                </div>

                {/* Crop Name */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Crop Name *</label>
                  <Input
                    placeholder="e.g., Premium Yellow Maize"
                    value={formData.cropName}
                    onChange={(e) => setFormData({ ...formData, cropName: e.target.value })}
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Description</label>
                  <textarea
                    placeholder="Describe your produce..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input-field resize-none"
                    rows={3}
                  />
                </div>

                {/* Grid Layout */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Total Quantity (kg) *</label>
                    <Input
                      type="number"
                      placeholder="1000"
                      value={formData.totalQuantity}
                      onChange={(e) => setFormData({ ...formData, totalQuantity: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Price per Share (GH¢) *</label>
                    <Input
                      type="number"
                      placeholder="50"
                      value={formData.pricePerShare}
                      onChange={(e) => setFormData({ ...formData, pricePerShare: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Total Shares *</label>
                    <Input
                      type="number"
                      placeholder="100"
                      value={formData.totalShares}
                      onChange={(e) => setFormData({ ...formData, totalShares: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Harvest Date *</label>
                    <Input
                      type="date"
                      value={formData.harvestDate}
                      onChange={(e) => setFormData({ ...formData, harvestDate: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Location (District) *</label>
                  <Input
                    placeholder="e.g., Ashanti Region"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    required
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Listing
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
