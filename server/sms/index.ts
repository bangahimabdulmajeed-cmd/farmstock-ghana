/**
 * SMS delivery with swappable providers.
 *
 * No provider gives unlimited free SMS to Ghanaian numbers, so the code is
 * provider-agnostic rather than tied to one. Resolution order:
 *
 *   1. SMS_PROVIDER env var, if set explicitly
 *   2. Arkesel        (Ghanaian, local sender IDs, free signup credits)
 *   3. mNotify        (Ghanaian, free signup credits)
 *   4. Africa's Talking (free sandbox — simulator only, not real handsets)
 *   5. Twilio         (paid beyond trial credit)
 *   6. console        (development fallback — logs the code, sends nothing)
 *
 * In production a `console` fallback is treated as a failure, never as success.
 */

export type SmsProviderId = "arkesel" | "mnotify" | "africas_talking" | "twilio" | "console";

export type SmsResult = {
  delivered: boolean;
  provider: SmsProviderId;
  error?: string;
};

type Resolved = { id: SmsProviderId; senderId: string };

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export function resolveSmsProvider(): Resolved {
  const explicit = env("SMS_PROVIDER")?.toLowerCase();
  const senderId = env("SMS_SENDER_ID") ?? "FarmStock";

  if (explicit === "arkesel") return { id: "arkesel", senderId };
  if (explicit === "mnotify") return { id: "mnotify", senderId };
  if (explicit === "africas_talking") return { id: "africas_talking", senderId };
  if (explicit === "twilio") return { id: "twilio", senderId };
  if (explicit === "console") return { id: "console", senderId };

  if (env("ARKESEL_API_KEY")) return { id: "arkesel", senderId };
  if (env("MNOTIFY_API_KEY")) return { id: "mnotify", senderId };
  if (env("AT_API_KEY")) return { id: "africas_talking", senderId };
  if (env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_PHONE_NUMBER")) {
    return { id: "twilio", senderId };
  }
  return { id: "console", senderId };
}

/** True when a provider that reaches real handsets is configured. */
export function isSmsConfigured(): boolean {
  const { id } = resolveSmsProvider();
  if (id === "console") return false;
  if (id === "africas_talking") return env("AT_API_KEY") !== undefined && env("AT_USERNAME") !== undefined;
  if (id === "arkesel") return env("ARKESEL_API_KEY") !== undefined;
  if (id === "mnotify") return env("MNOTIFY_API_KEY") !== undefined;
  return (
    env("TWILIO_ACCOUNT_SID") !== undefined &&
    env("TWILIO_AUTH_TOKEN") !== undefined &&
    env("TWILIO_PHONE_NUMBER") !== undefined
  );
}

export function smsProviderStatus() {
  const { id, senderId } = resolveSmsProvider();
  return {
    provider: id,
    senderId,
    configured: isSmsConfigured(),
    sandbox: id === "africas_talking" && env("AT_SANDBOX") === "true",
    hint:
      id === "console"
        ? "Set ARKESEL_API_KEY, MNOTIFY_API_KEY, AT_API_KEY or TWILIO_* to deliver real SMS."
        : null,
  };
}

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { ok: response.ok, status: response.status, json: parsed as Record<string, unknown> | null };
}

/** Arkesel — https://arkesel.com/developer-api/sms-api/ */
async function sendViaArkesel(to: string, message: string, senderId: string): Promise<SmsResult> {
  const apiKey = env("ARKESEL_API_KEY");
  if (!apiKey) return { delivered: false, provider: "arkesel", error: "ARKESEL_API_KEY is not set" };

  try {
    const { ok, status, json } = await postJson(
      "https://sms.arkesel.com/api/v2/sms/send",
      { "api-key": apiKey },
      { sender: senderId, message, recipients: [to] },
    );
    const delivered = ok && json?.status === "success";
    return {
      delivered,
      provider: "arkesel",
      error: delivered ? undefined : `Arkesel responded ${status}: ${JSON.stringify(json)}`,
    };
  } catch (error) {
    return { delivered: false, provider: "arkesel", error: error instanceof Error ? error.message : String(error) };
  }
}

