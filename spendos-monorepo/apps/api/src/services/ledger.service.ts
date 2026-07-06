import { prisma } from "@spendos/database";

export class LedgerService {
  static async getWallets(companyId: string, take: number = 50, cursor?: string) {
    const takeLimit = Math.min(Number(take) || 50, 100);
    const wallets = await prisma.wallet.findMany({
      where: { user: { company_id: companyId } },
      include: { user: { select: { id: true, full_name: true } }, account: true },
      take: takeLimit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    
    let nextCursor = null;
    if (wallets.length > takeLimit) {
      const nextItem = wallets.pop();
      nextCursor = nextItem!.id;
    }

    if (wallets.length === 0) return { data: [], meta: { nextCursor, hasMore: !!nextCursor } };

    const accountIds = wallets.map(w => w.account_id);
    const latestEntries = await prisma.journalEntry.findMany({
      where: { account_id: { in: accountIds } },
      orderBy: { sequence_number: "desc" },
      distinct: ['account_id'],
      select: { account_id: true, running_balance: true }
    });
    
    const balances = new Map(latestEntries.map(e => [e.account_id, e.running_balance]));

    const data = wallets.map(w => ({
      ...w,
      balancePaise: balances.get(w.account_id) || 0n
    }));

    return { data, meta: { nextCursor, hasMore: !!nextCursor } };
  }

  static async getLedger(companyId: string, take: number = 50, cursor?: string) {
    const takeLimit = Math.min(Number(take) || 50, 100);
    const entries = await prisma.journalEntry.findMany({
      where: { account: { company_id: companyId } },
      orderBy: { sequence_number: "desc" },
      include: { account: { select: { id: true, name: true, account_type: true } }, journal_group: { select: { id: true, transaction_type: true, description: true } } },
      take: takeLimit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    
    let nextCursor = null;
    if (entries.length > takeLimit) {
      const nextItem = entries.pop();
      nextCursor = nextItem!.id;
    }
    return { data: entries, meta: { nextCursor, hasMore: !!nextCursor } };
  }

  static async getJournalGroups(companyId: string, take: number = 50, cursor?: string) {
    const takeLimit = Math.min(Number(take) || 50, 100);
    const groups = await prisma.journalGroup.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: "desc" },
      take: takeLimit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    let nextCursor = null;
    if (groups.length > takeLimit) {
      const nextItem = groups.pop();
      nextCursor = nextItem!.id;
    }
    return { data: groups, meta: { nextCursor, hasMore: !!nextCursor } };
  }
}
