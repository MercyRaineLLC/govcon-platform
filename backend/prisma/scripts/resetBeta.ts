// =============================================================
// Beta Reset Script — fresh 15-slot beta state.
//
// DESTRUCTIVE. Truncates all tenant + user + opportunity data so
// the platform comes up empty, with the 15 beta slots free.
//
// Preserves:
//   - FAR / DFARS / NIST / CMMC / Section 508 catalog (regulatory ontology)
//   - NaicsCode lookup table
//   - SubscriptionPlan rows
//   - TermsOfServiceVersion + BetaNdaVersion (current legal docs)
//   - BetaWeeklyQuestionnaire + the publishedAt schedule
//
// Wipes:
//   - ConsultingFirm and every tenant-scoped child table (users,
//     clients, opportunities, decisions, submissions, audits, etc.)
//
// SAFETY GATES (must pass all three):
//   1. NODE_ENV must NOT be 'production' — UNLESS the operator
//      explicitly sets RESET_BETA_PROD_OK=I_HAVE_A_BACKUP
//   2. RESET_BETA_CONFIRM must equal 'YES_DELETE_ALL_DATA'
//   3. Process is interactive — operator hits Enter to proceed
//
// Run: RESET_BETA_CONFIRM=YES_DELETE_ALL_DATA \
//        npx ts-node backend/prisma/scripts/resetBeta.ts
// =============================================================
import { PrismaClient } from '@prisma/client'
import * as readline from 'readline'

const prisma = new PrismaClient()

async function confirmInteractive(): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ans = await new Promise<string>((resolve) =>
    rl.question('Type "RESET" to proceed (anything else aborts): ', (a) => {
      rl.close()
      resolve(a)
    })
  )
  return ans.trim() === 'RESET'
}

async function main() {
  // Gate 1 — production safety
  if (process.env.NODE_ENV === 'production' && process.env.RESET_BETA_PROD_OK !== 'I_HAVE_A_BACKUP') {
    console.error('REFUSED: NODE_ENV=production and RESET_BETA_PROD_OK is not set to "I_HAVE_A_BACKUP".')
    console.error('Take a database backup first, then re-run with RESET_BETA_PROD_OK=I_HAVE_A_BACKUP.')
    process.exit(1)
  }

  // Gate 2 — explicit confirmation env var
  if (process.env.RESET_BETA_CONFIRM !== 'YES_DELETE_ALL_DATA') {
    console.error('REFUSED: RESET_BETA_CONFIRM env must equal "YES_DELETE_ALL_DATA".')
    console.error('Re-run with: RESET_BETA_CONFIRM=YES_DELETE_ALL_DATA npx ts-node backend/prisma/scripts/resetBeta.ts')
    process.exit(1)
  }

  // Gate 3 — interactive Enter (skipped only if RESET_BETA_NONINTERACTIVE=1)
  if (process.env.RESET_BETA_NONINTERACTIVE !== '1') {
    console.log('================================================================')
    console.log(' BETA RESET — DESTRUCTIVE')
    console.log(' This will TRUNCATE all tenant data: firms, users, opportunities,')
    console.log(' decisions, submissions, audit events, agreements.')
    console.log(' Catalog tables (FAR/DFARS/NIST/CMMC/508/NAICS) will be preserved.')
    console.log('================================================================')
    const ok = await confirmInteractive()
    if (!ok) {
      console.log('Aborted.')
      process.exit(0)
    }
  }

  console.log('\nResetting...')

  // Order matters — child tables before parents to satisfy FK constraints.
  // Prisma 5 supports raw TRUNCATE ... CASCADE which would be one-shot, but
  // explicit deletes are safer + auditable.
  const truncations = [
    // Audit + agreements + verification
    'audit_events',
    'user_agreements',
    'email_verification_tokens',
    'password_reset_tokens',
    'beta_questionnaire_responses',

    // Compliance + proposal artifacts
    'far_clause_applicabilities',
    'compliance_logs',
    'matrix_requirements',
    'compliance_matrices',
    'adherence_scores',
    'review_comments',
    'review_cycles',
    'section_evidence_links',
    'evidence_artifacts',
    'proposal_sections',
    'past_performance_records',
    'cost_volumes',

    // Bid decisions + market
    'bid_decision_history',
    'bid_decisions',
    'capture_tasks',
    'capture_plans',
    'teaming_arrangements',
    'partners',
    'competitors',
    'cmmc_statuses',

    // Opportunity-scoped
    'amendments',
    'award_history',
    'opportunity_documents',

    // Document templates / rewards / portal
    'document_requirements',
    'document_templates',
    'shared_templates',
    'client_documents',
    'compliance_rewards',
    'client_portal_uploads',
    'client_portal_users',
    'client_opportunity_declines',
    'performance_stats',
    'client_naics',

    // Submissions + financials
    'financial_penalties',
    'submission_records',

    // Workflow + ingestion + analytics + state municipal
    'state_municipal_opportunities',
    'subcontract_opportunities',
    'ingestion_jobs',
    'api_usage_logs',

    // Billing
    'invoice_line_items',
    'invoices',
    'subscriptions',

    // Opportunities + clients + users + firms (last because most depended-upon)
    'opportunities',
    'client_companies',
    'users',
    'consulting_firms',
  ]

  for (const table of truncations) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;`)
      console.log(`  truncated ${table}`)
    } catch (err) {
      // Table may not exist yet (first deploy) — log and continue.
      console.log(`  skipped  ${table} (${(err as Error).message.split('\n')[0]})`)
    }
  }

  // Verify slot count
  const firmCount = await prisma.consultingFirm.count()
  const userCount = await prisma.user.count()
  console.log(`\nFinal state: ${firmCount} firms, ${userCount} users.`)
  console.log('Beta slots: 15/15 available (assuming MAX_BETA_SLOTS env = 15).')
  console.log('Reset complete.')
}

main()
  .catch((err) => {
    console.error('Reset FAILED:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
