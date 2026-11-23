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

export type SmsProviderId = "arkesel" | "mnotify" | "africas_talking" | "whatsapp" | "twilio" | "console";

export type SmsResult = {
  delivered: boolean;
  provider: SmsProviderId;
  error?: string;
};

/** Extra data a channel may need. WhatsApp templates require the code as a parameter. */
export type SmsOptions = { code?: string };

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
  if (explicit === "whatsapp") return { id: "whatsapp", senderId };
  if (explicit === "twilio") return { id: "twilio", senderId };
  if (explicit === "console") return { id: "console", senderId };

  // Cheapest-first for Ghana: local aggregators before the global channels.
  if (env("ARKESEL_API_KEY")) return { id: "arkesel", senderId };
  if (env("MNOTIFY_API_KEY")) return { id: "mnotify", senderId };
  if (env("AT_API_KEY")) return { id: "africas_talking", senderId };
  if (env("WHATSAPP_TOKEN") && env("WHATSAPP_PHONE_NUMBER_ID")) return { id: "whatsapp", senderId };
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
  if (id === "whatsapp") return env("WHATSAPP_TOKEN") !== undefined && env("WHATSAPP_PHONE_NUMBER_ID") !== undefined;
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
        ? "Set ARKESEL_API_KEY, MNOTIFY_API_KEY, AT_API_KEY, WHATSAPP_TOKEN or TWILIO_* to deliver real messages."
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

  // Arkesel runs two products. v2 is the current JSON API; "SMS Messenger"
  // accounts only have the legacy query-string endpoint, which answers in plain
  // text. Select with ARKESEL_API_VERSION (default v2).
  if ((env("ARKESEL_API_VERSION") ?? "v2").toLowerCase() === "v1") {
    return sendViaArkeselLegacy(to, message, senderId, apiKey);
  }

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
      error: delivered ? undefined : `Arkesel v2 responded ${status}: ${JSON.stringify(json)}`,
    };
  } catch (error) {
    return { delivered: false, provider: "arkesel", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Legacy "SMS Messenger" endpoint:
 * GET https://sms.arkesel.com/sms/api?action=send-sms&api_key=…&to=…&from=…&sms=…
 * It replies with plain text, usually "SMS-Sent-Successfully", not JSON.
 */
async function sendViaArkeselLegacy(
  to: string,
  message: string,
  senderId: string,
  apiKey: string,
): Promise<SmsResult> {
  try {
    const url = new URL("https://sms.arkesel.com/sms/api");
    url.searchParams.set("action", "send-sms");
    url.searchParams.set("api_key", apiKey);
    // The legacy API expects a local or international number without the plus.
    url.searchParams.set("to", to.replace(/^\+/, ""));
    url.searchParams.set("from", senderId);
    url.searchParams.set("sms", message);

    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const text = await response.text().catch(() => "");

    // Success is plain text ("SMS-Sent-Successfully") on this endpoint, but
    // failures are JSON (e.g. {"code":"102","message":"Authentication failed"}),
    // so accept either shape rather than assuming plain text.
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = null;
    }

    const delivered =
      response.ok &&
      (String(parsed?.code ?? "") === "200" ||
        (/sent/i.test(text) && /success/i.test(text)));

    return {
      delivered,
      provider: "arkesel",
      error: delivered
        ? undefined
        : `Arkesel v1 responded ${response.status}: ${text.slice(0, 300) || "(empty body)"}`,
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

/**
 * WhatsApp Cloud API — https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * NOT a free channel. Meta bills per delivered template message; the
 * authentication category for Ghana is ~$0.004 (Jan 2026 rate cards), which is
 * slightly MORE than a Ghanaian SMS at ~GH¢0.03 (~$0.0026). It is offered
 * because some recipients — especially diaspora investors — read WhatsApp
 * reliably and ignore SMS.
 *
 * Requires a Meta Business account, a WhatsApp Business Account, a phone number
 * ID, and an approved *authentication* template whose body takes one {{1}}
 * parameter for the code. Approval is not instant.
 */
async function sendViaWhatsapp(to: string, options: SmsOptions, fallbackMessage: string): Promise<SmsResult> {
  const token = env("WHATSAPP_TOKEN");
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) {
    return {
      delivered: false,
      provider: "whatsapp",
      error: "WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID must both be set",
    };
  }

  const templateName = env("WHATSAPP_TEMPLATE_NAME") ?? "farmstock_otp";
  const language = env("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en_US";
  const apiVersion = env("WHATSAPP_API_VERSION") ?? "v21.0";
  // Cloud API expects digits only, including the country code.
  const recipient = to.replace(/[^\d]/g, "");

  try {
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipient,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: options.code ?? fallbackMessage }],
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    let json: Record<string, unknown> | null = null;
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      json = null;
    }

    const messageId = Array.isArray(json?.messages)
      ? (json?.messages as Array<{ id?: string }>)[0]?.id
      : undefined;
    return {
      delivered: response.ok && Boolean(messageId),
      provider: "whatsapp",
      error: response.ok
        ? undefined
        : `WhatsApp responded ${response.status}: ${JSON.stringify(json).slice(0, 300)}`,
    };
  } catch (error) {
    return { delivered: false, provider: "whatsapp", error: error instanceof Error ? error.message : String(error) };
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

export async function sendSms(to: string, message: string, options: SmsOptions = {}): Promise<SmsResult> {
  const { id, senderId } = resolveSmsProvider();

  switch (id) {
    case "arkesel":
      return sendViaArkesel(to, message, senderId);
    case "mnotify":
      return sendViaMnotify(to, message, senderId);
    case "africas_talking":
      return sendViaAfricasTalking(to, message, senderId);
    case "whatsapp":
      return sendViaWhatsapp(to, options, message);
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
