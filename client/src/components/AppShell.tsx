import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Store,
  TrendingUp,
  Receipt,
  Wallet,
  Sprout,
  LogOut,
  Leaf,
  Menu,
  LineChart,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";

type NavItem = { label: string; path: string; icon: typeof Leaf };

function itemsForRole(role: string | undefined): NavItem[] {
  const prices: NavItem = { label: "Market Prices", path: "/prices", icon: LineChart };

  if (role === "admin") {
    return [
      { label: "Marketplace", path: "/marketplace", icon: Store },
      prices,
      { label: "Operator", path: "/admin", icon: ShieldCheck },
      { label: "Transactions", path: "/transactions", icon: Receipt },
    ];
  }

  if (role === "farmer") {
    return [
      { label: "Dashboard", path: "/farmer/dashboard", icon: LayoutDashboard },
      { label: "My Listings", path: "/farmer/listings", icon: Sprout },
      { label: "Harvest Updates", path: "/farmer/harvest", icon: TrendingUp },
      prices,
      { label: "Transactions", path: "/transactions", icon: Receipt },
    ];
  }

  if (role === "investor") {
    return [
      { label: "Dashboard", path: "/investor/dashboard", icon: LayoutDashboard },
      { label: "Marketplace", path: "/marketplace", icon: Store },
      { label: "Payouts", path: "/investor/payout", icon: Wallet },
      prices,
      { label: "Transactions", path: "/transactions", icon: Receipt },
    ];
  }

  return [prices];
}

/**
 * Application shell: top navigation, identity and sign-out.
 *
 * The original build registered eight routes but never rendered a navigation
 * element, so half the product was only reachable by typing a URL and there was
 * no way to log out.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const items = itemsForRole(user?.role);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/auth");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Leaf className="h-5 w-5 text-primary" />
            <span className="hidden sm:inline text-gradient">FarmStock</span>
          </Link>

          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {items.map(item => {
              const active = location === item.path || location.startsWith(`${item.path}/`);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors",
                    active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {user && (
              <div className="hidden text-right sm:block">
                <p className="text-sm leading-tight">{user.name || user.phoneNumber}</p>
                <p className="text-xs capitalize text-muted-foreground">{user.role}</p>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
            {!user && (
              <Button size="sm" onClick={() => navigate("/auth")}>
                Sign in
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setOpen(value => !value)}
              aria-label="Toggle navigation"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {open && (
          <nav className="border-t border-border md:hidden">
            {items.map(item => {
              const active = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 text-sm",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      <main>{children}</main>
    </div>
  );
}

export default AppShell;
