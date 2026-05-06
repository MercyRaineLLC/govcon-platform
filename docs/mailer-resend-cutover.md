# Mailer cutover: SendGrid → Resend

Owner-facing runbook for finishing the mailer migration. Code changes (Commits 1–4) are already merged. This file covers the remaining ops steps that aren't code: account setup, DNS, env vars, and verification.

## Why

SendGrid account hit "Maximum credits exceeded" on 2026-05-06, breaking every transactional email — registration verification, password reset, beta-questionnaire reminders. Switching to Resend (3,000 free emails/mo, 100/day) unblocks beta operations without needing to top up SendGrid.

## 1. Resend account setup

1. Sign up at https://resend.com (or log in if you already have an account).
2. **Domains → Add domain → `mrgovcon.co`** → Resend issues 3 records.
3. **API Keys → Create** → name `mrgovcon-prod`, permission `Sending access`, scope to the `mrgovcon.co` domain. Copy the `re_...` value once — Resend doesn't show it again.

## 2. DNS records to publish

Add at the DNS host that controls `mrgovcon.co`. Resend's dashboard shows the exact values after step 1; the names below are the standard set.

| Type | Name | Value | Notes |
|---|---|---|---|
| `MX` | `send.mrgovcon.co` (or whatever Resend specifies) | `feedback-smtp.us-east-1.amazonses.com` (priority 10) | Bounce processing |
| `TXT` | `send.mrgovcon.co` | `v=spf1 include:amazonses.com ~all` | SPF |
| `TXT` | `resend._domainkey.mrgovcon.co` | (long Resend-issued DKIM key) | DKIM |
| `TXT` | `_dmarc.mrgovcon.co` | `v=DMARC1; p=none; rua=mailto:postmaster@mrgovcon.co` | Start permissive — tighten to `p=quarantine` after 30 days of clean sends |

Wait 5–30 min, then click **Verify** in the Resend dashboard. All three rows must flip green before sending will work.

## 3. Droplet env vars (Govcon-beta-01)

```bash
# Pull the new Resend key into .env (replace placeholder with real value)
cat >> /opt/govcon/app/backend/.env <<'EOF'

# Mailer (Resend) — added 2026-05-06 after SendGrid quota exhaustion
RESEND_API_KEY=re_xxxx_PASTE_REAL_KEY_HERE
EOF

# Sanity check
grep -E '^(RESEND_API_KEY|EMAIL_FROM|EMAIL_FROM_NAME|PUBLIC_APP_URL)=' \
  /opt/govcon/app/backend/.env | sed -E 's/=(.{4}).*/=\1***/'
```

`EMAIL_FROM`, `EMAIL_FROM_NAME`, and `PUBLIC_APP_URL` are already set from the prior session. The old `SENDGRID_API_KEY` line can be removed but it's harmless to leave (mailer.ts no longer reads it).

## 4. Restart backend & verify

```bash
cd /opt/govcon/app && docker compose -f docker-compose.prod.yml restart backend
sleep 10
docker exec govcon_backend printenv RESEND_API_KEY | head -c 5  # → "re_..."
```

### 4a. Direct provider probe (decoupled from app)

```bash
SG_KEY=$(docker exec govcon_backend printenv RESEND_API_KEY)
curl -i -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $SG_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"from":"Mr GovCon <noreply@mrgovcon.co>","to":["YOUR_INBOX@gmail.com"],"subject":"Resend probe","text":"direct test"}'
```

| Status | Meaning |
|---|---|
| `200 { id: "..." }` | Delivered. Check inbox + spam within 60s. |
| `403` with "domain is not verified" | DNS records still propagating or values wrong. Re-verify in Resend dashboard. |
| `401` | Wrong API key. |

### 4b. App-level probe (admin-only, requires login)

After your account is verified (use the unblock SQL below if needed):

```bash
# Get an admin JWT from /api/auth/login first, then:
curl -X POST https://mrgovcon.co/api/health/mailer \
  -H "Authorization: Bearer $ADMIN_JWT"
```

Should return `{ success: true, data: { delivered: true, provider: "resend", providerMessageId: "..." } }`.

### 4c. End-to-end registration test

Register a fresh test user via the UI. Verification email should arrive within 30s in inbox (not spam).

## 5. Email-case backfill (one-shot)

The auth code now normalizes emails to lowercase. Existing rows that have mixed case (e.g. `Johngladmon917@gmail.com`) need to be rewritten so login lookups match. The script is idempotent and prints collision warnings before applying changes.

```bash
docker cp /opt/govcon/app/backend/prisma/scripts/normalize_emails.sql \
  govcon_postgres:/tmp/normalize_emails.sql
docker exec -i govcon_postgres \
  psql -U govcon_user -d govcon_platform -f /tmp/normalize_emails.sql
```

If the **collision check** prints any rows, STOP and reconcile manually before running the UPDATEs. The script BEGIN/COMMIT will roll back automatically if a unique-constraint violation hits during the UPDATE.

## 6. Unblock locked-out accounts (optional, only if needed)

If verification email still hasn't worked for the test accounts:

```bash
docker exec -it govcon_postgres psql -U govcon_user -d govcon_platform -c \
  "UPDATE users SET \"isEmailVerified\"=true, \"emailVerifiedAt\"=NOW()
   WHERE email ILIKE 'johngladmon%@gmail.com' RETURNING email;"
```

## 7. After 24h of clean sends

- Tighten DMARC: change `p=none` → `p=quarantine`.
- Optionally remove `SMTP_*` and `SENDGRID_API_KEY` env vars from droplet (no longer read).
- Migrate `emailService.ts` (the nodemailer SMTP path used by client-portal notifications) to Resend in a follow-up commit.
