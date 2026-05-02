# Phase 1B Database Schema Design

**Status:** 📋 PLANNING  
**File:** `backend/prisma/schema.prisma`  
**Migration:** `prisma/migrations/X_add_proposal_sections.sql`

---

## Schema Changes

### New Entity: ProposalSection

```prisma
model ProposalSection {
  // Identity
  id                    String   @id @default(cuid())
  
  // Relationships
  opportunityId         String
  opportunity           Opportunity                 @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  requirements          MatrixRequirement[]         // Mapped requirements in this section
  
  // Section Content
  sectionName           String                      // e.g., "Technical Approach", "Team & Experience"
  sectionDescription   String?                     // Optional sub-heading (max 500 chars)
  outlineText          String?                     // AI-generated or user-provided outline (max 5000 chars)
  
  // Section Status
  isCustom             Boolean        @default(false) // true if user has modified name/description/outline
  
  // Requirements Tracking (Cached for Performance)
  requirementCount     Int            @default(0)  // Count of mapped requirements (auto-updated)
  coverageStatus       String         @default("UNCOVERED") 
                                                    // UNCOVERED (0 requirements)
                                                    // PARTIAL (some requirements mapped)
                                                    // COVERED (all critical requirements mapped)
  
  // Generation Metadata
  generatedAt         DateTime?                     // When Claude generated this section
  generatedByPrompt   String?                       // SHA256 hash of the Claude prompt used
  manualAdjustments   String?                       // JSON field tracking user changes
                                                    // Format: { editedFields: [], addedRequirements: [], removedRequirements: [], lastModified: "", modifiedBy: "" }
  
  // Display & Ordering
  displayOrder        Int            @default(0)   // Sort order within proposal (0, 1, 2, ... must be unique per opportunity)
  
  // Audit
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
  
  // Indexes for performance
  @@index([opportunityId])
  @@index([coverageStatus])
  @@unique([opportunityId, displayOrder])  // Ensure no duplicate displayOrder per opportunity
  @@unique([opportunityId, sectionName])   // Ensure no duplicate sectionName per opportunity (case-insensitive)
}
```

### Enhanced: MatrixRequirement

**Add these fields to existing MatrixRequirement model:**

```prisma
model MatrixRequirement {
  // ... existing fields ...
  
  // Phase 1B: Proposal Section Mapping
  proposalSectionId    String?                      // FK to ProposalSection (optional, can be unmapped)
  proposalSection      ProposalSection?             @relation(fields: [proposalSectionId], references: [id], onDelete: SetNull)
  
  requirementWeight    Int            @default(1)   // 1-5 importance: 1=nice-to-have, 5=critical
                                                    // Used in coverage scoring and proposal prioritization
  
  // ... rest of existing fields ...
  
  @@index([proposalSectionId])  // For fast lookup of requirements per section
}
```

---

## Detailed Field Descriptions

### ProposalSection

| Field | Type | Nullable | Default | Constraints | Notes |
|-------|------|----------|---------|-------------|-------|
| id | String | No | CUID | PK | Auto-generated UUID-like ID |
| opportunityId | String | No | - | FK to Opportunity | Cascade delete on opp deletion |
| sectionName | String | No | - | Max 100 chars, Unique(opp,name) | Section title (e.g., "Technical Approach") |
| sectionDescription | String | Yes | NULL | Max 500 chars | Optional sub-heading |
| outlineText | String | Yes | NULL | Max 5000 chars | Section outline/summary |
| isCustom | Boolean | No | false | - | true if user edited name/desc/outline |
| requirementCount | Int | No | 0 | >= 0, <= 1000 | Count of mapped requirements (cached) |
| coverageStatus | String | No | "UNCOVERED" | Enum-like: UNCOVERED, PARTIAL, COVERED | Calculated based on mapped requirements |
| generatedAt | DateTime | Yes | NULL | - | Timestamp when Claude generated |
| generatedByPrompt | String | Yes | NULL | SHA256 hash | Prompt hash for reproducibility |
| manualAdjustments | String | Yes | NULL | JSON | Tracks user edits (schema below) |
| displayOrder | Int | No | 0 | >= 0, Unique(opp,order) | Sort order in proposal |
| createdAt | DateTime | No | NOW() | - | Auto-set on creation |
| updatedAt | DateTime | No | NOW() | - | Auto-updated on changes |

### MatrixRequirement Additions

