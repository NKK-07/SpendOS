const { prisma } = require("@spendos/database");
console.log("prisma object keys:", prisma ? Object.keys(prisma) : "undefined");
console.log("prisma type:", typeof prisma);
console.log("prisma.company type:", typeof prisma?.company);
console.log("prisma.employee type:", typeof prisma?.employee);
