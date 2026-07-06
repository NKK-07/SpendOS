import { prisma, UserRole } from "@spendos/database";
import { redis } from "./redis.service";

export class ActivityService {
  /** Redis key for the company-wide pulse (PRINCIPAL/ADMIN/VIP). */
  static pulseGlobalKey(companyId: string): string {
    return `pulse:global:${companyId}`;
  }

  /** Redis key for a single user's personal pulse (MANAGER/EMPLOYEE). */
  static pulseUserKey(userId: string): string {
    return `pulse:user:${userId}`;
  }

  /**
   * Evicts the pulse cache entries a mutation can invalidate: always the
   * company-wide view, and — when a submitter is known — that submitter's
   * personal view. This is the single source of truth for which keys to drop;
   * callers must not hand-build pulse keys (that drift caused the original bug
   * where approve/reject deleted a `pulse:{companyId}` key that never existed).
   *
   * Errors are swallowed: a stale cache entry is cheap and self-heals on its
   * next 5-minute TTL, but breaking the underlying mutation over a Redis blip
   * is not acceptable.
   */
  static async invalidatePulse(companyId: string, submittedBy?: string): Promise<void> {
    const keys = [ActivityService.pulseGlobalKey(companyId)];
    if (submittedBy) keys.push(ActivityService.pulseUserKey(submittedBy));
    try {
      await redis.del(...keys);
    } catch (err: any) {
      console.error("[Redis] Pulse cache eviction failed:", err.message);
    }
  }

