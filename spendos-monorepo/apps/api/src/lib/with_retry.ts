import { Prisma } from "@spendos/database";

/**
 * Wraps an asynchronous operation with an exponential backoff retry loop
 * for Prisma P2034 (Transaction failed due to a write conflict or a deadlock).
 */
export async function executeSerializableTx<T>(operation: () => Promise<T>): Promise<T> {
  const maxRetries = 4; // Up to 3 retries (4 attempts total)
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        attempt++;
        if (attempt >= maxRetries) {
          throw error; // Max retries exceeded
        }
        // Exponential backoff: 50ms -> 100ms -> 200ms
        const backoff = 50 * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 20; // 0-20ms jitter to avoid herd storms
        await new Promise(resolve => setTimeout(resolve, backoff + jitter));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Unreachable");
}
