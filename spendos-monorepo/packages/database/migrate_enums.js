const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  try {
    console.log('Adding new enum values...');
    await prisma.$executeRawUnsafe(`ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PRINCIPAL';`);
    await prisma.$executeRawUnsafe(`ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN';`);
    await prisma.$executeRawUnsafe(`ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MANAGER';`);
    await prisma.$executeRawUnsafe(`ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'EMPLOYEE';`);
    await prisma.$executeRawUnsafe(`ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'VIP';`);
    
    console.log('Migrating existing rows...');
    await prisma.$executeRawUnsafe(`UPDATE users SET role = 'PRINCIPAL' WHERE role::text = 'black_card';`);
    await prisma.$executeRawUnsafe(`UPDATE users SET role = 'ADMIN' WHERE role::text = 'admin';`);
    await prisma.$executeRawUnsafe(`UPDATE users SET role = 'MANAGER' WHERE role::text = 'manager';`);
    await prisma.$executeRawUnsafe(`UPDATE users SET role = 'EMPLOYEE' WHERE role::text = 'employee';`);
    console.log('Successfully added new enum values and migrated existing user roles.');
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
run();
