import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "async_hooks";

export const tenantContext = new AsyncLocalStorage<{ companyId: string, isSystem?: boolean }>();

const basePrisma = new PrismaClient();

const TENANT_AWARE_MODELS = [
  "Account", "JournalGroup",
  "Expense", "SpendPolicy", "ExpenseDocument", "Ticket",
  "Notification", "AuditLog", "InviteToken"
];

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const store = tenantContext.getStore();
        
        if (store?.isSystem) {
          // Explicit system bypass
          return query(args);
        }

        if (TENANT_AWARE_MODELS.includes(model as string)) {
          if (!store?.companyId) {
            throw new Error(`CRITICAL: Attempted to query tenant-aware model '${model}' without a tenant context or system bypass.`);
          }

          const targetOperations = [
            "findUnique", "findMany", "update", "delete", 
            "findFirst", "findUniqueOrThrow", "findFirstOrThrow",
            "updateMany", "deleteMany", "count", "aggregate", "groupBy"
          ];

          if (targetOperations.includes(operation)) {
            // Safely inject company_id into the AST's where clause
            const safeArgs = (args as any) ?? {};
            safeArgs.where = { ...(safeArgs.where || {}), company_id: store.companyId };
            args = safeArgs;
          }
        }

        // Return the query directly without spawning a new connection/transaction
        return query(args);
      },
    },
    journalGroup: {
      async create({ args, query }) {
        const entries = args.data?.entries?.create;
        if (Array.isArray(entries)) {
          let totalDebits = 0n;
          let totalCredits = 0n;
          for (const entry of entries) {
            if (entry.entry_type === "DEBIT") totalDebits += BigInt(entry.amount_paise);
            else if (entry.entry_type === "CREDIT") totalCredits += BigInt(entry.amount_paise);
          }
          if (totalDebits !== totalCredits) {
            throw new Error("JournalGroup entries must balance (Debits == Credits)");
          }
        }
        return query(args);
      }
    }
  },
}) as unknown as PrismaClient; // Cast back to retain standard types while using extension

export { prisma };
export * from "@prisma/client";
