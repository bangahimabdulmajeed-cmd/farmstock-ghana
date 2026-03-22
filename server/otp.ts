import { getDb, getUserByPhoneNumber } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Generate a 6-digit OTP code
 */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
 * Send OTP to phone number (mock implementation)
 * In production, integrate with SMS service like Twilio, Africa's Talking, etc.
 */
export async function sendOTP(phoneNumber: string, otpCode: string): Promise<boolean> {
  try {
    // Mock implementation - in production, call SMS API
    console.log(`[OTP] Sending OTP ${otpCode} to ${phoneNumber}`);
    
    // For demo purposes, log the OTP
    if (process.env.NODE_ENV === "development") {
      console.log(`[OTP] Demo OTP: ${otpCode}`);
    }
    
    return true;
  } catch (error) {
    console.error("[OTP] Failed to send OTP:", error);
    return false;
  }
}

/**
 * Create or update OTP for a phone number
 */
export async function createOrUpdateOTP(phoneNumber: string): Promise<{ otpCode: string; expiresAt: Date } | null> {
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
      // Update existing user's OTP
      await db
        .update(users)
        .set({ otpCode, otpExpiresAt: expiresAt })
        .where(eq(users.phoneNumber, phoneNumber));
    } else {
      // Create new user with OTP (not verified yet)
      await db.insert(users).values({
        phoneNumber,
        otpCode,
        otpExpiresAt: expiresAt,
        isPhoneVerified: false,
        role: "user",
        openId: `temp-${phoneNumber}-${Date.now()}`, // Temporary, will be replaced on OAuth
      });
    }

    // Send OTP via SMS
    await sendOTP(phoneNumber, otpCode);

    return { otpCode, expiresAt };
  } catch (error) {
    console.error("[OTP] Failed to create OTP:", error);
    return null;
  }
}

/**
 * Verify OTP for a phone number
 */
export async function verifyOTP(phoneNumber: string, otpCode: string): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.warn("[OTP] Database not available");
    return false;
  }

  try {
    const user = await getUserByPhoneNumber(phoneNumber);

    if (!user) {
      console.warn("[OTP] User not found for phone number:", phoneNumber);
      return false;
    }

    // Check if OTP matches
    if (user.otpCode !== otpCode) {
      console.warn("[OTP] OTP mismatch");
      return false;
    }

    // Check if OTP has expired
    if (!user.otpExpiresAt || new Date() > user.otpExpiresAt) {
      console.warn("[OTP] OTP expired");
      return false;
    }

    // Mark phone as verified and clear OTP
    await db
      .update(users)
      .set({
        isPhoneVerified: true,
        otpCode: null,
        otpExpiresAt: null,
      })
      .where(eq(users.phoneNumber, phoneNumber));

    return true;
  } catch (error) {
    console.error("[OTP] Failed to verify OTP:", error);
    return false;
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
