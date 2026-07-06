import { prisma, EntryType, AccountType, NormalBalance, TransactionType } from "@spendos/database";
import * as crypto from "crypto";

export async function createJournalGroupWithTx(tx: any, data: {
  companyId?: string;
  actorId?: string;
  transactionType: TransactionType;
  description: string;
  transactionId?: string;
  entries: {
    accountId: string;
    entryType: EntryType;
    amountPaise: bigint;
  }[];
  idempotencyKey?: string;
  requestHash?: string;
}) {
  const { companyId, actorId, transactionType, description, transactionId, entries, idempotencyKey } = data;

  if (entries.some(e => e.amountPaise <= 0n)) {
    throw new Error("Individual entry amounts must be greater than zero");
  }

  const totalDebits = entries.filter((e) => e.entryType === EntryType.DEBIT).reduce((acc, e) => acc + e.amountPaise, 0n);
  const totalCredits = entries.filter((e) => e.entryType === EntryType.CREDIT).reduce((acc, e) => acc + e.amountPaise, 0n);

  if (totalDebits !== totalCredits) {
    throw new Error("Journal entries must balance (Debits == Credits)");
  }
  if (totalDebits <= 0n) {
    throw new Error("Total transaction amount must be greater than zero");
  }

  const requestHash = data.requestHash || crypto.createHash('sha256').update(JSON.stringify({ companyId, actorId, transactionType, description, entries }, (key, value) => typeof value === 'bigint' ? value.toString() : value)).digest('hex');

  // 1. Check Idempotency if provided
  if (idempotencyKey) {
    const existing = await tx.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw new Error("Idempotency key reused for a different request payload");
      }
      return existing.response_snapshot;
    }
  }

  // 2. Sort accounts by UUID ascending for deterministic locking
  const accountIds = Array.from(new Set(entries.map(e => e.accountId))).sort();
  
  // 3. Acquire pessimistic advisory locks on accounts to prevent concurrency corruption
  for (const accId of accountIds) {
    // Generate a consistent 64-bit integer hash from the UUID for the advisory lock
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(left(${accId}::text, 18)), hashtext(right(${accId}::text, 18)))`;
  }


  // 4. Create Journal Group
  const journalGroup = await tx.journalGroup.create({
    data: {
      description,
      transaction_type: transactionType,
      transaction_id: transactionId,
      actor_id: actorId,
      company_id: companyId,
    },
  });

  // 5. Calculate running balances and create entries
  const journalEntries = [];
  for (const entry of entries) {
    const account = await tx.account.findUniqueOrThrow({ where: { id: entry.accountId } });
    
    // Get previous running balance with strict deterministic ordering
    const lastEntry = await tx.journalEntry.findFirst({
      where: { account_id: entry.accountId },
      orderBy: { sequence_number: "desc" },
    });
    
    let previousBalance = lastEntry ? BigInt(lastEntry.running_balance) : 0n;
    let amountPaise = BigInt(entry.amountPaise);
    let newBalance = previousBalance;

    if (account.normal_balance === NormalBalance.DEBIT) {
      newBalance += (entry.entryType === EntryType.DEBIT ? amountPaise : -amountPaise);
    } else {
      newBalance += (entry.entryType === EntryType.CREDIT ? amountPaise : -amountPaise);
    }

    if (newBalance < 0n && account.account_type === AccountType.ASSET) {
      throw new Error(`Insufficient funds for asset account ${entry.accountId}`);
    }

    const je = await tx.journalEntry.create({
      data: {
        journal_group_id: journalGroup.id,
        account_id: entry.accountId,
        entry_type: entry.entryType,
        amount_paise: amountPaise,
        running_balance: newBalance,
      },
    });
    journalEntries.push(je);
  }

  const snapshot = { journalGroup, entries: journalEntries };

  // 6. Record idempotency if provided
  if (idempotencyKey) {
    // Convert BigInts and Dates for JSON serialization
    const serializedSnapshot = JSON.parse(JSON.stringify(snapshot, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));

    await tx.idempotencyKey.create({
      data: {
        key: idempotencyKey,
        request_hash: requestHash,
        response_snapshot: serializedSnapshot,
      },
    });
  }

  return snapshot;
}

export async function createJournalGroup(data: Parameters<typeof createJournalGroupWithTx>[1]) {
  return await prisma.$transaction(async (tx) => {
    return createJournalGroupWithTx(tx, data);
  }, { maxWait: 300000, timeout: 300000 });
}
