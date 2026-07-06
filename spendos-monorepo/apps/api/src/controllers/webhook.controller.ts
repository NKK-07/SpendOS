import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { prisma } from '@spendos/database';
import { env } from '../config';

export class WebhookController {
  private static readonly MAX_SKEW_MS = 5 * 60 * 1000;

  /**
   * Endpoint for AWS EventBridge / Lambda to push Malware Scan results.
   * Enforces HMAC signature validation (over the raw request bytes) and event
   * replay deduplication.
   *
   * NOTE: the route that mounts this handler MUST capture the raw request body
   * onto `request.rawBody` (a content-type parser that stores the untouched
   * bytes). The signature is computed over those exact bytes — re-serializing
   * the parsed `request.body` changes key order/spacing and would never match.
   */
  static async handleMalwareScanResult(req: FastifyRequest, reply: FastifyReply) {
    const secret = env.WEBHOOK_HMAC_SECRET;
    if (!secret) {
      // Fail closed: never accept a webhook we cannot cryptographically verify.
      // No hardcoded dev secret fallback.
      return reply.status(503).send({ error: 'Webhook verification is not configured.' });
    }

    const signature = req.headers['x-signature'] as string | undefined;
    const timestamp = req.headers['x-timestamp'] as string | undefined;
    if (!signature || !timestamp) {
      return reply.status(401).send({ error: 'Missing webhook signature headers.' });
    }

    // Reject clock skew in BOTH directions. The original code only checked that
    // the timestamp was not too old, so an attacker could present a FUTURE
    // timestamp (negative age) and sail past the freshness gate.
    const ts = parseInt(timestamp, 10);
    if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > WebhookController.MAX_SKEW_MS) {
      return reply.status(401).send({ error: 'Webhook timestamp invalid or expired.' });
    }

    // HMAC over the EXACT raw bytes the sender signed.
    const rawBody = (req as any).rawBody;
    if (typeof rawBody !== 'string') {
      return reply.status(400).send({ error: 'Raw request body unavailable for signature verification.' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    // Constant-time comparison. Length guard first because timingSafeEqual throws
    // on unequal-length buffers (and a bad hex string decodes to a short buffer).
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expectedSignature, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return reply.status(401).send({ error: 'Invalid HMAC signature.' });
    }

    // Parse from the verified raw bytes (not req.body, which may not exist if the
    // route bypassed Fastify's JSON parser to preserve the raw body).
    let parsed: { event_id?: string; document_id?: string; status?: 'CLEAN' | 'INFECTED'; details?: string };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return reply.status(400).send({ error: 'Malformed JSON body.' });
    }

    const { event_id, document_id, status, details } = parsed;
    if (!event_id || !document_id || !status) {
      return reply.status(400).send({ error: 'Missing required fields (event_id, document_id, status).' });
    }

    // Replay deduplication: the unique (key/nonce) insert fails for a repeat event.
    try {
      await prisma.idempotencyKey.create({
        data: {
          key: `webhook_event_${event_id}`,
          request_hash: expectedSignature,
          nonce: event_id,
        },
      });
    } catch (e) {
      // Prisma P2002 -> event_id already processed.
      return reply.send({ success: true, message: 'Event already processed (Idempotent success).' });
    }

    if (status === 'INFECTED') {
      console.warn(`[Security] Malware detected in document ${document_id}. Details: ${details}`);
      // Here we would delete the object from S3 quarantine or move it to a cold vault.
    } else {
      console.log(`[Security] Document ${document_id} marked CLEAN.`);
      // Move from quarantine bucket to production bucket.
    }

    return reply.send({ success: true, processed: true });
  }
}
