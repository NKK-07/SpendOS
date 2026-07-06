// Mock config so importing the service never triggers the real env validation
// (which calls process.exit on missing vars and would kill the jest worker).
jest.mock("../../config", () => ({
  env: { JWT_SECRET: "test-jwt-secret-at-least-8-chars-long" },
}));

// otplib is an external dependency: per the testing rulebook (6.4) external calls
// are mocked in unit tests. This lets us prove that MFAService DELEGATES the code
// check to otplib (i.e. there is no hardcoded bypass) and that our own JWT
// context-binding logic is correct. End-to-end TOTP correctness is covered by an
// integration test that exercises the real otplib build.
const verifyTotp = jest.fn();
jest.mock("otplib", () => ({ verify: (...args: any[]) => verifyTotp(...args) }));

const findUnique = jest.fn();
jest.mock("@spendos/database", () => ({
  prisma: { user: { findUnique: (...args: any[]) => findUnique(...args) } },
}));

import { MFAService } from "../mfa.service";

describe("MFAService — TOTP elevation", () => {
  const enrolledUser = { id: "u1", mfa_enabled: true, mfa_secret: "JBSWY3DPEHPK3PXP" };
  const issueContext = {
    sessionId: "s1",
    deviceId: "device-1",
    ipSubnet: "10.0.0",
    scope: "payment_execute",
  };
  const validateContext = {
    userId: "u1",
    sessionId: "s1",
    deviceId: "device-1",
    ipSubnet: "10.0.0",
  };

  beforeEach(() => {
    findUnique.mockReset();
    verifyTotp.mockReset();
  });

  it("delegates the code check to otplib and rejects the legacy '123456' bypass", async () => {
    findUnique.mockResolvedValue(enrolledUser);
    verifyTotp.mockResolvedValue({ valid: false });

    await expect(
      MFAService.verifyAndElevate("u1", "123456", issueContext)
    ).rejects.toThrow("Invalid MFA code.");

    // Proves the code is actually verified against the enrolled secret, not
    // compared to any hardcoded constant.
    expect(verifyTotp).toHaveBeenCalledWith(
      expect.objectContaining({ token: "123456", secret: "JBSWY3DPEHPK3PXP" })
    );
  });

  it("issues a context-bound elevation token when otplib accepts the code", async () => {
    findUnique.mockResolvedValue(enrolledUser);
    verifyTotp.mockResolvedValue({ valid: true });

    const token = await MFAService.verifyAndElevate("u1", "492817", issueContext);
    expect(typeof token).toBe("string");
    expect(
      MFAService.validateElevationToken(token, "payment_execute", validateContext)
    ).toBe(true);
  });

  it("rejects a token replayed from a different device / IP", async () => {
    findUnique.mockResolvedValue(enrolledUser);
    verifyTotp.mockResolvedValue({ valid: true });

    const token = await MFAService.verifyAndElevate("u1", "492817", issueContext);
    expect(
      MFAService.validateElevationToken(token, "payment_execute", {
        ...validateContext,
        deviceId: "attacker-device",
        ipSubnet: "66.66.66",
      })
    ).toBe(false);
  });

  it("rejects a token whose scope does not match the protected action", async () => {
    findUnique.mockResolvedValue(enrolledUser);
    verifyTotp.mockResolvedValue({ valid: true });

    const token = await MFAService.verifyAndElevate("u1", "492817", issueContext);
    expect(
      MFAService.validateElevationToken(token, "admin_action", validateContext)
    ).toBe(false);
  });

  it("throws (without calling otplib) when MFA is not enabled for the user", async () => {
    findUnique.mockResolvedValue({ id: "u1", mfa_enabled: false, mfa_secret: null });

    await expect(
      MFAService.verifyAndElevate("u1", "000000", issueContext)
    ).rejects.toThrow("MFA is not enabled");
    expect(verifyTotp).not.toHaveBeenCalled();
  });

  it("returns false for an empty / missing elevation token", () => {
    expect(
      MFAService.validateElevationToken("", "payment_execute", validateContext)
    ).toBe(false);
  });
});