| Field | Type | Nullable | Default | Constraints | Notes |
|-------|------|----------|---------|-------------|-------|
| proposalSectionId | String | Yes | NULL | FK to ProposalSection | Which section this requirement is in (can be NULL) |
| requirementWeight | Int | No | 1 | 1-5 | Importance: 1=nice-to-have, 5=critical |

---

## manualAdjustments JSON Schema

```typescript
interface ManualAdjustments {
  editedFields: string[];           // Fields modified by user: ["sectionName", "outlineText"]
  addedRequirements: string[];      // Requirement IDs added manually: ["req-123", "req-456"]
  removedRequirements: string[];    // Requirement IDs removed manually: ["req-789"]
  lastModified?: string;            // ISO 8601 timestamp
  modifiedBy?: string;              // user ID who last modified
}

// Stored as JSON string in DB:
// {"editedFields":["outlineText"],"addedRequirements":[],"removedRequirements":[],"lastModified":"2026-04-22T11:00:00Z","modifiedBy":"user-456"}
```

---

## Relationships

### Opportunity → ProposalSection
```
1 Opportunity has many ProposalSections
- Cascade delete on opportunity deletion
- opportunityId is NOT NULL (every section must belong to an opportunity)
```

### ProposalSection → MatrixRequirement
```
1 ProposalSection has many MatrixRequirements
- Set NULL on requirement deletion (requirement can become unmapped)
- proposalSectionId is nullable (requirement can exist without a section)
```

### Diagram

```
Opportunity (1)
    ↓ (1:M)
ProposalSection (many)
    ↓ (1:M)
MatrixRequirement (many)
    ↓ (M:1)
OpportunityDocument (the source RFP)
```

---

## Indexes Strategy

### Indexes on ProposalSection

```sql
CREATE INDEX idx_proposal_sections_opportunity_id 
  ON proposal_sections(opportunity_id);
  
CREATE INDEX idx_proposal_sections_coverage_status 
  ON proposal_sections(coverage_status);
  
CREATE UNIQUE INDEX idx_proposal_sections_opp_order 
  ON proposal_sections(opportunity_id, display_order);
  
CREATE UNIQUE INDEX idx_proposal_sections_opp_name 
  ON proposal_sections(opportunity_id, LOWER(section_name));
```

### Indexes on MatrixRequirement (new/modified)

```sql
CREATE INDEX idx_matrix_requirements_proposal_section_id 
  ON matrix_requirements(proposal_section_id);
```

### Why These Indexes?

| Index | Used By | Benefit |
|-------|---------|---------|
| opportunity_id | GET all sections, filter by opp | Fast lookup (O(log n) vs O(n)) |
| coverage_status | Filter by UNCOVERED/PARTIAL/COVERED | Quick coverage filtering |
| opp_order (unique) | Reorder sections, check duplicates | Enforces constraint + fast lookup |
| opp_name (unique) | Check duplicate names, find section | Enforces constraint + fast lookup |
| proposal_section_id | Find requirements in section | Fast joins for /requirements endpoint |

---

## Data Validation Rules

### At Database Level (Constraints)

```sql
-- Column constraints
ALTER TABLE proposal_sections 
  ADD CONSTRAINT section_name_not_empty CHECK (LENGTH(TRIM(section_name)) > 0),
  ADD CONSTRAINT section_name_max_length CHECK (LENGTH(section_name) <= 100),
  ADD CONSTRAINT description_max_length CHECK (LENGTH(section_description) <= 500),
  ADD CONSTRAINT outline_max_length CHECK (LENGTH(outline_text) <= 5000),
  ADD CONSTRAINT requirement_count_non_negative CHECK (requirement_count >= 0),
  ADD CONSTRAINT requirement_count_max CHECK (requirement_count <= 1000),
  ADD CONSTRAINT display_order_non_negative CHECK (display_order >= 0);

ALTER TABLE matrix_requirements
  ADD CONSTRAINT requirement_weight_in_range CHECK (requirement_weight BETWEEN 1 AND 5);
```

### At Application Level (Prisma Validation)

- sectionName: 1-100 chars, trimmed, no leading/trailing spaces
- sectionDescription: Max 500 chars
- outlineText: Max 5000 chars
- displayOrder: >= 0, unique per opportunity
- requirementWeight: 1-5
- coverageStatus: Must be one of ["UNCOVERED", "PARTIAL", "COVERED"]
- isCustom: Boolean only
- requirementCount: >= 0, <= maxRequirements(opp)

