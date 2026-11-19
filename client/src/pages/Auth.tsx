import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import { Leaf, ArrowRight, Loader2, Copy, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";

/** Surface what the server actually said instead of a generic message. */
function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof TRPCClientError) {
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

/** The server decides which workspace the signed-in user belongs in. */
function destinationForRole(role: string): string | null {
  switch (role) {
    case "farmer":
      return "/farmer/dashboard";
    case "investor":
      return "/investor/dashboard";
    case "admin":
      // Admins can open either workspace; the investor view is the default.
      return "/investor/dashboard";
    default:
      return null;
  }
}

export default function Auth() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [userRole, setUserRole] = useState<"farmer" | "investor">("investor");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [isLoading, setIsLoading] = useState(false);
  const [demoOTP, setDemoOTP] = useState<string | null>(null);
  const [copiedOTP, setCopiedOTP] = useState(false);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const requestOTPMutation = trpc.auth.requestOTP.useMutation();
  const verifyOTPMutation = trpc.auth.verifyOTPAndLogin.useMutation();

  const handleRequestOTP = async () => {
    if (!phoneNumber.trim()) {
      toast.error("Please enter your phone number");
      return;
    }

    setIsLoading(true);
    try {
      // Support international numbers (with +) or Ghana numbers (without +)
      let formattedNumber = phoneNumber;
      if (!phoneNumber.startsWith("+")) {
        // If no +, assume Ghana number and add country code
        formattedNumber = `+233${phoneNumber.slice(-9)}`;
      }
      
      const response = await requestOTPMutation.mutateAsync({
        phoneNumber: formattedNumber,
      });
      setStep("otp");
      // `demoOtp` only exists outside production, so the box below is hidden
      // automatically in a real deployment.
      setDemoOTP(typeof response.demoOtp === "string" ? response.demoOtp : null);
      toast.success(response.message || "OTP sent to your phone number");
    } catch (error) {
      setDemoOTP(null);
      toast.error(errorMessage(error, "Failed to send OTP. Please try again."));
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
      // Use the same formatting as requestOTP
      let formattedNumber = phoneNumber;
      if (!phoneNumber.startsWith("+")) {
        formattedNumber = `+233${phoneNumber.slice(-9)}`;
      }

      const result = await verifyOTPMutation.mutateAsync({
        phoneNumber: formattedNumber,
        otpCode,
        userRole,
      });

      // /auth has no `auth.me` observer, so invalidate() has nothing to refetch.
      // Fetch it so the authenticated shell sees the new session immediately.
      await utils.auth.me.fetch();

      // The server decides the role: an existing account keeps the role it
      // already has, so the selected tab cannot be trusted for routing.
      const destination = destinationForRole(result.role);
      if (!destination) {
        toast.error("This account has no workspace yet. Contact support to finish setting it up.");
        return;
      }

      if (!result.roleChanged && result.role !== userRole) {
        toast.info(`Signed in with your existing ${result.role} account.`);
      } else {
        toast.success("Phone verified successfully!");
      }

      navigate(destination);
    } catch (error) {
      toast.error(errorMessage(error, "Could not verify that code. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyOTP = () => {
    if (demoOTP) {
      navigator.clipboard.writeText(demoOTP);
      setCopiedOTP(true);
      setTimeout(() => setCopiedOTP(false), 2000);
      toast.success("OTP copied to clipboard");
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
            <label className="text-sm font-medium mb-2 block">Phone Number</label>
            <Input
              type="tel"
              placeholder="+233501234567 or +15625735548"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={isLoading}
              className="flex-1"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Enter your phone number with country code (e.g., +233501234567 for Ghana or +1... for US)
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
            We sent a 6-digit code to {phoneNumber.startsWith("+") ? phoneNumber : `+233${phoneNumber.slice(-9)}`}
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

        {/* Rendered only when the server returned `demoOtp`, i.e. never in production. */}
        {demoOTP !== null && (
          <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">
                  Development only — not shown in production
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Your OTP</p>
                <p className="text-2xl font-mono font-bold text-blue-700 dark:text-blue-300 tracking-widest">{demoOTP}</p>
              </div>
              <button
                onClick={handleCopyOTP}
                className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900 rounded transition-colors"
                title="Copy OTP"
              >
                {copiedOTP ? (
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                ) : (
                  <Copy className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                )}
              </button>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              This code is echoed by the API in non-production environments only.
            </p>
          </div>
        )}

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
            setDemoOTP(null);
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
