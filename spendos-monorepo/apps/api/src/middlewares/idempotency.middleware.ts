import { FastifyBaseLogger, FastifyInstance, FastifyRequest, FastifyReply, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from 'fastify';
import { prisma } from '@spendos/database';
import { generateRequestHash } from '../idempotency';
import { BadRequestError, ConflictError } from '../lib/errors';

// Routes that are exempt from idempotency enforcement (auth, health, reads)
const IDEMPOTENCY_EXEMPT_PREFIXES = [
  '/api/v1/auth/',
  '/api/v1/csrf',
  '/api/v1/health',
  '/health',
  '/local-s3',
  '/docs',
];

// Only mutating methods require an Idempotency-Key
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Validated Idempotency-Key format: UUID v4
const IDEMPOTENCY_KEY_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isExempt(url: string): boolean {
  return IDEMPOTENCY_EXEMPT_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * Registers global idempotency enforcement as Fastify hooks.
 *
 * Lifecycle:
 *  preHandler → check if a cached response exists for this (key, hash) pair.
 *               If yes: reply immediately with the cached snapshot.
 *               If key reused with a different payload: 409 Conflict.
 *               If no key on a mutating route: 400 Bad Request.
 *
 *  onSend     → after a successful handler execution (2xx), persist the
 *               response snapshot against the idempotency key so future
 *               retries can be short-circuited.
 */
export function registerIdempotencyHooks(
  // Accept both plain FastifyInstance and ZodTypeProvider-decorated variants
  fastify: FastifyInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, FastifyBaseLogger, any>
): void {
  // ── Pre-Handler: enforce key presence and serve cached responses ──────────
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!MUTATING_METHODS.has(request.method) || isExempt(request.url)) {
      return;
    }

    const rawKey = request.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    // Enforce presence of the header on all mutations
    if (!idempotencyKey) {
      throw new BadRequestError('Missing required header: Idempotency-Key. All mutating requests (POST, PUT, PATCH, DELETE) must include a unique UUID v4 Idempotency-Key header.');
    }

    // Validate format (must be UUID v4)
    if (!IDEMPOTENCY_KEY_REGEX.test(idempotencyKey)) {
      throw new BadRequestError('Invalid Idempotency-Key format. Must be a UUID v4 (e.g. 550e8400-e29b-41d4-a716-446655440000).');
    }

    // Compute the request fingerprint (route + actor + body)
    const actor = (request as any).user;
    const companyId = actor?.companyId ?? 'anonymous';
    const actorId = actor?.userId ?? 'anonymous';
    const requestHash = generateRequestHash(request.url, request.body, companyId, actorId);

    // Attach to request context for the onSend hook
    (request as any).idempotencyKey = idempotencyKey;
    (request as any).idempotencyRequestHash = requestHash;

    // Look up any existing record for this key
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
    });

    if (existing) {
      if (existing.request_hash !== requestHash) {
        // Key reused with a different payload — hard conflict
        throw new ConflictError('Idempotency key conflict: this key was previously used with a different request payload. Generate a new UUID v4 Idempotency-Key for this distinct request.');
      }

      // Same key, same payload — return the cached response
      if (existing.response_snapshot !== null && existing.response_snapshot !== undefined) {
        reply.header('X-Idempotent-Replayed', 'true');
        return reply.status(200).send(existing.response_snapshot);
      }

      // Key exists but no snapshot yet (request in-flight or failed mid-write).
      // Let the handler run again — the onSend hook will overwrite the record.
    }
  });

  // ── onSend: persist the response snapshot after a successful handler ───────
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: any) => {
    const idempotencyKey = (request as any).idempotencyKey as string | undefined;
    const requestHash = (request as any).idempotencyRequestHash as string | undefined;

    if (!idempotencyKey || !requestHash) return payload;

    // Only cache successful responses
    const statusCode = reply.statusCode;
    if (statusCode < 200 || statusCode >= 300) return payload;

    try {
      let snapshot: any;
      if (typeof payload === 'string') {
        try {
          snapshot = JSON.parse(payload);
        } catch {
          snapshot = payload;
        }
      } else {
        snapshot = payload;
      }

      await prisma.idempotencyKey.upsert({
        where: { key: idempotencyKey },
        create: {
          key: idempotencyKey,
          request_hash: requestHash,
          response_snapshot: snapshot,
        },
        update: {
          response_snapshot: snapshot,
        },
      });
    } catch (err) {
      // Non-fatal: log but don't break the response
      request.log.warn({ err, idempotencyKey }, 'Failed to persist idempotency snapshot');
    }

    return payload;
  });
}
