import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import {
  DollarSign,
  Truck,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";

type PayoutType = "cash" | "physical_delivery";

type PayoutReceipt = {
  payoutId: number;
  payoutType: PayoutType;
  amountGhs: number;
  valuationAmount: number | null;
  quantityKg: number | null;
  pricePerKgGhs: number | null;
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof TRPCClientError) {
    return error.message || fallback;
  }
  return fallback;
}

function exitOptionLabel(exitOption: string): string {
  return exitOption.replace(/_/g, " ");
}

function PayoutStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return <Badge className="bg-yellow-500/20 text-yellow-700">Pending</Badge>;
    case "approved":
      return <Badge className="bg-blue-500/20 text-blue-700">Approved</Badge>;
    case "processing":
      return <Badge className="bg-blue-500/20 text-blue-700">Processing</Badge>;
    case "completed":
      return <Badge className="bg-green-500/20 text-green-700">Completed</Badge>;
    case "rejected":
      return <Badge className="bg-red-500/20 text-red-700">Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
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

export default function PayoutRequest() {
  const [selectedInvestment, setSelectedInvestment] = useState<number | null>(null);
  const [payoutType, setPayoutType] = useState<PayoutType>("cash");
  const [deliveryData, setDeliveryData] = useState({
    address: "",
    phone: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<PayoutReceipt | null>(null);

  const utils = trpc.useUtils();

  // Fetch portfolio
  const {
    data: portfolio,
    isLoading: portfolioLoading,
    isError: portfolioError,
    refetch: refetchPortfolio,
  } = trpc.investor.getPortfolio.useQuery();

  // Payout history
  const {
    data: payoutHistory,
    isLoading: historyLoading,
    isError: historyError,
    refetch: refetchHistory,
  } = trpc.payout.getPayoutRequests.useQuery();

  // Create payout mutation
  const payoutMutation = trpc.payout.requestPayout.useMutation();

  // Cash payouts need an active holding that was not bought for delivery or
  // share trading; physical delivery is only ever offered for delivery lots.
  const cashableInvestments = (portfolio?.investments ?? []).filter(
    ({ investment }) =>
      investment.status === "active" &&
      investment.exitOption !== "share_trading" &&
      investment.exitOption !== "physical_delivery"
  );

  const deliverableInvestments = (portfolio?.investments ?? []).filter(
    ({ investment }) => investment.status === "active" && investment.exitOption === "physical_delivery"
  );

  const eligibleInvestments = payoutType === "cash" ? cashableInvestments : deliverableInvestments;

  const selectedInvestmentData = eligibleInvestments.find(
    (row) => row.investment.id === selectedInvestment
  );

  const handleSelectPayoutType = (next: PayoutType) => {
    setPayoutType(next);
    // The holding eligible for one route may not be eligible for the other.
    setSelectedInvestment(null);
  };

  const handleSubmitPayout = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedInvestment) {
      toast.error("Please select an investment");
      return;
    }

    if (payoutType === "physical_delivery") {
      if (!deliveryData.address.trim() || !deliveryData.phone.trim()) {
        toast.error("Please fill in delivery address and phone number");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const result = await payoutMutation.mutateAsync({
        investmentId: selectedInvestment,
        payoutType,
        deliveryAddress: payoutType === "physical_delivery" ? deliveryData.address : undefined,
        deliveryPhone: payoutType === "physical_delivery" ? deliveryData.phone : undefined,
      });

      const quantity = result.quantityKg;
      const perKg = result.pricePerKgGhs;

      setReceipt({
        payoutId: result.payoutId,
        payoutType,
        amountGhs: result.amountGhs,
        valuationAmount: result.valuationAmount,
        quantityKg: quantity,
        pricePerKgGhs: perKg,
      });

      toast.success(
        `Payout request #${result.payoutId}: ${formatCurrency(result.amountGhs)}${
          quantity !== null ? ` for ${quantity.toFixed(2)} kg` : ""
        }${perKg !== null ? ` at ${formatCurrency(perKg)}/kg` : ""}`
      );

      setSelectedInvestment(null);
      setPayoutType("cash");
      setDeliveryData({ address: "", phone: "" });

      await Promise.all([
        utils.payout.getPayoutRequests.invalidate(),
        utils.investor.getPortfolio.invalidate(),
      ]);
    } catch (error) {
      toast.error(errorMessage(error, "Failed to submit payout request"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (portfolioLoading) {
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
            <DollarSign className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Request Payout</h1>
              <p className="text-muted-foreground">
                Withdraw your investment returns
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container py-8">
        {portfolioError ? (
          <RetryCard title="Could not load your portfolio" onRetry={() => void refetchPortfolio()} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Investments Sidebar */}
            <div className="lg:col-span-1">
              <Card className="p-6 sticky top-20">
                <h2 className="text-lg font-semibold mb-1">Your Investments</h2>
                <p className="text-xs text-muted-foreground mb-4">
                  {payoutType === "cash"
                    ? "Holdings eligible for a cash payout"
                    : "Holdings eligible for physical delivery"}
                </p>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {eligibleInvestments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {payoutType === "cash"
                        ? "No active holdings are eligible for a cash payout."
                        : "No active holdings are eligible for physical delivery."}
                    </p>
                  ) : (
                    eligibleInvestments.map((row) => (
                      <button
                        key={row.investment.id}
                        onClick={() => setSelectedInvestment(row.investment.id)}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                          selectedInvestment === row.investment.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <p className="font-medium text-sm">
                          {row.listing?.cropName ?? row.valuation?.cropName ?? "Investment"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(Number(row.investment.totalInvestment))} ·{" "}
                          {row.investment.sharesOwned} shares
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {exitOptionLabel(row.investment.exitOption)}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {row.investment.status}
                          </Badge>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </Card>
            </div>

            {/* Payout Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Receipt from the previous submission */}
              {receipt ? (
                <Card className="p-6 border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold">Payout request submitted</h3>
                          <p className="text-sm text-muted-foreground">
                            Request #{receipt.payoutId} ·{" "}
                            {receipt.payoutType === "cash" ? "cash payout" : "physical delivery"}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setReceipt(null)}>
                          Dismiss
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Amount</p>
                          <p className="font-semibold">{formatCurrency(receipt.amountGhs)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Quantity</p>
                          <p className="font-semibold">
                            {receipt.quantityKg !== null ? `${receipt.quantityKg.toFixed(2)} kg` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Price at Request</p>
                          <p className="font-semibold">
                            {receipt.pricePerKgGhs !== null
                              ? `${formatCurrency(receipt.pricePerKgGhs)}/kg`
                              : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ) : null}

              {selectedInvestment && selectedInvestmentData ? (
                <Card className="p-8">
                  {/* Investment Summary */}
                  <div className="mb-8 p-4 bg-secondary/10 rounded-lg border border-border">
                    <h3 className="font-semibold mb-3">Investment Summary</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Crop</p>
                        <p className="font-medium">
                          {selectedInvestmentData.listing?.cropName ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Amount</p>
                        <p className="font-medium">
                          {formatCurrency(
                            Number(selectedInvestmentData.investment.totalInvestment)
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Shares Owned</p>
                        <p className="font-medium">
                          {selectedInvestmentData.investment.sharesOwned}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Exit Option</p>
                        <p className="font-medium">
                          {exitOptionLabel(selectedInvestmentData.investment.exitOption)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Status</p>
                        <Badge variant="outline">
                          {selectedInvestmentData.investment.status}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleSubmitPayout} className="space-y-6">
                    {/* Payout Type Selection */}
                    <div>
                      <label className="text-sm font-semibold mb-3 block">
                        Payout Method
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleSelectPayoutType("cash")}
                          className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                            payoutType === "cash"
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <DollarSign className="w-6 h-6" />
                          <span className="text-sm font-medium">Cash Payout</span>
                          <span className="text-xs text-muted-foreground">
                            Direct to account
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectPayoutType("physical_delivery")}
                          className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                            payoutType === "physical_delivery"
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <Truck className="w-6 h-6" />
                          <span className="text-sm font-medium">
                            Physical Delivery
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Produce delivery
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Delivery Address (if physical delivery) */}
                    {payoutType === "physical_delivery" && (
                      <>
                        <div>
                          <label className="text-sm font-semibold mb-2 block">
                            Delivery Address *
                          </label>
                          <Textarea
                            placeholder="Enter your full delivery address"
                            value={deliveryData.address}
                            onChange={(e) =>
                              setDeliveryData({
                                ...deliveryData,
                                address: e.target.value,
                              })
                            }
                            className="border-border min-h-20"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-sm font-semibold mb-2 block">
                            Phone Number *
                          </label>
                          <Input
                            type="tel"
                            placeholder="+233 XX XXX XXXX"
                            value={deliveryData.phone}
                            onChange={(e) =>
                              setDeliveryData({
                                ...deliveryData,
                                phone: e.target.value,
                              })
                            }
                            className="border-border"
                            required
                          />
                        </div>
                      </>
                    )}

                    {/* Info Box */}
                    <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex gap-3">
                        <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-900 dark:text-blue-100">
                          <p className="font-medium mb-1">Processing Time</p>
                          <p>
                            {payoutType === "cash"
                              ? "Cash payouts typically process within 2-3 business days"
                              : "Physical deliveries are arranged within 5-7 business days"}
                          </p>
                        </div>
                      </div>
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
                          <DollarSign className="w-4 h-4 mr-2" />
                          Request {payoutType === "cash" ? "Cash" : "Delivery"}{" "}
                          Payout
                        </>
                      )}
                    </Button>
                  </form>
                </Card>
              ) : (
                <Card className="p-8 text-center">
                  <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Select an investment from the left to request a payout
                  </p>
                  {eligibleInvestments.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      You don't have any investments available for this payout method
                    </p>
                  )}
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Payout History */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Payout History</h2>
          {historyError ? (
            <RetryCard title="Could not load your payout history" onRetry={() => void refetchHistory()} />
          ) : historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !payoutHistory || payoutHistory.length === 0 ? (
            <Card className="card-subtle text-center py-8">
              <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No payout requests yet.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {payoutHistory.map((request) => (
                <Card key={request.id} className="card-subtle p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="font-semibold">Request #{request.id}</p>
                        <PayoutStatusBadge status={request.status} />
                        <Badge variant="outline" className="text-xs">
                          {request.payoutType === "cash" ? "cash" : "physical delivery"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Amount</p>
                          <p className="font-semibold">{formatCurrency(Number(request.amount))}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Quantity</p>
                          <p className="font-semibold">
                            {request.quantityKg !== null ? `${Number(request.quantityKg).toFixed(2)} kg` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Price per kg</p>
                          <p className="font-semibold">
                            {request.pricePerKgAtRequest !== null
                              ? formatCurrency(Number(request.pricePerKgAtRequest))
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Requested</p>
                          <p className="font-semibold">
                            {new Date(request.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {request.rejectionReason ? (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                          Rejected: {request.rejectionReason}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Valuation</p>
                      <p className="font-semibold">
                        {request.valuationAmount !== null
                          ? formatCurrency(Number(request.valuationAmount))
                          : "—"}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
