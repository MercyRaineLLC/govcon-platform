# Phase 1B API Specification — Proposal Sections

**Version:** 1.0  
**Status:** 📋 PLANNING  
**Last Updated:** April 22, 2026

---

## Overview

These endpoints manage proposal sections and their mapping to RFP requirements.

**Base URL:** `/api/opportunities/:opportunityId/proposal-sections`

**Authentication:** All endpoints require Bearer token in Authorization header

---

## Endpoints

### 1. GET `/api/opportunities/:opportunityId/proposal-sections`

**Purpose:** Fetch all proposal sections for an opportunity

**Request:**
```http
GET /api/opportunities/opp-123/proposal-sections?withRequirements=true
Authorization: Bearer <token>
```

**Query Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| withRequirements | boolean | No | false | Include mapped requirements in response |
| coverageStatus | string | No | - | Filter by status: UNCOVERED, PARTIAL, COVERED |
| orderBy | string | No | displayOrder | Sort field: displayOrder, createdAt, updatedAt |
| limit | number | No | 100 | Max results to return (1-1000) |
| offset | number | No | 0 | Pagination offset |

**Response (200 OK):**
```json
{
  "sections": [
    {
      "id": "sec-123",
      "opportunityId": "opp-123",
      "sectionName": "Technical Approach",
      "sectionDescription": "Our technical solution and architecture",
      "outlineText": "- Overview of our technical stack\n- System architecture\n- Security measures",
      "isCustom": false,
      "requirementCount": 12,
      "coverageStatus": "COVERED",
      "displayOrder": 1,
      "generatedAt": "2026-04-22T10:30:00Z",
      "generatedByPrompt": "SHA256 hash of prompt...",
      "createdAt": "2026-04-22T10:30:00Z",
      "updatedAt": "2026-04-22T10:30:00Z",
      "mappedRequirements": [
        {
          "id": "req-1",
          "requirementText": "System shall support real-time data processing",
          "isMandatory": true,
          "extractionConfidence": 0.95,
          "requirementWeight": 5,
          "sourcePageNumber": 3
        }
        // ... more requirements
      ]
    }
    // ... more sections
  ],
  "statistics": {
    "totalSections": 6,
    "totalRequirements": 45,
    "mappedRequirements": 43,
    "unmappedRequirements": 2,
    "averageCoverage": 0.87,
    "coverageByStatus": {
      "UNCOVERED": 1,
      "PARTIAL": 3,
      "COVERED": 2
    }
  }
}
```

**Error Responses:**
- 401: Unauthorized (missing/invalid token)
- 404: Opportunity not found
- 500: Server error

---

### 2. POST `/api/opportunities/:opportunityId/proposal-sections/generate`

**Purpose:** Auto-generate proposal sections from extracted requirements

**Request:**
```http
POST /api/opportunities/opp-123/proposal-sections/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "autoMapRequirements": true,
  "generateOutlines": true
}
```

