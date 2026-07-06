import "./config"; // Run environment configuration checks before boot
import { env } from "./config";
// import * as Sentry from "@sentry/node";

// if (env.NODE_ENV === "production" && process.env.SENTRY_DSN) {
//   Sentry.init({
//     dsn: process.env.SENTRY_DSN,
//     tracesSampleRate: 1.0,
//   });
// }
import Fastify from "fastify";
import { AuditService } from "./services/audit";
import { sendEmail } from "./services/email";
import { generateUploadUrl, generateDownloadUrl } from "./services/s3";
import { startCronJobs } from "./services/cron";
import { startOutboxWorker } from "./services/outbox.processor";
import { startOcrWorker } from "./services/ocr.queue";
import { requirePrincipal, requireSettingsAccess, requireReviewer, requireEmployeeUp } from "./rbac";

import { serializerCompiler, validatorCompiler, jsonSchemaTransform, ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "@spendos/database";
import { redis } from "./services/redis.service";

import swaggerPlugin from "./plugins/swagger";
import rateLimitPlugin from "./plugins/rate-limit";
import errorHandlerPlugin from "./plugins/error-handler";
import authPlugin from "./plugins/auth";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { 
  FastifySignupSchema, FastifyLoginSchema, FastifyMarkPaidSchema, FastifyCreateExpenseSchema, 
  FastifyUpdateProfileSchema, FastifySetPasswordSchema, FastifyInviteUserSchema 
} from "@spendos/shared-types";

import { AppError } from "./lib/errors";
import { registerIdempotencyHooks } from "./middlewares/idempotency.middleware";

// ─────────────────────────────────────────────────────────────────────────────
// FASTIFY INSTANCE & PLUGINS
// ─────────────────────────────────────────────────────────────────────────────

// Translate the TRUST_PROXY env into Fastify's trustProxy option. Default false
// (trust nothing). A numeric string ⇒ number of proxy hops; "true"/"false" ⇒
// boolean; anything else (CIDR / comma-separated IPs) is passed through.
function parseTrustProxy(val?: string): boolean | number | string {
  if (!val) return false;
  if (val === "true") return true;
  if (val === "false") return false;
  const n = Number(val);
  if (Number.isInteger(n) && n >= 0) return n;
  return val;
}

export const fastify = Fastify({
  logger: { level: env.LOG_LEVEL },
  trustProxy: parseTrustProxy(env.TRUST_PROXY),
}).withTypeProvider<ZodTypeProvider>();
fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

// Global BigInt Serializer
fastify.setReplySerializer((payload) => {
  return JSON.stringify(payload, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
});

fastify.register(errorHandlerPlugin);
fastify.register(swaggerPlugin);
fastify.register(authPlugin);
fastify.register(rateLimitPlugin);

import fastifyMultipart from "@fastify/multipart";
fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,
  }
});

import fastifyCors from "@fastify/cors";
fastify.register(fastifyCors, {
  origin: [env.FRONTEND_URL],
  credentials: true,
});

// Helper for cookies
function setAuthCookies(reply: any, accessToken: string, refreshToken: string) {
  const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' };
  reply.setCookie('accessToken', accessToken, cookieOpts);
  reply.setCookie('refreshToken', refreshToken, cookieOpts);
}

// Helper for IDOR scoping removed

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function serializeBigInt(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

const BCRYPT_ROUNDS = 12;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS & RBAC
// ─────────────────────────────────────────────────────────────────────────────

const REVIEWER_ROLES = ["PRINCIPAL", "ADMIN", "MANAGER"];

// ─────────────────────────────────────────────────────────────────────────────
// IDEMPOTENCY ENFORCEMENT
// ─────────────────────────────────────────────────────────────────────────────
registerIdempotencyHooks(fastify);

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────────────────────────────────────

const healthHandler = async (request: any, reply: any) => {
  let dbHealthy = false;
  let redisHealthy = false;
  let dbError: string | null = null;
  let redisError: string | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbHealthy = true;
  } catch (err: any) {
    dbError = err.message;
  }

  try {
    if (redis) {
      const pingRes = await redis.ping();
      redisHealthy = pingRes === "PONG";
    }
  } catch (err: any) {
    redisError = err.message;
  }

  if (dbError) console.error("[HealthCheck] DB Error:", dbError);
  if (redisError) console.error("[HealthCheck] Redis Error:", redisError);

  const status = dbHealthy 
    ? (redisHealthy ? "ok" : "degraded") 
    : "database_unavailable";

  const response = {
    status,
  };

  if (!dbHealthy) {
    return reply.status(503).send(response);
  }

  return reply.status(200).send(response);
};

fastify.get("/health", healthHandler);
fastify.get("/api/v1/health", healthHandler);

fastify.get("/api/v1/csrf", async (request, reply) => {
  const token = await reply.generateCsrf();
  return { csrfToken: token };
});

// ─────────────────────────────────────────────────────────────────────────────
import { authRoutes } from "./routes/auth.routes";
import { usersRoutes } from "./routes/users.routes";
import { companyRoutes } from "./routes/company.routes";
import { activityRoutes } from "./routes/activity.routes";
import { notificationsRoutes } from "./routes/notifications.routes";
import { expensesRoutes } from "./routes/expenses.routes";
import { ledgerRoutes } from "./routes/ledger.routes";
import { policiesRoutes } from "./routes/policies.routes";
import { localS3Routes } from "./routes/local-s3.routes";

fastify.register(authRoutes, { prefix: "/api/v1" });
fastify.register(usersRoutes, { prefix: "/api/v1" });
fastify.register(companyRoutes, { prefix: "/api/v1" });
fastify.register(activityRoutes, { prefix: "/api/v1" });
fastify.register(notificationsRoutes, { prefix: "/api/v1" });
fastify.register(expensesRoutes, { prefix: "/api/v1" });
fastify.register(ledgerRoutes, { prefix: "/api/v1" });
fastify.register(policiesRoutes, { prefix: "/api/v1" });

if (process.env.NODE_ENV !== "production" && process.env.ENABLE_LOCAL_S3 === "true") {
  fastify.register(localS3Routes, { prefix: "/local-s3" });
}

// BACKGROUND JOBS CONDITIONAL INITIALIZATION
export const initializeBackgroundJobs = () => {
  if (process.env.RUN_JOBS === "true" || process.env.NODE_ENV !== "production") {
    startCronJobs();
    (global as any).ocrWorkerInstance = startOcrWorker();
    startOutboxWorker();
    return true;
  }
  return false;
};

// START SERVER
const start = async () => {
  try {
    initializeBackgroundJobs();
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
    console.log("SpendOS API listening on port 3000");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};
if (process.env.NODE_ENV !== "test") {
  start();
}

