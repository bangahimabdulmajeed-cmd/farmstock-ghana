import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { getLoginUrl } from "@/const";
import { Leaf, TrendingUp, Users, Zap, ArrowRight, CheckCircle2 } from "lucide-react";

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!user) return;
    if (user.role === "farmer") navigate("/farmer/dashboard");
    else if (user.role === "investor" || user.role === "admin") navigate("/investor/dashboard");
  }, [navigate, user]);

  // Signed-in visitors are redirected to their workspace; render a spinner
  // instead of a blank page while that happens.
  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border sticky top-0 bg-background/95 backdrop-blur">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Leaf className="w-6 h-6 text-primary" />
            <span className="text-xl font-bold text-gradient">FarmStock Ghana</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#features" className="text-sm hover:text-primary transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="text-sm hover:text-primary transition-colors">
              How It Works
            </a>
            <Button asChild>
              <a href="/auth">Get Started</a>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
        <div className="container relative z-10">
          <div className="max-w-3xl mx-auto text-center animate-slide-in-up">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 text-gradient">
              Connect Farmers with Investors
            </h1>
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Invest in agricultural produce from just GH¢ 10. Support local farmers and grow your wealth together.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="gap-2" asChild>
                <a href="/auth">
                  Start as Investor
                  <ArrowRight className="w-5 h-5" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="/auth">
                  List Your Produce
                </a>
              </Button>
            </div>

            {/* Trust Badges */}
            <div className="mt-12 flex flex-wrap justify-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                Secure & Transparent
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                Low Minimum Investment
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                Ghana-Focused
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-card border-y border-border">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Why Choose FarmStock Ghana?</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A platform designed specifically for Ghanaian farmers and investors
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <Card className="card-subtle hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Leaf className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Support Local Farmers</h3>
              <p className="text-muted-foreground">
                Directly fund agricultural projects from Ghanaian farmers and help them grow their businesses.
              </p>
            </Card>

            {/* Feature 2 */}
            <Card className="card-subtle hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-secondary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Grow Your Wealth</h3>
              <p className="text-muted-foreground">
                Invest from as low as GH¢ 10 and benefit from harvest returns and share trading opportunities.
              </p>
            </Card>

            {/* Feature 3 */}
            <Card className="card-subtle hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Community Driven</h3>
              <p className="text-muted-foreground">
                Join a community of Ghanaian investors and farmers working together for agricultural growth.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Simple steps to start investing or listing your produce
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Investor Flow */}
            <div>
              <h3 className="text-2xl font-bold mb-8 text-primary">For Investors</h3>
              <div className="space-y-6">
                {[
                  { step: 1, title: "Sign Up", desc: "Create account with your phone number" },
                  { step: 2, title: "Browse Listings", desc: "Explore available farm produce opportunities" },
                  { step: 3, title: "Invest", desc: "Purchase shares starting from GH¢ 10" },
                  { step: 4, title: "Receive Returns", desc: "Get cash payout, trade shares, or physical delivery" },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary text-primary-foreground font-semibold">
                        {item.step}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">{item.title}</h4>
                      <p className="text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Farmer Flow */}
            <div>
              <h3 className="text-2xl font-bold mb-8 text-secondary">For Farmers</h3>
              <div className="space-y-6">
                {[
                  { step: 1, title: "Register", desc: "Create your farmer account" },
                  { step: 2, title: "List Produce", desc: "Add your crop details and set share prices" },
                  { step: 3, title: "Receive Funding", desc: "Investors purchase shares of your produce" },
                  { step: 4, title: "Deliver & Earn", desc: "Harvest and fulfill investor exit options" },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-secondary text-secondary-foreground font-semibold">
                        {item.step}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">{item.title}</h4>
                      <p className="text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Exit Options Section */}
      <section className="py-20 bg-card border-y border-border">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Three Exit Options</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Choose how you want to receive your returns
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: "💰",
                title: "Cash Payout",
                desc: "Receive cash payment at harvest time based on your investment returns",
              },
              {
                icon: "🔄",
                title: "Trade Shares",
                desc: "Sell your shares to other investors on our peer-to-peer marketplace",
              },
              {
                icon: "🚚",
                title: "Physical Delivery",
                desc: "Receive actual produce delivered to your location at harvest",
              },
            ].map((option, idx) => (
              <Card key={idx} className="card-subtle text-center hover:shadow-lg transition-all">
                <div className="text-4xl mb-4">{option.icon}</div>
                <h3 className="text-xl font-semibold mb-3">{option.title}</h3>
                <p className="text-muted-foreground">{option.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container">
          <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-2xl border border-primary/20 p-12 text-center">
            <h2 className="text-4xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join thousands of Ghanaian farmers and investors building a stronger agricultural future
            </p>
            <Button size="lg" className="gap-2" asChild>
              <a href="/auth">
                Create Your Account
                <ArrowRight className="w-5 h-5" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 bg-card">
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Leaf className="w-5 h-5 text-primary" />
                <span className="font-bold">FarmStock Ghana</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Connecting farmers with investors for sustainable agricultural growth
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">For Investors</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">Browse Listings</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">My Portfolio</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Marketplace</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">For Farmers</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">Create Listing</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">My Listings</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Analytics</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Privacy Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2026 FarmStock Ghana. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
