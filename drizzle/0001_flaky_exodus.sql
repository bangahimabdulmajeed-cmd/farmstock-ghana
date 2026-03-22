CREATE TABLE `harvestUpdate` (
	`id` int AUTO_INCREMENT NOT NULL,
	`produceListingId` int NOT NULL,
	`farmerId` int NOT NULL,
	`status` enum('in_progress','completed','delayed') NOT NULL,
	`description` text,
	`images` json DEFAULT ('[]'),
	`actualQuantity` decimal(10,2),
	`harvestDate` datetime,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `harvestUpdate_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `investment` (
	`id` int AUTO_INCREMENT NOT NULL,
	`investorId` int NOT NULL,
	`produceListingId` int NOT NULL,
	`sharesOwned` int NOT NULL,
	`sharePrice` decimal(10,2) NOT NULL,
	`totalInvestment` decimal(15,2) NOT NULL,
	`exitOption` enum('cash_payout','physical_delivery','share_trading') NOT NULL,
	`status` enum('active','pending_payout','completed','cancelled') NOT NULL DEFAULT 'active',
	`payoutReceived` boolean DEFAULT false,
	`payoutAmount` decimal(15,2),
	`payoutDate` datetime,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `investment_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marketplaceTransaction` (
	`id` int AUTO_INCREMENT NOT NULL,
	`buyerId` int NOT NULL,
	`marketplaceListingId` int NOT NULL,
	`sharesPurchased` int NOT NULL,
	`pricePerShare` decimal(10,2) NOT NULL,
	`totalAmount` decimal(15,2) NOT NULL,
	`status` enum('completed','pending','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketplaceTransaction_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payoutRequest` (
	`id` int AUTO_INCREMENT NOT NULL,
	`investorId` int NOT NULL,
	`investmentId` int NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`payoutType` enum('cash','physical_delivery') NOT NULL,
	`status` enum('pending','approved','processing','completed','rejected') NOT NULL DEFAULT 'pending',
	`deliveryAddress` text,
	`deliveryPhone` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payoutRequest_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `produceListing` (
	`id` int AUTO_INCREMENT NOT NULL,
	`farmerId` int NOT NULL,
	`cropType` enum('maize','cocoa','cassava','plantain','rice','tomato','pepper','groundnut','shea','other') NOT NULL,
	`cropName` varchar(100) NOT NULL,
	`description` text,
	`totalQuantity` decimal(10,2) NOT NULL,
	`quantityUnit` varchar(20) DEFAULT 'kg',
	`pricePerShare` decimal(10,2) NOT NULL,
	`totalShares` int NOT NULL,
	`sharesAvailable` int NOT NULL,
	`sharesSold` int DEFAULT 0,
	`harvestDate` datetime NOT NULL,
	`location` text NOT NULL,
	`fundingStatus` enum('active','fully_funded','harvested','completed','cancelled') NOT NULL DEFAULT 'active',
	`fundedAmount` decimal(15,2) DEFAULT '0',
	`exitOptions` json DEFAULT ('{"cashPayout":true,"physicalDelivery":false,"shareTrading":true}'),
	`images` json DEFAULT ('[]'),
	`harvestStatus` enum('pending','in_progress','completed') DEFAULT 'pending',
	`payoutStatus` enum('pending','processing','completed') DEFAULT 'pending',
	`payoutDate` datetime,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `produceListing_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shareMarketplace` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sellerId` int NOT NULL,
	`investmentId` int NOT NULL,
	`sharesForSale` int NOT NULL,
	`pricePerShare` decimal(10,2) NOT NULL,
	`totalPrice` decimal(15,2) NOT NULL,
	`status` enum('active','sold','cancelled') NOT NULL DEFAULT 'active',
	`sharesSold` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shareMarketplace_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transaction` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('share_purchase','marketplace_purchase','payout','refund') NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`currency` varchar(3) DEFAULT 'GHS',
	`produceListingId` int,
	`investmentId` int,
	`marketplaceListingId` int,
	`status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transaction_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','farmer','investor') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `phoneNumber` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `otpCode` varchar(6);--> statement-breakpoint
ALTER TABLE `users` ADD `otpExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `isPhoneVerified` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `users` ADD `location` text;--> statement-breakpoint
ALTER TABLE `users` ADD `profileImage` text;--> statement-breakpoint
ALTER TABLE `users` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `users` ADD `bankAccountName` text;--> statement-breakpoint
ALTER TABLE `users` ADD `bankAccountNumber` varchar(50);--> statement-breakpoint
ALTER TABLE `users` ADD `bankName` varchar(100);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_phoneNumber_unique` UNIQUE(`phoneNumber`);