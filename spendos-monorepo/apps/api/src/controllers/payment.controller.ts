import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma, PaymentRunStatus } from '@spendos/database';
import { MFAService } from '../services/mfa.service';

export class PaymentController {
  
  /**
   * Execute a payment run with Four-Eyes principle, MFA Elevation, and Replay Protection.
   */
  static async executePaymentRun(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const { idempotencyKey, nonce } = req.body as { idempotencyKey: string; nonce: string };
    const mfaElevationToken = req.headers['x-elevation-token'] as string;
    
    // 1. Basic user context (assuming Fastify auth middleware populates req.user)
    const user = (req as any).user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    // 2. Validate MFA Elevation Token for Payment Execution
    const isValidToken = MFAService.validateElevationToken(
      mfaElevationToken,
      'payment_execute',
      {
        userId: user.userId,
        sessionId: (req as any).session?.id || 'unknown',
        deviceId: req.headers['x-device-id'] as string || 'unknown',
        ipSubnet: req.ip
      }
    );

    if (!isValidToken) {
      return reply.status(403).send({ error: 'Valid MFA Elevation Token required.' });
    }

    // 3. Replay Protection & Idempotency Coupling
    // Validate the nonce and idempotency key combination
    const requestHash = require('crypto').createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
    
    try {
      await prisma.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          request_hash: requestHash,
          nonce: nonce
        }
      });
    } catch (e) {
      // Prisma P2002 error means duplicate nonce or idempotency key
      return reply.status(409).send({ error: 'Replay detected or idempotency key already used.' });
    }

    // 4. Fetch Payment Run and enforce State Machine / Four-Eyes
    const paymentRun = await prisma.paymentRun.findUnique({ where: { id } });
    if (!paymentRun) return reply.status(404).send({ error: 'Payment run not found.' });

    if (paymentRun.initiated_by === user.userId) {
      return reply.status(403).send({ error: 'Four-Eyes Violation: Initiator cannot execute the payment.' });
    }

    if (paymentRun.status !== PaymentRunStatus.APPROVED) {
      return reply.status(400).send({ error: `State Machine Violation: Cannot execute from status ${paymentRun.status}. Must be APPROVED.` });
    }

    // 5. Execute the transition (Wrapped in a transaction to trigger DB-level SQL constraints)
    try {
      const updatedRun = await prisma.$transaction(async (tx) => {
        // Mark as executing
        const updated = await tx.paymentRun.update({
          where: { id },
          data: {
            status: PaymentRunStatus.PENDING_BANK_PROCESSING,
            approved_by: user.userId,
            approved_at: new Date()
          }
        });

        // Store response snapshot for idempotency
        await tx.idempotencyKey.update({
          where: { key: idempotencyKey },
          data: { response_snapshot: { status: 'PENDING_BANK_PROCESSING', runId: id } }
        });

        return updated;
      });

      return reply.send({ success: true, paymentRun: updatedRun });
    } catch (dbError: any) {
      // If the PostgreSQL Trigger fires, it will be caught here
      return reply.status(500).send({ error: 'Database Constraint Failed', detail: dbError.message });
    }
  }
}