/** mNotify — https://apps.mnotify.net/smsapi */
async function sendViaMnotify(to: string, message: string, senderId: string): Promise<SmsResult> {
  const apiKey = env("MNOTIFY_API_KEY");
  if (!apiKey) return { delivered: false, provider: "mnotify", error: "MNOTIFY_API_KEY is not set" };

  try {
    const url = new URL("https://apps.mnotify.net/smsapi");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("to", to);
    url.searchParams.set("msg", message);
    url.searchParams.set("sender_id", senderId);

    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    let json: Record<string, unknown> | null = null;
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      json = null;
    }
    const delivered = response.ok && (json?.status === "success" || String(json?.code) === "2000");
    return {
      delivered,
      provider: "mnotify",
      error: delivered ? undefined : `mNotify responded ${response.status}: ${JSON.stringify(json)}`,
    };
  } catch (error) {
    return { delivered: false, provider: "mnotify", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Africa's Talking — https://developers.africastalking.com
 * The sandbox (AT_SANDBOX=true) is free but only delivers to the web simulator.
 */
async function sendViaAfricasTalking(to: string, message: string, senderId: string): Promise<SmsResult> {
  const apiKey = env("AT_API_KEY");
  const username = env("AT_USERNAME");
  if (!apiKey || !username) {
    return { delivered: false, provider: "africas_talking", error: "AT_API_KEY and AT_USERNAME must both be set" };
  }

  const sandbox = env("AT_SANDBOX") === "true";
  const base = sandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";

  try {
    const body = new URLSearchParams({ username, to, message });
    const from = env("AT_SENDER_ID") ?? (sandbox ? undefined : senderId);
    if (from) body.set("from", from);

    const response = await fetch(base, {
      method: "POST",
      headers: {
        apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    let json: Record<string, unknown> | null = null;
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      json = null;
    }

    const recipients =
      (json?.SMSMessageData as { Recipients?: Array<{ status?: string }> } | undefined)?.Recipients ?? [];
    const delivered = response.ok && recipients.some(recipient => recipient.status === "Success");
    return {
      delivered,
      provider: "africas_talking",
      error: delivered ? undefined : `Africa's Talking responded ${response.status}: ${JSON.stringify(json)}`,
    };
  } catch (error) {
    return {
      delivered: false,
      provider: "africas_talking",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Twilio REST API directly, so the SDK is not required at runtime. */
async function sendViaTwilio(to: string, message: string): Promise<SmsResult> {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_PHONE_NUMBER");
  if (!accountSid || !authToken || !from) {
    return { delivered: false, provider: "twilio", error: "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER must be set" };
  }

  try {
    const body = new URLSearchParams({ To: to, From: from, Body: message });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { delivered: false, provider: "twilio", error: `Twilio responded ${response.status}: ${text.slice(0, 200)}` };
    }

    const json = (await response.json().catch(() => null)) as { status?: string } | null;
    return { delivered: json?.status !== "failed", provider: "twilio", error: json?.status === "failed" ? "Twilio reported failure" : undefined };
  } catch (error) {
    return { delivered: false, provider: "twilio", error: error instanceof Error ? error.message : String(error) };
  }
}

export async function sendSms(to: string, message: string): Promise<SmsResult> {
  const { id, senderId } = resolveSmsProvider();

  switch (id) {
    case "arkesel":
      return sendViaArkesel(to, message, senderId);
    case "mnotify":
      return sendViaMnotify(to, message, senderId);
    case "africas_talking":
      return sendViaAfricasTalking(to, message, senderId);
    case "twilio":
      return sendViaTwilio(to, message);
    case "console":
    default:
      if (process.env.NODE_ENV === "production") {
        return {
          delivered: false,
          provider: "console",
          error: "No SMS provider configured in production. Set SMS_PROVIDER and its credentials.",
        };
      }
      console.log(`[SMS:console] to=${to} message=${message}`);
      return { delivered: true, provider: "console" };
  }
}
