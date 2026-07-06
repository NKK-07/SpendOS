import { prisma } from '@spendos/database';
import crypto from 'crypto';

export type AuditAction = 
  | 'user_invited'
  | 'user_registered'
  | 'user_frozen'
  | 'user_unfrozen'
  | 'user_role_changed'
  | 'expense_submitted'
  | 'expense_approved'
  | 'expense_rejected'
  | 'expense_paid'
  | 'expense_proof_requested'
  | 'ticket_raised'
  | 'ticket_resolved'
  | 'company_settings_updated'
  | 'company_created'
  | 'policy_updated'
  | 'payment_run_initiated'
  | 'payment_run_executed';

interface AuditLogPayload {
  companyId: string;
  actorId?: string; // Optional (e.g. system actions)
  action: string;
  targetId?: string; // ID of the affected user, expense, ticket, etc.
  targetType?: 'User' | 'Expense' | 'Ticket' | 'Company' | 'SpendPolicy' | 'PaymentRun';
  metadata?: Record<string, any>; // JSON metadata
  correlationId?: string;
}

/**
 * AuditService provides a centralized way to log security, operational, 
 * and financial events across the SpendOS platform.
 * It implements a cryptographically verifiable, tamper-evident hash chain.
 */
export class AuditService {
  /**
   * Log an event to the database with cryptographic chaining.
   */
  static async log(payload: AuditLogPayload, tx?: any) {
    // The hash chain is a read-modify-write of the per-company chain head: read
    // the last record, hash against its record_hash, insert. Concurrent audits
    // for the SAME company must be serialized or two writers read the same head
    // and fork the chain (verifyChainIntegrity would then report tampering).
    //
    // We serialize with a per-company advisory lock, which is transaction-scoped:
    //   - with an ambient tx (the common path, called from a service transaction):
    //     take the lock on that tx so it is held until the caller commits.
    //   - without one: open a short transaction so the lock has a scope
    //     (pg_advisory_xact_lock requires a live transaction to bind to).
    if (tx) {
      await AuditService.writeChained(tx, payload);
    } else {
      await prisma.$transaction(async (t) => {
        await AuditService.writeChained(t, payload);
      });
    }
  }

  private static async writeChained(client: any, payload: AuditLogPayload) {
    try {
      // Serialize per-company chain writes. hashtext() maps the company key to a
      // 32-bit int; the lock is released automatically when the enclosing
      // transaction commits or rolls back. Concurrent audits for OTHER companies
      // hash to different keys and are not blocked.
      await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'audit:' + payload.companyId}))`;

      // Find the last record in the chain for this company (now under the lock).
      const lastRecord = await client.auditLog.findFirst({
        where: { company_id: payload.companyId },
        orderBy: { chain_sequence: 'desc' },
      });

      const previousHash = lastRecord?.record_hash || null;

      // Deterministic JSON serialization for the hash payload
      const hashPayload: string = JSON.stringify({
        company_id: payload.companyId,
        actor_id: payload.actorId || "SYSTEM",
        action: payload.action,
        target_id: payload.targetId || null,
        target_type: payload.targetType || null,
        metadata: payload.metadata || null,
        correlation_id: payload.correlationId || null,
        previous_hash: previousHash
      });

      const recordHash: string = crypto.createHash('sha256').update(hashPayload).digest('hex');

      await client.auditLog.create({
        data: {
          company_id: payload.companyId,
          actor_id: payload.actorId || "SYSTEM",
          action: payload.action,
          target_id: payload.targetId,
          target_type: payload.targetType,
          metadata: payload.metadata || {},
          correlation_id: payload.correlationId,
          previous_hash: previousHash,
          record_hash: recordHash
        },
      });
    } catch (error) {
      console.error('[AuditService] Failed to write audit log:', error);
      // In Enterprise systems, we typically THROW here if the audit log fails,
      // as a missing log is a compliance violation.
      throw new Error('Audit log write failed, transaction aborted.');
    }
  }

  /**
   * Retrieve audit logs for a company with optional filters
   */
  static async getLogs(companyId: string, options?: { actorId?: string; targetId?: string; action?: AuditAction; limit?: number }) {
    return prisma.auditLog.findMany({
      where: {
        company_id: companyId,
        actor_id: options?.actorId,
        target_id: options?.targetId,
        action: options?.action,
      },
      orderBy: { created_at: 'desc' },
      take: options?.limit || 50,
      include: {
        actor: { select: { full_name: true, role: true, email: true } }
      }
    });
  }

  /**
   * Verifies the integrity of the audit log chain for a given company.
   * Throws an error if tampering is detected.
   */
  static async verifyChainIntegrity(companyId: string): Promise<boolean> {
    const logs = await prisma.auditLog.findMany({
      where: { company_id: companyId },
      orderBy: { chain_sequence: 'asc' }
    });

    let expectedPreviousHash: string | null = null;

    for (const log of logs) {
      if (log.previous_hash !== expectedPreviousHash) {
        console.error(`[AuditService] Chain broken at sequence ${log.chain_sequence}.`);
        return false;
      }

      const hashPayload: string = JSON.stringify({
        company_id: log.company_id,
        actor_id: log.actor_id,
        action: log.action,
        target_id: log.target_id,
        target_type: log.target_type,
        metadata: log.metadata && Object.keys(log.metadata).length ? log.metadata : null,
        correlation_id: log.correlation_id,
        previous_hash: log.previous_hash
      });

      const computedHash: string = crypto.createHash('sha256').update(hashPayload).digest('hex');

      if (computedHash !== log.record_hash) {
        console.error(`[AuditService] Record hash mismatch at sequence ${log.chain_sequence}.`);
        return false;
      }

      expectedPreviousHash = log.record_hash;
    }

    return true;
  }
}
