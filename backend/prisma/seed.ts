import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
const prisma = new PrismaClient()
function daysFromNow(d: number): Date { return new Date(Date.now() + d * 86400000) }
function daysAgo(d: number): Date { return new Date(Date.now() - d * 86400000) }
function monthsAgo(m: number): Date { const d = new Date(); d.setMonth(d.getMonth() - m); return d }
function rand(a: number, b: number): number { return Math.random() * (b - a) + a }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

async function main() {
  console.log("Seeding database...")

  await prisma.complianceLog.deleteMany()
  await prisma.complianceReward.deleteMany()
  await prisma.documentRequirement.deleteMany()
  await prisma.financialPenalty.deleteMany()
  await prisma.submissionRecord.deleteMany()
  await prisma.bidDecision.deleteMany()
  await prisma.awardHistory.deleteMany()
  await prisma.amendment.deleteMany()
  await prisma.opportunityDocument.deleteMany()
  await prisma.opportunity.deleteMany()
  await prisma.performanceStats.deleteMany()
  await prisma.clientPortalUser.deleteMany()
  await prisma.clientNaics.deleteMany()
  await prisma.clientCompany.deleteMany()
  await prisma.ingestionJob.deleteMany()
  await prisma.stateMunicipalOpportunity.deleteMany()
  await prisma.stateMunicipalSubscription.deleteMany()
  await prisma.user.deleteMany()
  await prisma.consultingFirm.deleteMany()
  const firm = await prisma.consultingFirm.create({
    data: {
      name: "Mercy Raine Consulting",
      contactEmail: "admin@mercyrainellc.com",
      isActive: true,
      flatLateFee: 500,
      penaltyPercent: 2.5,
      lastIngestedAt: daysAgo(1),
    },
  })

  const adminHash = await bcrypt.hash("Admin1234!", 10)
  const analystHash = await bcrypt.hash("Analyst1234!", 10)

  const adminUser = await prisma.user.create({
    data: {
      consultingFirmId: firm.id,
      email: "admin@mercyrainellc.com",
      passwordHash: adminHash,
      firstName: "Alex",
      lastName: "Mitchell",
      role: "ADMIN",
      isActive: true,
      lastLoginAt: daysAgo(0),
    },
  })

  const analystUser = await prisma.user.create({
    data: {
      consultingFirmId: firm.id,
      email: "analyst@mercyrainellc.com",
      passwordHash: analystHash,
      firstName: "Jordan",
      lastName: "Rivera",
      role: "ANALYST",
      isActive: true,
      lastLoginAt: daysAgo(2),
    },
  })

  const clientsData = [
    { name: "Aspetto Inc", cage: "7YKL3", uei: "ASPET001UEI1", naicsCodes: ["541512", "541519"], sdvosb: true, wosb: false, hubzone: false, smallBusiness: true },
    { name: "Vanguard Defense Solutions", cage: "8BQR2", uei: "VNGRD002UEI1", naicsCodes: ["336414", "541330"], sdvosb: false, wosb: false, hubzone: false, smallBusiness: true },
    { name: "Liberty IT Group", cage: "9CKT4", uei: "LBRIT003UEI1", naicsCodes: ["541512", "541513", "518210"], sdvosb: false, wosb: true, hubzone: true, smallBusiness: true },
    { name: "Patriot Logistics LLC", cage: "4DLV5", uei: "PTLOG004UEI1", naicsCodes: ["488510", "541614"], sdvosb: false, wosb: false, hubzone: false, smallBusiness: true },
    { name: "Sentinel Cyber Inc", cage: "5EMW6", uei: "SNTCB005UEI1", naicsCodes: ["541519", "541690"], sdvosb: true, wosb: false, hubzone: false, smallBusiness: true },
    { name: "Apex Engineering Corp", cage: "6FNX7", uei: "APXEN006UEI1", naicsCodes: ["541330", "541340"], sdvosb: false, wosb: false, hubzone: true, smallBusiness: true },
    { name: "TechBridge Federal", cage: "7GPY8", uei: "TCHBR007UEI1", naicsCodes: ["541512", "541611"], sdvosb: false, wosb: true, hubzone: false, smallBusiness: true },
    { name: "Guardian Medical Systems", cage: "8HQZ9", uei: "GRDMD008UEI1", naicsCodes: ["339112", "621910"], sdvosb: false, wosb: false, hubzone: false, smallBusiness: true },
  ]

  const clients = await Promise.all(
    clientsData.map((c) => prisma.clientCompany.create({ data: { ...c, consultingFirmId: firm.id } }))
  )

  const portalHash = await bcrypt.hash("ClientPortal1!", 10)
  const portalDefs = [
    { firstName: "Marcus", lastName: "Chen", email: "aspetto@portal.com", clientIdx: 0 },
    { firstName: "Sarah", lastName: "Kovacs", email: "vanguard@portal.com", clientIdx: 1 },
    { firstName: "Devon", lastName: "Walsh", email: "libertyit@portal.com", clientIdx: 2 },
    { firstName: "Priya", lastName: "Nair", email: "patriot@portal.com", clientIdx: 3 },
  ]
  await Promise.all(
    portalDefs.map((p) =>
      prisma.clientPortalUser.create({
        data: {
          clientCompanyId: clients[p.clientIdx].id,
          email: p.email,
          passwordHash: portalHash,
          firstName: p.firstName,
          lastName: p.lastName,
          isActive: true,
        },
      })
    )
  )

  const oppData = [
    { title: "Cybersecurity Operations Center Support", agency: "Department of Homeland Security", naicsCode: "541519", setAsideType: "SDVOSB", estimatedValue: 4200000, prob: 0.82, daysUntil: 18, recompete: true },
    { title: "IT Modernization Program Phase 2", agency: "Department of Veterans Affairs", naicsCode: "541512", setAsideType: "SDVOSB", estimatedValue: 8500000, prob: 0.74, daysUntil: 32, recompete: false },
    { title: "Logistics Management System Overhaul", agency: "Department of Defense", naicsCode: "488510", setAsideType: "SBA", estimatedValue: 3100000, prob: 0.61, daysUntil: 45, recompete: false },
    { title: "Medical Supplies Distribution Services", agency: "Department of Veterans Affairs", naicsCode: "339112", setAsideType: "WOSB", estimatedValue: 2700000, prob: 0.55, daysUntil: 28, recompete: true },
    { title: "Cloud Infrastructure Migration", agency: "General Services Administration", naicsCode: "518210", setAsideType: "SBA", estimatedValue: 6400000, prob: 0.78, daysUntil: 14, recompete: false },
    { title: "Network Security Assessment Services", agency: "Department of Justice", naicsCode: "541519", setAsideType: "SDVOSB", estimatedValue: 1900000, prob: 0.69, daysUntil: 22, recompete: false },
    { title: "Engineering Design Support IDIQ", agency: "Army Corps of Engineers", naicsCode: "541330", setAsideType: "HUBZone", estimatedValue: 12000000, prob: 0.48, daysUntil: 60, recompete: true },
    { title: "Healthcare IT Systems Integration", agency: "Department of Health and Human Services", naicsCode: "541512", setAsideType: "WOSB", estimatedValue: 5100000, prob: 0.71, daysUntil: 35, recompete: false },
    { title: "Supply Chain Analytics Platform", agency: "Defense Logistics Agency", naicsCode: "541614", setAsideType: "SBA", estimatedValue: 3800000, prob: 0.63, daysUntil: 50, recompete: false },
    { title: "Cybersecurity Training Program", agency: "Department of Homeland Security", naicsCode: "541690", setAsideType: "SDVOSB", estimatedValue: 980000, prob: 0.85, daysUntil: 10, recompete: true },
    { title: "Software Development Services BPA", agency: "Department of State", naicsCode: "541512", setAsideType: "SBA", estimatedValue: 9200000, prob: 0.52, daysUntil: 75, recompete: false },
    { title: "Aviation Maintenance Support", agency: "Department of Defense", naicsCode: "336414", setAsideType: "SBA", estimatedValue: 7300000, prob: 0.44, daysUntil: 90, recompete: false },
    { title: "Data Analytics Dashboard Contract", agency: "Social Security Administration", naicsCode: "541512", setAsideType: "WOSB", estimatedValue: 2100000, prob: 0.77, daysUntil: 20, recompete: true },
    { title: "Facility Management Services", agency: "General Services Administration", naicsCode: "541614", setAsideType: "HUBZone", estimatedValue: 4600000, prob: 0.58, daysUntil: 42, recompete: false },
    { title: "AI Research Contract", agency: "Defense Advanced Research Projects Agency", naicsCode: "541512", setAsideType: "SBA", estimatedValue: 15000000, prob: 0.39, daysUntil: 120, recompete: false },
    { title: "Emergency Medical Response Fleet", agency: "Department of Veterans Affairs", naicsCode: "621910", setAsideType: "SDVOSB", estimatedValue: 3300000, prob: 0.73, daysUntil: 25, recompete: true },
    { title: "Zero Trust Architecture Implementation", agency: "Department of Treasury", naicsCode: "541519", setAsideType: "SBA", estimatedValue: 7800000, prob: 0.67, daysUntil: 38, recompete: false },
    { title: "Geospatial Mapping Services", agency: "Department of Interior", naicsCode: "541340", setAsideType: "HUBZone", estimatedValue: 2200000, prob: 0.54, daysUntil: 55, recompete: false },
    { title: "HR Information System Modernization", agency: "Office of Personnel Management", naicsCode: "541611", setAsideType: "WOSB", estimatedValue: 4100000, prob: 0.72, daysUntil: 30, recompete: true },
    { title: "Secure Communications Infrastructure", agency: "Department of Defense", naicsCode: "541519", setAsideType: "SDVOSB", estimatedValue: 11000000, prob: 0.81, daysUntil: 15, recompete: true },
    { title: "Environmental Engineering Consulting", agency: "Environmental Protection Agency", naicsCode: "541330", setAsideType: "SBA", estimatedValue: 1700000, prob: 0.46, daysUntil: 65, recompete: false },
    { title: "Financial Audit Services", agency: "Department of Agriculture", naicsCode: "541211", setAsideType: "SBA", estimatedValue: 890000, prob: 0.59, daysUntil: 48, recompete: false },
    { title: "IT Help Desk Operations", agency: "Department of Energy", naicsCode: "541513", setAsideType: "WOSB", estimatedValue: 3500000, prob: 0.68, daysUntil: 27, recompete: true },
    { title: "Penetration Testing Services", agency: "Department of Homeland Security", naicsCode: "541519", setAsideType: "SBA", estimatedValue: 1200000, prob: 0.76, daysUntil: 16, recompete: false },
    { title: "Defense Training Simulation Systems", agency: "Department of Defense", naicsCode: "541512", setAsideType: "SBA", estimatedValue: 18000000, prob: 0.41, daysUntil: 100, recompete: false },
    { title: "Veterans Benefits Processing System", agency: "Department of Veterans Affairs", naicsCode: "541512", setAsideType: "SDVOSB", estimatedValue: 6700000, prob: 0.79, daysUntil: 21, recompete: true },
    { title: "Warehouse Automation Integration", agency: "Defense Logistics Agency", naicsCode: "488510", setAsideType: "SBA", estimatedValue: 4300000, prob: 0.53, daysUntil: 70, recompete: false },
    { title: "Telehealth Platform Development", agency: "Department of Health and Human Services", naicsCode: "541512", setAsideType: "WOSB", estimatedValue: 5500000, prob: 0.66, daysUntil: 33, recompete: false },
    { title: "Cybersecurity Compliance Advisory", agency: "Department of Homeland Security", naicsCode: "541690", setAsideType: "SDVOSB", estimatedValue: 2400000, prob: 0.84, daysUntil: 12, recompete: true },
    { title: "Satellite Communications Support", agency: "National Reconnaissance Office", naicsCode: "336414", setAsideType: "SBA", estimatedValue: 22000000, prob: 0.36, daysUntil: 130, recompete: false },
    { title: "Medical Records Digitization Program", agency: "Department of Veterans Affairs", naicsCode: "541512", setAsideType: "SDVOSB", estimatedValue: 3900000, prob: 0.70, daysUntil: 29, recompete: false },
    { title: "Logistics Forecasting Analytics", agency: "Department of Defense", naicsCode: "541614", setAsideType: "SBA", estimatedValue: 2800000, prob: 0.57, daysUntil: 52, recompete: false },
    { title: "Biometrics Identity Management", agency: "Department of Homeland Security", naicsCode: "541519", setAsideType: "SBA", estimatedValue: 9500000, prob: 0.62, daysUntil: 44, recompete: true },
    { title: "Legal Case Management Software", agency: "Department of Justice", naicsCode: "541512", setAsideType: "WOSB", estimatedValue: 3200000, prob: 0.65, daysUntil: 37, recompete: false },
    { title: "Construction Project Oversight", agency: "Army Corps of Engineers", naicsCode: "541330", setAsideType: "HUBZone", estimatedValue: 5800000, prob: 0.49, daysUntil: 80, recompete: false },
    { title: "Command and Control Systems Upgrade", agency: "Department of Defense", naicsCode: "541512", setAsideType: "SBA", estimatedValue: 14000000, prob: 0.43, daysUntil: 110, recompete: false },
    { title: "Small Business Development Advisory", agency: "Small Business Administration", naicsCode: "541611", setAsideType: "NONE", estimatedValue: 750000, prob: 0.88, daysUntil: 8, recompete: true },
    { title: "Border Security Technology Solutions", agency: "Department of Homeland Security", naicsCode: "541519", setAsideType: "SBA", estimatedValue: 16000000, prob: 0.45, daysUntil: 95, recompete: false },
    { title: "Nuclear Facility Safety Engineering", agency: "Department of Energy", naicsCode: "541330", setAsideType: "SBA", estimatedValue: 8100000, prob: 0.51, daysUntil: 67, recompete: false },
    { title: "Disaster Recovery Planning Services", agency: "Federal Emergency Management Agency", naicsCode: "541690", setAsideType: "SDVOSB", estimatedValue: 1500000, prob: 0.75, daysUntil: 19, recompete: true },
  ]

  const places = ["Washington, DC", "Arlington, VA", "Bethesda, MD", "Quantico, VA", "Norfolk, VA", "San Antonio, TX"]
  const priorWinners = ["Booz Allen Hamilton", "Leidos", "SAIC", "General Dynamics IT", "Peraton"]

  const opportunities = await Promise.all(
    oppData.map((o, i) => {
      const ev = o.estimatedValue * o.prob
      const breakdown = {
        naicsMatch: o.prob > 0.7 ? 0.9 : 0.6,
        setAsideMatch: o.setAsideType !== "NONE" ? 1.0 : 0.5,
        agencyHistory: Math.round(rand(0.4, 0.9) * 100) / 100,
        incumbentFlag: o.recompete ? 0.3 : 0.7,
        competitionCount: Math.floor(rand(2, 15)),
        contractSize: o.estimatedValue > 5000000 ? 0.8 : 0.95,
        deadlineUrgency: o.daysUntil < 20 ? 0.9 : 0.6,
        pastPerformance: Math.round(rand(0.5, 0.95) * 100) / 100,
      }
      return prisma.opportunity.create({
        data: {
          consultingFirmId: firm.id,
          samNoticeId: "SAM-2026-" + String(1000 + i).padStart(6, "0"),
          title: o.title,
          agency: o.agency,
          naicsCode: o.naicsCode,
          setAsideType: o.setAsideType,
          estimatedValue: o.estimatedValue,
          probabilityScore: o.prob,
          expectedValue: ev,
          isScored: true,
          isEnriched: true,
          status: "ACTIVE",
          postedDate: daysAgo(Math.floor(rand(10, 60))),
          responseDeadline: daysFromNow(o.daysUntil),
          placeOfPerformance: pick(places),
          recompeteFlag: o.recompete,
          competitionCount: Math.floor(rand(2, 15)),
          incumbentProbability: o.recompete ? rand(0.3, 0.6) : null,
          agencySmallBizRate: rand(0.3, 0.65),
          agencySdvosbRate: rand(0.1, 0.3),
          historicalAwardCount: Math.floor(rand(1, 8)),
          historicalAvgAward: o.estimatedValue * rand(0.85, 1.15),
          historicalWinner: o.recompete ? pick(priorWinners) : null,
          scoreBreakdown: { ...breakdown },
          documentIntelScore: rand(0.5, 0.95),
          scopeAlignmentScore: rand(0.5, 0.95),
          technicalComplexScore: rand(0.3, 0.85),
          incumbentSignalDetected: o.recompete && Math.random() > 0.5,
        },
      })
    })
  )

  const amendTitles = ["Response deadline extended", "Scope clarification issued", "Q&A responses posted", "Technical requirements updated"]
  await Promise.all(
    opportunities.slice(0, 8).map((opp, i) =>
      prisma.amendment.create({
        data: {
          opportunityId: opp.id,
          amendmentNo: "A000" + (i + 1),
          amendmentNumber: "Amendment " + (i + 1),
          title: pick(amendTitles),
          description: "Amendment issued in response to industry feedback and internal review.",
          issuedDate: daysAgo(Math.floor(rand(1, 20))),
          postedDate: daysAgo(Math.floor(rand(1, 25))),
          plainLanguageSummary: "Review updated requirements and revised submission instructions.",
        },
      })
    )
  )

  const awardTypes = ["Firm-Fixed-Price", "Cost-Plus-Fixed-Fee", "Time-and-Materials", "IDIQ"]
  const awardFirms = ["Booz Allen Hamilton", "Leidos", "SAIC", "General Dynamics IT", "Peraton", "ManTech International"]
  await Promise.all(
    opportunities.slice(0, 10).map((opp) =>
      prisma.awardHistory.create({
        data: {
          opportunityId: opp.id,
          awardingAgency: opp.agency,
          recipientName: pick(awardFirms),
          awardAmount: Number(opp.estimatedValue) * rand(0.9, 1.05),
          awardDate: monthsAgo(Math.floor(rand(6, 36))),
          naics: opp.naicsCode,
          contractNumber: "GS-" + String(Math.floor(rand(100, 999))) + "-" + String(Math.floor(rand(10000, 99999))),
          awardType: pick(awardTypes),
        },
      })
    )
  )

  const decisionsData = [
    { ci: 0, oi: 0, rec: "BID_PRIME", decision: "GO" as const, prob: 0.82 },
    { ci: 0, oi: 1, rec: "BID_PRIME", decision: "GO" as const, prob: 0.74 },
    { ci: 0, oi: 5, rec: "BID_PRIME", decision: "GO" as const, prob: 0.69 },
    { ci: 0, oi: 9, rec: "BID_PRIME", decision: "GO" as const, prob: 0.85 },
    { ci: 1, oi: 2, rec: "BID_PRIME", decision: "GO" as const, prob: 0.61 },
    { ci: 1, oi: 6, rec: "BID_SUB", decision: "GO" as const, prob: 0.48 },
    { ci: 1, oi: 11, rec: "NO_BID", decision: "NO_GO" as const, prob: 0.44 },
    { ci: 2, oi: 4, rec: "BID_PRIME", decision: "GO" as const, prob: 0.78 },
    { ci: 2, oi: 7, rec: "BID_PRIME", decision: "GO" as const, prob: 0.71 },
    { ci: 2, oi: 12, rec: "BID_PRIME", decision: "GO" as const, prob: 0.77 },
    { ci: 3, oi: 3, rec: "NO_BID", decision: "NO_GO" as const, prob: 0.55 },
    { ci: 3, oi: 8, rec: "BID_PRIME", decision: "GO" as const, prob: 0.63 },
    { ci: 3, oi: 13, rec: "BID_SUB", decision: "PENDING" as const, prob: 0.58 },
    { ci: 4, oi: 0, rec: "BID_PRIME", decision: "GO" as const, prob: 0.82 },
    { ci: 4, oi: 23, rec: "BID_PRIME", decision: "GO" as const, prob: 0.76 },
    { ci: 4, oi: 28, rec: "BID_PRIME", decision: "GO" as const, prob: 0.84 },
    { ci: 5, oi: 6, rec: "BID_PRIME", decision: "GO" as const, prob: 0.48 },
    { ci: 5, oi: 17, rec: "BID_SUB", decision: "PENDING" as const, prob: 0.54 },
    { ci: 6, oi: 7, rec: "BID_PRIME", decision: "GO" as const, prob: 0.71 },
    { ci: 7, oi: 3, rec: "BID_PRIME", decision: "GO" as const, prob: 0.55 },
  ]

  const bidDecisions = await Promise.all(
    decisionsData.map((d) => {
      const opp = opportunities[d.oi]
      const ev = Number(opp.estimatedValue) * d.prob
      const cost = ev * 0.08
      const nev = ev - cost
      const expJson = {
        recommendation: d.rec,
        featureBreakdown: {
          naicsMatch: d.prob > 0.7 ? "Strong NAICS alignment" : "Moderate NAICS alignment",
          setAsideEligibility: "Eligible",
          pastPerformance: "3 similar contracts in past 5 years",
          incumbentRisk: opp.recompeteFlag ? "Incumbent detected - moderate risk" : "No incumbent identified",
        },
      }
      return prisma.bidDecision.create({
        data: {
          consultingFirmId: firm.id,
          clientCompanyId: clients[d.ci].id,
          opportunityId: opp.id,
          decision: d.decision,
          recommendation: d.rec,
          rationale: "Based on " + (d.prob > 0.7 ? "strong" : "moderate") + " probability score and client capability alignment.",
          winProbability: d.prob,
          expectedRevenue: Number(opp.estimatedValue),
          proposalCostEstimate: cost,
          expectedValue: ev,
          netExpectedValue: nev,
          roiRatio: nev / cost,
          complianceStatus: d.decision === "GO" ? "APPROVED" : "PENDING",
          riskScore: Math.floor((1 - d.prob) * 100),
          explanationJson: { ...expJson },
        },
      })
    })
  )

  const submissionOpps = opportunities.slice(0, 25)
  const submissionRecords: any[] = []
  const submissionStatuses = ["APPROVED", "APPROVED", "APPROVED", "PENDING", "REJECTED"]
  for (let i = 0; i < 50; i++) {
    const wasOnTime = Math.random() > 0.2
    const monthsBack = Math.floor(i / 4) + 0.5
    const sub = await prisma.submissionRecord.create({
      data: {
        consultingFirmId: firm.id,
        clientCompanyId: clients[i % clients.length].id,
        opportunityId: submissionOpps[i % submissionOpps.length].id,
        submittedById: i % 3 === 0 ? adminUser.id : analystUser.id,
        submittedAt: monthsAgo(monthsBack),
        wasOnTime,
        penaltyAmount: wasOnTime ? 0 : 500,
        notes: wasOnTime ? null : "Submitted after deadline due to scope clarification delay",
        status: pick(submissionStatuses) as any,
      },
    })
    submissionRecords.push(sub)
  }

  const lateSubmissions = submissionRecords.filter((s: any) => !s.wasOnTime)
  await Promise.all(
    lateSubmissions.map((sub: any, i: number) =>
      prisma.financialPenalty.create({
        data: {
          consultingFirmId: firm.id,
          clientCompanyId: sub.clientCompanyId,
          submissionRecordId: sub.id,
          amount: pick([500, 750, 1000, 1250, 500]),
          penaltyType: "LATE_SUBMISSION",
          reason: "Proposal submitted after the response deadline.",
          isPaid: i % 2 === 0,
          paidAt: i % 2 === 0 ? daysAgo(Math.floor(rand(1, 30))) : null,
          appliedAt: sub.submittedAt ?? daysAgo(30),
        },
      })
    )
  )
  await prisma.financialPenalty.create({
    data: {
      consultingFirmId: firm.id,
      clientCompanyId: clients[1].id,
      amount: 2500,
      penaltyType: "NON_COMPLIANT_BID",
      reason: "Proposal did not meet mandatory formatting requirements per solicitation.",
      isPaid: true,
      paidAt: daysAgo(45),
      appliedAt: daysAgo(60),
    },
  })
  await prisma.financialPenalty.create({
    data: {
      consultingFirmId: firm.id,
      clientCompanyId: clients[3].id,
      amount: 1500,
      penaltyType: "DOCUMENT_ERROR",
      reason: "Missing SF-330 form attachment in submitted proposal package.",
      isPaid: false,
      appliedAt: daysAgo(15),
    },
  })

  await Promise.all(
    clients.map((c, i) => {
      const submitted = 8 + i * 3
      const won = Math.floor(submitted * rand(0.2, 0.45))
      const late = Math.floor(submitted * 0.15)
      const onTime = submitted - late
      return prisma.performanceStats.create({
        data: {
          clientCompanyId: c.id,
          totalOpportunities: submitted + Math.floor(rand(5, 20)),
          totalSubmitted: submitted,
          totalWon: won,
          totalLost: submitted - won,
          submissionsOnTime: onTime,
          submissionsLate: late,
          completionRate: onTime / submitted,
          totalPenalties: late * 500,
          lastCalculatedAt: daysAgo(1),
        },
      })
    })
  )

  const docTitles = [
    "SF-330 Architect-Engineer Qualifications",
    "Past Performance Questionnaire",
    "Small Business Subcontracting Plan",
    "Technical Capability Statement",
    "Price/Cost Proposal",
    "Management Plan Narrative",
    "Security Clearance Verification",
    "SAM.gov Registration Certificate",
    "Quality Control Plan",
    "Key Personnel Resumes",
    "Financial Statements (Last 3 Years)",
    "Insurance Certificate",
  ]
  const docStatuses = ["PENDING", "PENDING", "APPROVED", "APPROVED", "REJECTED"]
  await Promise.all(
    docTitles.map((title, i) =>
      prisma.documentRequirement.create({
        data: {
          consultingFirmId: firm.id,
          clientCompanyId: clients[i % clients.length].id,
          opportunityId: opportunities[i % opportunities.length].id,
          title,
          description: "Required document for proposal submission: " + title,
          dueDate: daysFromNow(Math.floor(rand(5, 60))),
          isPenaltyEnabled: true,
          penaltyAmount: pick([250, 500, 750, 1000]),
          status: pick(docStatuses),
          submittedAt: Math.random() > 0.4 ? daysAgo(Math.floor(rand(1, 20))) : null,
        },
      })
    )
  )

  const rewardTypes = ["FEE_DISCOUNT", "PRIORITY_REVIEW", "BONUS_SUBMISSION", "FEE_WAIVER"]
  const rewardDescs = [
    "10% fee discount for 3 consecutive on-time submissions",
    "Priority proposal review for perfect compliance month",
    "One free additional submission slot earned",
    "Late fee waived for first-time occurrence",
  ]
  await Promise.all(
    clients.slice(0, 5).map((c, i) =>
      prisma.complianceReward.create({
        data: {
          clientCompanyId: c.id,
          rewardType: pick(rewardTypes),
          description: pick(rewardDescs),
          value: i % 2 === 0 ? pick([250, 500]) : null,
          percentDiscount: i % 2 !== 0 ? pick([5, 10]) : null,
          isRedeemed: i < 3,
          redeemedAt: i < 3 ? daysAgo(Math.floor(rand(5, 60))) : null,
          expiresAt: daysFromNow(Math.floor(rand(30, 180))),
          triggerReason: "Consecutive on-time submissions threshold reached",
        },
      })
    )
  )

  const logEntries = [
    { type: "SUBMISSION", from: "PENDING", to: "APPROVED", reason: "Proposal reviewed and approved by compliance officer" },
    { type: "SUBMISSION", from: "PENDING", to: "REJECTED", reason: "Incomplete documentation - missing certifications" },
    { type: "BID_DECISION", from: "PENDING", to: "GO", reason: "Win probability meets threshold; client approved" },
    { type: "BID_DECISION", from: "PENDING", to: "NO_GO", reason: "Insufficient past performance for required NAICS" },
    { type: "SUBMISSION", from: "APPROVED", to: "REJECTED", reason: "Contracting officer identified formatting non-compliance" },
    { type: "BID_DECISION", from: null as any, to: "PENDING", reason: "New opportunity evaluated, awaiting client decision" },
  ]
  for (let i = 0; i < 30; i++) {
    const entry = logEntries[i % logEntries.length]
    const entityId = entry.type === "SUBMISSION"
      ? submissionRecords[i % submissionRecords.length].id
      : bidDecisions[i % bidDecisions.length].id
    await prisma.complianceLog.create({
      data: {
        consultingFirmId: firm.id,
        entityType: entry.type,
        entityId,
        fromStatus: entry.from,
        toStatus: entry.to,
        reason: entry.reason,
        triggeredBy: i % 2 === 0 ? adminUser.id : analystUser.id,
        createdAt: daysAgo(Math.floor(rand(1, 90))),
      },
    })
  }

  const jobStatusList = ["COMPLETED", "COMPLETED", "COMPLETED", "FAILED", "RUNNING"]
  for (let i = 0; i < 5; i++) {
    await prisma.ingestionJob.create({
      data: {
        consultingFirmId: firm.id,
        type: "SAM_SEARCH",
        status: jobStatusList[i],
        opportunitiesFound: i < 4 ? 40 + i * 5 : null,
        opportunitiesNew: i < 4 ? 10 + i * 2 : null,
        enrichedCount: i < 4 ? 8 + i : null,
        scoringJobsQueued: i < 4 ? 15 + i * 3 : null,
        errors: i === 3 ? 2 : 0,
        errorDetail: i === 3 ? "API rate limit exceeded after 38 records" : null,
        triggeredBy: i === 0 ? "SCHEDULED" : "MANUAL",
        startedAt: daysAgo(i + 1),
        completedAt: i < 4 ? daysAgo(i + 1) : null,
        progressCurrent: i === 4 ? 23 : null,
        progressTotal: i === 4 ? 50 : null,
        progressPhase: i === 4 ? "ENRICHING" : null,
      },
    })
  }

  await prisma.stateMunicipalSubscription.create({
    data: {
      consultingFirmId: firm.id,
      tier: "FULL",
      monthlyPrice: 299.99,
      isActive: true,
      activatedAt: monthsAgo(2),
      statesEnabled: ["VA", "MD", "DC", "TX", "FL", "CA"],
    },
  })

  const smData = [
    { title: "Virginia IT Modernization Initiative", state: "VA", level: "STATE", agency: "Virginia IT Agency", naics: "541512", value: 2100000, daysUntil: 21, portal: "eVA", jurisdiction: "Commonwealth of Virginia" },
    { title: "Maryland Cybersecurity Services", state: "MD", level: "STATE", agency: "Maryland DoIT", naics: "541519", value: 1400000, daysUntil: 35, portal: "eMMA", jurisdiction: "State of Maryland" },
    { title: "DC Metro Area Network Upgrade", state: "DC", level: "MUNICIPAL", agency: "DC Office of the CTO", naics: "541512", value: 890000, daysUntil: 18, portal: "DC Contracts", jurisdiction: "District of Columbia" },
    { title: "Texas Public Safety Software", state: "TX", level: "STATE", agency: "Texas DPS", naics: "541512", value: 3200000, daysUntil: 45, portal: "TxSmartBuy", jurisdiction: "State of Texas" },
    { title: "Fairfax County Records Management", state: "VA", level: "COUNTY", agency: "Fairfax County Government", naics: "541511", value: 560000, daysUntil: 28, portal: "eVA", jurisdiction: "Fairfax County" },
    { title: "Florida Healthcare Data Platform", state: "FL", level: "STATE", agency: "Florida AHCA", naics: "541512", value: 2800000, daysUntil: 60, portal: "MyFloridaMarketPlace", jurisdiction: "State of Florida" },
    { title: "California Transportation Analytics", state: "CA", level: "STATE", agency: "Caltrans", naics: "541614", value: 4100000, daysUntil: 72, portal: "Cal eProcure", jurisdiction: "State of California" },
    { title: "Arlington County HR System", state: "VA", level: "MUNICIPAL", agency: "Arlington County", naics: "541611", value: 420000, daysUntil: 15, portal: "eVA", jurisdiction: "Arlington County" },
    { title: "Maryland Port Authority Security", state: "MD", level: "STATE", agency: "Maryland Port Administration", naics: "541519", value: 1900000, daysUntil: 40, portal: "eMMA", jurisdiction: "State of Maryland" },
    { title: "Houston Metro Transit Management", state: "TX", level: "MUNICIPAL", agency: "METRO Houston", naics: "488510", value: 2300000, daysUntil: 55, portal: "TxSmartBuy", jurisdiction: "City of Houston" },
    { title: "Richmond City Digital Services", state: "VA", level: "MUNICIPAL", agency: "City of Richmond", naics: "541512", value: 680000, daysUntil: 25, portal: "eVA", jurisdiction: "City of Richmond" },
    { title: "Los Angeles County Cloud Migration", state: "CA", level: "COUNTY", agency: "LA County ISD", naics: "518210", value: 5500000, daysUntil: 90, portal: "Cal eProcure", jurisdiction: "Los Angeles County" },
  ]
  const setAsidePool = ["NONE", "SBE", "MBE", "WBE", "NONE", "NONE"]
  const contactPool = ["John Martinez", "Lisa Chen", "David Park", "Sarah Williams", "Michael Brown"]
  await Promise.all(
    smData.map((s, i) =>
      prisma.stateMunicipalOpportunity.create({
        data: {
          consultingFirmId: firm.id,
          contractLevel: s.level as any,
          state: s.state,
          jurisdiction: s.jurisdiction,
          sourcePortal: s.portal,
          externalId: s.state + "-" + s.level + "-" + (2026000 + i),
          title: s.title,
          agency: s.agency,
          naicsCode: s.naics,
          setAsideType: pick(setAsidePool),
          estimatedValue: s.value,
          postedDate: daysAgo(Math.floor(rand(5, 30))),
          responseDeadline: daysFromNow(s.daysUntil),
          contactName: pick(contactPool),
          status: "ACTIVE",
          probabilityScore: rand(0.45, 0.85),
          expectedValue: s.value * rand(0.5, 0.8),
          isScored: true,
        },
      })
    )
  )

  console.log("Seed complete!")
  console.log("Admin:    admin@mercyrainellc.com / Admin1234!")
  console.log("Analyst:  analyst@mercyrainellc.com / Analyst1234!")
  console.log("Portal:   aspetto@portal.com / ClientPortal1!")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
