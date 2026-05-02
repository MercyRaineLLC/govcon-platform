// =============================================================
// Seed loader for the versioned legal documents (Terms of Service
// and Beta Non-Disclosure Agreement). Idempotent — re-running
// publishes a new version only if the markdown body changed.
//
// Each version stores the SHA-256 hash of its body. UserAgreement
// rows pin to the contentHash, so a court-grade record exists of
// the exact text the user accepted.
// =============================================================
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'

const SEED_DIR = path.join(__dirname, 'legal')

function loadAndHash(file: string): { body: string; hash: string } {
  const body = fs.readFileSync(path.join(SEED_DIR, file), 'utf-8')
  const hash = crypto.createHash('sha256').update(body).digest('hex')
  return { body, hash }
}

export async function loadLegalDocs(prisma: PrismaClient): Promise<void> {
  const tos = loadAndHash('tos-v1.md')
  const nda = loadAndHash('beta-nda-v1.md')

  // ToS v1.0 — make it the current version. If a row already exists with the
  // same hash, leave it in place; otherwise upsert and roll the current flag.
  const existingTos = await prisma.termsOfServiceVersion.findUnique({ where: { version: '1.2' } })
  if (!existingTos || existingTos.contentHash !== tos.hash) {
    await prisma.termsOfServiceVersion.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    })
    await prisma.termsOfServiceVersion.upsert({
      where: { version: '1.2' },
      create: {
        version: '1.2',
        title: 'Terms of Service',
        body: tos.body,
        contentHash: tos.hash,
        isCurrent: true,
      },
      update: {
        body: tos.body,
        contentHash: tos.hash,
        isCurrent: true,
      },
    })
    console.log('Seeded ToS v1.0')
  } else {
    console.log('ToS v1.0 already current — no change.')
  }

  const existingNda = await prisma.betaNdaVersion.findUnique({ where: { version: '1.2' } })
  if (!existingNda || existingNda.contentHash !== nda.hash) {
    await prisma.betaNdaVersion.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    })
    await prisma.betaNdaVersion.upsert({
      where: { version: '1.2' },
      create: {
        version: '1.2',
        title: 'Beta Non-Disclosure & IP Protection Agreement',
        body: nda.body,
        contentHash: nda.hash,
        isCurrent: true,
      },
      update: {
        body: nda.body,
        contentHash: nda.hash,
        isCurrent: true,
      },
    })
    console.log('Seeded Beta NDA v1.0')
  } else {
    console.log('Beta NDA v1.0 already current — no change.')
  }
}
