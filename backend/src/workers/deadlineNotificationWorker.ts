// =============================================================
// Deadline Notification Worker
// Runs daily at 09:00 UTC to send deadline reminder emails
// =============================================================

import { Queue, Worker } from 'bullmq'
import { prisma } from '../config/database'
import { logger } from '../utils/logger'
import { notifyDeadlineApproaching } from '../services/emailService'
import { config } from '../config/config'

const QUEUE_NAME = 'deadline-notifications'
const REMINDER_DAYS = [14, 7, 3, 1]

// Parse REDIS_URL into BullMQ connection options
function parseRedisUrl(url: string) {
  try {
    const u = new URL(url)
    return {
      host: u.hostname || 'localhost',
      port: parseInt(u.port || '6379', 10),
      password: u.password || undefined,
    }
  } catch {
    return { host: 'localhost', port: 6379 }
  }
}
const connection = parseRedisUrl(config.redis.url)

const queue = new Queue(QUEUE_NAME, { connection })

// -------------------------------------------------------------
// Job: send-daily-reminders
// Scans all DocumentRequirements with upcoming deadlines and emails clients
// -------------------------------------------------------------

async function sendDailyReminders() {
  logger.info('Deadline notification scan started')

  const now = new Date()
  const horizon = new Date(now.getTime() + 14 * 86400000)

  const requirements = await prisma.documentRequirement.findMany({
    where: {
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      dueDate: { gte: now, lte: horizon },
    },
    include: {
      clientCompany: {
        select: {
          id: true,
          name: true,
          consultingFirmId: true,
          clientPortalUsers: {
            where: { isActive: true, notifyDeadlines: true },
            select: { email: true, firstName: true, lastName: true },
          },
        },
      },
    },
  })

  let sentCount = 0
  let skippedCount = 0

  for (const req of requirements) {
    const daysUntil = Math.ceil((new Date(req.dueDate).getTime() - now.getTime()) / 86400000)

    // Only send on milestone days (14, 7, 3, 1)
    if (!REMINDER_DAYS.includes(daysUntil)) {
      skippedCount++
      continue
    }

    const portalUrl = (process.env.FRONTEND_URL || 'http://localhost:3000') + '/client-portal'

    for (const user of req.clientCompany.clientPortalUsers) {
      try {
        await notifyDeadlineApproaching({
          firmId: req.clientCompany.consultingFirmId,
          recipientEmail: user.email,
          recipientName: `${user.firstName} ${user.lastName}`.trim(),
          documentTitle: req.title,
          daysUntilDue: daysUntil,
          portalUrl,
        })
        sentCount++
      } catch (err: any) {
        logger.warn('Deadline reminder send failed', {
          email: user.email,
          docId: req.id,
          error: err.message,
        })
      }
    }
  }

  logger.info('Deadline notification scan complete', {
    total: requirements.length,
    sent: sentCount,
    skipped: skippedCount,
  })

  return { total: requirements.length, sent: sentCount, skipped: skippedCount }
}

// -------------------------------------------------------------
// Worker
// -------------------------------------------------------------

export function startDeadlineNotificationWorker() {
  const worker = new Worker(QUEUE_NAME, async (job) => {
    if (job.name === 'send-daily-reminders') {
      return sendDailyReminders()
    }
    throw new Error(`Unknown job: ${job.name}`)
  }, { connection })

  // Schedule daily at 09:00 UTC
  queue.add(
    'send-daily-reminders',
    {},
    {
      repeat: { pattern: '0 9 * * *' }, // every day at 09:00 UTC
      removeOnComplete: 50,
      removeOnFail: 50,
    }
  ).then(() => {
    logger.info('Deadline notification worker started (daily at 09:00 UTC)')
  }).catch(err => {
    logger.error('Failed to schedule deadline notifications', { error: err.message })
  })

  worker.on('completed', (job, result) => {
    logger.info('Deadline notification job complete', { jobId: job.id, result })
  })

  worker.on('failed', (job, err) => {
    logger.error('Deadline notification job failed', { jobId: job?.id, error: err.message })
  })

  return worker
}

// Allow manual trigger via API
export async function triggerDeadlineCheck() {
  return sendDailyReminders()
}
