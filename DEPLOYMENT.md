# MrGovCon Deployment Runbook
## DigitalOcean Droplet + Production Stripe + mrgovcon.co

**Updated:** 2026-04-23 (after Phase 5/6 changes)

This runbook gets every change since the last droplet deploy into production safely.

---

## ⚠️ READ THIS FIRST

Since the last droplet deploy, the codebase has shipped:

| Change | Risk | Action Required |
|---|---|---|
| **Schema changes** (9 new ConsultingFirm fields, ClientPortalUser notify fields, DeliverableComment model, status enums) | High | DB migration required — `prisma db push` |
| **New Stripe integration** (lifetime + subscription + webhooks) | High | Requires production Stripe keys + webhook endpoint registration |
| **Twilio SMS service** | Medium | Optional — only active if env vars set |
| **Custom domain support** (subdomain/customDomain fields) | Medium | DNS setup required for `mrgovcon.co` |
| **AI clause extraction** | Low | Uses existing LLM router, no new infra |
| **Email service** (nodemailer) | Medium | Needs production SMTP config |
| **Threaded comments** | Low | Schema migration only |
| **branding.ts bug fix** (5 admin endpoints) | **CRITICAL** | These were 500-ing in prod before this fix |
| **AiAssistant hooks fix** | High | Frontend was crashing on login/logout |

---

## 0. Pre-Deploy Audit (run on your local machine)

```bash
# Confirm what's about to ship
cd c:/Users/gladm/OneDrive/Desktop/Gov-ConV2
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
```

Note the commit hash you're deploying. Tag it:
```bash
git tag -a v1.1.0-stripe -m "Stripe + custom domains + threaded comments + tests"
git push origin v1.1.0-stripe
git push origin main
```

---

## 1. SSH to Droplet

```bash
ssh root@<your-droplet-ip>
# or
ssh deploy@mrgovcon.co
```

Find the project directory:
```bash
find / -name "Gov-ConV2" -o -name "govcon-platform" -type d 2>/dev/null | head -5
# typical paths: /var/www/govcon, /home/deploy/Gov-ConV2, /opt/mrgovcon
```

`cd` into it. Verify it's a git checkout:
```bash
git status
git remote -v
git log -1 --oneline    # current production commit
```

---

## 2. Backup Production DB BEFORE Anything Else

```bash
# Find Postgres
docker ps | grep postgres
# Or systemd: systemctl status postgresql

# Backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump -U govcon_user -h localhost govcon_platform > /root/backups/govcon_${TIMESTAMP}.sql
ls -lh /root/backups/govcon_*.sql | tail -3
```

If you don't have `/root/backups/`, create it: `mkdir -p /root/backups`.

**Do not proceed until the backup file exists and has non-zero size.**

---

## 3. Production Environment Variables

Edit production `backend/.env` (NEVER commit). Add/update:

### New (Phase 5/6) — REQUIRED

```env
# Platform domain (used by hostResolver + email links)
PLATFORM_ROOT_DOMAIN=mrgovcon.co
APP_URL=https://mrgovcon.co
FRONTEND_URL=https://mrgovcon.co

# Stripe — PRODUCTION keys (get from https://dashboard.stripe.com/apikeys)
# WARNING: pk_live_* + sk_live_* trigger REAL CHARGES
STRIPE_SECRET_KEY=sk_live_REPLACE_ME
STRIPE_PUBLISHABLE_KEY=pk_live_REPLACE_ME
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ME_AFTER_REGISTERING_ENDPOINT

# Stripe — Recurring tier Price IDs (from your live Stripe products)
STRIPE_PRICE_STARTER=price_REPLACE_ME
STRIPE_PRICE_PROFESSIONAL=price_REPLACE_ME
STRIPE_PRICE_ENTERPRISE=price_REPLACE_ME
```

### New — OPTIONAL (only if you want SMS / email)

```env
# Twilio (urgent SMS alerts) — leave blank to disable
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

# SMTP (transactional email) — leave blank to disable
SMTP_HOST=smtp.sendgrid.net    # or smtp.mailgun.org, etc.
SMTP_PORT=587
SMTP_USER=apikey               # SendGrid uses literal 'apikey'
SMTP_PASS=SG.your_api_key
SMTP_FROM=noreply@mrgovcon.co
```

### Verify Existing — DO NOT REMOVE

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://...   # existing prod DB string
REDIS_URL=redis://...            # existing prod Redis string
JWT_SECRET=<>                    # MUST be 32+ chars, MUST be different from dev
SAM_API_KEY=<>
ALLOWED_ORIGINS=https://mrgovcon.co,https://app.mrgovcon.co
```

**If `NODE_ENV=production` and `JWT_SECRET` is the dev placeholder, the app will refuse to boot.**

### Frontend env (`frontend/.env.production` if used by your build)

```env
VITE_API_URL=https://mrgovcon.co        # or whatever your API host is
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
VITE_STRIPE_PRICING_TABLE_ID=prctbl_xxx
```

---

## 4. Pull Code

```bash
cd /path/to/Gov-ConV2
git fetch --all
git status                              # should be clean
git checkout main                        # or your prod branch
git pull origin main
git log -1 --oneline                     # confirm new commit
```

---

## 5. Install Dependencies

```bash
cd backend
npm ci                                   # use npm ci, not install (deterministic)

