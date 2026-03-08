import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
function daysFromNow(d: number): Date { return new Date(Date.now() + d * 86400000) }
function daysAgo(d: number): Date { return new Date(Date.now() - d * 86400000) }
function monthsAgo(m: number): Date { const d = new Date(); d.setMonth(d.getMonth() - m); return d }
function rand(a: number, b: number): number { return Math.random() * (b - a) + a }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
async function main() {
  console.log('Clearing...')
  for (const m of ['complianceLog','complianceReward','documentRequirement','clientPortalUser','financialPenalty','submissionRecord','bidDecision','performanceStats','awardHistory','amendment','opportunityDocument','ingestionJob','stateMunicipalOpportunity','stateMunicipalSubscription','opportunity','clientNaics','naicsCode','clientCompany','user','consultingFirm'] as const) await (prisma[m] as any).deleteMany()
  const firm = await prisma.consultingFirm.create({ data: { name: 'Mercy Raine Consulting', contactEmail: 'admin@mercyrainellc.com', flatLateFee: 2500, penaltyPercent: 5.0, lastIngestedAt: daysAgo(1) } })
  const hp = await bcrypt.hash('Admin1234!', 10)
  const admin = await prisma.user.create({ data: { email: 'admin@mercyrainellc.com', passwordHash: hp, firstName: 'Marcus', lastName: 'Raine', role: 'ADMIN', consultingFirmId: firm.id } })
  const ap = await bcrypt.hash('Analyst1234!', 10)
  const analyst = await prisma.user.create({ data: { email: 'analyst@mercyrainellc.com', passwordHash: ap, firstName: 'Sarah', lastName: 'Chen', role: 'ANALYST', consultingFirmId: firm.id } })