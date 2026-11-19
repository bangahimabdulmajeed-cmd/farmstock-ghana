import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CROP_LABELS } from "@shared/prices";
import { CROP_TYPES, type CropType } from "@shared/crops";

function statusVariant(status: string) {
  if (status === "completed" || status === "approved") return "default" as const;
  if (status === "rejected") return "destructive" as const;
  return "secondary" as const;
}

/**
 * Operator console. The original build had no way to approve a payout at all,
 * so every request stayed pending forever; nor was there anywhere to record a
 * Ghana market price, which the valuation depends on.
 */
export default function AdminConsole() {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "completed">("pending");

  const payoutsQuery = trpc.admin.listPayouts.useQuery({
    limit: 100,
    ...(filter === "all" ? {} : { status: filter }),
  });

  const resolvePayout = trpc.admin.resolvePayout.useMutation({
    onSuccess: async () => {
      toast.success("Payout updated");
      await utils.admin.listPayouts.invalidate();
      await utils.investor.getPortfolio.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const [cropType, setCropType] = useState<CropType>("maize");
  const [market, setMarket] = useState("Kumasi Central");
  const [price, setPrice] = useState("");

  const setNationalPrice = trpc.admin.setNationalPrice.useMutation({
    onSuccess: async () => {
      toast.success("National price recorded");
      setPrice("");
      await utils.prices.getQuotes.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const refreshPrices = trpc.prices.refresh.useMutation({
    onSuccess: async result => {
      toast[result.success ? "success" : "error"](result.success ? "Prices refreshed" : "Upstream feed unavailable");
      await utils.prices.getQuotes.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const submitPrice = async () => {
    const parsed = Number(price);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter a price in GH¢ per kg");
      return;
    }
    await setNationalPrice.mutateAsync({ cropType, market, pricePerKgGhs: parsed });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gradient">Operator Console</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve payouts and record Ghana market prices. Changes are audited against your account.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refreshPrices.mutate()}
          disabled={refreshPrices.isPending}
          className="gap-2"
        >
          {refreshPrices.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh market prices
        </Button>
      </div>

      <Tabs defaultValue="payouts">
        <TabsList className="mb-4">
          <TabsTrigger value="payouts">Payout queue</TabsTrigger>
          <TabsTrigger value="prices">National prices</TabsTrigger>
        </TabsList>

        <TabsContent value="payouts" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["pending", "approved", "completed", "all"] as const).map(value => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "default" : "outline"}
                onClick={() => setFilter(value)}
                className="capitalize"
              >
                {value}
              </Button>
            ))}
          </div>

          {payoutsQuery.isLoading ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>
          ) : payoutsQuery.isError ? (
            <Card className="p-8 text-center">
              <p className="mb-3 text-sm text-muted-foreground">Could not load the payout queue.</p>
              <Button variant="outline" size="sm" onClick={() => payoutsQuery.refetch()}>
                Retry
              </Button>
            </Card>
          ) : (payoutsQuery.data ?? []).length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Nothing in this queue.</Card>
          ) : (
            <div className="space-y-3">
              {(payoutsQuery.data ?? []).map(payout => (
                <Card key={payout.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {payout.investorName ?? `Investor #${payout.investorId}`}
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          {payout.cropName ?? "—"}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Requested {formatDate(payout.createdAt)} · {payout.payoutType === "cash" ? "Cash" : "Physical delivery"}
                        {payout.quantityKg ? ` · ${Number(payout.quantityKg).toFixed(1)} kg` : ""}
                      </p>
                      {payout.rejectionReason && (
                        <p className="mt-1 text-xs text-rose-600">Rejected: {payout.rejectionReason}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(Number(payout.amount))}</p>
                      {payout.valuationAmount && (
                        <p className="text-xs text-muted-foreground">
                          valued at {formatCurrency(Number(payout.valuationAmount))}
                        </p>
                      )}
                      <Badge variant={statusVariant(payout.status)} className="mt-1 capitalize">
                        {payout.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {payout.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          className="gap-1"
                          disabled={resolvePayout.isPending}
                          onClick={() => resolvePayout.mutate({ payoutId: payout.id, action: "approve" })}
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-rose-600"
                          disabled={resolvePayout.isPending}
                          onClick={() =>
                            resolvePayout.mutate({
                              payoutId: payout.id,
                              action: "reject",
                              reason: "Rejected by operator",
                            })
                          }
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </>
                    )}
                    {payout.status === "approved" && (
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={resolvePayout.isPending}
                        onClick={() => resolvePayout.mutate({ payoutId: payout.id, action: "complete" })}
                      >
                        <Check className="h-3.5 w-3.5" /> Mark paid
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="prices">
          <Card className="max-w-xl p-5">
            <h2 className="mb-1 font-semibold">Record a Ghana market price</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Entered as GH¢ per kilogram for a named market. This replaces the global benchmark for valuation for 45
              days.
            </p>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Crop</label>
                <select
                  value={cropType}
                  onChange={event => setCropType(event.target.value as CropType)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {CROP_TYPES.map(value => (
                    <option key={value} value={value}>
                      {CROP_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Market</label>
                <Input value={market} onChange={event => setMarket(event.target.value)} placeholder="Kumasi Central" />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Price (GH¢ per kg)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={event => setPrice(event.target.value)}
                  placeholder="5.20"
                />
              </div>

              <Button onClick={submitPrice} disabled={setNationalPrice.isPending} className="w-full">
                {setNationalPrice.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  "Save price"
                )}
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
