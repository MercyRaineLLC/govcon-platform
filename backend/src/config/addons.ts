export interface AddonDef {
  slug: string
  name: string
  tagline: string
  description: string
  priceMonthly: number
  priceAnnual: number   // ~15% off
  icon: string          // emoji
  status: 'available' | 'coming_soon'
  category: 'ai' | 'data' | 'automation' | 'reporting'
  isTokenPack?: boolean   // one-time credit purchase, not a subscription
  tokenAmount?: number    // how many proposal tokens this pack grants
}

export const ADDON_CATALOG: AddonDef[] = [
  {
    slug: 'proposal_assistant',
    name: 'Proposal Writing Assistant',
    tagline: 'AI-generated proposal outlines in seconds',
    description: 'Turn your compliance matrix into a full proposal outline — executive summary, section drafts, discriminator suggestions, and win themes. Cuts proposal prep time by 60%.',
    priceMonthly: 249,
    priceAnnual: 212,
    icon: '✍️',
    status: 'available',
    category: 'ai',
  },
  {
    slug: 'competitor_intel',
    name: 'Competitor Intelligence',
    tagline: 'Know who you are competing against before you bid',
    description: 'See historical winners for each NAICS code, incumbent identification, average competitor count, and bidding pattern analysis sourced from USAspending award data.',
    priceMonthly: 179,
    priceAnnual: 152,
    icon: '🎯',
    status: 'available',
    category: 'data',
  },
  {
    slug: 'auto_sync',
    name: 'Automated Daily Sync',
    tagline: 'New contracts land in your dashboard every morning',
    description: 'SAM.gov is automatically checked every morning at 6am. New opportunities matching your NAICS filters are ingested, scored, and waiting for you — no manual sync needed.',
    priceMonthly: 49,
    priceAnnual: 42,
    icon: '⚡',
    status: 'available',
    category: 'automation',
  },
  {
    slug: 'branded_reports',
    name: 'Custom Branded Reports',
    tagline: 'Deliver professional PDF reports to your clients',
    description: 'Generate branded PDF deliverables — pipeline reports, opportunity analyses, compliance summaries — with your firm logo and colors. Email directly to clients from the platform.',
    priceMonthly: 79,
    priceAnnual: 67,
    icon: '📄',
    status: 'coming_soon',
    category: 'reporting',
  },
  {
    slug: 'teaming_finder',
    name: 'Teaming Partner Finder',
    tagline: 'Find the right teaming partners for every bid',
    description: 'AI identifies ideal teaming partners based on the opportunity requirements, set-aside type, and past performance history. Never miss a bid because you lack a required capability.',
    priceMonthly: 129,
    priceAnnual: 110,
    icon: '🤝',
    status: 'coming_soon',
    category: 'ai',
  },
  {
    slug: 'state_municipal',
    name: 'State & Municipal Access',
    tagline: 'Expand beyond federal to state and local contracts',
    description: 'Unlock state, county, and municipal contracting opportunities. Access procurement portals from all 50 states with the same AI scoring and compliance tracking you use for federal.',
    priceMonthly: 99,
    priceAnnual: 84,
    icon: '🏛️',
    status: 'coming_soon',
    category: 'data',
  },
  {
    slug: 'api_access',
    name: 'API Access',
    tagline: 'Integrate your CRM, ERP, or custom dashboards',
    description: 'Full REST API access to all platform data. Build custom integrations with Salesforce, HubSpot, or any system. Includes webhook support for real-time opportunity alerts.',
    priceMonthly: 199,
    priceAnnual: 169,
    icon: '🔌',
    status: 'coming_soon',
    category: 'automation',
  },
  {
    slug: 'executive_briefing',
    name: 'Executive Intel Briefing',
    tagline: 'Weekly AI briefing on your top opportunities',
    description: 'Every Monday, receive an AI-curated briefing on your top 10 opportunities, market shifts in your NAICS codes, and strategic recommendations for the week ahead.',
    priceMonthly: 149,
    priceAnnual: 127,
    icon: '📊',
    status: 'coming_soon',
    category: 'ai',
  },
]

// ---------------------------------------------------------------
// Proposal Token Packs — one-time credit purchases
// ---------------------------------------------------------------
export const TOKEN_PACK_SLUGS: Record<string, number> = {
  proposal_tokens_10: 10,
  proposal_tokens_25: 25,
  proposal_tokens_50: 50,
}

export const TOKEN_PACK_ADDONS: AddonDef[] = [
  {
    slug: 'proposal_tokens_10',
    name: '10 Proposal Tokens',
    tagline: 'Good for 2 full drafts + outlines',
    description: 'One-time purchase of 10 proposal tokens. Use them to generate outlines (1 token each) or full draft PDFs (5 tokens each). Tokens never expire.',
    priceMonthly: 49,
    priceAnnual: 49,
    icon: '🪙',
    status: 'available',
    category: 'ai',
    isTokenPack: true,
    tokenAmount: 10,
  },
  {
    slug: 'proposal_tokens_25',
    name: '25 Proposal Tokens',
    tagline: 'Best value — 5 full drafts + outlines',
    description: 'One-time purchase of 25 proposal tokens. Use them to generate outlines (1 token each) or full draft PDFs (5 tokens each). Tokens never expire.',
    priceMonthly: 99,
    priceAnnual: 99,
    icon: '🪙',
    status: 'available',
    category: 'ai',
    isTokenPack: true,
    tokenAmount: 25,
  },
  {
    slug: 'proposal_tokens_50',
    name: '50 Proposal Tokens',
    tagline: 'Power pack — 10 full drafts + outlines',
    description: 'One-time purchase of 50 proposal tokens. Use them to generate outlines (1 token each) or full draft PDFs (5 tokens each). Tokens never expire.',
    priceMonthly: 179,
    priceAnnual: 179,
    icon: '🪙',
    status: 'available',
    category: 'ai',
    isTokenPack: true,
    tokenAmount: 50,
  },
]

// Elite plan includes all add-ons automatically
export const ELITE_PLAN_SLUG = 'elite'

export function isAddonIncluded(planSlug: string, addonSlug: string): boolean {
  if (planSlug === ELITE_PLAN_SLUG) return true
  return false
}
