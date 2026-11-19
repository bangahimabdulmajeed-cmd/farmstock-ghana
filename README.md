# FarmStock Ghana

Fractional investment in Ghanaian agriculture. Farmers list a future harvest as
shares; investors buy into it, follow the harvest, and exit by cash payout,
physical delivery of the produce, or by trading shares on a peer-to-peer
marketplace before harvest.

See [PRODUCT.md](./PRODUCT.md) for the model — what a share is, how it is valued,
and the exit-option contract. Read that before changing anything in `server/`.

## Stack

- **Server** — Express + tRPC v11, Drizzle ORM, MySQL/TiDB
- **Client** — React 19, Vite 7, Tailwind 4, shadcn/ui, wouter, TanStack Query
- **Auth** — phone number + 6-digit OTP, JWT session cookie
- **Tests** — Vitest

## Setup

```bash
pnpm install
cp .env.example .env      # or export the variables below
pnpm db:migrate           # apply drizzle/*.sql in order
pnpm db:seed              # demo users, listings and Ghana market prices
pnpm dev                  # http://localhost:3000
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | `mysql://user:pass@host:port/database` |
| `JWT_SECRET` | yes in production | Signs session cookies. **The server refuses to start in production without it.** Use 32+ random characters. |
| `SMS_PROVIDER` + that provider's credentials | in production | OTP SMS delivery. See [SMS providers](#sms-providers). With nothing configured, development logs the code instead of sending it, and production refuses to issue a code at all. |
| `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL` | no | Only needed for the optional Manus OAuth login path. Phone login does not use them. |
| `PORT` | no | Defaults to `3000`; falls forward up to 20 ports if busy. |

`.env` is gitignored. `.project-config.json` (platform deployment manifest) is
gitignored too because it contains live credentials — if it has ever been
committed or shared, rotate the database password, `JWT_SECRET` and the AWS keys.

### SMS providers

`server/sms/index.ts` resolves a provider at runtime, so no vendor is hardcoded.
Set `SMS_PROVIDER` to force one, otherwise the first configured wins:

| Provider | Free tier | Reaches real handsets | Notes |
| --- | --- | --- | --- |
| **Arkesel** (Ghana) | Signup credits | Yes | Local sender IDs, ~GH¢0.03/SMS. Best Ghana fit. `ARKESEL_API_KEY` |
| **mNotify** (Ghana) | Signup credits | Yes | Ghana-only, local billing. `MNOTIFY_API_KEY` |
| **Africa's Talking** | Sandbox free | No in sandbox | Sandbox delivers to a web simulator only — free to develop against. `AT_API_KEY`, `AT_USERNAME`, `AT_SANDBOX=true` |
| **Twilio** | Trial credit | Yes | Paid after the trial. |
| **console** | Always | No | Development only. |

No provider offers unlimited free SMS to Ghanaian numbers. The cheap route is a
Ghanaian aggregator: at roughly GH¢0.03 per message, a thousand OTPs costs about
GH¢30. The free route is Africa's Talking's sandbox for development, then a
Ghanaian provider for production.

Check what the running server resolved with `admin.smsStatus`.

## Database

Migrations live in `drizzle/` and are applied in journal order by
`drizzle-kit migrate`, which needs no snapshot files.

> `drizzle-kit generate` compares against the latest snapshot in
> `drizzle/meta/`. Migration `0002` was written by hand and has no generated
> snapshot, so run `generate` only after you have created one — otherwise it will
> re-emit the same ALTERs.

Migration SQL is written for **TiDB compatibility**: no foreign keys (TiDB does
not enforce them) and no JSON column defaults (`DEFAULT ('[]')` is rejected by
TiDB, which is what broke migration `0001`). Integrity is held by the
transactional guards in `server/db.ts` and by indexes.

## Price feed

`server/prices/` values every listing against a market price in **GH¢ per kg**.

- **Global leg** (`benchmarks.ts`) — live exchange futures, free and keyless:
  CBOT corn, ICE cocoa, CBOT rough rice. Native quotes (US¢/bushel, USD/tonne,
  USD/cwt) are converted to USD/tonne, then to GH¢ using the live `USDGHS=X`
  rate, then per kilogram.
- **National leg** — Ghana market prices entered by an operator in the
  `/admin` console. There is no free public farmgate API for Ghana, so this leg
  is manual by design; a GCX/Esoko adapter can replace the reader without
  changing consumers.

A national price overrides the global benchmark for valuation while it is less
than 45 days old. Crops with no futures contract (cassava, plantain, tomato,
pepper, groundnut, shea) are valued only from the national table — no proxy
commodity is substituted.

Prices are cached in memory for 10 minutes and persisted to `commodityPrice`. If
the upstream feed is unreachable the API serves the last stored observation and
flags `stale: true`; the UI shows a banner rather than pretending the number is
live.

## Money paths

Every value-moving operation is a single database transaction that locks the rows
it reads (`SELECT … FOR UPDATE`) and uses conditional updates with affected-row
checks:

- `purchaseSharesAtomic` — no overselling, no buying your own listing, no buying
  a cancelled or harvested listing.
- `buySharesAtomic` — debits the seller's lot, credits the buyer with a real lot,
  writes both ledger entries.
- `requestPayoutAtomic` — one open payout per investment, respects the exit
  option, records the valuation the request was based on.
- `resolvePayoutAtomic` — operator approval, rejection and completion, with the
  ledger entry written on completion.

## Tests

```bash
pnpm test
```

Pure logic (price conversion, valuation, rate limiting, kg-per-share) runs with
no database. Tests that need a live database are skipped when `DATABASE_URL` is
absent.

## Deployment notes

- One Node instance only: rate limiting is in-process. Move it to Redis before
  scaling horizontally.
- The session cookie is `SameSite=None; Secure` over https and `SameSite=Lax`
  over http, so local development works without a TLS terminator.
- `pnpm build` produces `dist/public` (client) and `dist/index.js` (server).