**Request Body:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| autoMapRequirements | boolean | No | true | Automatically map requirements to generated sections |
| generateOutlines | boolean | No | true | Generate section outlines via Claude |
| customPrompt | string | No | - | Custom Claude prompt for section generation (Phase 2) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Generated 6 proposal sections and mapped 43 requirements",
  "sectionsCreated": 6,
  "requirementsMapped": 43,
  "sections": [
    {
      "id": "sec-123",
      "sectionName": "Technical Approach",
      "requirementCount": 12,
      "coverageStatus": "COVERED",
      "displayOrder": 1
    }
    // ... more sections
  ],
  "generatedAt": "2026-04-22T10:35:00Z"
}
```

**Behavior:**
1. Fetches all extracted requirements for opportunity
2. Calls Claude via llmRouter to generate sections
3. Creates ProposalSection records
4. Maps requirements to sections (if autoMapRequirements=true)
5. Returns results

**Idempotency:**
- If sections already exist, returns 409 Conflict
- Recommendation: Add `replace=true` query param in Phase 2 to regenerate

**Errors:**
- 400: Missing requirements (no Phase 1A extraction yet)
- 409: Sections already exist for this opportunity
- 503: Claude API unavailable
- 500: Server error

**Timeout:** 60 seconds (5s per section × ~6-8 sections)

---

### 3. GET `/api/opportunities/:opportunityId/proposal-sections/:sectionId`

**Purpose:** Fetch a single section with all its requirements

**Request:**
```http
GET /api/opportunities/opp-123/proposal-sections/sec-123
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "sec-123",
  "opportunityId": "opp-123",
  "sectionName": "Technical Approach",
  "sectionDescription": "Our technical solution and architecture",
  "outlineText": "- Overview of our technical stack\n- System architecture",
  "isCustom": false,
  "requirementCount": 12,
  "coverageStatus": "COVERED",
  "displayOrder": 1,
  "generatedAt": "2026-04-22T10:30:00Z",
  "generatedByPrompt": "SHA256 hash...",
  "manualAdjustments": {
    "editedFields": ["outlineText"],
    "addedRequirements": ["req-99"],
    "removedRequirements": [],
    "lastModified": "2026-04-22T11:00:00Z",
    "modifiedBy": "user-456"
  },
  "mappedRequirements": [
    {
      "id": "req-1",
      "requirementText": "System shall support real-time data processing",
      "isMandatory": true,
      "extractionConfidence": 0.95,
      "requirementWeight": 4,
      "sourcePageNumber": 3
    }
    // ... more
  ],
  "createdAt": "2026-04-22T10:30:00Z",
  "updatedAt": "2026-04-22T11:00:00Z"
}
```

**Errors:**
- 404: Section not found or unauthorized

---

### 4. PATCH `/api/opportunities/:opportunityId/proposal-sections/:sectionId`

**Purpose:** Update section details (name, description, outline, display order)

**Request:**
```http
PATCH /api/opportunities/opp-123/proposal-sections/sec-123
Authorization: Bearer <token>
Content-Type: application/json

{
  "sectionName": "Technical Implementation",
  "sectionDescription": "Our implementation strategy",
  "outlineText": "- Phase 1: Architecture design\n- Phase 2: Development\n- Phase 3: Testing",
  "displayOrder": 2
}
```

**Request Body (all optional):**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| sectionName | string | 1-100 chars, unique per opp | Section title |
| sectionDescription | string | Max 500 chars | Optional subtitle |
| outlineText | string | Max 5000 chars | Section outline |
| displayOrder | number | >= 0, unique per opp | Sort order |

**Response (200 OK):**
```json
{
  "id": "sec-123",
  "sectionName": "Technical Implementation",
  "sectionDescription": "Our implementation strategy",
  "outlineText": "- Phase 1: Architecture design\n- Phase 2: Development\n- Phase 3: Testing",
  "isCustom": true,
  "displayOrder": 2,
  "updatedAt": "2026-04-22T11:05:00Z"
}
```

**Side Effects:**
- Sets isCustom=true (marks section as user-edited)
- Updates manualAdjustments JSON with changed fields
- Timestamps updatedAt

**Validation:**
- sectionName: Must be unique within opportunity (case-insensitive)
- displayOrder: Must not create gaps or duplicates
- If displayOrder changes, reorder other sections automatically

**Errors:**
- 400: Invalid request body
- 409: Duplicate sectionName or displayOrder conflict
- 404: Section not found

---

### 5. POST `/api/opportunities/:opportunityId/proposal-sections/:sectionId/map-requirement`

**Purpose:** Add a requirement to a section (or update its weight)

**Request:**
```http
POST /api/opportunities/opp-123/proposal-sections/sec-123/map-requirement
Authorization: Bearer <token>
Content-Type: application/json

{
  "requirementId": "req-1",
  "requirementWeight": 5
}
```

**Request Body:**
| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| requirementId | string | Yes | Must exist | Requirement ID from Phase 1A |
| requirementWeight | number | No | 1-5 | Importance: 1=Nice-to-have, 5=Critical |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Requirement mapped to section",
  "section": {
    "id": "sec-123",
    "sectionName": "Technical Approach",
    "requirementCount": 13,
    "coverageStatus": "COVERED"
  },
  "requirement": {
    "id": "req-1",
    "requirementText": "System shall support...",
    "requirementWeight": 5,
    "proposalSectionId": "sec-123"
  }
}
```

**Behavior:**
1. Validates requirement exists and is unassigned (or already in this section)
2. Updates MatrixRequirement.proposalSectionId and requirementWeight
3. Increments section.requirementCount
4. Recalculates coverage status
5. Returns updated section

**Errors:**
- 400: Missing or invalid requirementId
- 404: Requirement or section not found
- 409: Requirement already mapped to another section (return it, ask user to unmap first)

---

