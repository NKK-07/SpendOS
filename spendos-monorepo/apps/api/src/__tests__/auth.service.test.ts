/**
 * VIR-001 — AuthService.getMe credential field exposure
 *
 * Two test layers per the fintech security mandate:
 *   1. Service level — verifies the Prisma SELECT is an allowlist (no sensitive fields in the query)
 *   2. HTTP level   — fires a real request through fastify.inject and asserts the
 *                     response body never contains credential fields, even when the
 *                     mocked DB row contains them all (worst-case scenario)
 */

import { mockDeep, DeepMockProxy } from "jest-mock-extended";
import { PrismaClient } from "@spendos/database";

jest.mock("@spendos/database", () => {
  const original = jest.requireActual("@spendos/database");
  return {
    __esModule: true,
    ...original,
    prisma: mockDeep<PrismaClient>(),
  };
});

jest.mock("../services/cron", () => ({ startCronJobs: jest.fn() }));
jest.mock("../services/outbox.processor", () => ({ startOutboxWorker: jest.fn() }));

import { prisma, UserRole } from "@spendos/database";
import { AuthService } from "../services/auth.service";
import { signAccessToken } from "@spendos/auth";
import { fastify } from "../server";
import { redis } from "../services/redis.service";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const USER_UUID    = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const COMPANY_UUID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

// Worst-case DB row: every sensitive column is populated with a non-null value.
// Used to prove the API never exposes these fields regardless of what the DB returns.
const FULL_USER_ROW = {
  id:                        USER_UUID,
  company_id:                COMPANY_UUID,
  full_name:                 "Test User",
  email:                     "test@spendos.dev",
  password_hash:             "$2b$12$SENSITIVE_BCRYPT_HASH_MUST_NEVER_REACH_CLIENT",
  role:                      "EMPLOYEE" as UserRole,
  approval_scope:            null,
  auto_approval_limit_paise: null,
  is_active:                 true,
  is_frozen:                 false,
  frozen_reason:             null,
  frozen_by:                 null,
  invited_by:                null,
  last_login_at:             null,
  password_reset_token:      "active-reset-jti-must-never-reach-client",
  password_reset_expires_at: new Date("2026-12-31"),
  mfa_enabled:               false,
  mfa_secret:                "JBSWY3DPEHPK3PXP_TOTP_SECRET_MUST_NEVER_REACH_CLIENT",
  recovery_codes:            ["$2b$12$recoveryHash1", "$2b$12$recoveryHash2"],
  created_at:                new Date("2026-01-01"),
  updated_at:                new Date("2026-01-01"),
};

const EXPECTED_SAFE_SELECT = {
  id:                        true,
  company_id:                true,
  full_name:                 true,
  email:                     true,
  role:                      true,
  approval_scope:            true,
  auto_approval_limit_paise: true,
  is_active:                 true,
  is_frozen:                 true,
  frozen_reason:             true,
  mfa_enabled:               true,
  last_login_at:             true,
  created_at:                true,
};

const SENSITIVE_KEYS = [
  "password_hash",
  "mfa_secret",
  "recovery_codes",
  "password_reset_token",
  "password_reset_expires_at",
] as const;

describe("VIR-001: AuthService.getMe — credential field exposure", () => {
  beforeAll(async () => {
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    await prisma.$disconnect();
    if (redis && typeof redis.quit === "function") {
      await redis.quit();
    }
  });

  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue(FULL_USER_ROW as any);
    prismaMock.$transaction.mockImplementation(async (callback) => {
      if (typeof callback === "function") return callback(prismaMock);
      return callback;
    });
  });

  // ─── SERVICE LEVEL: verify the Prisma SELECT allowlist ────────────────────

  describe("AuthService.getMe — Prisma SELECT allowlist (service level)", () => {
    it("calls findUnique with exactly the 13-field safe select", async () => {
      await AuthService.getMe(USER_UUID);
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where:  { id: USER_UUID },
        select: EXPECTED_SAFE_SELECT,
      });
    });

    it.each(SENSITIVE_KEYS)(
      "does NOT include '%s' in the Prisma select",
      async (sensitiveKey) => {
        await AuthService.getMe(USER_UUID);
        const select = (prismaMock.user.findUnique.mock.calls[0][0] as any).select;
        expect(select).not.toHaveProperty(sensitiveKey);
      }
    );

    it("throws 'User not found' when Prisma returns null", async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      await expect(AuthService.getMe(USER_UUID)).rejects.toThrow("User not found");
    });
  });

  // ─── HTTP LEVEL: verify the API response body ─────────────────────────────
  // The DB mock always returns FULL_USER_ROW (all sensitive fields populated).
  // These tests prove the HTTP layer never surfaces those fields to the client.

  describe("GET /api/v1/auth/me — HTTP response (HTTP level)", () => {
    let validJwt: string;

    beforeAll(() => {
      validJwt = signAccessToken({
        userId:    USER_UUID,
        companyId: COMPANY_UUID,
        role:      "EMPLOYEE" as UserRole,
        tokenVersion: 0,
      });
    });

    it("returns 200 with a valid JWT cookie", async () => {
      const res = await fastify.inject({
        method:  "GET",
        url:     "/api/v1/auth/me",
        cookies: { accessToken: validJwt },
      });
      expect(res.statusCode).toBe(200);
    });

    it("returns 401 when no token is provided", async () => {
      const res = await fastify.inject({
        method: "GET",
        url:    "/api/v1/auth/me",
      });
      expect(res.statusCode).toBe(401);
    });

    it.each(SENSITIVE_KEYS)(
      "response body does NOT contain '%s'",
      async (sensitiveKey) => {
        const res = await fastify.inject({
          method:  "GET",
          url:     "/api/v1/auth/me",
          cookies: { accessToken: validJwt },
        });
        const body = JSON.parse(res.body);
        expect(body).not.toHaveProperty(sensitiveKey);
      }
    );

    it("response body contains the required safe fields", async () => {
      const res = await fastify.inject({
        method:  "GET",
        url:     "/api/v1/auth/me",
        cookies: { accessToken: validJwt },
      });
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("id",         USER_UUID);
      expect(body).toHaveProperty("company_id", COMPANY_UUID);
      expect(body).toHaveProperty("email",      "test@spendos.dev");
      expect(body).toHaveProperty("role",       "EMPLOYEE");
      expect(body).toHaveProperty("mfa_enabled", false);
    });
  });
});
