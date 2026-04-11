import PDFDocument from 'pdfkit'
import { ProposalDraft } from './proposalDraftService'

// Colors
const NAVY = '#1a2744'
const GOLD = '#c49a1a'
const DARK_GRAY = '#2d3748'
const MID_GRAY = '#4a5568'
const LIGHT_GRAY = '#e2e8f0'
const WHITE = '#ffffff'
const TEXT = '#1a202c'

export function buildProposalPdf(draft: ProposalDraft): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 72, size: 'LETTER', bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const validSections = draft.sections.filter(s => s.content && s.content.trim().length > 10)

    // ── COVER PAGE ──────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 220).fill(NAVY)

    doc.fontSize(9).fillColor('#8899bb').font('Helvetica')
       .text('PROPOSAL RESPONSE', 72, 45, { characterSpacing: 2 })

    doc.fontSize(22).fillColor(WHITE).font('Helvetica-Bold')
       .text(draft.opportunityTitle, 72, 65, { width: doc.page.width - 144, lineGap: 4 })

    const titleBottom = doc.y
    doc.fontSize(13).fillColor('#aabbdd').font('Helvetica')
       .text(`Submitted to: ${draft.agency}`, 72, Math.max(titleBottom + 12, 140))

    // Gold divider line
    doc.rect(0, 220, doc.page.width, 4).fill(GOLD)

    // Date / classification block
    doc.rect(0, 224, doc.page.width, 56).fill('#f7f8fa')
    doc.fontSize(10).fillColor(MID_GRAY).font('Helvetica')
       .text(`Date Prepared: ${draft.preparedDate}`, 72, 240)
       .text('Classification: Proposal — Confidential', 72, 256)

    doc.rect(0, 280, doc.page.width, 4).fill(LIGHT_GRAY)

    // Cover page section listing (below the header)
    doc.y = 320
    doc.fontSize(12).fillColor(NAVY).font('Helvetica-Bold')
       .text('PREPARED BY', 72, doc.y)
    doc.moveDown(0.4)
    doc.fontSize(10).fillColor(MID_GRAY).font('Helvetica')
       .text('Mr GovCon — AI-Powered Proposal Intelligence', 72, doc.y)
    doc.moveDown(2)

    doc.fontSize(10).fillColor(DARK_GRAY).font('Helvetica-Bold')
       .text('DOCUMENT CONTENTS', 72, doc.y)
    doc.moveDown(0.5)
    validSections.forEach((section, i) => {
      doc.fontSize(10).fillColor(TEXT).font('Helvetica')
         .text(`${i + 1}.  ${section.title}`, 90, doc.y)
      doc.moveDown(0.3)
    })

    // ── TABLE OF CONTENTS ───────────────────────────────────────
    doc.addPage()
    drawSectionHeader(doc, 'TABLE OF CONTENTS')
    doc.moveDown(0.5)

    validSections.forEach((section, i) => {
      doc.fontSize(11).fillColor(TEXT).font('Helvetica')
         .text(`${i + 1}.  ${section.title}`, 72, doc.y)
      doc.moveDown(0.5)
    })

    // ── PROPOSAL SECTIONS ────────────────────────────────────────
    validSections.forEach((section, i) => {
      doc.addPage()

      // Section header bar
      doc.rect(0, doc.page.margins.top - 10, doc.page.width, 48).fill(NAVY)
      doc.fontSize(8).fillColor('#8899bb').font('Helvetica')
         .text(`SECTION ${i + 1}`, 72, doc.page.margins.top - 2, { characterSpacing: 2 })
      doc.fontSize(16).fillColor(WHITE).font('Helvetica-Bold')
         .text(section.title.toUpperCase(), 72, doc.page.margins.top + 12)

      // Gold accent line under header
      const headerBottom = doc.page.margins.top + 48 - 10
      doc.rect(72, headerBottom, 60, 3).fill(GOLD)

      doc.y = headerBottom + 16
      doc.x = 72

      // Section body text — split on double newlines for paragraph breaks
      const paragraphs = section.content.split(/\n{2,}/).filter(p => p.trim())
      paragraphs.forEach((para, pi) => {
        // Handle single newlines within paragraphs as line breaks
        const lines = para.trim().split(/\n/)
        lines.forEach((line, li) => {
          doc.fontSize(10.5).fillColor(TEXT).font('Helvetica')
             .text(line.trim(), 72, doc.y, {
               width: doc.page.width - 144,
               align: 'justify',
               lineGap: 2,
             })
          if (li < lines.length - 1) doc.moveDown(0.2)
        })
        if (pi < paragraphs.length - 1) doc.moveDown(0.8)
      })
    })

    // ── REMOVE TRAILING BLANK PAGES ─────────────────────────────
    // PDFKit sometimes adds an extra page when content ends near bottom.
    // Check if the last page has any meaningful content below the header area.
    const range = doc.bufferedPageRange()
    const totalPages = range.count

    // ── FOOTER ON ALL PAGES ─────────────────────────────────────
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(range.start + i)
      const footerY = doc.page.height - 40
      doc.rect(0, footerY - 8, doc.page.width, 1).fill(LIGHT_GRAY)
      const footerTitle = draft.opportunityTitle.length > 60
        ? draft.opportunityTitle.slice(0, 57) + '...'
        : draft.opportunityTitle
      doc.fontSize(8).fillColor(MID_GRAY).font('Helvetica')
         .text(
           `${footerTitle} | ${draft.agency} | Page ${i + 1} of ${totalPages}`,
           72, footerY,
           { width: doc.page.width - 144, align: 'center', lineBreak: false }
         )
    }

    doc.end()
  })
}

function drawSectionHeader(doc: PDFKit.PDFDocument, title: string) {
  doc.fontSize(14).fillColor(NAVY).font('Helvetica-Bold').text(title)
  const y = doc.y + 4
  doc.rect(72, y, doc.page.width - 144, 2).fill(GOLD)
  doc.y = y + 10
}