  static async getDashboardPulse(actor: any) {
    const isGlobal = [UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.VIP].includes(actor.role);
    const needsTrend = [UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.VIP].includes(actor.role);
    const needsDisbursals = [UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.EMPLOYEE].includes(actor.role);

    // Cache key must include role-scope or user ID. Built via the shared
    // key-builders so eviction (invalidatePulse) can never drift from reads.
    const cacheKey = isGlobal
      ? ActivityService.pulseGlobalKey(actor.companyId)
      : ActivityService.pulseUserKey(actor.userId);
    let cached = null;
    try {
      cached = await redis.get(cacheKey);
    } catch (err: any) {
      console.error("[Redis] Pulse cache read failed:", err.message);
    }

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const baseWhere: any = { company_id: actor.companyId };
    if (!isGlobal) {
      baseWhere.submitted_by = actor.userId;
    }

    const [totalApproved, prevApproved, categories, pendingCount] = await Promise.all([
      prisma.expense.aggregate({
        where: { ...baseWhere, status: "approved", created_at: { gte: startOfMonth } },
        _sum: { amount_paise: true },
      }),
      prisma.expense.aggregate({
        where: { ...baseWhere, status: "approved", created_at: { gte: startOfPrevMonth, lt: startOfMonth } },
        _sum: { amount_paise: true },
      }),
      prisma.expense.groupBy({
        by: ['category'],
        where: { ...baseWhere, status: "approved" },
        _sum: { amount_paise: true },
        orderBy: { _sum: { amount_paise: "desc" } },
      }),
      prisma.expense.count({
        where: { ...baseWhere, status: "submitted" },
      }),
    ] as const);

    const currentVelocity: bigint = (totalApproved._sum as { amount_paise: bigint | null }).amount_paise ?? 0n;
    const prevVelocity: bigint = (prevApproved._sum as { amount_paise: bigint | null }).amount_paise ?? 0n;

    const response: any = {
      velocity: currentVelocity.toString(),
      prevVelocity: prevVelocity.toString(),
      categories: categories.map((c: any) => ({
        category: c.category,
        amount: (c._sum.amount_paise ?? 0n).toString(),
      })),
      pendingApprovals: pendingCount,
      timestamp: new Date().toISOString(),
    };

    // ── 30-day daily spend trend (Admin, VIP, Principal) ──────────────────────
    if (needsTrend) {
      const trendRows = await prisma.expense.findMany({
        where: {
          ...baseWhere,
          status: "approved",
          expense_date: { gte: thirtyDaysAgo },
        },
        select: { expense_date: true, amount_paise: true },
        orderBy: { expense_date: "asc" },
      });

      // Aggregate by date string (YYYY-MM-DD) in application code to avoid
      // raw SQL and stay Prisma-idiomatic.
      const dailyMap = new Map<string, bigint>();
      for (const row of trendRows) {
        const key = row.expense_date.toISOString().slice(0, 10);
        dailyMap.set(key, (dailyMap.get(key) ?? 0n) + row.amount_paise);
      }

      // Fill every day in the window so the chart has a continuous x-axis.
      const spendTrend: Array<{ date: string; amount: string }> = [];
      for (let i = 0; i < 30; i++) {
        const d = new Date(thirtyDaysAgo);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        spendTrend.push({ date: key, amount: (dailyMap.get(key) ?? 0n).toString() });
      }
      response.spend_trend = spendTrend;
    }

    // ── Recent disbursals (Admin, Principal, Employee) ────────────────────────
    if (needsDisbursals) {
      const recentExpenses = await prisma.expense.findMany({
        where: { ...baseWhere, status: "approved" },
        select: {
          merchant_name: true,
          category: true,
          amount_paise: true,
        },
        orderBy: { updated_at: "desc" },
        take: 10,
      });

      response.recent_disbursals = recentExpenses.map((e) => ({
        merchant: e.merchant_name ?? "Unknown",
        category: e.category,
        amount: e.amount_paise.toString(),
      }));
    }

    // ── Global operational metrics (Admin, VIP, Principal) ────────────────────
    if (isGlobal) {
      const [flagged, policies, teamSize] = await Promise.all([
        prisma.expense.count({
          where: { company_id: actor.companyId, status: "rejected" },
        }),
        prisma.spendPolicy.count({
          where: { company_id: actor.companyId },
        }),
        // Company headcount — drives the founder onboarding "invite your team"
        // step. User is not a tenant-aware model, so scope explicitly.
        prisma.user.count({
          where: { company_id: actor.companyId },
        }),
      ]);
      response.flaggedItems = flagged;
      response.activePolicies = policies;
      response.teamSize = teamSize;
    }

    // ── Manager / Employee personal limit utilization (future) ───────────────
    if (actor.role === UserRole.MANAGER || actor.role === UserRole.EMPLOYEE) {
      response.limitUtilization = "0%"; // TBD: Budget feature
    }

    try {
      await redis.set(cacheKey, JSON.stringify(response), "EX", 300);
    } catch (err: any) {
      console.error("[Redis] Pulse cache write failed:", err.message);
    }

    return response;
  }

  static async getActivity(actor: any, take: number, cursor?: string) {
    const where: any = { company_id: actor.companyId };
    const canViewAll = [UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.VIP, UserRole.MANAGER].includes(actor.role);
    if (!canViewAll) {
      const myExpenses = await prisma.expense.findMany({ where: { submitted_by: actor.userId }, select: { id: true } });
      where.target_type = "expense";
      where.target_id = { in: myExpenses.map(e => e.id) };
    }

    const limitLimit = Math.min(take, 100);
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: limitLimit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { actor: { select: { id: true, full_name: true, role: true } } },
    });

    let nextCursor = null;
    if (logs.length > limitLimit) {
      const nextItem = logs.pop();
      nextCursor = nextItem!.id;
    }

    return { data: logs, meta: { nextCursor, hasMore: !!nextCursor } };
  }

  static async getAuditLog(actor: any, page: number, limit: number) {
    const limitBounded = Math.min(limit, 100);
    const logs = await prisma.auditLog.findMany({
      where: { company_id: actor.companyId },
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limitBounded,
      take: limitBounded + 1,
      include: { actor: { select: { id: true, full_name: true, role: true } } },
    });

    let hasMore = false;
    if (logs.length > limitBounded) {
      logs.pop();
      hasMore = true;
    }

    return { data: logs, meta: { hasMore, nextPage: hasMore ? page + 1 : null } };
  }
}

