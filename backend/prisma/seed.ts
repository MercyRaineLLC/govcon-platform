import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { seedNaicsCodes } from './seedNaics'
import { loadFarCatalog } from './seeds/loadFarCatalog'
import { loadLegalDocs } from './seeds/loadLegal'

const prisma = new PrismaClient()

async function main() {
  console.log("Seeding database...")

  // Ordering matters:
  //   1. NAICS lookup table (other seeds may join on it)
  //   2. FAR / DFARS / NIST / CMMC / Section 508 regulatory catalog
  //   3. Versioned ToS + Beta NDA (UserAgreement rows below pin to current)
  //   4. Demo firm + user + opportunity (dev-environment only — operator
  //      runs `db:reset-beta` for the true fresh-beta state)
  await seedNaicsCodes(prisma)
  await loadFarCatalog(prisma)
  await loadLegalDocs(prisma)

  const firm = await prisma.consultingFirm.create({
    data: {
      name: "Mercy Raine Consulting",
      contactEmail: "admin@mercyrainellc.com"
    }
  })

  const hashedPassword = await bcrypt.hash("Admin1234!", 10)

  // Demo admin starts already-verified and already-accepted-current-legal so
  // the dev workflow doesn't require running through the full signup flow.
  // Production beta participants go through the gated signup like any other
  // user — this fast-path is local-only.
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@mercyrainellc.com",
      passwordHash: hashedPassword,
      firstName: "Admin",
      lastName: "User",
      role: "ADMIN",
      consultingFirmId: firm.id,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    }
  })

  const [tos, nda] = await Promise.all([
    prisma.termsOfServiceVersion.findFirst({ where: { isCurrent: true } }),
    prisma.betaNdaVersion.findFirst({ where: { isCurrent: true } }),
  ])
  if (tos && nda) {
    await prisma.userAgreement.createMany({
      data: [
        { userId: adminUser.id, documentType: 'TOS', documentId: tos.id, version: tos.version, contentHash: tos.contentHash, ip: '0.0.0.0::seed', userAgent: 'seed-script' },
        { userId: adminUser.id, documentType: 'BETA_NDA', documentId: nda.id, version: nda.version, contentHash: nda.contentHash, ip: '0.0.0.0::seed', userAgent: 'seed-script' },
      ],
      skipDuplicates: true,
    })
  }

  await prisma.clientCompany.create({
    data: {
      name: "Aspetto Inc",
      uei: "SAMPLE_UEI_001",
      sdvosb: true,
      smallBusiness: true,
      consultingFirmId: firm.id
    }
  })

  await prisma.opportunity.create({
    data: {
      title: "VA VISN 12 Medical Equipment Transport Services",
      agency: "Department of Veterans Affairs",
      naicsCode: "484121",
      setAsideType: "SDVOSB",
      marketCategory: "LOGISTICS",
      estimatedValue: 2500000,
      responseDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      consultingFirm: {
        connect: { id: firm.id }
      }
    }
  })

  console.log("Seed complete.")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
