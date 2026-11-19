# FarmStock Ghana — product model

This file pins down the four definitions the rest of the codebase depends on. If a
future change contradicts something here, change this file first.

## 1. What a share is

**One share = `kgPerShare` kilograms of the listed crop**, where

```
kgPerShare = totalQuantity / totalShares
```

`totalQuantity` is in kilograms. `kgPerShare` is stored on the listing and frozen
at creation.

This definition was missing from the first build: shares existed as bare integers
with no physical meaning, so "10 shares" could not be delivered, valued, or
compared to a market price. Every number below flows from it.

- A listing's implied price per kg = `pricePerShare / kgPerShare`.
- An investor's cost per kg = `totalInvestment / (sharesOwned × kgPerShare)`.
- Market value of a holding = `sharesOwned × kgPerShare × currentGhsPerKg`.

## 2. The exit-option contract

The investor chooses an exit **at purchase**, and that choice is a contract, not a
preference. It is stored on the investment row.

| `exitOption` at purchase | Cash payout | Physical delivery | Trade on marketplace |
| --- | --- | --- | --- |
| `cash_payout` | yes | no | yes |
| `physical_delivery` | no | yes | no |
| `share_trading` | yes | no | yes |

A payout request that contradicts the investment's `exitOption` is rejected with
`EXIT_OPTION_MISMATCH`. The first build let a physical-delivery investor request
cash and vice versa.

## 3. How a share is valued

A listing is worth what its produce is worth. Prices arrive from two legs, both
normalised to **GH¢ per kilogram**:

**Global leg — live, keyless.** Exchange futures, converted to USD/tonne and then
to GH¢ using the live `USDGHS=X` rate:

| Crop | Symbol | Exchange | Native quote | kg per unit |
| --- | --- | --- | --- | --- |
| Maize | `ZC=F` | CBOT | US¢/bushel | 25.4012 |
| Cocoa | `CC=F` | ICE | USD/tonne | 1000 |
| Rice | `ZR=F` | CBOT | USD/cwt | 45.359237 |

**National leg — operator-entered.** Ghana has no free public farmgate price API
(MoFA, GCX and Esoko are manual or subscription). An operator records GH¢/kg per
market in the Operator Console. A national price overrides the global one for
valuation while it is **less than 45 days old**; after that the global benchmark
takes over again.

Crops with no futures contract (cassava, plantain, tomato, pepper, groundnut,
shea, other) are valued **only** from the national table. No proxy commodity is
substituted for them.

Appreciation of a listing = `(marketGhskg − listedGhskg) / listedGhskg`. Positive
means the shares are priced below the underlying produce.

## 4. Roles

- **farmer** — creates listings, posts harvest updates, cannot invest in their own
  listing, cannot cancel a listing once shares are sold.
- **investor** — buys shares, trades them peer-to-peer, requests a payout on an
  investment.
- **admin / operator** — approves or rejects payouts, records national prices,
  forces a price refresh, changes roles. There is no admin self-service UI for
  creating admins: the owner's `openId` is promoted on first sign-in.

## State machines

**Listing** — `active → fully_funded → harvested → completed`, plus
`active → cancelled` (only while `sharesSold = 0`).

**Investment** — `active → pending_payout → completed`, or
`pending_payout → active` when the operator rejects the payout. `cancelled` is
reserved for a voided lot.

**Payout request** — `pending → approved → completed`, with `pending|approved →
rejected`. Exactly one request per investment may be open at a time.

**Share marketplace listing** — `active → sold` when fully bought, or
`active → cancelled` by the seller. Shares are escrowed: they must be deducted
from the seller's free balance before a listing is created, which is why
`listShares` sums the seller's other active listings first.

## Money movement

All share transfers are transactional and lock the rows they read
(`SELECT … FOR UPDATE`), with conditional `UPDATE … WHERE sharesAvailable >= ?`
guards plus affected-row checks. A purchase, a peer-to-peer sale, a payout
request and a payout decision each commit as one unit.

Peer-to-peer sale moves money and ownership together: the seller's lot is
debited, the buyer gets a real lot at the price they paid, and both sides get a
ledger entry.

## Known gaps — deliberately out of scope for this pass

1. **No payment rail.** Ledger entries are records, not settlements. Mobile money
   (MTN MoMo / Hubtel / Paystack) is the obvious next integration; `transaction`
   and `payoutRequest` are already shaped for it.
2. **No KYC / ID verification** before a farmer can list.
3. **No SMS provider configured** — OTP delivery degrades to development mode
   locally, and refuses to pretend success in production.
4. **Rate limiting is in-process.** It must move to Redis before running more than
   one instance.
5. **No foreign keys.** The deployment target is TiDB, which does not enforce
   them; integrity is held by the transactional guards and indexes. A MySQL 8 or
   Postgres deployment should add real FKs.
6. **No dispute resolution flow** for a farmer who under-delivers.
