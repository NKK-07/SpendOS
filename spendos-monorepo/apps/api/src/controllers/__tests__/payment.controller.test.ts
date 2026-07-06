/**
 * Payment execution — Four-Eyes + MFA elevation (Issue #7).
 *
 * The auth middleware populates req.user as { userId, companyId, role }, but the
 * controller previously read `user.id` (undefined). That silently defeated the
 * Four-Eyes check (`initiated_by === undefined` is always false) and bound the
 * MFA elevation to `undefined`. These tests verify the controller now uses
 * `user.userId` for both.
 */

import { mockDeep, DeepMockProxy } from "jest-mock-extended";
import { PrismaClient, PaymentRunStatus } from "@spendos/database";

jest.mock("@spendos/database", () => {
  const original = jest.requireActual("@spendos/database");
  return { __esModule: true, ...original, prisma: mockDeep<PrismaClient>() };
});

const mockValidateElevation = jest.fn();
jest.mock("../../services/mfa.service", () => ({
  MFAService: { validateElevationToken: (...args: any[]) => mockValidateElevation(...args) },
}));

import { prisma } from "@spendos/database";
import { PaymentController } from "../payment.controller";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const INITIATOR = "11111111-1111-1111-1111-111111111111";
const EXECUTOR = "22222222-2222-2222-2222-222222222222";
const RUN_ID = "99999999-9999-9999-9999-999999999999";

function mockReply() {
  const r: any = {
    statusCode: 200,
    status: jest.fn(function (c: number) { r.statusCode = c; return r; }),
    send: jest.fn(function (p: any) { r.payload = p; return r; }),
  };
  return r;
}

function makeReq(userId: string) {
  return {
    params: { id: RUN_ID },
    body: { idempotencyKey: "idem-1", nonce: "nonce-1" },
    headers: { "x-elevation-token": "tok", "x-device-id": "dev-1" },
    ip: "10.0.0.1",
    user: { userId, companyId: "c1", role: "ADMIN" },
  } as any;
}

describe("PaymentController.executePaymentRun (Issue #7)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateElevation.mockReturnValue(true);
    prismaMock.idempotencyKey.create.mockResolvedValue({} as any);
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
    prismaMock.paymentRun.update.mockResolvedValue({ id: RUN_ID, status: PaymentRunStatus.PENDING_BANK_PROCESSING } as any);
    prismaMock.idempotencyKey.update.mockResolvedValue({} as any);
  });

  it("binds MFA elevation to the real userId (not undefined)", async () => {
    prismaMock.paymentRun.findUnique.mockResolvedValue({ id: RUN_ID, initiated_by: INITIATOR, status: PaymentRunStatus.APPROVED } as any);

    await PaymentController.executePaymentRun(makeReq(EXECUTOR), mockReply());

    expect(mockValidateElevation).toHaveBeenCalledWith(
      "tok",
      "payment_execute",
      expect.objectContaining({ userId: EXECUTOR })
    );
  });

  it("blocks the initiator from executing their own run (Four-Eyes)", async () => {
    prismaMock.paymentRun.findUnique.mockResolvedValue({ id: RUN_ID, initiated_by: EXECUTOR, status: PaymentRunStatus.APPROVED } as any);
    const reply = mockReply();

    await PaymentController.executePaymentRun(makeReq(EXECUTOR), reply);

    expect(reply.statusCode).toBe(403);
    expect(reply.payload.error).toContain("Four-Eyes Violation");
    expect(prismaMock.paymentRun.update).not.toHaveBeenCalled();
  });

  it("allows a different user with valid elevation to execute an APPROVED run", async () => {
    prismaMock.paymentRun.findUnique.mockResolvedValue({ id: RUN_ID, initiated_by: INITIATOR, status: PaymentRunStatus.APPROVED } as any);
    const reply = mockReply();

    await PaymentController.executePaymentRun(makeReq(EXECUTOR), reply);

    expect(reply.payload).toEqual(expect.objectContaining({ success: true }));
    expect(prismaMock.paymentRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approved_by: EXECUTOR }) })
    );
  });

  it("rejects when the MFA elevation token is invalid", async () => {
    mockValidateElevation.mockReturnValue(false);
    const reply = mockReply();

    await PaymentController.executePaymentRun(makeReq(EXECUTOR), reply);

    expect(reply.statusCode).toBe(403);
    expect(reply.payload.error).toContain("MFA Elevation Token required");
  });

  it("rejects execution unless the run is APPROVED", async () => {
    prismaMock.paymentRun.findUnique.mockResolvedValue({ id: RUN_ID, initiated_by: INITIATOR, status: PaymentRunStatus.PENDING_BANK_PROCESSING } as any);
    const reply = mockReply();

    await PaymentController.executePaymentRun(makeReq(EXECUTOR), reply);

    expect(reply.statusCode).toBe(400);
  });
});
