/**
 * Seed demo data for FarmStock Ghana.
 *
 *   node seed-demo-data.mjs
 *
 * Requires DATABASE_URL. Safe to run more than once: users are upserted and
 * listings are only created when the farmer has none yet.
 */
import mysql from "mysql2/promise";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required, e.g. mysql://user:pass@host:4000/db");
  process.exit(1);
}

// Parse the URL ourselves so TiDB's `?ssl={"rejectUnauthorized":true}` becomes a
// real TLS option instead of being ignored by the driver.
function credentialsFromUrl(raw) {
  const parsed = new URL(raw);
  const isTiDbCloud = parsed.hostname.endsWith("tidbcloud.com");

  let ssl;
  const sslParam = parsed.searchParams.get("ssl");
  if (sslParam) {
    try {
      const decoded = JSON.parse(sslParam);
      ssl = typeof decoded === "object" && decoded !== null ? decoded : { rejectUnauthorized: true };
    } catch {
      ssl = { rejectUnauthorized: true };
    }
  } else if (isTiDbCloud) {
    ssl = { minVersion: "TLSv1.2", rejectUnauthorized: true };
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    ssl,
  };
}

const connection = await mysql.createConnection(credentialsFromUrl(connectionString));

const GHS = (value) => Number(value).toFixed(2);

const people = [
  { openId: "farmer_kwame_123", name: "Kwame Osei", phone: "+233501234567", role: "farmer", region: "Ashanti Region, Kumasi" },
  { openId: "farmer_ama_456", name: "Ama Mensah", phone: "+233551234568", role: "farmer", region: "Eastern Region, Koforidua" },
  { openId: "investor_kofi_789", name: "Kofi Amponsah", phone: "+233201234569", role: "investor", region: "Greater Accra, Accra" },
  { openId: "investor_abena_101", name: "Abena Owusu", phone: "+233261234560", role: "investor", region: "Greater Accra, Tema" },
];

for (const person of people) {
  await connection.execute(
    `INSERT INTO users (openId, name, phoneNumber, role, loginMethod, location, isPhoneVerified, createdAt, updatedAt, lastSignedIn)
     VALUES (?, ?, ?, ?, 'phone_otp', ?, 1, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE name = VALUES(name), phoneNumber = VALUES(phoneNumber), role = VALUES(role), location = VALUES(location)`,
    [person.openId, person.name, person.phone, person.role, person.region],
  );
}

const [[farmer1]] = await connection.execute("SELECT id FROM users WHERE openId = ?", ["farmer_kwame_123"]);
const [[farmer2]] = await connection.execute("SELECT id FROM users WHERE openId = ?", ["farmer_ama_456"]);
const [[investor1]] = await connection.execute("SELECT id FROM users WHERE openId = ?", ["investor_kofi_789"]);

/**
 * kgPerShare is the missing concept in the original data model: without it a
 * share is not a quantity of produce, so it cannot be valued or delivered.
 */
const listings = [
  {
    farmerId: farmer1.id,
    cropType: "maize",
    cropName: "Local Maize",
    description: "High-yield maize on an irrigated plot in Ashanti Region.",
    totalQuantity: 1000,
    totalShares: 200,
    pricePerShare: 22.5,
    location: "Ashanti Region, Kumasi",
    daysToHarvest: 120,
  },
  {
    farmerId: farmer1.id,
    cropType: "cocoa",
    cropName: "Premium Cocoa",
    description: "Organic cocoa beans, fermented and sun-dried.",
    totalQuantity: 500,
    totalShares: 100,
    pricePerShare: 85,
    location: "Ashanti Region, Kumasi",
    daysToHarvest: 180,
  },
  {
    farmerId: farmer2.id,
    cropType: "cassava",
    cropName: "Cassava (flour grade)",
    description: "Cassava for flour and starch production.",
    totalQuantity: 2000,
    totalShares: 400,
    pricePerShare: 9.5,
    location: "Eastern Region, Koforidua",
    daysToHarvest: 90,
  },
];

for (const listing of listings) {
  const [existing] = await connection.execute(
    "SELECT id FROM produceListing WHERE farmerId = ? AND cropName = ? LIMIT 1",
    [listing.farmerId, listing.cropName],
  );
  if (existing.length > 0) continue;

  const kgPerShare = listing.totalQuantity / listing.totalShares;

  await connection.execute(
    `INSERT INTO produceListing
       (farmerId, cropType, cropName, description, totalQuantity, quantityUnit, kgPerShare,
        pricePerShare, totalShares, sharesAvailable, sharesSold, harvestDate, location,
        fundingStatus, fundedAmount, exitOptions, images, harvestStatus, payoutStatus, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 'kg', ?, ?, ?, ?, 0, DATE_ADD(NOW(), INTERVAL ? DAY), ?, 'active', 0,
             ?, JSON_ARRAY(), 'pending', 'pending', NOW(), NOW())`,
    [
      listing.farmerId,
      listing.cropType,
      listing.cropName,
      listing.description,
      GHS(listing.totalQuantity),
      kgPerShare.toFixed(6),
      GHS(listing.pricePerShare),
      listing.totalShares,
      listing.totalShares,
      listing.daysToHarvest,
      listing.location,
      JSON.stringify({ cashPayout: true, physicalDelivery: true, shareTrading: true }),
    ],
  );
}

