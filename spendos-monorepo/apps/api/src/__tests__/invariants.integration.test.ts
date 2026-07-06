import { fastify } from "../server";
import { prisma } from "@spendos/database";
import { redis } from "../services/redis.service";
import crypto from "crypto";
import { tenantContext } from "@spendos/database";

const uuidv4 = () => crypto.randomUUID();

describe("Database Ledger Invariants", () => {
  beforeAll(async () => {
    await fastify.ready();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redis.quit();
    await fastify.close();
  });

  it("should block a JournalGroup where Debits != Credits (Trigger Enforcement)", async () => {
    const companyId = uuidv4();
    const account1Id = uuidv4();
    const account2Id = uuidv4();
    const uniqueEmail = `test-${Date.now()}-${uuidv4().slice(0,8)}@invariant.com`;

    await tenantContext.run({ companyId, isSystem: true }, async () => {
      // 1. Setup mock company & accounts
      await prisma.company.create({
        data: {
          id: companyId,
          name: "Ledger Invariant Co",
          email_domain: uniqueEmail,
        }
      });

      await prisma.account.createMany({
        data: [
          { id: account1Id, company_id: companyId, name: "Asset", account_type: "ASSET", normal_balance: "DEBIT" },
          { id: account2Id, company_id: companyId, name: "Expense", account_type: "EXPENSE", normal_balance: "DEBIT" },
        ]
      });

      // 2. Attempt to create unbalanced JournalGroup
      const unbalancedAttempt = prisma.journalGroup.create({
        data: {
          transaction_type: "SYSTEM_BOOTSTRAP",
          description: "Unbalanced Ledger Test",
          company_id: companyId,
          entries: {
            create: [
              {
                account_id: account1Id,
                entry_type: "DEBIT",
                amount_paise: 1000n,
                running_balance: 1000n,
              },
              {
                account_id: account2Id,
                entry_type: "CREDIT",
                amount_paise: 900n,
                running_balance: 0n,
              }
            ]
          }
        }
      });

      // 3. Verify PostgreSQL Trigger or Prisma constraints explicitly reject it
      await expect(unbalancedAttempt).rejects.toThrow();
    });
  }, 15000);
});
