import fp from "fastify-plugin";
import fastifyRateLimit from "@fastify/rate-limit";
import { redis } from "../services/redis.service";

// @fastify/rate-limit creates one child store per route (via child()) and keys
// every bucket by the client IP alone (see keyGenerator). Isolation between the
// global limiter and each per-route limiter therefore depends ENTIRELY on each
// child store counting independently. A naive shared store makes the global
// limiter and every route limiter increment the SAME IP counter, so the tightest
// per-route max (e.g. 5/min on POST /expenses) ends up counting requests to ALL
// endpoints — a user who merely loads the app (auth/me, csrf, notifications and
// pulse polls) is already over budget before their first real action.
//
// The `namespace` below gives each child its own counter space (a distinct
// prefix on both the in-memory key and the Redis key), restoring per-route
// isolation while still sharing one bounded Map for memory-exhaustion eviction.
let childCounter = 0;

class DualLayerStore {
  localCache = new Map<string, { count: number; expiresAt: number }>();
  options: any;
  namespace: string;

  constructor(options: any = {}, namespace: string = 'global') {
    this.options = options;
    this.namespace = namespace;
  }

  private nsKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  incr(key: string, cb: (err: any, result: { current: number; ttl: number }) => void) {
    const timeWindow = this.options.timeWindow || 60000;
    const nsKey = this.nsKey(key);

    // Check if Redis is healthy
    if (redis && redis.status === 'ready') {
      const redisKey = `rate-limit:${nsKey}`;
      redis.pipeline()
        .incr(redisKey)
        .pttl(redisKey)
        .exec()
        .then((results: any) => {
          let count = results[0][1];
          let ttl = results[1][1];
          if (count === 1 || ttl === -1) {
            redis.pexpire(redisKey, timeWindow);
            ttl = timeWindow;
          }
          cb(null, { current: count, ttl });
        })
        .catch((err: any) => {
          // If Redis throws an error mid-flight, fallback to local
          this.localIncr(key, cb);
        });
    } else {
      // Redis is disconnected, use local memory
      this.localIncr(key, cb);
    }
  }

  localIncr(key: string, cb: (err: any, result: { current: number; ttl: number }) => void) {
    const now = Date.now();
    const timeWindow = this.options.timeWindow || 60000;
    const cacheKey = this.nsKey(key);

    // Prevent memory exhaustion under DDoS if Redis is offline
    if (this.localCache.size > 10000 && !this.localCache.has(cacheKey)) {
      // Evict oldest item (Map maintains insertion order)
      const firstKey = this.localCache.keys().next().value;
      if (firstKey) this.localCache.delete(firstKey);
    }

    let record = this.localCache.get(cacheKey);

    if (!record || record.expiresAt < now) {
      record = { count: 0, expiresAt: now + timeWindow };
    }

    record.count++;
    this.localCache.set(cacheKey, record);

    cb(null, { current: record.count, ttl: record.expiresAt - now });
  }

  child(routeOptions: any) {
    const options = { ...this.options, ...routeOptions };
    // Each route-scoped limiter gets its OWN namespace so its counter is
    // independent of the global limiter and of other routes. Without this the
    // per-route max would count requests to every endpoint (see class comment).
    const store = new DualLayerStore(options, `route-${++childCounter}`);
    // Share the single bounded Map so eviction stays global; keys are namespaced
    // so counts remain isolated.
    store.localCache = this.localCache;
    return store;
  }
}

/**
 * Rate-limit bucket key. Uses Fastify's computed `req.ip`, which is the socket
 * peer by default and the real client IP only when `trustProxy` is configured
 * to the deployment's exact proxy hops (see TRUST_PROXY env / server.ts).
 *
 * Raw `X-Forwarded-For` is deliberately NOT used: it is fully client-controlled
 * and an attacker could rotate it on every request to evade the limiter.
 */
export function rateLimitKey(req: { ip: string }): string {
  return req.ip;
}

export default fp(async (fastify) => {
  fastify.register(fastifyRateLimit, {
    max: 100, // global limit
    timeWindow: 60 * 1000,
    store: DualLayerStore as any,
    skipOnError: false, // Ensure we never fail-open silently
    keyGenerator: (req) => rateLimitKey(req),
  });
});
