import { Redis } from "ioredis";
import RedisMock from "ioredis-mock";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl && process.env.NODE_ENV === "production") {
  console.error("❌ SRE SECURITY VIOLATION: REDIS_URL missing in production. Cannot fallback to local RAM.");
  process.exit(1);
}

export const isRedisMock = !redisUrl;

export const redis = redisUrl 
  ? new Redis(redisUrl, { 
      connectTimeout: 5000,      // Reduced connection timeout for fast DB fallback
      maxRetriesPerRequest: 1,   // Minimize retry delay to instantly drop to DB fallback
      enableOfflineQueue: false, // Drop commands immediately if Redis is disconnected
      ...(redisUrl.startsWith("rediss://") ? { tls: { rejectUnauthorized: true } } : {})
    })
  : new RedisMock();

redis.on("error", (err: any) => {
  console.error("[Redis] Shared client connection error:", err.message);
});

redis.on("connect", () => {
  if (process.env.NODE_ENV !== "test") {
    console.log("[Redis] Shared client successfully connected to storage cluster.");
  }
});