cd ../frontend
npm ci
```

If npm ci fails with peer dep conflicts, use `npm install --legacy-peer-deps` and capture why.

---

## 6. Apply Schema Changes

```bash
cd backend

# Use db push (NOT migrate dev — broken shadow DB) per rules.md
DATABASE_URL="<production-db-url>" npx prisma db push --accept-data-loss --skip-generate
DATABASE_URL="<production-db-url>" npx prisma generate
```

**`--accept-data-loss` is safe for these specific changes** — they're all `ADD COLUMN` operations with defaults or NULL allowed. No DROP TABLE, no DROP COLUMN.

Verify:
```bash
DATABASE_URL="<production-db-url>" npx prisma studio --browser none --port 5555
# Then SSH-tunnel: ssh -L 5555:localhost:5555 root@droplet
# Visit http://localhost:5555 in your local browser
# Confirm new fields visible: stripeCustomerId, subdomain, lifetimeAccessAt, etc.
```

---

## 7. Build

```bash
cd backend
npm run build                            # tsc → dist/
ls dist/server.js                        # verify exists

cd ../frontend
npm run build                            # vite build → dist/
ls dist/index.html
```

---

## 8. Run Tests Against Production-Like Setup (smoke check)

```bash
cd backend
npm test                                 # 60/60 should pass
```

If any test fails, **STOP** and investigate. Production data should not migrate behind broken code.

---

## 9. Restart Services

### If PM2

```bash
pm2 list                                 # find process names
pm2 restart govcon-backend               # or whatever you named it
pm2 logs govcon-backend --lines 50       # watch boot
```

### If Docker Compose

```bash
docker-compose down
docker-compose up -d --build
docker-compose logs -f backend | head -100
```

### If systemd

```bash
sudo systemctl restart mrgovcon-backend
sudo journalctl -u mrgovcon-backend -f --lines 100
```

### Verify Boot

You should see:
```
Redis connected
Database connected
Scoring worker started
Enrichment worker started
Recalibration worker started
MrGovCon Platform running - BANKV Engine Active {"port":3001,"environment":"production"}
Deadline notification worker started (daily at 09:00 UTC)
```

If you see errors:
- `JWT_SECRET must be set` → fix `.env`, restart
- `Can't reach database server` → check `DATABASE_URL`, firewall, postgres up
- `Redis is already connecting/connected` → kill old node processes first

---

## 10. Register Stripe Webhook in Production

Stripe needs to know your webhook URL. **Required for any Stripe payments to update your DB.**

1. Go to https://dashboard.stripe.com/webhooks (LIVE mode toggle ON)
2. **+ Add endpoint**
3. Endpoint URL: `https://mrgovcon.co/api/webhooks/stripe`
4. Events to send (click "Select events"):
   - `checkout.session.completed`
   - `charge.refunded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Save endpoint
6. Click the endpoint → **Signing secret** → Reveal → copy `whsec_...`
7. Paste into production `.env` as `STRIPE_WEBHOOK_SECRET=whsec_...`
8. Restart backend (step 9 again) so it picks up the new secret

**Test:** in Stripe Dashboard → your endpoint → click "Send test webhook" → choose `checkout.session.completed` → send. Watch your droplet logs for `Stripe webhook received` then `Stripe checkout processed`.

---

## 11. DNS Configuration (mrgovcon.co)

If `mrgovcon.co` doesn't already point to your droplet:

At your DNS registrar:

| Type | Host | Value | TTL |
|---|---|---|---|
| A | @ | <droplet IP> | 300 |
| A | app | <droplet IP> | 300 |
| A | * | <droplet IP> | 300 |
| CNAME | www | mrgovcon.co | 300 |

The wildcard `*` enables firm subdomains (`acme.mrgovcon.co`, `mrgovcon.mrgovcon.co`, etc.) per Phase 5B custom domain support.

**Wait 5-10 minutes for propagation**, then verify:
```bash
dig mrgovcon.co +short
dig acme.mrgovcon.co +short    # should return same IP via wildcard
```

---

## 12. TLS / HTTPS (mandatory for Stripe)

If using **nginx**:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d mrgovcon.co -d www.mrgovcon.co -d app.mrgovcon.co
# For wildcard (subdomain support):
sudo certbot certonly --manual --preferred-challenges dns \
  -d "*.mrgovcon.co" -d mrgovcon.co
```

If using **Caddy** (recommended for wildcard auto-renewal):
```Caddyfile
mrgovcon.co, *.mrgovcon.co {
    reverse_proxy localhost:3001
}
```

