import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.preprocess((val) => Number(val) || 3000, z.number().int().positive()),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection URL"),
  JWT_SECRET: z.string().min(8, "JWT_SECRET must be at least 8 characters long"),
  REFRESH_SECRET: z.string().min(8, "REFRESH_SECRET must be at least 8 characters long"),
  RESET_PASSWORD_SECRET: z.string().min(8, "RESET_PASSWORD_SECRET must be at least 8 characters long"),
  COOKIE_SECRET: z.string().min(8, "COOKIE_SECRET must be at least 8 characters long"),
  FRONTEND_URL: z.string().url().default("http://localhost:3002"),
  REDIS_URL: z.string().url().optional(),
  RUN_JOBS: z.preprocess((val) => val === "true" || val === true, z.boolean()).default(false),
  LOG_LEVEL: z.enum(["info", "error", "debug", "warn", "fatal", "trace"]).default("info"),
  // When true, mobile clients (x-client-type: mobile) MUST pass a cryptographically
  // verified device-attestation token. Defaults to false so that enabling enforcement
  // is an explicit, auditable operational decision rather than a hidden code path.
  MOBILE_ATTESTATION_ENABLED: z
    .preprocess((val) => val === "true" || val === true, z.boolean())
    .default(false),
  // Proxy-trust configuration for deriving the real client IP (used by rate
  // limiting and audit). Unset/false ⇒ trust nothing (req.ip = socket peer).
  // Prefer a numeric hop count matching your infra over "true" (which trusts a
  // client-controlled leftmost X-Forwarded-For). May also be a CIDR/IP list.
  TRUST_PROXY: z.string().optional(),
  // HMAC secret for inbound webhooks (e.g. malware-scan callbacks). Optional so
  // boot is unaffected when the webhook feature is not wired; the webhook handler
  // fails CLOSED (503) when a request arrives and this is unset — it never falls
  // back to a hardcoded dev secret.
  WEBHOOK_HMAC_SECRET: z.string().optional(),
});

let configParse = envSchema.safeParse(process.env);

if (!configParse.success) {
  console.error("❌ Invalid SpendOS Server Environment Configuration:");
  configParse.error.issues.forEach((err) => {
    console.error(`  - [${err.path.join(".")}] ${err.message}`);
  });
  console.error("Please configure the missing or malformed environment variables before booting.");
  process.exit(1);
}

export const env = configParse.data!;

// SRE Security Guard: Block insecure defaults in production
if (env.NODE_ENV === "production") {
  const unsafeDefaults = [
    "spendos-jwt-secret-change-in-prod",
    "spendos-refresh-secret-change-in-prod",
    "spendos-reset-secret-change-in-prod",
    "spendos-secret-key",
    // Sentinel shipped in .env.example — must never reach production.
    "CHANGE_ME_IN_PRODUCTION",
  ];

  if (unsafeDefaults.includes(env.JWT_SECRET)) {
    console.error("❌ SRE SECURITY VIOLATION: Insecure JWT_SECRET placeholder used in production!");
    process.exit(1);
  }
  if (unsafeDefaults.includes(env.REFRESH_SECRET)) {
    console.error("❌ SRE SECURITY VIOLATION: Insecure REFRESH_SECRET placeholder used in production!");
    process.exit(1);
  }
  if (unsafeDefaults.includes(env.RESET_PASSWORD_SECRET)) {
    console.error("❌ SRE SECURITY VIOLATION: Insecure RESET_PASSWORD_SECRET placeholder used in production!");
    process.exit(1);
  }
  if (unsafeDefaults.includes(env.COOKIE_SECRET)) {
    console.error("❌ SRE SECURITY VIOLATION: Insecure COOKIE_SECRET placeholder used in production!");
    process.exit(1);
  }
  if (!process.env.FRONTEND_URL || process.env.FRONTEND_URL.includes("localhost")) {
    console.error("❌ SRE SECURITY VIOLATION: Insecure or missing FRONTEND_URL in production!");
    process.exit(1);
  }
}
