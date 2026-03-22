# FarmStock Ghana - MVP TODO

## Phase 1: Database Schema & Backend Setup
- [x] Design and implement database schema (users, farms, produce listings, investments, transactions, shares marketplace)
- [x] Set up OTP verification system for phone number authentication
- [x] Create database migration and seed demo data
- [x] Build authentication procedures (OTP generation, verification, login)

## Phase 2: Backend API Routes
- [x] Auth procedures: register, verify OTP, login, logout
- [x] Farmer procedures: create listing, update listing, get my listings
- [x] Investor procedures: browse listings, purchase shares, get portfolio
- [x] Transaction procedures: get history, process payments
- [x] Marketplace procedures: list shares for trading, buy shares from others
- [x] Harvest & payout procedures: update status, process payouts
- [ ] Write vitest tests for critical procedures

## Phase 3: Frontend - Authentication & Core Layout
- [x] Design system: elegant color palette, typography, spacing (Ghana-focused)
- [x] Mobile-first responsive layout with top navigation
- [x] Phone number + OTP authentication flow
- [x] Auth state management and protected routes
- [x] User role detection (farmer vs investor)

## Phase 4: Frontend - Farmer Features
- [x] Farmer dashboard layout
- [x] Create produce listing form (crop type, quantity, price per share, harvest date, location)
- [x] View my listings page with status tracking
- [ ] Edit/delete listings
- [x] Funding progress visualization
- [ ] Harvest update form for farmers

## Phase 5: Frontend - Investor Features
- [x] Investor dashboard with browse listings
- [x] Produce listing cards with key details
- [ ] Detailed listing view with full information
- [x] Share purchase flow (quantity, payment confirmation)
- [x] Investment portfolio view
- [x] Portfolio value calculation and display

## Phase 6: Frontend - Exit Options & Marketplace
- [x] Peer-to-peer share marketplace (list shares for sale)
- [x] Browse marketplace listings
- [x] Buy shares from other investors
- [ ] Cash payout request interface
- [ ] Physical delivery request form
- [ ] Transaction history view

## Phase 7: Polish & Testing
- [x] Responsive design verification across devices
- [x] Form validation and error handling
- [x] Loading states and empty states
- [x] Toast notifications for user feedback
- [ ] Seed demo data with realistic scenarios
- [x] Vitest tests for critical procedures

## Phase 8: Deployment & Delivery
- [ ] Final checkpoint and project delivery
- [ ] Live platform URL provided to user
