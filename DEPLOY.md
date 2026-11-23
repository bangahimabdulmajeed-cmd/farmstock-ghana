# Deploying FarmStock Ghana

The app is an Express server (serves the built React client from `dist/public`)
plus a MySQL-compatible database. It is **not** a static site, so Vercel or
Netlify will not run it as-is.

Everything below assumes Node 20+ and pnpm.

---

## Option A — Render + TiDB Cloud (free path)

### 1. Database

[TiDB Cloud Starter](https://docs.pingcap.com/tidbcloud/select-cluster-tier/)
(formerly Serverless) has a free quota per organisation: **5 GiB row storage,
5 GiB columnar, 50 million request units/month**, no credit card. When the quota
is used up the instance throttles until the month resets, so it is fine for a
demo and not for real traffic.

1. Create a Starter cluster (region closest to Ghana — `eu-central-1` or
   `us-east-1` both work; latency is dominated by cold starts, not region).
2. Create the database, e.g. `farmstock`.
3. Copy the connection string. It looks like:

   ```
   mysql://<user>.root:<password>@gateway01.eu-central-1.prod.aws.tidbcloud.com:4000/farmstock?ssl={"rejectUnauthorized":true}
   ```

   Keep the `?ssl=` part — TiDB requires TLS. If Node later reports
   `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, download the CA bundle from the Connect
   dialog and point `DATABASE_CA_CERT` at the `.pem` file.

> Already have the Manus-provisioned cluster? Its URL is the `DATABASE_URL` in
> `.project-config.json`. Check it still exists before relying on it: free
> clusters are suspended or reclaimed after long inactivity.

### 2. Migrate and seed (from your machine)

```bash
export DATABASE_URL="mysql://.../farmstock?ssl={\"rejectUnauthorized\":true}"
pnpm install
pnpm db:migrate     # applies drizzle/0000, 0001, 0002 in order
pnpm db:seed        # optional demo users, listings and Ghana market prices
```

`0002_price_intelligence.sql` is the one that adds `kgPerShare`, the price tables
and the indexes — the app will not work without it.

### 3. Web service

Create a **Web Service** on [Render](https://render.com/docs/free) from the
GitHub repo:

| Field | Value |
| --- | --- |
| Runtime | Node |
| Build command | `pnpm install --frozen-lockfile --prod=false && pnpm build` |
| Start command | `pnpm start` |
| Health check path | *(leave empty)* |

`--prod=false` matters: Render sets `NODE_ENV=production`, and without it the
build tooling (Vite, esbuild, tsc) can be skipped during install. `pnpm start`
runs `scripts/prod.mjs`, which sets `NODE_ENV=production` in a cross-platform
way before loading the bundle.

Environment variables:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the TiDB string from step 1 |
| `JWT_SECRET` | 32+ random chars — **the server refuses to boot without it in production** |
| `SMS_PROVIDER` | `arkesel` (or `mnotify`) |
| `ARKESEL_API_KEY` | from your Arkesel dashboard |
| `SMS_SENDER_ID` | the sender ID registered with your provider |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Render injects `PORT`; the server reads it. Do not set it yourself.

**Free-tier reality** ([Render docs](https://render.com/docs/free)): 512 MB RAM,
0.1 CPU, 750 instance hours/month, and the service **spins down after 15 minutes
without traffic**, taking about a minute to wake. The first request after idle
will look slow — and an OTP requested during a cold start can time out
client-side. If that matters, upgrade the instance or ping it on a schedule.
The disk is ephemeral, but nothing here writes to disk.

### 4. First run

1. Open the app URL, sign in with a phone number, and confirm an SMS arrives.
2. Promote yourself to operator (the owner auto-promotion only applies to a
   Manus `OWNER_OPEN_ID`; phone users are created with `role = 'user'`):

   ```sql
   UPDATE users SET role = 'admin' WHERE phoneNumber = '+233XXXXXXXXX';
   ```

3. Visit `/admin` — the Operator Console. Record at least one Ghana market
   price, then check `/prices`.

---

## Option B — redeploy on Manus

You already have `.project-config.json` with `build_command`, `dev_command`,
`port` 3000 and the env vars. Add these to the platform's secrets panel:

- `JWT_SECRET` (rotate the existing one)
- `SMS_PROVIDER`, `ARKESEL_API_KEY`, `SMS_SENDER_ID`

Then `pnpm build` and `pnpm start`. The platform runs `pnpm run build` and serves
`dist/index.js`.

Note `experiments: ["no_db_push"]` in that file — the platform will not push
schema changes for you, so still run `pnpm db:migrate` yourself.

---

## Checklist before pointing anyone at it

- [ ] `pnpm db:migrate` has run against the production database
- [ ] `JWT_SECRET` is set and is not the old value from `.project-config.json`
- [ ] An SMS provider key is set — otherwise production **refuses to issue login codes** by design
- [ ] Rotate every credential that sat in `.project-config.json` (TiDB password, AWS keys, forge keys): they were shared in plaintext
- [ ] You have an `admin` user (`UPDATE users SET role='admin' ...`)
- [ ] `GET /api/trpc/auth.me` returns `null` when signed out, not a user object
- [ ] Sign in works end to end on a real phone

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Server exits immediately on boot | `JWT_SECRET` missing in production (intentional) |
| `Could not send a verification code right now` | No SMS provider configured, or the provider rejected the request — check `admin.smsStatus` and the server log, which prints the provider's response |
| Login form resets after entering the code | Check `NODE_ENV`; over plain http the cookie is `SameSite=Lax` and should persist, but a reverse proxy that terminates TLS must send `X-Forwarded-Proto: https` or the browser will reject a `Secure` cookie |
| Every page 500s | Migrations not applied, or `DATABASE_URL` missing the `?ssl=` parameter |
| Prices all show "no market price yet" | The global feed could not be reached and no national prices were entered — the UI shows a stale banner when it has cached values |