---

## Migration Strategy

### Migration File: `prisma/migrations/X_add_proposal_sections.sql`

```sql
-- Create ProposalSection table
CREATE TABLE proposal_sections (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  section_name VARCHAR(100) NOT NULL,
  section_description VARCHAR(500),
  outline_text VARCHAR(5000),
  is_custom BOOLEAN NOT NULL DEFAULT false,
  requirement_count INTEGER NOT NULL DEFAULT 0 CHECK (requirement_count >= 0),
  coverage_status VARCHAR(20) NOT NULL DEFAULT 'UNCOVERED' 
    CHECK (coverage_status IN ('UNCOVERED', 'PARTIAL', 'COVERED')),
  generated_at TIMESTAMP,
  generated_by_prompt VARCHAR(64),
  manual_adjustments JSONB,
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_opp_section_name UNIQUE (opportunity_id, LOWER(section_name)),
  CONSTRAINT unique_opp_display_order UNIQUE (opportunity_id, display_order)
);

-- Create indexes
CREATE INDEX idx_proposal_sections_opportunity_id 
  ON proposal_sections(opportunity_id);
CREATE INDEX idx_proposal_sections_coverage_status 
  ON proposal_sections(coverage_status);

-- Add columns to matrix_requirements
ALTER TABLE matrix_requirements
  ADD COLUMN proposal_section_id TEXT REFERENCES proposal_sections(id) ON DELETE SET NULL,
  ADD COLUMN requirement_weight INTEGER NOT NULL DEFAULT 1 
    CHECK (requirement_weight BETWEEN 1 AND 5);

-- Create index on matrix_requirements
CREATE INDEX idx_matrix_requirements_proposal_section_id 
  ON matrix_requirements(proposal_section_id);
```

### Rollback Plan

```sql
-- If deployment fails, rollback:
DROP TABLE proposal_sections CASCADE;  -- Cascades to drop FK in matrix_requirements

ALTER TABLE matrix_requirements
  DROP COLUMN proposal_section_id,
  DROP COLUMN requirement_weight;
```

### Testing the Migration

```bash
# In dev environment
cd backend
npx prisma migrate dev --name add_proposal_sections

# Verify schema
npx prisma db push
npx prisma studio  # Browse the schema

# Test with sample data
psql -U govcon_user -d govcon_platform -c "
  SELECT table_name FROM information_schema.tables 
  WHERE table_name = 'proposal_sections';"
  
# Should return: proposal_sections
```

---

## Performance Considerations

### Query Patterns

**Fast Queries (< 100ms):**
```sql
-- Get all sections for an opportunity
SELECT * FROM proposal_sections 
WHERE opportunity_id = $1 
ORDER BY display_order;

-- Get single section with requirements
SELECT ps.*, COUNT(mr.id) as requirement_count
FROM proposal_sections ps
LEFT JOIN matrix_requirements mr ON ps.id = mr.proposal_section_id
WHERE ps.id = $1
GROUP BY ps.id;

-- Filter by coverage status
SELECT * FROM proposal_sections 
WHERE opportunity_id = $1 AND coverage_status = 'UNCOVERED'
ORDER BY display_order;
```

**Potentially Slow Queries (needs optimization):**
```sql
-- Get all requirements for all sections (1000+ rows)
SELECT mr.* FROM matrix_requirements mr
WHERE mr.opportunity_id = $1
ORDER BY mr.proposal_section_id, mr.created_at;
-- SOLUTION: Paginate by section or requirement

-- Calculate coverage for all sections
SELECT ps.id, COUNT(mr.id), SUM(mr.requirement_weight)
FROM proposal_sections ps
LEFT JOIN matrix_requirements mr ON ps.id = mr.proposal_section_id
WHERE ps.opportunity_id = $1
GROUP BY ps.id;
-- SOLUTION: Cache in requirementCount column, update on mapping change
```

### Caching Strategy

**Cache in application layer:**
- `ProposalSection.requirementCount` — Update when requirements are mapped/unmapped
- `ProposalSection.coverageStatus` — Recalculate on requirement changes
- Invalidate cache on: mapping change, requirement deletion, section deletion

**Redis cache (for Phase 2):**
- Cache full section list per opportunity
- TTL: 5 minutes
- Invalidate on any section/requirement change

---

## Data Consistency Rules

