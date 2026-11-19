export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

// Fail closed: an empty HMAC key would make every session token forgeable.
if (ENV.isProduction) {
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET is required in production: refusing to start with an unsigned session key");
  }
  if (ENV.cookieSecret.length < 32) {
    console.warn("[env] JWT_SECRET is shorter than 32 characters; use a long random value");
  }
  if (!ENV.databaseUrl) {
    console.warn("[env] DATABASE_URL is not set; every database-backed procedure will fail");
  }
}
