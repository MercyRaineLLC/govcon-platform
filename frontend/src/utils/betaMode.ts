// =============================================================
// Beta-mode pricing mask
//
// During beta, all dollar amounts on user-facing pricing surfaces
// are replaced with "TBA" and Stripe checkout CTAs are replaced with
// a "Request Beta Access" link. Real Stripe products and prices remain
// untouched (still active in Stripe Dashboard) so existing customers,
// renewals, and admin-side flows keep working.
//
// Toggle via env vars in frontend/.env (or .env.prod at build time):
//   VITE_BETA_PRICING_HIDDEN=true
//   VITE_BETA_REQUEST_URL=mailto:johngladmon917@gmail.com?subject=MrGovCon%20Beta%20Access
//
// To exit beta: set VITE_BETA_PRICING_HIDDEN=false (or remove it)
// and rebuild the frontend container. ~30s rollback.
// =============================================================

export function isBetaPricingHidden(): boolean {
  const flag = (import.meta as any).env?.VITE_BETA_PRICING_HIDDEN
  return flag === 'true' || flag === true
}

export function getBetaRequestUrl(): string {
  const url = (import.meta as any).env?.VITE_BETA_REQUEST_URL
  return typeof url === 'string' && url.trim().length > 0
    ? url
    : 'mailto:johngladmon917@gmail.com?subject=MrGovCon%20Beta%20Access%20Request'
}

// Display string used wherever a price would otherwise render.
// Kept short so it fits in tier-card price slots without breaking layout.
export const BETA_PRICE_PLACEHOLDER = 'TBA'

export const BETA_CTA_LABEL = 'Request Beta Access'
