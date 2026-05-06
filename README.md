# MrGovCon - BANKV Engine
## Bid Analytics, Nexus Knowledge Vault
### Bid Smarter. Win Bigger.

[![CI](https://github.com/MercyRaineLLC/govcon-platform/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MercyRaineLLC/govcon-platform/actions/workflows/ci.yml)

CI runs on every PR and push to main: backend typecheck + Vitest (with Postgres + Redis service containers), frontend typecheck + Vitest + production build. Branch protection on `main` requires both jobs to pass before merge.

## Installation & Operations Guide

---

## SYSTEM REQUIREMENTS

| Component        | Minimum Version |
|-----------------|----------------|
| Node.js          | 20.x LTS       |
| PostgreSQL       | 14+            |
| Redis            | 7+             |
| npm              | 10+            |
| Docker (optional)| 24+            |

---

## OPTION A: DOCKER COMPOSE (Recommended — all infrastructure auto-provisioned)

### Step 1: Configure environment
```bash
cp backend/.env.example backend/.env
```
Edit `backend/.env`:
- Set `JWT_SECRET` to a 256-bit random string
- Set `SAM_API_KEY` from api.sam.gov

### Step 2: Start all services
```bash
docker compose up -d
```

### Step 3: Run migrations and seed
```bash
docker exec govcon_backend npx prisma migrate dev --name init
docker exec govcon_backend npm run db:seed
```

### Step 4: Access
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- API Health: http://localhost:3001/health

---

## OPTION B: MANUAL SETUP (Windows / Local Development)

### Step 1: Install PostgreSQL 16
Download from: https://www.postgresql.org/download/windows/
Create database:
```sql
CREATE USER govcon_user WITH PASSWORD 'govcon_pass';
CREATE DATABASE govcon_platform OWNER govcon_user;
```

### Step 2: Install Redis (Windows)
Using WSL2 (recommended):
```bash
wsl --install
# Inside WSL2:
sudo apt-get install redis-server
sudo service redis-server start
```
OR use Memurai (Windows Redis port): https://www.memurai.com/

### Step 3: Backend setup
```bash
cd govcon-platform/backend
npm install
cp .env.example .env
# Edit .env with your database and Redis URLs
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

### Step 4: Frontend setup (new terminal)
```bash
cd govcon-platform/frontend
npm install
npm run dev
```

---

## DEFAULT CREDENTIALS (after seed)

| Role       | Email                          | Password       |
|------------|-------------------------------|----------------|
| Admin      | admin@mercyraine.com          | Admin1234!     |
| Consultant | consultant@mercyraine.com     | Consultant1234!|

**Change these immediately after first login in production.**

---

## SAM.GOV API KEY

1. Register at: https://api.sam.gov
2. Navigate to: Account > API Keys
3. Request Public API Key
4. Add to `backend/.env` as `SAM_API_KEY`

Without a SAM.gov key, the ingestion endpoint returns 503. Manual opportunity creation via direct DB insert is available for testing.

---

## API REFERENCE

All endpoints require `Authorization: Bearer <jwt>` header except auth routes.

### Authentication
```
POST /api/auth/register-firm   Register new tenant + admin
POST /api/auth/login           Authenticate
GET  /api/auth/profile         Current user profile
POST /api/auth/register-user   Add user to firm (ADMIN only)
```

### Opportunities
```
GET  /api/opportunities                  Search/filter opportunities
GET  /api/opportunities/:id              Get single opportunity
POST /api/opportunities/ingest           Trigger SAM.gov ingestion
POST /api/opportunities/:id/score        On-demand scoring for client
```

### Query Parameters (GET /api/opportunities)
```
naicsCode          NAICS code filter
agency             Agency name (partial match)
setAsideType       NONE|SMALL_BUSINESS|SDVOSB|WOSB|HUBZONE|8A
estimatedValueMin  Min value in dollars
estimatedValueMax  Max value in dollars
daysUntilDeadline  Max days until deadline
probabilityMin     Min probability (0-1)
probabilityMax     Max probability (0-1)
sortBy             deadline|probability|expectedValue|createdAt
sortOrder          asc|desc
page               Page number (default: 1)
limit              Results per page (default: 25, max: 100)
```

### Clients
```
GET    /api/clients            List all clients
POST   /api/clients            Create client
GET    /api/clients/:id        Get client details + submissions
PUT    /api/clients/:id        Update client
DELETE /api/clients/:id        Deactivate client
GET    /api/clients/:id/stats  Performance statistics
```

### Submissions
```
POST /api/submissions          Log bid submission
GET  /api/submissions          List submissions (filterable)
GET  /api/submissions/:id      Get single submission
```

### Penalties
```
GET  /api/penalties            List all penalties
GET  /api/penalties/summary    Aggregate penalty summary
GET  /api/penalties/:id        Get single penalty
PUT  /api/penalties/:id/pay    Mark penalty paid (ADMIN only)
```

### Firm
```
GET  /api/firm                 Firm details + counts
PUT  /api/firm/penalty-config  Update penalty rules (ADMIN only)
GET  /api/firm/metrics         Aggregate metrics
GET  /api/firm/users           List firm users
GET  /api/firm/dashboard       Dashboard summary data
```

---

## PROBABILITY ENGINE

The win probability engine uses a weighted logistic regression model:

**Features and weights:**
| Feature                  | Weight | Description                                    |
|--------------------------|--------|------------------------------------------------|
| NAICS Overlap            | 0.30   | Exact/partial NAICS code match                 |
| Set-Aside Alignment      | 0.25   | Client qualification match (SDVOSB, etc.)      |
| Agency Historical Score  | 0.20   | Past relationship with awarding agency         |
| Award Size Fit           | 0.12   | Contract size within client's historical range |
| Competition Density      | 0.08   | Estimated number of competing offerors         |
| Historical Distribution  | 0.05   | Base award rate from USASpending               |

**Formula:**
```
Z = Σ(weight_i × feature_i)
P(win) = 1 / (1 + e^(-(6Z - 3)))
ExpectedValue = P(win) × EstimatedContractValue
```

---

## DEADLINE PRIORITY SYSTEM

| Color  | Threshold     | Action Required              |
|--------|---------------|------------------------------|
| RED    | ≤ 7 days     | Immediate — bid or no-bid    |
| YELLOW | ≤ 20 days    | Prepare submission            |
| GREEN  | > 20 days    | Monitor — normal workflow     |

---

## PENALTY ENGINE

Priority order for penalty calculation:
1. **Flat late fee** — if `flatLateFee` is configured
2. **Percentage** — `penaltyPercent × estimatedValue` if flat fee not set
3. **Zero** — if neither configured

All penalties are logged to `financial_penalties` table with full audit trail.

---

## PRODUCTION DEPLOYMENT (AWS GovCloud)

Checklist:
- [ ] Set `NODE_ENV=production`
- [ ] Replace JWT_SECRET with cryptographically secure value (min 256-bit)
- [ ] Use AWS RDS PostgreSQL with encrypted storage
- [ ] Use ElastiCache for Redis
- [ ] Enable HTTPS/TLS via ALB or CloudFront
- [ ] Set `ALLOWED_ORIGINS` to your domain
- [ ] Enable AWS WAF rules
- [ ] Configure CloudWatch for log aggregation
- [ ] Set up automated database backups
- [ ] Enable VPC isolation for database and Redis

---

## DIRECTORY STRUCTURE

```
govcon-platform/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Complete data model
│   │   └── seed.ts             # Dev bootstrap data
│   ├── src/
│   │   ├── config/             # DB, Redis, env config
│   │   ├── engines/            # Probability, deadline, penalty
│   │   ├── middleware/         # Auth, tenant, error handler
│   │   ├── routes/             # All API routes
│   │   ├── services/           # SAM.gov, USASpending, stats
│   │   ├── workers/            # BullMQ scoring worker
│   │   ├── types/              # TypeScript interfaces
│   │   ├── utils/              # Logger, errors
│   │   └── server.ts           # Express entry point
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/         # Layout, shared UI
│   │   ├── hooks/              # useAuth
│   │   ├── pages/              # All page views
│   │   ├── services/           # API client
│   │   ├── App.tsx             # Router + auth guards
│   │   └── main.tsx            # Entry point
│   ├── vite.config.ts
│   └── package.json
├── docker-compose.yml
└── README.md
```
