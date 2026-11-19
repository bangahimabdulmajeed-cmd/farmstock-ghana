import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { ArrowDownRight, ArrowUpRight, TrendingUp, Loader2 } from "lucide-react";


function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
  }).format(amount);
}

export default function TransactionHistory() {
  const { user } = useAuth();
  const { data: transactions, isLoading } = trpc.investor.getTransactionHistory.useQuery({
    limit: 100,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/20 text-green-700">Completed</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-700">Pending</Badge>;
      case "failed":
        return <Badge className="bg-red-500/20 text-red-700">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const purchases = transactions?.filter((t) => t.type === "share_purchase") || [];
  const payouts = transactions?.filter((t) => t.type === "payout") || [];
  const marketplace = transactions?.filter((t) =>
    ["marketplace_purchase"].includes(t.type)
  ) || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border-b border-border p-6">
        <div className="container">
          <h1 className="text-3xl font-bold text-gradient mb-2">Transaction History</h1>
          <p className="text-muted-foreground">View all your investment transactions</p>
        </div>
      </div>

      {/* Content */}
      <div className="container py-8">
        <Tabs defaultValue="purchases" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="purchases">
              Purchases ({purchases.length})
            </TabsTrigger>
            <TabsTrigger value="payouts">
              Payouts ({payouts.length})
            </TabsTrigger>
            <TabsTrigger value="marketplace">
              Marketplace ({marketplace.length})
            </TabsTrigger>
          </TabsList>

          {/* Purchases Tab */}
          <TabsContent value="purchases">
            {purchases.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No purchases yet</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {purchases.map((transaction) => (
                  <Card key={transaction.id} className="card-subtle p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <ArrowDownRight className="w-5 h-5 flex-shrink-0 text-red-500" />
                        <div className="flex-1">
                          <h3 className="font-semibold capitalize">Share Purchase</h3>
                          <p className="text-sm text-muted-foreground">
                            {new Date(transaction.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-lg">
                          -{formatCurrency(Number(transaction.amount))}
                        </p>
                        {getStatusBadge(transaction.status)}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Payouts Tab */}
          <TabsContent value="payouts">
            {payouts.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No payouts yet</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {payouts.map((transaction) => (
                  <Card key={transaction.id} className="card-subtle p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <ArrowUpRight className="w-5 h-5 flex-shrink-0 text-green-500" />
                        <div className="flex-1">
                          <h3 className="font-semibold capitalize">Payout Received</h3>
                          <p className="text-sm text-muted-foreground">
                            {new Date(transaction.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-lg text-green-600">
                          +{formatCurrency(Number(transaction.amount))}
                        </p>
                        {getStatusBadge(transaction.status)}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Marketplace Tab */}
          <TabsContent value="marketplace">
            {marketplace.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No marketplace transactions yet</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {marketplace.map((t) => (
                  <Card key={t.id} className="card-subtle p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <TrendingUp className="w-5 h-5 flex-shrink-0 text-purple-500" />
                        <div className="flex-1">
                          <h3 className="font-semibold capitalize">Marketplace Trade</h3>
                          <p className="text-sm text-muted-foreground">
                            {new Date(t.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-lg">
                          -{formatCurrency(Number(t.amount))}
                        </p>
                        {getStatusBadge(t.status)}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