### 6. DELETE `/api/opportunities/:opportunityId/proposal-sections/:sectionId/unmap-requirement/:requirementId`

**Purpose:** Remove a requirement from a section

**Request:**
```http
DELETE /api/opportunities/opp-123/proposal-sections/sec-123/unmap-requirement/req-1
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Requirement unmapped from section",
  "section": {
    "id": "sec-123",
    "sectionName": "Technical Approach",
    "requirementCount": 12,
    "coverageStatus": "PARTIAL"
  },
  "requirement": {
    "id": "req-1",
    "requirementText": "System shall support...",
    "proposalSectionId": null
  }
}
```

**Behavior:**
1. Sets MatrixRequirement.proposalSectionId to null
2. Decrements section.requirementCount
3. Recalculates coverage status
4. Returns updated section

**Errors:**
- 404: Section or requirement not found
- 409: Requirement not in this section

---

### 7. POST `/api/opportunities/:opportunityId/proposal-sections/:sectionId/unmap-all`

**Purpose:** Remove all requirements from a section (leaves section structure intact)

**Request:**
```http
POST /api/opportunities/opp-123/proposal-sections/sec-123/unmap-all
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Unmapped all requirements from section",
  "unmappedCount": 12,
  "section": {
    "id": "sec-123",
    "sectionName": "Technical Approach",
    "requirementCount": 0,
    "coverageStatus": "UNCOVERED"
  }
}
```

**Use Case:** User wants to start over mapping, or delete section later

**Errors:**
- 404: Section not found

---

### 8. DELETE `/api/opportunities/:opportunityId/proposal-sections/:sectionId`

**Purpose:** Delete a proposal section

**Request:**
```http
DELETE /api/opportunities/opp-123/proposal-sections/sec-123
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Section deleted",
  "deletedSectionId": "sec-123",
  "requirementsUnmapped": 12
}
```

**Pre-deletion Checks:**
1. Unmap all requirements (set proposalSectionId to null)
2. Check for evidence artifacts linking to section (Phase 1C concern)
   - If evidence exists: Return 409 Conflict (cannot delete)
   - If safe: Proceed with deletion
3. Reorder remaining sections (adjust displayOrder)

**Errors:**
- 404: Section not found
- 409: Section has evidence artifacts (cannot delete)

---

## Data Types

### ProposalSection
```typescript
{
  id: string;                      // CUID
  opportunityId: string;           // FK
  sectionName: string;             // 1-100 chars, unique per opp
  sectionDescription?: string;     // Optional, max 500 chars
  outlineText?: string;            // Max 5000 chars
  isCustom: boolean;               // true if user-edited
  requirementCount: number;        // Cached, 0-1000
  coverageStatus: 'UNCOVERED' | 'PARTIAL' | 'COVERED';
  displayOrder: number;            // 0-100, unique per opp
  generatedAt?: DateTime;          // When Claude generated
  generatedByPrompt?: string;      // SHA256 hash of prompt
  manualAdjustments?: {
    editedFields: string[];        // ['outlineText', 'sectionName']
    addedRequirements: string[];   // [req-IDs]
    removedRequirements: string[]; // [req-IDs]
    lastModified?: DateTime;
    modifiedBy?: string;           // user-ID
  };
  createdAt: DateTime;
  updatedAt: DateTime;
}
```

### MappedRequirement (in GET response)
```typescript
{
  id: string;
  requirementText: string;
  isMandatory: boolean;
  extractionConfidence: number;    // 0-1
  requirementWeight: number;       // 1-5 (1=nice-to-have, 5=critical)
  sourcePageNumber?: number;
  extractionMethod: string;        // AI, MANUAL, HYBRID
}
```

---

## Error Handling

