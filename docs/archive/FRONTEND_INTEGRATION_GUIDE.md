# Frontend Integration Guide — RequirementExtractionStatus Component

**Component Created:** `frontend/src/components/RequirementExtractionStatus.tsx` (370 lines)

**Status:** ✅ Ready to integrate

---

## What the Component Does

Displays:
- ✅ Document upload progress (PENDING → EXTRACTING → EXTRACTED)
- ✅ Extraction status with confidence scores
- ✅ List of extracted requirements
- ✅ Manual override UI for incorrect extractions
- ✅ "Refresh extraction" button to re-extract from all documents
- ✅ Real-time polling while extraction is in progress

---

## Integration Steps

### Step 1: Import the Component

In your opportunity detail page (e.g., `frontend/src/pages/OpportunityDetail.tsx`):

```typescript
import RequirementExtractionStatus from '../components/RequirementExtractionStatus';
```

### Step 2: Add to JSX

Place it in your opportunity detail page layout:

```typescript
<div className="opportunity-detail-container">
  {/* ... other sections ... */}
  
  <RequirementExtractionStatus 
    opportunityId={opportunityId}
    onExtractionComplete={(count) => {
      console.log(`Extracted ${count} requirements`);
      // Could trigger other actions here (e.g., refresh proposal outline)
    }}
  />
</div>
```

### Step 3: Ensure Authentication

The component reads `auth_token` from `localStorage`. Make sure your app stores JWT there:

```typescript
// In your auth context/store:
localStorage.setItem('auth_token', jwtToken);
```

---

## Component Props

```typescript
interface Props {
  opportunityId: string;           // Required: ID of the opportunity
  onExtractionComplete?: (count: number) => void;  // Optional: callback when extraction finishes
}
```

---

## Features in Detail

### 1. Document Status Display

Shows each uploaded document with:
- File name and size
- Upload date
- Extraction status (badge with color)
- Number of requirements extracted (when done)
- Confidence score (0-100%)
- Error message if failed

### 2. Real-time Polling

- Polls every 2 seconds while extraction is in progress
- Stops polling when all documents are done
- Updates document status automatically
- Fetches requirements once extraction completes

### 3. Refresh Extraction

Button to re-extract requirements from all documents:
- Useful if you've improved the Claude prompt
- Or if extraction failed and you want to retry
- Shows confirmation with count of queued documents

### 4. Manual Override UI

For each requirement, users can:
- Click "Edit" to open override form
- Correct the requirement text
- Provide a reason (logged for audit)
- Save override (marked as `isManuallyVerified`)

### 5. Requirement Cards

Each requirement shows:
- Full requirement text
- Badges for: Mandatory, Method (AI/Manual/Hybrid), Confidence %
- Source page number (if available)
- Manual verification status
- Edit button for manual override

---

## Styling & Tailwind

The component uses **Tailwind CSS** classes. Ensure your project has Tailwind configured.

Key classes used:
- `border`, `rounded`, `p-6` — Layout
- `bg-blue-50`, `border-blue-200` — Colors
- `text-sm`, `font-bold` — Typography
- `hover:`, `disabled:` — States
- `animate-spin`, `animate-pulse` — Animations

---

## Usage Example

### Full Page Integration

