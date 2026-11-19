import { getDb, getUserByPhoneNumber } from "./db";
import { users } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { nanoid } from "nanoid";
import { sendSms } from "./sms";

/** Max wrong guesses before the code is destroyed and a new one is required. */
export const MAX_OTP_ATTEMPTS = 5;

/**
 * Generate a 6-digit OTP code.
 * Uses the CSPRNG — `Math.random()` is guessable from observed output and must
 * never be used for a credential.
 */
export function generateOTP(): string {
  return randomInt(100_000, 1_000_000).toString();
}

/**
 * Generate OTP expiration time (5 minutes from now)
 */
export function getOTPExpiration(): Date {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 5);
  return expiresAt;
}

/**
 * Generate a permanent openId for OTP-based users
 * Format: otp_{nanoid} to distinguish from OAuth users
 */
export function generatePermanentOpenId(): string {
  return `otp_${nanoid(32)}`;
}

/**
 * Deliver an OTP over whichever SMS provider is configured.
 *
 * Providers are resolved in server/sms/index.ts, so there is no hard dependency
 * on Twilio: Arkesel or mNotify (both Ghanaian) or Africa's Talking can be used
 * instead. With no provider configured, development logs the code and returns
 * true; production returns false so the caller never pretends delivery worked.
 */
export async function sendOTP(phoneNumber: string, otpCode: string): Promise<boolean> {
  const result = await sendSms(
    phoneNumber,
    `Your FarmStock Ghana verification code is: ${otpCode}. Valid for 5 minutes.`,
    { code: otpCode },
  );

  if (!result.delivered) {
    console.error(
      `[OTP] ${result.provider} delivery failed for ${phoneNumber}: ${result.error ?? "unknown error"}`,
    );
    return false;
  }

  console.log(`[OTP] Code delivered to ${phoneNumber} via ${result.provider}`);
  return true;
}

/**
 * Create or update OTP for a phone number
 * Ensures user has a permanent openId that will be used for session tokens
 */
export async function createOrUpdateOTP(
  phoneNumber: string,
): Promise<{ otpCode: string; expiresAt: Date; openId: string; delivered: boolean } | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[OTP] Database not available");
    return null;
  }

  try {
    const otpCode = generateOTP();
    const expiresAt = getOTPExpiration();

    // Check if user exists with this phone number
    const existingUser = await getUserByPhoneNumber(phoneNumber);

    if (existingUser) {
      // Update existing user's OTP (keep their existing openId), reset the guess counter
      await db
        .update(users)
        .set({ otpCode, otpExpiresAt: expiresAt, otpAttempts: 0 })
        .where(eq(users.phoneNumber, phoneNumber));

      const delivered = await sendOTP(phoneNumber, otpCode);
      if (!delivered && process.env.NODE_ENV === "production") {
        await clearOTP(phoneNumber);
        return null;
      }

      return { otpCode, expiresAt, openId: existingUser.openId, delivered };
    } else {
      // Create new user with permanent openId
      const permanentOpenId = generatePermanentOpenId();

      await db.insert(users).values({
        openId: permanentOpenId,
        phoneNumber,
        otpCode,
        otpExpiresAt: expiresAt,
        otpAttempts: 0,
        isPhoneVerified: false,
        role: "user", // Default role, will be updated on verification
        loginMethod: "phone_otp",
        name: `User-${phoneNumber.slice(-4)}`, // Temporary name
      });

      const delivered = await sendOTP(phoneNumber, otpCode);
      if (!delivered && process.env.NODE_ENV === "production") {
        await clearOTP(phoneNumber);
        return null;
      }

      return { otpCode, expiresAt, openId: permanentOpenId, delivered };
    }
  } catch (error) {
    console.error("[OTP] Failed to create OTP:", error);
    return null;
  }
}

/**
 * Verify OTP for a phone number
 * Returns the user's openId which will be used for session token
 */
export async function verifyOTP(
  phoneNumber: string,
  otpCode: string,
): Promise<{ success: boolean; openId?: string; attemptsRemaining?: number; lockedOut?: boolean }> {
  const db = await getDb();
  if (!db) {
    console.warn("[OTP] Database not available");
    return { success: false };
  }

  try {
    const user = await getUserByPhoneNumber(phoneNumber);

    if (!user) {
      console.warn("[OTP] User not found for phone number:", phoneNumber);
      return { success: false };
    }

    // No live code: already used, cleared, or never requested.
    if (!user.otpCode || !user.otpExpiresAt) {
      return { success: false, attemptsRemaining: 0, lockedOut: true };
    }

    // Check if OTP has expired
    if (new Date() > user.otpExpiresAt) {
      console.warn("[OTP] OTP expired");
      await clearOTP(phoneNumber);
      return { success: false, attemptsRemaining: 0, lockedOut: true };
    }

    // Check if OTP matches
    if (user.otpCode !== otpCode) {
      const attemptsUsed = (user.otpAttempts ?? 0) + 1;
      if (attemptsUsed >= MAX_OTP_ATTEMPTS) {
        // Burn the code: an attacker must not get unlimited guesses, and a
        // legitimate user simply requests a new one.
        await db
          .update(users)
          .set({ otpCode: null, otpExpiresAt: null, otpAttempts: 0 })
          .where(eq(users.phoneNumber, phoneNumber));
        console.warn("[OTP] Too many failed attempts, code invalidated");
        return { success: false, attemptsRemaining: 0, lockedOut: true };
      }

      await db
        .update(users)
        .set({ otpAttempts: sql`${users.otpAttempts} + 1` })
        .where(eq(users.phoneNumber, phoneNumber));

      return { success: false, attemptsRemaining: MAX_OTP_ATTEMPTS - attemptsUsed };
    }

    // Mark phone as verified and clear OTP in one statement.
    // Scoped to this phone *and* the matched code, which makes the code
    // single-use even under concurrent verification attempts.
    const claimed = await db
      .update(users)
      .set({
        isPhoneVerified: true,
        otpCode: null,
        otpExpiresAt: null,
        otpAttempts: 0,
      })
      .where(and(eq(users.phoneNumber, phoneNumber), eq(users.otpCode, otpCode)));

    // A concurrent request may have consumed the same code first.
    if (Array.isArray(claimed) && claimed[0] && typeof claimed[0] === "object" && "affectedRows" in claimed[0]) {
      const header = claimed[0] as { affectedRows?: number };
      if (header.affectedRows === 0) {
        return { success: false };
      }
    }

    // Return the user's openId for session creation
    return { success: true, openId: user.openId };
  } catch (error) {
    console.error("[OTP] Failed to verify OTP:", error);
    return { success: false };
  }
}

/**
 * Clear OTP for a phone number (after failed attempts or logout)
 */
export async function clearOTP(phoneNumber: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db
      .update(users)
      .set({
        otpCode: null,
        otpExpiresAt: null,
      })
      .where(eq(users.phoneNumber, phoneNumber));
  } catch (error) {
    console.error("[OTP] Failed to clear OTP:", error);
  }
}
