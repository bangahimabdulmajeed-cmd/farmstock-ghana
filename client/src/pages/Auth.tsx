import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Leaf, ArrowRight, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Auth() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [userRole, setUserRole] = useState<"farmer" | "investor">("investor");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [isLoading, setIsLoading] = useState(false);
  const [, navigate] = useLocation();

  const requestOTPMutation = trpc.auth.requestOTP.useMutation();
  const verifyOTPMutation = trpc.auth.verifyOTPAndLogin.useMutation();

  const handleRequestOTP = async () => {
    if (!phoneNumber.trim()) {
      toast.error("Please enter your phone number");
      return;
    }

    setIsLoading(true);
    try {
      await requestOTPMutation.mutateAsync({
        phoneNumber: phoneNumber.startsWith("+") ? phoneNumber : `+233${phoneNumber.slice(-9)}`,
      });
      setStep("otp");
      toast.success("OTP sent to your phone number");
    } catch (error) {
      toast.error("Failed to send OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode.trim() || otpCode.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP");
      return;
    }

    setIsLoading(true);
    try {
      await verifyOTPMutation.mutateAsync({
        phoneNumber: phoneNumber.startsWith("+") ? phoneNumber : `+233${phoneNumber.slice(-9)}`,
        otpCode,
        userRole,
      });
      toast.success("Phone verified successfully!");
      navigate(userRole === "farmer" ? "/farmer/dashboard" : "/investor/dashboard");
    } catch (error) {
      toast.error("Invalid OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Header */}
        <div className="text-center mb-8 animate-slide-in-down">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Leaf className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold text-gradient">FarmStock Ghana</h1>
          </div>
          <p className="text-muted-foreground">
            Connect farmers with investors. Grow together.
          </p>
        </div>

        {/* Auth Card */}
        <Card className="card-elevated animate-slide-in-up">
          <Tabs defaultValue="investor" onValueChange={(v) => setUserRole(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="investor">Investor</TabsTrigger>
              <TabsTrigger value="farmer">Farmer</TabsTrigger>
            </TabsList>

            <TabsContent value="investor" className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-2">Invest in Agriculture</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Start investing in farm produce with as little as GH¢ 10
                </p>
              </div>
              {renderAuthForm()}
            </TabsContent>

            <TabsContent value="farmer" className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-2">List Your Produce</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Connect with investors and fund your harvest
                </p>
              </div>
              {renderAuthForm()}
            </TabsContent>
          </Tabs>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );

  function renderAuthForm() {
    if (step === "phone") {
      return (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Phone Number (Ghana)</label>
            <div className="flex gap-2">
              <span className="flex items-center px-3 py-3 bg-muted rounded-lg text-sm font-medium">
                +233
              </span>
              <Input
                type="tel"
                placeholder="5XXXXXXXXX"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={isLoading}
                maxLength={9}
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Enter your 9-digit phone number (e.g., 501234567)
            </p>
          </div>

          <Button
            onClick={handleRequestOTP}
            disabled={isLoading || !phoneNumber.trim()}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending OTP...
              </>
            ) : (
              <>
                Send OTP
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Enter OTP Code</label>
          <p className="text-xs text-muted-foreground mb-3">
            We sent a 6-digit code to +233{phoneNumber.slice(-9)}
          </p>
          <Input
            type="text"
            placeholder="000000"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={isLoading}
            maxLength={6}
            className="text-center text-2xl tracking-widest font-mono"
          />
        </div>

        <Button
          onClick={handleVerifyOTP}
          disabled={isLoading || otpCode.length !== 6}
          className="w-full"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              Verify & Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            setStep("phone");
            setOtpCode("");
          }}
          disabled={isLoading}
          className="w-full"
        >
          Change Phone Number
        </Button>
      </div>
    );
  }
}
