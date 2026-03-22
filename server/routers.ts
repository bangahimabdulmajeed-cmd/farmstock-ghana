import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createOrUpdateOTP,
  verifyOTP,
  clearOTP,
} from "./otp";
import {
  getUserByPhoneNumber,
  createProduceListing,
  getProduceListingsByFarmerId,
  getActiveProduceListings,
  getProduceListingById,
  updateProduceListing,
  createInvestment,
  getInvestmentsByInvestorId,
  getInvestmentsByProduceListingId,
  createTransaction,
  getTransactionsByUserId,
  createShareMarketplaceListing,
  getShareMarketplaceListings,
  getShareMarketplaceListingById,
  updateShareMarketplaceListing,
  createMarketplaceTransaction,
  getMarketplaceTransactionsByBuyerId,
  createPayoutRequest,
  getPayoutRequestsByInvestorId,
  getPayoutRequestById,
  updatePayoutRequest,
  createHarvestUpdate,
  getHarvestUpdatesByProduceListingId,
  getInvestmentById,
} from "./db";

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),

    // OTP-based phone authentication
    requestOTP: publicProcedure
      .input(z.object({
        phoneNumber: z.string().regex(/^\+?[0-9]{10,15}$/, "Invalid phone number"),
      }))
      .mutation(async ({ input }) => {
        try {
          const result = await createOrUpdateOTP(input.phoneNumber);
          if (!result) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to send OTP",
            });
          }
          return {
            success: true,
            message: "OTP sent to your phone number",
            expiresIn: 5 * 60, // 5 minutes in seconds
          };
        } catch (error) {
          console.error("Error requesting OTP:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to request OTP",
          });
        }
      }),

    verifyOTPAndLogin: publicProcedure
      .input(z.object({
        phoneNumber: z.string().regex(/^\+?[0-9]{10,15}$/, "Invalid phone number"),
        otpCode: z.string().length(6, "OTP must be 6 digits"),
        userRole: z.enum(["farmer", "investor"]).optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const isValid = await verifyOTP(input.phoneNumber, input.otpCode);
          if (!isValid) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Invalid or expired OTP",
            });
          }

          const user = await getUserByPhoneNumber(input.phoneNumber);
          if (!user) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "User not found",
            });
          }

          return {
            success: true,
            message: "Phone verified successfully",
            userId: user.id,
            phoneVerified: user.isPhoneVerified,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          console.error("Error verifying OTP:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to verify OTP",
          });
        }
      }),
  }),

  // Farmer procedures
  farmer: router({
    createListing: protectedProcedure
      .input(z.object({
        cropType: z.enum(["maize", "cocoa", "cassava", "plantain", "rice", "tomato", "pepper", "groundnut", "shea", "other"]),
        cropName: z.string().min(1, "Crop name is required"),
        description: z.string().optional(),
        totalQuantity: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid quantity"),
        pricePerShare: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price"),
        totalShares: z.number().int().positive("Total shares must be positive"),
        harvestDate: z.date(),
        location: z.string().min(1, "Location is required"),
        images: z.array(z.string().url()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user?.role !== "farmer" && ctx.user?.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only farmers can create listings",
          });
        }

        try {
          const sharesAvailable = input.totalShares;
          const result = await createProduceListing({
            farmerId: ctx.user.id,
            cropType: input.cropType,
            cropName: input.cropName,
            description: input.description,
            totalQuantity: input.totalQuantity as any,
            pricePerShare: input.pricePerShare as any,
            totalShares: input.totalShares,
            sharesAvailable,
            location: input.location,
            harvestDate: new Date(input.harvestDate),
            images: input.images || [],
            fundingStatus: "active",
          });

          return {
            success: true,
            message: "Listing created successfully",
            listingId: (result as any).insertId,
          };
        } catch (error) {
          console.error("Error creating listing:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create listing",
          });
        }
      }),

    getMyListings: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.role !== "farmer" && ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only farmers can view their listings",
        });
      }

      try {
        return await getProduceListingsByFarmerId(ctx.user.id);
      } catch (error) {
        console.error("Error fetching listings:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch listings",
        });
      }
    }),

    getListingById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        try {
          const listing = await getProduceListingById(input.id);
          if (!listing) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Listing not found",
            });
          }
          return listing;
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch listing",
          });
        }
      }),

    updateListing: protectedProcedure
      .input(z.object({
        id: z.number(),
        cropName: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        images: z.array(z.string().url()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const listing = await getProduceListingById(input.id);
          if (!listing) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Listing not found",
            });
          }

          if (listing.farmerId !== ctx.user?.id && ctx.user?.role !== "admin") {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You can only update your own listings",
            });
          }

          await updateProduceListing(input.id, {
            cropName: input.cropName,
            description: input.description,
            location: input.location,
            images: input.images,
          });

          return { success: true, message: "Listing updated successfully" };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update listing",
          });
        }
      }),

    publishHarvestUpdate: protectedProcedure
      .input(z.object({
        produceListingId: z.number(),
        status: z.enum(["in_progress", "completed", "delayed"]),
        description: z.string(),
        images: z.array(z.string().url()).optional(),
        actualQuantity: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const listing = await getProduceListingById(input.produceListingId);
          if (!listing) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Listing not found",
            });
          }

          if (listing.farmerId !== ctx.user?.id && ctx.user?.role !== "admin") {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You can only update your own listings",
            });
          }

          await createHarvestUpdate({
            produceListingId: input.produceListingId,
            farmerId: ctx.user.id,
            status: input.status,
            description: input.description,
            images: input.images || [],
            actualQuantity: input.actualQuantity as any,
            harvestDate: new Date(),
          });

          // Update listing harvest status
          await updateProduceListing(input.produceListingId, {
            harvestStatus: input.status as any,
          });

          return { success: true, message: "Harvest update published successfully" };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to publish harvest update",
          });
        }
      }),
  }),

  // Investor procedures
  investor: router({
    browseListings: publicProcedure
      .input(z.object({
        limit: z.number().default(20),
        offset: z.number().default(0),
      }))
      .query(async ({ input }) => {
        try {
          return await getActiveProduceListings(input.limit, input.offset);
        } catch (error) {
          console.error("Error browsing listings:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch listings",
          });
        }
      }),

    getListingDetails: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        try {
          const listing = await getProduceListingById(input.id);
          if (!listing) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Listing not found",
            });
          }

          const investments = await getInvestmentsByProduceListingId(input.id);
          const totalInvested = investments.reduce((sum, inv) => sum + Number(inv.totalInvestment), 0);

          return {
            ...listing,
            totalInvested,
            investorCount: investments.length,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch listing details",
          });
        }
      }),

    purchaseShares: protectedProcedure
      .input(z.object({
        produceListingId: z.number(),
        shareQuantity: z.number().int().positive("Share quantity must be positive"),
        exitOption: z.enum(["cash_payout", "physical_delivery", "share_trading"]),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const listing = await getProduceListingById(input.produceListingId);
          if (!listing) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Listing not found",
            });
          }

          if (input.shareQuantity > listing.sharesAvailable) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Not enough shares available",
            });
          }

          const totalInvestment = Number(listing.pricePerShare) * input.shareQuantity;

          // Create investment record
          const investmentResult = await createInvestment({
            investorId: ctx.user!.id,
            produceListingId: input.produceListingId,
            sharesOwned: input.shareQuantity,
            sharePrice: listing.pricePerShare,
            totalInvestment: totalInvestment.toString() as any,
            exitOption: input.exitOption,
            status: "active",
          });

          // Update listing shares available
          const newSharesAvailable = listing.sharesAvailable - input.shareQuantity;
          const newSharesSold = (listing.sharesSold || 0) + input.shareQuantity;
          const newFundedAmount = Number(listing.fundedAmount) + totalInvestment;

          const newFundingStatus = newSharesAvailable === 0 ? "fully_funded" : "active";

          await updateProduceListing(input.produceListingId, {
            sharesAvailable: newSharesAvailable,
            sharesSold: newSharesSold,
            fundedAmount: newFundedAmount.toString() as any,
            fundingStatus: newFundingStatus,
          });

          // Create transaction record
          await createTransaction({
            userId: ctx.user!.id,
            type: "share_purchase",
            amount: totalInvestment.toString() as any,
            currency: "GHS",
            produceListingId: input.produceListingId,
            investmentId: (investmentResult as any).insertId,
            status: "completed",
            description: `Purchased ${input.shareQuantity} shares of ${listing.cropName}`,
          });

          return {
            success: true,
            message: "Shares purchased successfully",
            investmentId: (investmentResult as any).insertId,
            totalInvestment,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          console.error("Error purchasing shares:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to purchase shares",
          });
        }
      }),

    getPortfolio: protectedProcedure.query(async ({ ctx }) => {
      try {
        const investments = await getInvestmentsByInvestorId(ctx.user!.id);

        const portfolioItems = await Promise.all(
          investments.map(async (inv) => {
            const listing = await getProduceListingById(inv.produceListingId);
            return {
              investment: inv,
              listing,
            };
          })
        );

        const totalValue = portfolioItems.reduce((sum, item) => sum + Number(item.investment.totalInvestment), 0);

        return {
          investments: portfolioItems,
          totalValue,
          investmentCount: investments.length,
        };
      } catch (error) {
        console.error("Error fetching portfolio:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch portfolio",
        });
      }
    }),
  }),

  // Marketplace procedures
  marketplace: router({
    listSharesForSale: protectedProcedure
      .input(z.object({
        investmentId: z.number(),
        shareQuantity: z.number().int().positive("Share quantity must be positive"),
        pricePerShare: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price"),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const investment = await getInvestmentById(input.investmentId);
          if (!investment) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Investment not found",
            });
          }

          if (investment.investorId !== ctx.user!.id && ctx.user?.role !== "admin") {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You can only sell your own shares",
            });
          }

          if (input.shareQuantity > investment.sharesOwned) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cannot sell more shares than you own",
            });
          }

          const totalPrice = Number(input.pricePerShare) * input.shareQuantity;

          const result = await createShareMarketplaceListing({
            sellerId: ctx.user!.id,
            investmentId: input.investmentId,
            sharesForSale: input.shareQuantity,
            pricePerShare: input.pricePerShare as any,
            totalPrice: totalPrice.toString() as any,
            status: "active",
          });

          return {
            success: true,
            message: "Shares listed for sale successfully",
            marketplaceListingId: (result as any).insertId,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to list shares",
          });
        }
      }),

    getMarketplaceListings: publicProcedure
      .input(z.object({
        limit: z.number().default(20),
        offset: z.number().default(0),
      }))
      .query(async ({ input }) => {
        try {
          return await getShareMarketplaceListings(input.limit, input.offset);
        } catch (error) {
          console.error("Error fetching marketplace listings:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch marketplace listings",
          });
        }
      }),

    buySharesFromMarketplace: protectedProcedure
      .input(z.object({
        marketplaceListingId: z.number(),
        shareQuantity: z.number().int().positive("Share quantity must be positive"),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const listing = await getShareMarketplaceListingById(input.marketplaceListingId);
          if (!listing) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Marketplace listing not found",
            });
          }

          if (listing.status !== "active") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This listing is no longer available",
            });
          }

          const availableShares = listing.sharesForSale - (listing.sharesSold || 0);
          if (input.shareQuantity > availableShares) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Not enough shares available",
            });
          }

          const totalAmount = Number(listing.pricePerShare) * input.shareQuantity;

          // Create marketplace transaction
          const txResult = await createMarketplaceTransaction({
            buyerId: ctx.user!.id,
            marketplaceListingId: input.marketplaceListingId,
            sharesPurchased: input.shareQuantity,
            pricePerShare: listing.pricePerShare,
            totalAmount: totalAmount.toString() as any,
            status: "completed",
          });

          // Update marketplace listing
          const newSharesSold = (listing.sharesSold || 0) + input.shareQuantity;
          const newStatus = newSharesSold >= listing.sharesForSale ? "sold" : "active";

          await updateShareMarketplaceListing(input.marketplaceListingId, {
            sharesSold: newSharesSold,
            status: newStatus,
          });

          // Create transaction record
          await createTransaction({
            userId: ctx.user!.id,
            type: "marketplace_purchase",
            amount: totalAmount.toString() as any,
            currency: "GHS",
            marketplaceListingId: input.marketplaceListingId,
            status: "completed",
            description: `Purchased ${input.shareQuantity} shares from marketplace`,
          });

          return {
            success: true,
            message: "Shares purchased successfully",
            transactionId: (txResult as any).insertId,
            totalAmount,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to purchase shares",
          });
        }
      }),
  }),

  // Payout procedures
  payout: router({
    requestPayout: protectedProcedure
      .input(z.object({
        investmentId: z.number(),
        payoutType: z.enum(["cash", "physical_delivery"]),
        deliveryAddress: z.string().optional(),
        deliveryPhone: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const investment = await getInvestmentById(input.investmentId);
          if (!investment) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Investment not found",
            });
          }

          if (investment.investorId !== ctx.user!.id && ctx.user?.role !== "admin") {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You can only request payout for your own investments",
            });
          }

          const result = await createPayoutRequest({
            investorId: ctx.user!.id,
            investmentId: input.investmentId,
            amount: investment.totalInvestment,
            payoutType: input.payoutType,
            deliveryAddress: input.deliveryAddress,
            deliveryPhone: input.deliveryPhone,
            status: "pending",
          });

          return {
            success: true,
            message: "Payout request submitted successfully",
            payoutRequestId: (result as any).insertId,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to request payout",
          });
        }
      }),

    getPayoutRequests: protectedProcedure.query(async ({ ctx }) => {
      try {
        return await getPayoutRequestsByInvestorId(ctx.user!.id);
      } catch (error) {
        console.error("Error fetching payout requests:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch payout requests",
        });
      }
    }),
  }),

  // Transaction history
  transactions: router({
    getHistory: protectedProcedure
      .input(z.object({
        limit: z.number().default(20),
        offset: z.number().default(0),
      }))
      .query(async ({ input, ctx }) => {
        try {
          return await getTransactionsByUserId(ctx.user!.id, input.limit, input.offset);
        } catch (error) {
          console.error("Error fetching transaction history:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch transaction history",
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
