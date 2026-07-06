/**
 * Session revocation via token_version (Issue #5).
 *
 * Access + refresh JWTs carry the user's token_version. A password change /
 * reset increments it, so every previously issued token is rejected. These
 * tests verify: (1) issued tokens embed the current version, (2) the three
 * credential-change paths bump the version, and (3) refresh rejects a token
 * whose version is stale.
 */

import { mockDeep, DeepMockProxy } from "jest-mock-extended";
import { PrismaClient } from "@spendos/database";

jest.mock("@spendos/database", () => {
  const original = jest.requireActual("@spendos/database");
  return { __esModule: true, ...original, prisma: mockDeep<PrismaClient>() };
});

const mockSignAccess = jest.fn(() => "access-token");
const mockSignRefresh = jest.fn(() => "refresh-token");
const mockVerifyRefresh = jest.fn();
const mockVerifyReset = jest.fn();
jest.mock("@spendos/auth", () => ({
  __esModule: true,
  signAccessToken: mockSignAccess,
  signRefreshToken: mockSignRefresh,
  verifyRefreshToken: mockVerifyRefresh,
  signResetToken: jest.fn(() => "reset-token"),
  verifyResetToken: mockVerifyReset,
  signMfaToken: jest.fn(() => "mfa-token"),
  verifyMfaToken: jest.fn(),
  signToken: mockSignAccess,
}));

jest.mock("bcrypt", () => ({
  hash: jest.fn(async () => "new-hash"),
  compare: jest.fn(async () => true),
}));

jest.mock("../audit", () => ({ AuditService: { log: jest.fn() } }));
jest.mock("../email", () => ({ sendEmail: jest.fn() }));

import { prisma, UserRole } from "@spendos/database";
import { AuthService } from "../auth.service";
import { UsersService } from "../users.service";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const USER = "22222222-2222-2222-2222-222222222222";
const COMPANY = "11111111-1111-1111-1111-111111111111";

function userRow(overrides: Record<string, any> = {}) {
  return {
    id: USER,
    company_id: COMPANY,
    role: UserRole.EMPLOYEE,
    email: "e@spendos.dev",
    full_name: "Emp",
    password_hash: "old-hash",
    is_active: true,
    is_frozen: false,
    mfa_enabled: false,
    token_version: 0,
    ...overrides,
  };
}

describe("Session revocation via token_version (Issue #5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.user.update.mockResolvedValue({} as any);
  });

  describe("issued tokens embed the current token_version", () => {
    it("login signs access + refresh with the user's token_version", async () => {
      prismaMock.user.findUnique.mockResolvedValue(userRow({ token_version: 5 }) as any);

      await AuthService.login({ email: "e@spendos.dev", password: "pw" } as any);

      expect(mockSignAccess).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER, tokenVersion: 5 })
      );
      expect(mockSignRefresh).toHaveBeenCalledWith(
        expect.objectContaining({ tokenVersion: 5 })
      );
    });
  });

  describe("credential changes bump token_version", () => {
    it("changePassword increments token_version", async () => {
      prismaMock.user.findUnique.mockResolvedValue(userRow() as any);

      await AuthService.changePassword(USER, "current", "brand-new-pass");

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER },
          data: expect.objectContaining({ token_version: { increment: 1 } }),
        })
      );
    });

    it("resetPassword increments token_version and clears the reset token", async () => {
      const jti = "jti-1";
      mockVerifyReset.mockReturnValue({ sub: USER, type: "password_reset", jti });
      prismaMock.user.findUnique.mockResolvedValue(
        userRow({
          password_reset_token: jti,
          password_reset_expires_at: new Date(Date.now() + 60_000),
        }) as any
      );

      await AuthService.resetPassword("reset-token", "brand-new-pass");

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            token_version: { increment: 1 },
            password_reset_token: null,
          }),
        })
      );
    });

    it("admin resetUserPassword increments the target's token_version", async () => {
      prismaMock.user.findUnique.mockResolvedValue(userRow() as any);
      const admin = { companyId: COMPANY, userId: "33333333-3333-3333-3333-333333333333", role: UserRole.ADMIN };

      await UsersService.resetUserPassword(admin, USER, "brand-new-pass");

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER },
          data: expect.objectContaining({ token_version: { increment: 1 } }),
        })
      );
    });
  });

  describe("refresh honors token_version", () => {
    it("rejects a refresh token whose version is stale", async () => {
      mockVerifyRefresh.mockReturnValue({ userId: USER, companyId: COMPANY, role: UserRole.EMPLOYEE, tokenVersion: 1 });
      prismaMock.user.findUnique.mockResolvedValue(userRow({ token_version: 2 }) as any);

      await expect(AuthService.refresh("stale-refresh")).rejects.toThrow(
        "Invalid or expired refresh token"
      );
      expect(mockSignAccess).not.toHaveBeenCalled();
    });

    it("re-issues tokens at the current version when the refresh token matches", async () => {
      mockVerifyRefresh.mockReturnValue({ userId: USER, companyId: COMPANY, role: UserRole.EMPLOYEE, tokenVersion: 2 });
      prismaMock.user.findUnique.mockResolvedValue(userRow({ token_version: 2 }) as any);

      await AuthService.refresh("good-refresh");

      expect(mockSignAccess).toHaveBeenCalledWith(
        expect.objectContaining({ tokenVersion: 2 })
      );
    });
  });
});