Stripe **will not** send webhooks to a non-HTTPS endpoint in live mode.

---

## 13. Smoke Test Production

After DNS + TLS:

```bash
# Health
curl https://mrgovcon.co/health
# Expect: {"status":"healthy","db":"ok"}

# Branding (public)
curl https://mrgovcon.co/api/branding/by-host/mrgovcon.co | jq .

# Login (replace with a real production user)
curl -X POST https://mrgovcon.co/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mrgovcon.co","password":"<real password>"}'

# Stripe catalog (with real JWT)
TOKEN=<paste from login response>
curl https://mrgovcon.co/api/billing/stripe/catalog \
  -H "Authorization: Bearer $TOKEN" | jq .data.tiers
# All 3 tiers should show configured: true
```

---

## 14. Post-Deploy Checklist

- [ ] Backend logs show clean boot, no warnings
- [ ] Frontend loads at https://mrgovcon.co
- [ ] Login works for at least 1 production user
- [ ] `/api/billing/stripe/catalog` shows `configured: true` for all tiers
- [ ] Stripe webhook endpoint shows ✓ Active in dashboard
- [ ] Test webhook event from Stripe → backend logs `Stripe webhook received`
- [ ] DNS propagated (`dig` returns droplet IP for both apex and wildcard)
- [ ] HTTPS certificate valid (browser shows padlock)
- [ ] No 500 errors in last 100 log lines

---

## Rollback Procedure

If anything breaks after deploy:

```bash
cd /path/to/Gov-ConV2

# Code rollback
PREV_COMMIT=$(git log --oneline -2 | tail -1 | awk '{print $1}')
git checkout $PREV_COMMIT
cd backend && npm run build
# Restart per step 9

# DB rollback (only if schema change broke things)
psql -U govcon_user -h localhost govcon_platform < /root/backups/govcon_<TIMESTAMP>.sql
```

**Note:** if Stripe webhooks fired during the broken window, the DB rollback will lose those updates. Check ComplianceLog before rolling back.

---

## Common Post-Deploy Issues

### "Stripe checkout completed without firmId metadata"
- Webhook arrived for a session not created via your /checkout endpoint (e.g., Stripe Dashboard test, pricing table without metadata)
- Safe — handler logs and skips. Not a deploy issue.

### Frontend shows old branding
- Vite cached. Hard refresh (Ctrl+Shift+R) or clear CDN cache if you're behind one.

### "Can't reach database server at postgres:5432"
- Production DATABASE_URL still points to Docker hostname instead of localhost or managed DB host. Update `.env`.

### Workers not running
- Check Redis connectivity: `redis-cli -u $REDIS_URL ping` should return `PONG`
- BullMQ workers won't process jobs without Redis

### CORS errors in browser console
- Add the production frontend domain to `ALLOWED_ORIGINS` env var
- Restart backend

---

## Environment Variable Audit Script

Run this on your droplet to confirm everything's set:

```bash
cd backend
node -e "
const required = [
  'NODE_ENV','PORT','DATABASE_URL','REDIS_URL','JWT_SECRET',
  'STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_PUBLISHABLE_KEY',
  'STRIPE_PRICE_STARTER','STRIPE_PRICE_PROFESSIONAL','STRIPE_PRICE_ENTERPRISE',
  'PLATFORM_ROOT_DOMAIN','APP_URL','FRONTEND_URL','ALLOWED_ORIGINS',
  'SAM_API_KEY',
];
const optional = [
  'OPENAI_API_KEY','ANTHROPIC_API_KEY','DEFAULT_LLM_PROVIDER',
  'TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_FROM_NUMBER',
  'SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','SMTP_FROM',
];
require('dotenv').config();
console.log('=== REQUIRED ===');
required.forEach(k => {
  const v = process.env[k];
  const ok = v && !v.includes('REPLACE') && !v.includes('placeholder');
  console.log((ok ? 'OK  ' : 'MISS') + ' ' + k + (v ? ' (' + v.slice(0,15) + '...)' : ''));
});
console.log('');
console.log('=== OPTIONAL ===');
optional.forEach(k => {
  const v = process.env[k];
  console.log((v ? 'SET ' : '----') + ' ' + k);
});
"
```

---

## What I Need From You To Tailor This

To make this runbook precise to your droplet:

1. **What's the public hostname?** (`mrgovcon.co` already? something else?)
2. **What's the path to the project?** (`/var/www/govcon`? `/home/deploy/Gov-ConV2`?)
3. **Process manager?** (PM2, Docker Compose, systemd, raw nohup?)
4. **Reverse proxy?** (nginx, Caddy, none?)
5. **Database location?** (Same droplet's Postgres? Managed DigitalOcean DB?)
6. **Current production git commit hash** (run `git log -1 --oneline` on droplet)

Reply with those and I'll produce a deploy-ready bash script tailored to your exact setup.
