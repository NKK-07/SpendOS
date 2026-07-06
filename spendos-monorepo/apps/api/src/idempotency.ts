import { prisma } from '@spendos/database';
import * as crypto from 'crypto';

// Canonicalize a payload object so that key ordering does not affect the hash.
// BigInt-safe: request bodies validated by Zod can contain BigInt values (e.g.
// CreateExpenseSchema transforms amountPaise to BigInt), which plain
// JSON.stringify cannot serialize — it throws "Do not know how to serialize a
// BigInt". We stringify BigInts deterministically instead.
export function canonicalStringify(obj: any): string {
  if (typeof obj === 'bigint') {
    return JSON.stringify(obj.toString());
  }
  if (typeof obj !== 'object' || obj === null) {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const sortedObj: any = {};
  for (const key of keys) {
    sortedObj[key] = obj[key];
  }
  return JSON.stringify(sortedObj, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
}

export function generateRequestHash(route: string, payload: any, companyId: string, actorId: string): string {
  const canonicalPayload = canonicalStringify(payload);
  const hashInput = `${route}|${companyId}|${actorId}|${canonicalPayload}`;
  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

export async function withIdempotency(
  idempotencyKey: string | undefined,
  requestHash: string,
  transactionFn: (tx: any) => Promise<any>
) {
  if (!idempotencyKey) {
    // If no key is provided, just run the transaction without idempotency guarantees
    return await prisma.$transaction(transactionFn);
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Pre-check idempotency key
    const existing = await tx.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw new Error("HTTP 409 Conflict: Idempotency key reused for a different request payload");
      }
      return existing.response_snapshot;
    }

    // 2. Execute the primary logic
    const snapshot = await transactionFn(tx);

    // Convert any BigInts to strings for JSON serialization
    const serializedSnapshot = JSON.parse(JSON.stringify(snapshot, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));

    // 3. Save the response
    await tx.idempotencyKey.create({
      data: {
        key: idempotencyKey,
        request_hash: requestHash,
        response_snapshot: serializedSnapshot,
      }
    });

    return snapshot;
  }, { maxWait: 5000, timeout: 10000 });
}
