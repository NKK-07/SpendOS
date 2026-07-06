const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  try {
    console.log('Migrating invite_tokens roles...');
    await prisma.$executeRawUnsafe(`UPDATE invite_tokens SET role = 'PRINCIPAL' WHERE role::text = 'black_card';`);
    await prisma.$executeRawUnsafe(`UPDATE invite_tokens SET role = 'ADMIN' WHERE role::text = 'admin';`);
    await prisma.$executeRawUnsafe(`UPDATE invite_tokens SET role = 'MANAGER' WHERE role::text = 'manager';`);
    await prisma.$executeRawUnsafe(`UPDATE invite_tokens SET role = 'EMPLOYEE' WHERE role::text = 'employee';`);
    console.log('Successfully updated invite_tokens.');
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
run();
