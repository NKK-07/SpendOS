const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const c = await prisma.company.findFirst({
    orderBy: { created_at: 'desc' },
    include: { accounts: true }
  });
  console.log('Company:', c.name, c.id);
  const g = await prisma.journalGroup.findMany({
    where: { company_id: c.id },
    include: { entries: true }
  });
  console.log('Groups:', JSON.stringify(g, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}

main().finally(() => prisma.$disconnect());
