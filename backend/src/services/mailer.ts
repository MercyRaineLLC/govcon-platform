// =============================================================
// Mailer — SendGrid in production, dev-log fallback otherwise.
//
// Behavior:
//   - If SENDGRID_API_KEY is set: sends via SendGrid HTTPS API.
//   - Else: logs the email payload to the backend logs and returns
//     `{ delivered: false, devFallback: true }`. Dev workflow that
//     reads the verification URL out of the response (mirroring the
//     forgot-password pattern) keeps working unchanged.
//
// Env vars (set in .env.prod):
//   SENDGRID_API_KEY  — full key, starts with "SG."
//   EMAIL_FROM        — verified single-sender address (e.g. no-reply@mrgovcon.co)
//   EMAIL_FROM_NAME   — optional display name (default "Mr GovCon")
//   PUBLIC_APP_URL    — base for verification / reset links
//
// SendGrid sender authentication: domain auth on mrgovcon.co OR
// single-sender verification on EMAIL_FROM. Domain auth is preferred
// (DKIM + SPF) because Gmail will otherwise mark single-sender mail
// as suspicious. See https://docs.sendgrid.com/ui/sending-email/sender-verification
// =============================================================
import { logger } from '../utils/logger'

export interface EmailMessage {
  to: string
  subject: string
  textBody: string
  htmlBody?: string
  category?: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'TRANSACTIONAL' | 'BETA_QUESTIONNAIRE'
}

export interface DeliveryResult {
  delivered: boolean
  devFallback?: boolean
  provider?: string
  providerMessageId?: string | null
  error?: string
}

const SENDGRID_API = 'https://api.sendgrid.com/v3/mail/send'

function getEnv() {
  const apiKey = process.env.SENDGRID_API_KEY?.trim() || null
  const from = process.env.EMAIL_FROM?.trim() || 'no-reply@mrgovcon.co'
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || 'Mr GovCon'
  return { apiKey, from, fromName }
}

/**
 * Send via SendGrid v3 mail API. Retries once on transient (5xx, network)
 * failures. Returns delivered:false on permanent failure (4xx) so the
 * caller can decide whether to surface to the user.
 */
async function sendViaSendGrid(msg: EmailMessage, apiKey: string, from: string, fromName: string): Promise<DeliveryResult> {
  const body = {
    personalizations: [{ to: [{ email: msg.to }] }],
    from: { email: from, name: fromName },
    subject: msg.subject,
    content: [
      { type: 'text/plain', value: msg.textBody },
      ...(msg.htmlBody ? [{ type: 'text/html', value: msg.htmlBody }] : []),
    ],
    categories: msg.category ? [msg.category] : undefined,
  }

  const attempt = async (): Promise<{ ok: boolean; status: number; messageId: string | null; errorBody?: string }> => {
    const res = await fetch(SENDGRID_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const messageId = res.headers.get('x-message-id')
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status, messageId }
    }
    const errorBody = await res.text().catch(() => '')
    return { ok: false, status: res.status, messageId: null, errorBody: errorBody.slice(0, 500) }
  }

  try {
    let result = await attempt()
    // Retry once on 5xx — transient SendGrid blips happen
    if (!result.ok && result.status >= 500) {
      await new Promise((r) => setTimeout(r, 750))
      result = await attempt()
    }

    if (result.ok) {
      logger.info('Mailer (sendgrid) — delivered', {
        to: msg.to,
        subject: msg.subject,
        category: msg.category,
        messageId: result.messageId,
      })
      return { delivered: true, provider: 'sendgrid', providerMessageId: result.messageId }
    }

    logger.warn('Mailer (sendgrid) — failed', {
      to: msg.to,
      subject: msg.subject,
      status: result.status,
      error: result.errorBody,
    })
    return {
      delivered: false,
      provider: 'sendgrid',
      error: `sendgrid status=${result.status}: ${result.errorBody ?? ''}`,
    }
  } catch (err) {
    logger.error('Mailer (sendgrid) — exception', { error: (err as Error).message, to: msg.to })
    return { delivered: false, provider: 'sendgrid', error: (err as Error).message }
  }
}

export async function sendEmail(msg: EmailMessage): Promise<DeliveryResult> {
  const { apiKey, from, fromName } = getEnv()

  if (!apiKey) {
    logger.info('Mailer (dev) — would send email (SENDGRID_API_KEY not set)', {
      to: msg.to,
      subject: msg.subject,
      category: msg.category ?? 'TRANSACTIONAL',
      bodyPreview: msg.textBody.slice(0, 200),
    })
    return { delivered: false, devFallback: true }
  }

  return sendViaSendGrid(msg, apiKey, from, fromName)
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
