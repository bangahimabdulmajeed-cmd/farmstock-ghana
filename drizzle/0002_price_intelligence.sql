-- Price intelligence + correctness hardening.
-- TiDB compatible: no foreign keys (TiDB does not enforce them and older builds
-- reject the syntax) and no JSON column defaults (TiDB rejects `DEFAULT ('[]')`,
-- which is what broke migration 0001).

ALTER TABLE `users` ADD `otpAttempts` int NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX `idx_users_role` ON `users` (`role`);
--> statement-breakpoint

-- kgPerShare makes a share a real quantity of produce, which is what lets us
-- value it against a market price and fulfil a physical-delivery payout.
ALTER TABLE `produceListing` ADD `kgPerShare` decimal(12,6);
--> statement-breakpoint
UPDATE `produceListing`
SET `kgPerShare` = `totalQuantity` / `totalShares`
WHERE `kgPerShare` IS NULL AND `totalShares` > 0;
--> statement-breakpoint
CREATE INDEX `idx_listing_farmer` ON `produceListing` (`farmerId`);
--> statement-breakpoint
CREATE INDEX `idx_listing_status` ON `produceListing` (`fundingStatus`, `createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_listing_crop` ON `produceListing` (`cropType`);
--> statement-breakpoint

ALTER TABLE `investment` ADD `pricePerKgAtPurchase` decimal(12,4);
--> statement-breakpoint
ALTER TABLE `investment` ADD `sharesTransferred` int NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `investment` i
JOIN `produceListing` p ON p.`id` = i.`produceListingId`
SET i.`pricePerKgAtPurchase` = (i.`totalInvestment` / (p.`kgPerShare` * i.`sharesOwned`))
WHERE i.`pricePerKgAtPurchase` IS NULL AND p.`kgPerShare` > 0 AND i.`sharesOwned` > 0;
--> statement-breakpoint
CREATE INDEX `idx_investment_investor` ON `investment` (`investorId`, `createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_investment_listing` ON `investment` (`produceListingId`);
--> statement-breakpoint

CREATE INDEX `idx_marketplace_seller` ON `shareMarketplace` (`sellerId`);
--> statement-breakpoint
CREATE INDEX `idx_marketplace_status` ON `shareMarketplace` (`status`, `createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_marketplace_investment` ON `shareMarketplace` (`investmentId`);
--> statement-breakpoint

-- Marketplace transfers now name both sides of the trade.
ALTER TABLE `marketplaceTransaction` ADD `sellerId` int;
--> statement-breakpoint
ALTER TABLE `marketplaceTransaction` ADD `buyerInvestmentId` int;
--> statement-breakpoint
ALTER TABLE `marketplaceTransaction` ADD `sellerInvestmentId` int;
--> statement-breakpoint
CREATE INDEX `idx_marketplace_tx_buyer` ON `marketplaceTransaction` (`buyerId`);
--> statement-breakpoint
CREATE INDEX `idx_marketplace_tx_listing` ON `marketplaceTransaction` (`marketplaceListingId`);
--> statement-breakpoint

CREATE INDEX `idx_transaction_user` ON `transaction` (`userId`, `createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_transaction_type` ON `transaction` (`type`);
--> statement-breakpoint

-- Payout requests now record the valuation they were based on and the operator
-- decision. The (investmentId, status) index is deliberately NOT unique so this
-- migration cannot fail on historical demo rows.
ALTER TABLE `payoutRequest` ADD `valuationAmount` decimal(15,2);
--> statement-breakpoint
ALTER TABLE `payoutRequest` ADD `pricePerKgAtRequest` decimal(12,4);
--> statement-breakpoint
ALTER TABLE `payoutRequest` ADD `quantityKg` decimal(12,3);
--> statement-breakpoint
ALTER TABLE `payoutRequest` ADD `reviewedBy` int;
--> statement-breakpoint
ALTER TABLE `payoutRequest` ADD `reviewedAt` datetime;
--> statement-breakpoint
ALTER TABLE `payoutRequest` ADD `rejectionReason` text;
--> statement-breakpoint
CREATE INDEX `idx_payout_investor` ON `payoutRequest` (`investorId`, `createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_payout_status` ON `payoutRequest` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_payout_investment_status` ON `payoutRequest` (`investmentId`, `status`);
--> statement-breakpoint

CREATE INDEX `idx_harvest_listing` ON `harvestUpdate` (`produceListingId`, `createdAt`);
--> statement-breakpoint

CREATE TABLE `commodityPrice` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cropType` enum('maize','cocoa','cassava','plantain','rice','tomato','pepper','groundnut','shea','other') NOT NULL,
	`scope` enum('global','national') NOT NULL,
	`market` varchar(100) NOT NULL,
	`pricePerKgGhs` decimal(12,4) NOT NULL,
	`priceNative` decimal(15,4),
	`nativeCurrency` varchar(8),
	`nativeUnit` varchar(24),
	`fxRateGhsPerUsd` decimal(12,4),
	`source` varchar(64) NOT NULL,
	`sourceSymbol` varchar(32),
	`observedAt` datetime NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `commodityPrice_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_price_point` UNIQUE(`cropType`,`scope`,`market`,`observedAt`)
);
--> statement-breakpoint
CREATE INDEX `idx_price_lookup` ON `commodityPrice` (`cropType`,`scope`,`observedAt`);
