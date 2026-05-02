// =============================================================
// Beta Weekly Questionnaire Worker
//
// Fires every Monday at 13:00 UTC (~9 AM Eastern, ~6 AM Pacific).
// On each fire:
//   1. Compute the start of the current ISO week (Monday 00:00 UTC).
//   2. Upsert a BetaWeeklyQuestionnaire row for that week using the
//      default question template (idempotent — safe to re-run).
//   3. Email every active user in every active firm reminding them
//      to complete the questionnaire. Login is gated by
//      requireQuestionnaireCompleted() until they submit.
//
// Why a hard login gate: charter §1 ("beta-period blast radius") +
// the operator's directive — beta participants must produce
// feedback to retain access. Filling in the form is the price of
// admission for the week.
// =============================================================
import { Worker, Queue, Job } from 'bullmq'
import { prisma } from '../config/database'
import { redis } from '../config/redis'
import { logger } from '../utils/logger'
import { sendEmail } from '../services/mailer'

// BullMQ 4.x requires an IORedis instance, not { url }. Use the
// shared `redis` connection from config/redis.
const redisConnection = redis as any

export const betaQuestionnaireQueue = new Queue('beta-questionnaire', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 12 }, // keep 12 weeks of history
    removeOnFail: { count: 12 },
  },
})

/**
 * Default questionnaire template. Five short questions — the goal is a
 * 90-second weekly tax that produces real product-decision data.
 */
export const DEFAULT_QUESTIONS = [
  {
    id: 'q1_usefulness',
    type: 'RATING_1_5',
    prompt: 'How useful was Mr GovCon for your capture work this week?',
    required: true,
  },
  {
    id: 'q2_compliance_accuracy',
    type: 'RATING_1_5',
    prompt: 'How accurate did the FAR/DFARS compliance gap analysis feel against the solicitations you reviewed?',
    required: true,
  },
  {
    id: 'q3_friction',
    type: 'TEXT',
    prompt: 'What was the single biggest friction point this week? Be specific.',
    required: true,
    maxLength: 600,
  },
  {
    id: 'q4_delight',
    type: 'TEXT',
    prompt: "What's one thing the platform did well this week — or one feature you'd pay extra for?",
    required: false,
    maxLength: 600,
  },
  {
    id: 'q5_submitted',
    type: 'BOOL',
    prompt: 'Did your team submit any proposals this week using Mr GovCon outputs?',
    required: true,
  },
]

/**
 * Compute the start of the current ISO week in UTC (Monday 00:00:00).
 */
function startOfIsoWeekUtc(now: Date = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  // getUTCDay: 0=Sun ... 6=Sat. We want offset to Monday.
  const dayOfWeek = d.getUTCDay()
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  d.setUTCDate(d.getUTCDate() - daysSinceMonday)
  return d
}

/**
 * Idempotent: returns the questionnaire for the current ISO week,
 * creating it from the default template if it doesn't exist yet.
 */
export async function ensureCurrentQuestionnaire() {
  const weekStarting = startOfIsoWeekUtc()
  const existing = await prisma.betaWeeklyQuestionnaire.findUnique({
    where: { weekStarting },
  })
  if (existing) return existing
  return prisma.betaWeeklyQuestionnaire.create({
    data: {
      weekStarting,
      title: `Weekly Beta Feedback — Week of ${weekStarting.toISOString().slice(0, 10)}`,
      questionsJson: DEFAULT_QUESTIONS,
      isActive: true,
    },
  })
}

/**
 * Email every active user in every active firm. Non-blocking failures
 * per user — one user's email-provider hiccup must not block the rest.
 */
async function emailReminders(weekStarting: Date): Promise<{ sent: number; failed: number }> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      isEmailVerified: true,
      consultingFirm: { isActive: true },
    },
    select: { id: true, email: true, firstName: true },
  })

  let sent = 0
  let failed = 0
  for (const u of users) {
    try {
      await sendEmail({
        to: u.email,
        subject: 'Mr GovCon — weekly beta feedback (2 minutes)',
        category: 'TRANSACTIONAL',
        textBody: `Good morning ${u.firstName},

Your weekly Mr GovCon beta feedback questionnaire is open. It's five short questions and takes about two minutes. Login is gated until it's submitted, so please complete it before your first action this week.

Sign in at https://mrgovcon.co/login — the questionnaire will appear automatically.

Week starting: ${weekStarting.toISOString().slice(0, 10)}

— Mercy Raine LLC, operator of Mr GovCon`,
      })
      sent++
    } catch (err) {
      failed++
      logger.warn('Beta questionnaire reminder email failed', {
        userId: u.id,
        error: (err as Error).message,
      })
    }
  }
  return { sent, failed }
}

/**
 * Main job handler — exported so it can be called manually for testing
 * or via a one-off `bullmq` add.
 */
export async function publishWeeklyQuestionnaire(): Promise<{
  questionnaireId: string
  weekStarting: string
  emails: { sent: number; failed: number }
}> {
  const questionnaire = await ensureCurrentQuestionnaire()
  logger.info('Beta questionnaire ensured for week', {
    questionnaireId: questionnaire.id,
    weekStarting: questionnaire.weekStarting.toISOString(),
  })
  const emails = await emailReminders(questionnaire.weekStarting)
  logger.info('Beta questionnaire reminders sent', emails)
  return {
    questionnaireId: questionnaire.id,
    weekStarting: questionnaire.weekStarting.toISOString(),
    emails,
  }
}

export function startBetaQuestionnaireWorker(): Worker {
  const worker = new Worker(
    'beta-questionnaire',
    async (_job: Job) => publishWeeklyQuestionnaire(),
    { connection: redisConnection }
  )

  worker.on('completed', (job) =>
    logger.info('Beta questionnaire job completed', { jobId: job.id })
  )
  worker.on('failed', (job, err) =>
    logger.error('Beta questionnaire job failed', {
      jobId: job?.id,
      error: String(err),
    })
  )

  // Schedule the recurring job: every Monday at 13:00 UTC (~9 AM ET).
  betaQuestionnaireQueue
    .add(
      'publish-weekly',
      {},
      {
        repeat: { pattern: '0 13 * * 1', tz: 'UTC' },
        jobId: 'beta-questionnaire-monday-cron', // stable id prevents duplicate scheduling
      }
    )
    .catch((err) =>
      logger.warn('Failed to schedule beta questionnaire cron', {
        error: (err as Error).message,
      })
    )

  logger.info('Beta questionnaire worker started — Monday 13:00 UTC cron')
  return worker
}
