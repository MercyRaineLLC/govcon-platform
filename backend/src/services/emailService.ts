// =============================================================
// Email Service - SMTP-based email sending with branded templates
// =============================================================

import nodemailer from 'nodemailer'
import { logger } from '../utils/logger'
import {
  renderBrandedEmail,
  deliverableReadyEmail,
  deadlineReminderEmail,
  approvalConfirmationEmail,
  BrandedTemplateData,
} from './brandedEmailTemplates'

// -------------------------------------------------------------
// Transport configuration
// -------------------------------------------------------------
// In production: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS env vars.
// In development: emails are logged but not sent (unless SMTP_HOST is set).
// -------------------------------------------------------------

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter

  const host = process.env.SMTP_HOST
  if (!host) {
    logger.warn('SMTP_HOST not configured — emails will be logged only')
    return null
  }

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  })

  return transporter
}

// -------------------------------------------------------------
// Send email helper
// -------------------------------------------------------------
async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text: string
  fromName?: string
}) {
  const fromAddress = process.env.SMTP_FROM || 'noreply@mrgovcon.com'
  const fromHeader = opts.fromName ? `"${opts.fromName}" <${fromAddress}>` : fromAddress

  const tx = getTransporter()
  if (!tx) {
    logger.info('Email (dev mode, not sent)', {
      to: opts.to,
      subject: opts.subject,
      from: fromHeader,
    })
    return { success: true, messageId: 'dev-mode-not-sent' }
  }

  try {
    const info = await tx.sendMail({
      from: fromHeader,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    })
    logger.info('Email sent', { to: opts.to, subject: opts.subject, messageId: info.messageId })
    return { success: true, messageId: info.messageId }
  } catch (err: any) {
    logger.error('Email send failed', { to: opts.to, subject: opts.subject, error: err.message })
    return { success: false, error: err.message }
  }
}

// -------------------------------------------------------------
// Public API: Branded notifications
// -------------------------------------------------------------

export async function notifyDeliverableReady(opts: {
  firmId: string
  recipientEmail: string
  recipientName: string
  deliverableTitle: string
  portalUrl: string
  fromName?: string
}) {
  const email = await deliverableReadyEmail({
    firmId: opts.firmId,
    clientName: opts.recipientName,
    deliverableTitle: opts.deliverableTitle,
    portalUrl: opts.portalUrl,
  })

  return sendEmail({
    to: opts.recipientEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
    fromName: opts.fromName,
  })
}

export async function notifyDeadlineApproaching(opts: {
  firmId: string
  recipientEmail: string
  recipientName: string
  documentTitle: string
  daysUntilDue: number
  portalUrl: string
  fromName?: string
}) {
  const email = await deadlineReminderEmail({
    firmId: opts.firmId,
    clientName: opts.recipientName,
    documentTitle: opts.documentTitle,
    daysUntilDue: opts.daysUntilDue,
    portalUrl: opts.portalUrl,
  })

  return sendEmail({
    to: opts.recipientEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
    fromName: opts.fromName,
  })
}

export async function notifyApprovalReceived(opts: {
  firmId: string
  recipientEmail: string
  recipientName: string
  deliverableTitle: string
  portalUrl: string
  fromName?: string
}) {
  const email = await approvalConfirmationEmail({
    firmId: opts.firmId,
    clientName: opts.recipientName,
    deliverableTitle: opts.deliverableTitle,
    portalUrl: opts.portalUrl,
  })

  return sendEmail({
    to: opts.recipientEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
    fromName: opts.fromName,
  })
}

export async function sendCustomBrandedEmail(opts: BrandedTemplateData & {
  recipientEmail: string
  fromName?: string
}) {
  const email = await renderBrandedEmail(opts)
  return sendEmail({
    to: opts.recipientEmail,
    subject: email.subject,
    html: email.html,
    text: email.text,
    fromName: opts.fromName,
  })
}
