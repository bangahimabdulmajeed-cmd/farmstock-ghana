# FarmStock Ghana — build status

## Phase 1–7 (original MVP)

Delivered, but with serious defects that this pass fixed — see *Phase 9* below.
The earlier version of this file marked everything `[x]` including "live platform
URL provided", which overstated what actually worked.

## Phase 8: Deployment & Delivery

- [x] Final checkpoint and project delivery
- [x] Deployment guide for Render + TiDB Cloud ([DEPLOY.md](./DEPLOY.md))
- [ ] Live platform URL provided — **needs redeploy**; the running build predates the fixes below

## Phase 9: Security & correctness hardening

- [x] Remove the OTP auth bypass (`demoOtp` is development-only; production refuses to pretend an SMS was sent)
- [x] Cryptographic OTP generation (`crypto.randomInt`, not `Math.random`)
- [x] OTP attempt cap (5) with single-use codes and automatic invalidation
- [x] Rate limiting on OTP request/verify (per IP and per phone number)
- [x] Pluggable SMS providers (Arkesel, mNotify, Africa's Talking, Twilio, console) with no vendor lock-in
- [x] WhatsApp Cloud API provider (opt-in — billed per authentication message, ~$0.004 in Ghana)
- [x] `auth.me` no longer returns `otpCode` or bank account details
- [x] Session cookies: `SameSite=Lax` over http so login works locally, `maxAge` set
- [x] Fail closed on a missing `JWT_SECRET` in production
- [x] Atomic share purchase inside a transaction with conditional update guards (no overselling)
- [x] Peer-to-peer purchase actually transfers shares and writes both sides of the ledger
- [x] Marketplace listing escrows shares (no double-listing the same investment)
- [x] One open payout per investment; investment moves to `pending_payout`
- [x] Payout respects the investor's exit option (`EXIT_OPTION_MISMATCH`)
- [x] Operator payout approval/rejection/completion with ledger entry
- [x] Listings cannot be cancelled once shares are sold
- [x] Purchases blocked on cancelled/harvested listings and on your own listing
- [x] `farmer.updateListing` implemented (the Edit button used to do nothing)
- [x] Harvest updates readable by the investors backing the listing
- [x] Indexes and unique constraints added; TiDB-safe migration `0002`
- [x] Test suite references the real routers; DB-dependent tests skip without `DATABASE_URL`
- [x] Seed script rewritten against the real schema

## Phase 10: Price intelligence

- [x] `commodityPrice` table (global + national observations, normalised to GH¢/kg)
- [x] Live global benchmarks: CBOT corn, ICE cocoa, CBOT rough rice + live USD/GHS
- [x] Operator-entered Ghana market prices with 45-day freshness window
- [x] `kgPerShare` makes a share a real quantity of produce
- [x] Valuation math: cost per kg, market value, gain/loss, appreciation %
- [x] Portfolio shows appreciation/depreciation per holding
- [x] Listing cards show market price vs asking price
- [x] Market Prices page with sparklines, source and observation date
- [x] Graceful degradation: upstream failure serves stored prices marked as stale

## Phase 11: Navigation & UX

- [x] `AppShell` navigation (previously six routes were unreachable and there was no sign-out)
- [x] Correct post-login routing from the server-returned role
- [x] Expired sessions go to `/auth`, not the external OAuth portal
- [x] Marketplace "List Shares" uses the investor's real portfolio, not hardcoded IDs
- [x] Farmer create-listing form: real crop type selector and explicit share count
- [x] Cache invalidation after money mutations

## Still open

- [ ] Payment rail (mobile money: MTN MoMo / Hubtel / Paystack)
- [ ] KYC / ID verification before a farmer can list
- [ ] Set a real SMS provider key on the deployment (Arkesel or mNotify — both Ghanaian and ~GH¢0.03/SMS)
- [ ] Move rate limiting to Redis before running more than one instance
- [ ] Dispute resolution for under-delivery
- [ ] Redeploy and re-verify the live URL
