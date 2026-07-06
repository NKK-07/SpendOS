/**
 * Change-password MFA step-up (settings security hardening).
 *
 * Authentication is two-step: (1) the current password, and (2) — when the user
 * has MFA enrolled — a fresh TOTP. A hijacked session with a known password must
 * still not be able to rotate the password (which also revokes every session)
 * without the second factor. Authorization is inherent: the endpoint only ever
 * changes the caller's own password (userId comes from the token, not the body).
 */

import { mockDeep, DeepMockProxy } from "jest-mock-extended";
import { PrismaClient } from "@spendos/database";

jest.mock("@spendos/database", () => {
  const original = jest.requireActual("@spendos/database");
  return { __esModule: true, ...original, prisma: mockDeep<PrismaClient>() };
});

jest.mock("bcrypt", () => ({
  hash: jest.fn(async () => "new-hash"),
  compare: jest.fn(async () => true), // current password always "correct" here
}));

const mockVerifyTotp = jest.fn();
jest.mock("otplib", () => ({ verify: (...args: any[]) => mockVerifyTotp(...args) }));

jest.mock("../audit", () => ({ AuditService: { log: jest.fn() } }));
jest.mock("../email", () => ({ sendEmail: jest.fn() }));

import { prisma } from "@spendos/database";
import { AuthService } from "../auth.service";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

function userRow(overrides: Record<string, any> = {}) {
  return {
    id: "u1",
    company_id: "c1",
    password_hash: "old-hash",
    mfa_enabled: false,
    mfa_secret: null,
    token_version: 0,
    ...overrides,
  };
}

const bumpsTokenVersion = expect.objectContaining({
  where: { id: "u1" },
  data: expect.objectContaining({ token_version: { increment: 1 } }),
});

describe("AuthService.changePassword — MFA step-up", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.user.update.mockResolvedValue({} as any);
  });

  it("no MFA: changes the password (and revokes sessions) without a code", async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow({ mfa_enabled: false }) as any);

    await AuthService.changePassword("u1", "current", "NewPassw0rd1");

    expect(mockVerifyTotp).not.toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledWith(bumpsTokenVersion);
  });

  it("MFA enabled, no code supplied: throws 'MFA code required' and does NOT change the password", async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow({ mfa_enabled: true, mfa_secret: "S" }) as any);

    await expect(
      AuthService.changePassword("u1", "current", "NewPassw0rd1")
    ).rejects.toThrow("MFA code required");

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("MFA enabled, invalid code: throws 'Invalid MFA code' and does NOT change the password", async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow({ mfa_enabled: true, mfa_secret: "S" }) as any);
    mockVerifyTotp.mockResolvedValue({ valid: false });

    await expect(
      AuthService.changePassword("u1", "current", "NewPassw0rd1", "000000")
    ).rejects.toThrow("Invalid MFA code");

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("MFA enabled, valid TOTP: changes the password and bumps token_version", async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow({ mfa_enabled: true, mfa_secret: "S" }) as any);
    mockVerifyTotp.mockResolvedValue({ valid: true });

    await AuthService.changePassword("u1", "current", "NewPassw0rd1", "123456");

    expect(mockVerifyTotp).toHaveBeenCalledWith(
      expect.objectContaining({ token: "123456", secret: "S" })
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith(bumpsTokenVersion);
  });

  it("wrong current password: rejects before any MFA check", async () => {
    const bcrypt = require("bcrypt");
    bcrypt.compare.mockResolvedValueOnce(false);
    prismaMock.user.findUnique.mockResolvedValue(userRow({ mfa_enabled: true, mfa_secret: "S" }) as any);

    await expect(
      AuthService.changePassword("u1", "wrong", "NewPassw0rd1", "123456")
    ).rejects.toThrow("Current password is incorrect");

    expect(mockVerifyTotp).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
