import type { ComponentType } from "react";
import { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import AppShell from "./components/AppShell";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import InvestorDashboard from "./pages/InvestorDashboard";
import FarmerDashboard from "./pages/FarmerDashboard";
import Marketplace from "./pages/Marketplace";
import ListingDetail from "./pages/ListingDetail";
import TransactionHistory from "./pages/TransactionHistory";
import FarmerListings from "./pages/FarmerListings";
import HarvestUpdate from "./pages/HarvestUpdate";
import PayoutRequest from "./pages/PayoutRequest";
import MarketPrices from "./pages/MarketPrices";
import AdminConsole from "./pages/AdminConsole";
import NotFound from "./pages/NotFound";

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
    </div>
  );
}

function ProtectedRoute({
  component: Component,
  requiredRole,
}: {
  component: ComponentType;
  requiredRole?: "farmer" | "investor" | "admin";
}) {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  const wrongRole =
    Boolean(user) && Boolean(requiredRole) && user?.role !== requiredRole && user?.role !== "admin";

  useEffect(() => {
    if (loading || !user) return;
    if (!wrongRole) return;
    if (user.role === "farmer") navigate("/farmer/dashboard");
    else if (user.role === "investor") navigate("/investor/dashboard");
    else navigate("/prices");
  }, [loading, navigate, user, wrongRole]);

  // While auth is resolving — or while a role redirect is in flight — show a
  // spinner. The original rendered the login form here, which made a successful
  // login appear to reset itself.
  if (loading) return <FullPageSpinner />;
  if (!user) return <Auth />;
  if (wrongRole) return <FullPageSpinner />;

  return (
    <AppShell>
      <Component />
    </AppShell>
  );
}

function PublicPage({ component: Component }: { component: ComponentType }) {
  return (
    <AppShell>
      <Component />
    </AppShell>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={Auth} />
      <Route path="/prices" component={() => <PublicPage component={MarketPrices} />} />
      <Route
        path="/investor/dashboard"
        component={() => <ProtectedRoute component={InvestorDashboard} requiredRole="investor" />}
      />
      <Route
        path="/farmer/dashboard"
        component={() => <ProtectedRoute component={FarmerDashboard} requiredRole="farmer" />}
      />
      <Route
        path="/marketplace"
        component={() => <ProtectedRoute component={Marketplace} requiredRole="investor" />}
      />
      <Route
        path="/farmer/listings"
        component={() => <ProtectedRoute component={FarmerListings} requiredRole="farmer" />}
      />
      <Route path="/listing/:id" component={() => <ProtectedRoute component={ListingDetail} />} />
      <Route path="/transactions" component={() => <ProtectedRoute component={TransactionHistory} />} />
      <Route
        path="/farmer/harvest"
        component={() => <ProtectedRoute component={HarvestUpdate} requiredRole="farmer" />}
      />
      <Route
        path="/investor/payout"
        component={() => <ProtectedRoute component={PayoutRequest} requiredRole="investor" />}
      />
      <Route path="/admin" component={() => <ProtectedRoute component={AdminConsole} requiredRole="admin" />} />
      {/* Home page - must be last before the catch-all */}
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