All error responses follow this format:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Human-readable error message",
    "details": {
      "field": "sectionName",
      "reason": "Must be unique within opportunity"
    }
  }
}
```

### Common Error Codes
- `UNAUTHORIZED` (401): Missing/invalid token
- `FORBIDDEN` (403): User lacks permission for this operation
- `NOT_FOUND` (404): Resource doesn't exist
- `INVALID_REQUEST` (400): Bad request body
- `CONFLICT` (409): State conflict (duplicate, constraint violation)
- `TIMEOUT` (503): Claude API timeout
- `INTERNAL_ERROR` (500): Server error

---

## Rate Limiting

**Per endpoint:**
- GET: 100 requests/minute
- POST: 10 requests/minute
- PATCH: 10 requests/minute
- DELETE: 5 requests/minute

**Enforce via:**
- Redis-based rate limiter
- Return 429 Too Many Requests if exceeded
- Include `Retry-After` header with seconds to wait

---

## Pagination

**For large result sets:**

```http
GET /api/opportunities/opp-123/proposal-sections?limit=20&offset=0
```

**Response includes pagination metadata:**
```json
{
  "sections": [...],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 127,
    "hasMore": true,
    "nextOffset": 20
  }
}
```

---

## Authentication & Authorization

**Token Format:**
```
Authorization: Bearer <JWT>
```

**Token Claims Required:**
```json
{
  "sub": "user-123",
  "consultingFirmId": "firm-456",
  "role": "editor",
  "iat": 1234567890
}
```

**Authorization Rules:**
- User must belong to same consultingFirm as opportunity
- User must have role "editor" or "admin" to modify sections
- View-only (GET) requires "viewer" or above

---

## Examples

### Scenario 1: Generate Sections & View Coverage

```bash
# 1. Generate sections from extracted requirements
curl -X POST http://localhost:3001/api/opportunities/opp-123/proposal-sections/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"autoMapRequirements": true}'

# Response:
{
  "success": true,
  "sectionsCreated": 6,
  "requirementsMapped": 43,
  ...
}

# 2. View all sections with coverage stats
curl http://localhost:3001/api/opportunities/opp-123/proposal-sections \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "sections": [...],
  "statistics": {
    "totalSections": 6,
    "mappedRequirements": 43,
    "unmappedRequirements": 2,
    "averageCoverage": 0.95
  }
}
```

### Scenario 2: Manual Mapping

```bash
# 1. Unmapped requirements in one section
curl -X POST http://localhost:3001/api/opportunities/opp-123/proposal-sections/sec-123/map-requirement \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"requirementId": "req-99", "requirementWeight": 5}'

# 2. Verify mapping
curl "http://localhost:3001/api/opportunities/opp-123/proposal-sections/sec-123?withRequirements=true" \
  -H "Authorization: Bearer $TOKEN"
```

### Scenario 3: Edit & Track Changes

```bash
# 1. Edit section outline
curl -X PATCH http://localhost:3001/api/opportunities/opp-123/proposal-sections/sec-123 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "outlineText": "- Updated approach\n- New strategy"
  }'

# 2. Get section (shows isCustom=true, manualAdjustments populated)
curl "http://localhost:3001/api/opportunities/opp-123/proposal-sections/sec-123" \
  -H "Authorization: Bearer $TOKEN"

# Shows:
{
  "isCustom": true,
  "manualAdjustments": {
    "editedFields": ["outlineText"],
    "lastModified": "2026-04-22T11:05:00Z",
    "modifiedBy": "user-456"
  }
}
```

---

## Performance Expectations

| Operation | Time | Notes |
|-----------|------|-------|
| GET all sections | < 200ms | Cached, paginated if 100+ |
| Generate sections | 20-60s | 5-8 sections, includes Claude API latency |
| PATCH section | < 100ms | Single DB update |
| Map/unmap requirement | < 100ms | Single FK update |
| DELETE section | < 200ms | Cascade unmap + reorder |

---

## Versioning

**Current Version:** 1.0  
**Stability:** BETA (may change before Phase 1B ship)

**Changes in Roadmap:**
- Phase 2: M:M requirement mapping (one req → multiple sections)
- Phase 2: Custom Claude prompts for section generation
- Phase 2: Section templates and sharing

---

## Testing Checklist

- [ ] Create opportunity with requirements
- [ ] Generate sections (expect 6-8 created)
- [ ] View all sections with coverage stats
- [ ] Get single section with requirements
- [ ] Edit section outline (verify isCustom flag)
- [ ] Map unmapped requirement to section
- [ ] Unmap requirement (verify it's now uncovered)
- [ ] Unmap all requirements
- [ ] Edit displayOrder (verify reordering)
- [ ] Delete section (verify requirements unmapped)
- [ ] Error: duplicate sectionName (expect 409)
- [ ] Error: missing token (expect 401)
- [ ] Rate limiting: 10 POST/min (expect 429 on 11th)
- [ ] Pagination: with 20+ sections (expect hasMore=true)

---

**Status:** Ready for backend implementation  
**Next:** Database schema design document

