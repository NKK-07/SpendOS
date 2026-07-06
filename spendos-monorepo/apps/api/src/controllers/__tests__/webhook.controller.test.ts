/**
 * Webhook HMAC verification (Issue #6).
 *
 * The signature must be verified over the EXACT raw request bytes (not a
 * re-serialized req.body), the secret must come from config with no dev
 * fallback (fail closed when unset), the comparison must be constant-time, and
 * timestamp skew must be rejected in both directions.
 */

import crypto from "crypto";
import { mockDeep, DeepMockProxy } from "jest-mock-extended";
import { PrismaClient } from "@spendos/database";

jest.mock("@spendos/database", () => {
  const original = jest.requireActual("@spendos/database");
  return { __esModule: true, ...original, prisma: mockDeep<PrismaClient>() };
});

// Mutable env mock so a single test can simulate an unconfigured secret.
const envMock: { WEBHOOK_HMAC_SECRET?: string } = { WEBHOOK_HMAC_SECRET: "test-secret" };
jest.mock("../../config", () => ({ env: envMock }));

import { prisma } from "@spendos/database";
import { WebhookController } from "../webhook.controller";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

function sign(secret: string, timestamp: string, rawBody: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

function mockReply() {
  const r: any = {
    statusCode: 200,
    status: jest.fn(function (c: number) { r.statusCode = c; return r; }),
    send: jest.fn(function (p: any) { r.payload = p; return r; }),
  };
  return r;
}

function makeReq(rawBody: string, signature: string, timestamp: string) {
  return {
    headers: { "x-signature": signature, "x-timestamp": timestamp },
    rawBody,
  } as any;
}

const RAW = JSON.stringify({ event_id: "evt-1", document_id: "doc-1", status: "CLEAN" });

describe("WebhookController.handleMalwareScanResult (Issue #6)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    envMock.WEBHOOK_HMAC_SECRET = "test-secret";
    prismaMock.idempotencyKey.create.mockResolvedValue({} as any);
  });

  it("accepts a request signed over the raw body", async () => {
    const ts = Date.now().toString();
    const req = makeReq(RAW, sign("test-secret", ts, RAW), ts);
    const reply = mockReply();

    await WebhookController.handleMalwareScanResult(req, reply);

    expect(reply.statusCode).toBe(200);
    expect(reply.payload).toEqual({ success: true, processed: true });
    expect(prismaMock.idempotencyKey.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nonce: "evt-1" }) })
    );
  });

  it("rejects a tampered body (signature no longer matches)", async () => {
    const ts = Date.now().toString();
    const sig = sign("test-secret", ts, RAW);
    const tampered = JSON.stringify({ event_id: "evt-1", document_id: "doc-1", status: "INFECTED" });
    const reply = mockReply();

    await WebhookController.handleMalwareScanResult(makeReq(tampered, sig, ts), reply);

    expect(reply.statusCode).toBe(401);
    expect(prismaMock.idempotencyKey.create).not.toHaveBeenCalled();
  });

  it("rejects a signature made with the wrong secret", async () => {
    const ts = Date.now().toString();
    const reply = mockReply();

    await WebhookController.handleMalwareScanResult(makeReq(RAW, sign("attacker-secret", ts, RAW), ts), reply);

    expect(reply.statusCode).toBe(401);
  });

  it("rejects a future timestamp (skew guarded in both directions)", async () => {
    const futureTs = (Date.now() + 10 * 60 * 1000).toString();
    const reply = mockReply();

    await WebhookController.handleMalwareScanResult(makeReq(RAW, sign("test-secret", futureTs, RAW), futureTs), reply);

    expect(reply.statusCode).toBe(401);
  });

  it("rejects an expired (too old) timestamp", async () => {
    const oldTs = (Date.now() - 10 * 60 * 1000).toString();
    const reply = mockReply();

    await WebhookController.handleMalwareScanResult(makeReq(RAW, sign("test-secret", oldTs, RAW), oldTs), reply);

    expect(reply.statusCode).toBe(401);
  });

  it("fails closed with 503 when the secret is not configured (no dev fallback)", async () => {
    envMock.WEBHOOK_HMAC_SECRET = undefined;
    const ts = Date.now().toString();
    const reply = mockReply();

    await WebhookController.handleMalwareScanResult(makeReq(RAW, sign("anything", ts, RAW), ts), reply);

    expect(reply.statusCode).toBe(503);
  });

  it("treats a duplicate event as idempotent success", async () => {
    const ts = Date.now().toString();
    const req = makeReq(RAW, sign("test-secret", ts, RAW), ts);
    const reply = mockReply();
    prismaMock.idempotencyKey.create.mockRejectedValue(new Error("P2002 unique violation"));

    await WebhookController.handleMalwareScanResult(req, reply);

    expect(reply.statusCode).toBe(200);
    expect(reply.payload).toEqual({ success: true, message: "Event already processed (Idempotent success)." });
  });

  it("rejects when the raw body is unavailable (cannot verify)", async () => {
    const ts = Date.now().toString();
    const req: any = { headers: { "x-signature": "ab", "x-timestamp": ts } }; // no rawBody
    const reply = mockReply();

    await WebhookController.handleMalwareScanResult(req, reply);

    expect(reply.statusCode).toBe(400);
  });
});
