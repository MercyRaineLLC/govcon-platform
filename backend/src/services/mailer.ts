// =============================================================
// Mailer — placeholder until SES/SendGrid is wired up.
//
// Today: logs the email payload AND attaches it to the response
// helper (`getDevDeliveryHint`) so the dev workflow mirrors the
// existing forgot-password pattern (token returned to caller).
//
// TODO(production): swap `deliver` for AWS SES / SendGrid / Postmark.
// =============================================================
import { logger } from '../utils/logger'

export interface EmailMessage {
  to: string
  subject: string
  textBody: string
  htmlBody?: string
  category?: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'TRANSACTIONAL'
}

export async function sendEmail(msg: EmailMessage): Promise<{ delivered: boolean }> {
  // Production hook: implement here.
  logger.info('Mailer (dev) — would send email', {
    to: msg.to,
    subject: msg.subject,
    category: msg.category ?? 'TRANSACTIONAL',
    bodyPreview: msg.textBody.slice(0, 200),
  })
  return { delivered: true }
}

/**
 * Build the verification URL the user clicks. Frontend route consumes the
 * token and POSTs to /api/auth/verify-email.
 */
export function buildEmailVerificationUrl(token: string): string {
  const base = process.env.PUBLIC_APP_URL || 'http://localhost:5173'
  return `${base}/verify-email?token=${encodeURIComponent(token)}`
}

export function buildPasswordResetUrl(token: string): string {
  const base = process.env.PUBLIC_APP_URL || 'http://localhost:5173'
  return `${base}/reset-password?token=${encodeURIComponent(token)}`
}