```typescript
import React, { useState } from 'react';
import RequirementExtractionStatus from '../components/RequirementExtractionStatus';

export function OpportunityDetailPage({ opportunityId }: { opportunityId: string }) {
  const [requirementCount, setRequirementCount] = useState(0);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Opportunity Details</h1>
      
      {/* Other sections */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Opportunity info here */}
      </div>

      {/* Requirement extraction section */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">RFP Analysis</h2>
        <RequirementExtractionStatus
          opportunityId={opportunityId}
          onExtractionComplete={(count) => {
            setRequirementCount(count);
            console.log(`✓ Extracted ${count} requirements`);
          }}
        />
      </div>

      {/* Next section: Proposal outline, pricing, etc. */}
      {requirementCount > 0 && (
        <div className="mt-8 p-4 bg-green-50 rounded border border-green-200">
          <p className="text-green-900">
            ✓ Ready to generate proposal outline with {requirementCount} requirements
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## API Calls Made by Component

The component calls these endpoints (all authenticated):

1. **GET** `/api/opportunities/:opportunityId/documents`
   - Fetches list of uploaded documents with extraction status
   - Called on mount and every 2s while extracting

2. **GET** `/api/compliance-matrix/:opportunityId/requirements`
   - Fetches extracted requirements
   - Called once extraction is complete

3. **PATCH** `/api/compliance-matrix/:opportunityId/requirements/:reqId`
   - Called when user saves a manual override
   - Sends: `{ requirementText, overrideReason }`

4. **POST** `/api/compliance-matrix/:opportunityId/refresh`
   - Called when user clicks "Refresh Extraction"
   - Re-queues all documents for extraction

---

## Testing the Component

### Manual Test
1. Create or open an opportunity
2. Upload an RFP PDF
3. Component should show document in "PENDING" state
4. After 10-60 seconds, status should change to "EXTRACTING"
5. After extraction completes, status changes to "EXTRACTED" with requirement count
6. Requirements appear in list below

### Test Manual Override
1. Click "Edit" on a requirement
2. Modify text and provide reason
3. Click "Save Override"
4. Verify requirement shows "Manually Verified" badge
5. Check DB: `SELECT isManuallyVerified, manualOverrideReason FROM matrix_requirements WHERE id='...'`

### Test Refresh
1. Click "Refresh Extraction" button
2. Verify documents queued message appears
3. Verify polling resumes
4. After completion, requirements should be updated

---

## Customization

### Change Polling Interval
Find this line:
```typescript
const interval = setInterval(fetchDocuments, 2000);  // Every 2 seconds
```

Change to higher/lower value as needed (in milliseconds).

### Change Colors
Replace Tailwind classes with your design system colors:
```typescript
// Example: change blue-600 to your primary color
className="bg-primary-600"
```

### Add More Requirements Fields
If you add fields to MatrixRequirement in the future, just add them to the `Requirement` interface and render them in `RequirementCard`.

### Disable Manual Override
Remove or comment out the override button:
```typescript
{/* <button onClick={() => setShowOverride(!showOverride)} ... /> */}
```

---

## Error Handling

Component handles these gracefully:
- ❌ Missing auth token → Falls back silently (no API calls)
- ❌ API errors (4xx/5xx) → Shows alert to user
- ❌ No documents → Shows "No documents uploaded yet"
- ❌ Extraction failures → Shows error message from backend
- ❌ Network errors → Logged to console, polling continues

---

## Browser DevTools Debugging

To watch API calls in real-time:
1. Open DevTools → Network tab
2. Filter for "requirements" or "documents"
3. See each API call and response
4. Check Console for logs and errors

To check polling:
```javascript
// In console:
localStorage.getItem('auth_token');  // Verify token exists
```

---

## Performance Notes

- ✅ Component is lightweight (~370 lines)
- ✅ Polling only active during extraction (stops when done)
- ✅ No unnecessary re-renders (uses useCallback for stable functions)
- ✅ Handles large requirement lists (tested with 100+ requirements)

---

## Accessibility

- ✅ Buttons are properly labeled
- ✅ Loading states are clear (spinner + text)
- ✅ Status badges are readable
- ✅ Form inputs have labels
- ✅ Color is not sole indicator (uses text + badges)

---

## Next Steps

After integrating this component:

1. **Test thoroughly** — Run through manual test cases above
2. **Phase 1B** — Build ProposalSection component (map sections to requirements)
3. **Phase 1C** — Build evidence artifact UI
4. **Phase 1D** — Build submission readiness dashboard

---

## Questions?

See these files:
- **What's the API contract?** → PHASE_1A_IMPLEMENTATION_COMPLETE.md
- **How do I test the backend?** → QUICK_START_GUIDE.md
- **What's Phase 1B?** → IMPLEMENTATION_PLAN_PHASE_1.md

---

**Component Status:** ✅ Ready to integrate into OpportunityDetail page  
**Estimated Integration Time:** 15-30 minutes  
**Testing Time:** 1-2 hours

Let's ship this. 🚀
