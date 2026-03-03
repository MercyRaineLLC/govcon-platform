const { PrismaClient } = require('@prisma/client');
const { Queue } = require('bullmq');

const prisma = new PrismaClient();
const queue = new Queue('opportunity-scoring', {
  connection: { host: 'redis', port: 6379 }
});

async function run() {
  const opps = await prisma.opportunity.findMany({
    where: { isScored: false, status: 'ACTIVE' },
    select: { id: true, consultingFirmId: true }
  });

  console.log('Found', opps.length, 'unscored opportunities');

  for (const opp of opps) {
    await queue.add('score-opportunity', {
      opportunityId: opp.id,
      consultingFirmId: opp.consultingFirmId
    });
  }

  console.log('Done queuing', opps.length, 'jobs');
  await queue.close();
  await prisma.$disconnect();
}

run().catch(console.error);
