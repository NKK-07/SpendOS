/**
 * Ledger Unit Tests — Double-Entry Accounting Verification
 * 
 * These tests verify the core financial invariants of the SpendOS ledger:
 * 1. Debits must equal Credits (balanced journal entries)
 * 2. Negative-amount entries are rejected
 * 3. Zero-sum transactions are rejected
 * 4. Idempotency keys prevent duplicate ledger writes
 * 5. Insufficient funds are caught before write
 * 6. Running balances are computed correctly
 */

import { createJournalGroupWithTx } from "../index";
import { EntryType, TransactionType, NormalBalance, AccountType } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// MOCK SETUP — We mock the Prisma transaction context to isolate ledger logic
// ─────────────────────────────────────────────────────────────────────────────

function createMockTx(options?: {
  existingIdempotencyKey?: any;
  lastEntryBalance?: bigint;
  accountNormalBalance?: NormalBalance;
}) {
  const { 
    existingIdempotencyKey = null, 
    lastEntryBalance = 0n, 
    accountNormalBalance = NormalBalance.DEBIT 
  } = options || {};

  let journalGroupCounter = 0;
  let journalEntryCounter = 0;

  return {
    idempotencyKey: {
      findUnique: jest.fn().mockResolvedValue(existingIdempotencyKey),
      create: jest.fn().mockResolvedValue({}),
    },
    journalGroup: {
      create: jest.fn().mockImplementation(({ data }) => {
        journalGroupCounter++;
        return Promise.resolve({ id: `jg-${journalGroupCounter}`, ...data });
      }),
    },
    journalEntry: {
      findFirst: jest.fn().mockResolvedValue(
        lastEntryBalance !== 0n 
          ? { running_balance: lastEntryBalance } 
          : null
      ),
      create: jest.fn().mockImplementation(({ data }) => {
        journalEntryCounter++;
        return Promise.resolve({ id: `je-${journalEntryCounter}`, ...data });
      }),
    },
    account: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: "acc-1",
        normal_balance: accountNormalBalance,
        account_type: AccountType.ASSET,
      }),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("Ledger: createJournalGroupWithTx", () => {
  
  // ── Invariant 1: Balanced Entries ──────────────────────────────────────
  describe("Double-Entry Balance Invariant", () => {
    it("should REJECT unbalanced entries (Debits ≠ Credits)", async () => {
      const tx = createMockTx();
      
      await expect(
        createJournalGroupWithTx(tx as any, {
          transactionType: TransactionType.EXPENSE_REIMBURSEMENT,
          description: "Unbalanced test",
          entries: [
            { accountId: "acc-debit", entryType: EntryType.DEBIT, amountPaise: 10000n },
            { accountId: "acc-credit", entryType: EntryType.CREDIT, amountPaise: 5000n },
          ],
        })
      ).rejects.toThrow("Journal entries must balance (Debits == Credits)");
    });

    it("should ACCEPT perfectly balanced entries", async () => {
      const tx = createMockTx({ lastEntryBalance: 100000n });

      const result = await createJournalGroupWithTx(tx as any, {
        transactionType: TransactionType.EXPENSE_REIMBURSEMENT,
        description: "Balanced reimbursement",
        entries: [
          { accountId: "acc-debit", entryType: EntryType.DEBIT, amountPaise: 50000n },
          { accountId: "acc-credit", entryType: EntryType.CREDIT, amountPaise: 50000n },
        ],
      });

      expect(result).toBeDefined();
      expect(result.journalGroup).toBeDefined();
      expect(result.entries).toHaveLength(2);
      expect(tx.journalGroup.create).toHaveBeenCalledTimes(1);
      expect(tx.journalEntry.create).toHaveBeenCalledTimes(2);
    });
  });

  // ── Invariant 2: Positive Amounts Only ────────────────────────────────
  describe("Amount Validation", () => {
    it("should REJECT negative entry amounts", async () => {
      const tx = createMockTx();
      
      await expect(
        createJournalGroupWithTx(tx as any, {
          transactionType: TransactionType.EXPENSE_REIMBURSEMENT,
          description: "Negative amount test",
          entries: [
            { accountId: "acc-debit", entryType: EntryType.DEBIT, amountPaise: -5000n },
            { accountId: "acc-credit", entryType: EntryType.CREDIT, amountPaise: -5000n },
          ],
        })
      ).rejects.toThrow("Individual entry amounts must be greater than zero");
    });

    it("should REJECT zero-sum transactions", async () => {
      const tx = createMockTx();
      
      await expect(
        createJournalGroupWithTx(tx as any, {
          transactionType: TransactionType.EXPENSE_REIMBURSEMENT,
          description: "Zero-sum test",
          entries: [],
        })
      ).rejects.toThrow("Total transaction amount must be greater than zero");
    });
  });

  // ── Invariant 3: Idempotency ──────────────────────────────────────────
  describe("Idempotency Protection", () => {
    it("should return cached snapshot when idempotency key is reused with same payload", async () => {
      const cachedSnapshot = { journalGroup: { id: "cached-jg" }, entries: [] };
      const requestHash = require("crypto")
        .createHash("sha256")
        .update(JSON.stringify([
          { accountId: "acc-debit", entryType: EntryType.DEBIT, amountPaise: "50000" },
          { accountId: "acc-credit", entryType: EntryType.CREDIT, amountPaise: "50000" },
        ]))
        .digest("hex");

      const tx = createMockTx({
        existingIdempotencyKey: { 
          key: "test-key", 
          request_hash: requestHash, 
          response_snapshot: cachedSnapshot 
        },
      });

      const result = await createJournalGroupWithTx(tx as any, {
        transactionType: TransactionType.EXPENSE_REIMBURSEMENT,
        description: "Duplicate test",
        idempotencyKey: "test-key",
        requestHash: requestHash,
        entries: [
          { accountId: "acc-debit", entryType: EntryType.DEBIT, amountPaise: 50000n },
          { accountId: "acc-credit", entryType: EntryType.CREDIT, amountPaise: 50000n },
        ],
      });

      // Should return cached result without creating new entries
      expect(result).toEqual(cachedSnapshot);
      expect(tx.journalGroup.create).not.toHaveBeenCalled();
    });

    it("should REJECT reused idempotency key with different payload", async () => {
      const tx = createMockTx({
        existingIdempotencyKey: { key: "test-key", request_hash: "different-hash", response_snapshot: {} },
      });

      await expect(
        createJournalGroupWithTx(tx as any, {
          transactionType: TransactionType.EXPENSE_REIMBURSEMENT,
          description: "Mismatched idempotency test",
          idempotencyKey: "test-key",
          entries: [
            { accountId: "acc-debit", entryType: EntryType.DEBIT, amountPaise: 50000n },
            { accountId: "acc-credit", entryType: EntryType.CREDIT, amountPaise: 50000n },
          ],
        })
      ).rejects.toThrow("Idempotency key reused for a different request payload");
    });
  });

  // ── Invariant 4: Insufficient Funds ───────────────────────────────────
  describe("Insufficient Funds Protection", () => {
    it("should REJECT a CREDIT entry that would cause a DEBIT-normal account to go negative", async () => {
      // Account has 100 paise balance, trying to credit 500 paise (which subtracts from a DEBIT-normal account)
      const tx = createMockTx({ 
        lastEntryBalance: 100n, 
        accountNormalBalance: NormalBalance.DEBIT 
      });

      await expect(
        createJournalGroupWithTx(tx as any, {
          transactionType: TransactionType.EXPENSE_REIMBURSEMENT,
          description: "Overdraft test",
          entries: [
            { accountId: "acc-debit", entryType: EntryType.CREDIT, amountPaise: 500n },
            { accountId: "acc-credit", entryType: EntryType.DEBIT, amountPaise: 500n },
          ],
        })
      ).rejects.toThrow("Insufficient funds");
    });
  });

  // ── Invariant 5: Running Balance Computation ──────────────────────────
  describe("Running Balance Computation", () => {
    it("should correctly compute running balance for DEBIT-normal accounts", async () => {
      const tx = createMockTx({ lastEntryBalance: 10000n, accountNormalBalance: NormalBalance.DEBIT });

      await createJournalGroupWithTx(tx as any, {
        transactionType: TransactionType.EXPENSE_REIMBURSEMENT,
        description: "Balance computation test",
        entries: [
          { accountId: "acc-debit", entryType: EntryType.DEBIT, amountPaise: 5000n },
          { accountId: "acc-credit", entryType: EntryType.CREDIT, amountPaise: 5000n },
        ],
      });

      // First entry: DEBIT on DEBIT-normal = 10000 + 5000 = 15000
      expect(tx.journalEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            running_balance: 15000n,
            entry_type: EntryType.DEBIT,
          }),
        })
      );
    });
  });

  // ── Invariant 6: Pessimistic Locking ──────────────────────────────────
  describe("Pessimistic Locking", () => {
    it("should acquire FOR UPDATE locks on accounts before writing", async () => {
      const tx = createMockTx({ lastEntryBalance: 100000n });

      await createJournalGroupWithTx(tx as any, {
        transactionType: TransactionType.EXPENSE_REIMBURSEMENT,
        description: "Lock test",
        entries: [
          { accountId: "acc-debit", entryType: EntryType.DEBIT, amountPaise: 1000n },
          { accountId: "acc-credit", entryType: EntryType.CREDIT, amountPaise: 1000n },
        ],
      });

      // $executeRaw should be called for each unique account to acquire row locks
      expect(tx.$executeRaw).toHaveBeenCalled();
    });
  });
});