/**
 * Ghana market prices. There is no free national price API, so these are
 * operator-entered reference values — change them from the Operator Console.
 * They are dated today, so they are fresh for 45 days.
 */
const nationalPrices = [
  { cropType: "maize", market: "Kumasi Central", pricePerKg: 4.6 },
  { cropType: "cocoa", market: "Tema Port (COCOBOD)", pricePerKg: 62.0 },
  { cropType: "cassava", market: "Koforidua", pricePerKg: 2.1 },
  { cropType: "rice", market: "Accra (Agbogbloshie)", pricePerKg: 9.8 },
  { cropType: "tomato", market: "Techiman", pricePerKg: 6.4 },
  { cropType: "plantain", market: "Kumasi Central", pricePerKg: 3.2 },
  { cropType: "pepper", market: "Techiman", pricePerKg: 12.5 },
  { cropType: "groundnut", market: "Tamale", pricePerKg: 8.9 },
  { cropType: "shea", market: "Tamale", pricePerKg: 5.5 },
];

for (const row of nationalPrices) {
  await connection.execute(
    `INSERT INTO commodityPrice
       (cropType, scope, market, pricePerKgGhs, priceNative, nativeCurrency, nativeUnit, fxRateGhsPerUsd, source, sourceSymbol, observedAt, createdAt)
     VALUES (?, 'national', ?, ?, ?, 'GHS', 'GHS/kg', NULL, 'operator', NULL, DATE(NOW()), NOW())
     ON DUPLICATE KEY UPDATE pricePerKgGhs = VALUES(pricePerKgGhs), priceNative = VALUES(priceNative)`,
    [row.cropType, row.market, row.pricePerKg.toFixed(4), row.pricePerKg.toFixed(4)],
  );
}

/**
 * One worked example: an investor buys 20 shares of the maize listing, then
 * requests a cash payout, so the Operator Console has something to review.
 */
const [[maize]] = await connection.execute(
  "SELECT * FROM produceListing WHERE cropName = 'Local Maize' LIMIT 1",
);

if (maize && investor1) {
  const [existingInvestment] = await connection.execute(
    "SELECT id FROM investment WHERE investorId = ? AND produceListingId = ? LIMIT 1",
    [investor1.id, maize.id],
  );

  if (existingInvestment.length === 0) {
    const shares = 20;
    const amount = shares * Number(maize.pricePerShare);
    const kgPerShare = Number(maize.kgPerShare);
    const pricePerKgAtPurchase = amount / (kgPerShare * shares);

    const [investmentResult] = await connection.execute(
      `INSERT INTO investment
         (investorId, produceListingId, sharesOwned, sharePrice, pricePerKgAtPurchase, totalInvestment,
          exitOption, status, payoutReceived, sharesTransferred, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'cash_payout', 'active', 0, 0, NOW(), NOW())`,
      [
        investor1.id,
        maize.id,
        shares,
        maize.pricePerShare,
        pricePerKgAtPurchase.toFixed(4),
        amount.toFixed(2),
      ],
    );

    await connection.execute(
      `UPDATE produceListing
       SET sharesAvailable = sharesAvailable - ?, sharesSold = sharesSold + ?, fundedAmount = fundedAmount + ?
       WHERE id = ?`,
      [shares, shares, amount.toFixed(2), maize.id],
    );

    await connection.execute(
      `INSERT INTO transaction (userId, type, amount, status, produceListingId, investmentId, description, createdAt, updatedAt)
       VALUES (?, 'share_purchase', ?, 'completed', ?, ?, ?, NOW(), NOW())`,
      [investor1.id, amount.toFixed(2), maize.id, investmentResult.insertId, `Purchased ${shares} shares of ${maize.cropName}`],
    );

    console.log(`Created demo investment #${investmentResult.insertId} for investor ${investor1.id}`);
  }
}

const [[users]] = await connection.execute("SELECT COUNT(*) AS count FROM users");
const [[produce]] = await connection.execute("SELECT COUNT(*) AS count FROM produceListing");
const [[prices]] = await connection.execute("SELECT COUNT(*) AS count FROM commodityPrice");

console.log("FarmStock demo data ready:");
console.log(`  users: ${users.count}`);
console.log(`  listings: ${produce.count}`);
console.log(`  price observations: ${prices.count}`);
console.log("Sign in with any of the demo phone numbers, e.g. +233501234567 (farmers are auto-detected by role).");

await connection.end();
