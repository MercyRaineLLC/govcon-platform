import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { seedNaicsCodes } from './seedNaics'

const prisma = new PrismaClient()

async function main() {
  console.log("Seeding database...")

  await seedNaicsCodes(prisma)

  const firm = await prisma.consultingFirm.create({
    data: {
      name: "Mercy Raine Consulting",
      contactEmail: "admin@mercyrainellc.com"
    }
  })

  const hashedPassword = await bcrypt.hash("Admin1234!", 10)

  await prisma.user.create({
    data: {
      email: "admin@mercyrainellc.com",
      passwordHash: hashedPassword,
      firstName: "Admin",
      lastName: "User",
      role: "ADMIN",
      consultingFirmId: firm.id
    }
  })

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