### Derived Fields (Always Up-to-Date)

| Field | Derivation | Recalculated When |
|-------|-----------|------------------|
| requirementCount | COUNT(*) of mapped requirements | mapping added/removed |
| coverageStatus | Based on requirementCount & criticality | mapping changed, weight changed |
| updatedAt | CURRENT_TIMESTAMP | Any field modified |

### Automatic Calculations

```typescript
// Coverage Status Logic
function calculateCoverageStatus(
  totalRequirements: number,
  mappedCount: number,
  criticalMapped: number,
  totalCritical: number
): CoverageStatus {
  if (mappedCount === 0) return 'UNCOVERED';
  if (criticalMapped === totalCritical && mappedCount === totalRequirements) 
    return 'COVERED';
  return 'PARTIAL';
}

// Example:
// 10 total requirements, 5 critical
// 8 mapped (includes 4 critical) → PARTIAL
// 10 mapped (includes 5 critical) → COVERED
```

---

## Migration Path for Existing Data

### Scenario 1: Upgrading production database

**Current state:** Phase 1A complete, requirements extracted

**Steps:**
1. Backup PostgreSQL: `pg_dump govcon_platform > backup.sql`
2. Run migration: `npx prisma migrate deploy`
3. Verify: `SELECT COUNT(*) FROM proposal_sections;` (should be 0)
4. No data loss (new table is empty)
5. Users can now generate sections

### Scenario 2: Regenerate sections if prompt improves

```typescript
// API can be updated to regenerate (Phase 2):
// POST /refresh with replace=true
// 1. Delete existing ProposalSection rows
// 2. Unmaps all requirements (FK → NULL)
// 3. Regenerate from scratch
// 4. Optionally use new Claude prompt
```

---

## Troubleshooting

### Common Issues

**Issue:** "UNIQUE constraint violation on (opportunity_id, section_name)"
- **Cause:** Trying to create two sections with same name
- **Fix:** Validate sectionName is unique before PATCH

**Issue:** "Foreign key violation: opportunity_id not found"
- **Cause:** Opportunity was deleted before sections
- **Fix:** ON DELETE CASCADE handles this (sections deleted automatically)

**Issue:** "requirement_count is stale (shows 5 but 8 requirements mapped)"
- **Cause:** Cache wasn't updated when requirements mapped
- **Fix:** Always recalculate in code, store in DB for performance

---

## Query Examples for Testing

### Insert Sample Data

```sql
-- Create test opportunity first
INSERT INTO opportunities (id, title, consulting_firm_id)
VALUES ('opp-test-1', 'Test RFP', 'firm-123');

-- Create sections
INSERT INTO proposal_sections 
  (id, opportunity_id, section_name, display_order, created_at, updated_at)
VALUES
  ('sec-1', 'opp-test-1', 'Technical Approach', 0, NOW(), NOW()),
  ('sec-2', 'opp-test-1', 'Team Experience', 1, NOW(), NOW()),
  ('sec-3', 'opp-test-1', 'Risk Management', 2, NOW(), NOW());

-- Create requirements (assumes they exist from Phase 1A)
UPDATE matrix_requirements 
SET proposal_section_id = 'sec-1', requirement_weight = 5
WHERE id IN ('req-1', 'req-2', 'req-3');

UPDATE matrix_requirements 
SET proposal_section_id = 'sec-2', requirement_weight = 3
WHERE id IN ('req-4', 'req-5');

-- Verify
SELECT 
  ps.section_name,
  COUNT(mr.id) as requirement_count
FROM proposal_sections ps
LEFT JOIN matrix_requirements mr ON ps.id = mr.proposal_section_id
WHERE ps.opportunity_id = 'opp-test-1'
GROUP BY ps.id, ps.section_name
ORDER BY ps.display_order;
```

### Verify Indexes

```sql
-- List all indexes on proposal_sections
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'proposal_sections';

-- Check index usage (performance monitoring)
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan
FROM pg_stat_user_indexes
WHERE tablename = 'proposal_sections'
ORDER BY idx_scan DESC;
```

---

## Next Steps

1. ✅ Schema design (this document)
2. 📋 Create migration SQL file
3. 📋 Test migration in dev environment
4. 📋 Update Prisma client types
5. 📋 Implement backend services
6. 📋 Deploy to staging

---

**Status:** Ready for migration implementation  
**Approval:** Pending tech lead review

