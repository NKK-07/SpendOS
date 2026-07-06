import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { verify as verifyTotp } from 'otplib';
import { prisma } from '@spendos/database';
import { env } from '../config';
import { UnauthorizedError, BadRequestError } from '../lib/errors';

export interface MFAElevationTokenPayload {
  user_id: string;
  session_id: string;
  device_id: string;
  ip_subnet: string;
  scope: string;
  risk_context_hash: string;
}

/**
 * Derives a dedicated signing key for MFA elevation tokens from the primary
 * JWT secret using HMAC-SHA256 domain separation.
 *
 * Rationale (security ADR): elevation tokens authorise high-risk actions
 * (e.g. payment execution) and must not share the literal access-token secret,
 * so that the two trust domains can be reasoned about independently. Deriving
 * the key — instead of introducing a new mandatory `MFA_*_SECRET` env var —
 * keeps the boot contract unchanged (the key rotates automatically with
 * JWT_SECRET) while still guaranteeing cryptographic separation. The fixed
 * `info` label binds the derivation to this specific purpose and version.
 */
const ELEVATION_SIGNING_KEY = crypto
  .createHmac('sha256', env.JWT_SECRET)
  .update('spendos:mfa-elevation:v1')
  .digest('hex');

export class MFAService {
  private static readonly ELEVATION_TTL_MINUTES = 5;

  /**
   * Verifies a user-supplied TOTP code and, on success, issues a short-lived MFA
   * elevation token cryptographically bound to the current request context.
   *
   * @param userId  The authenticated user's id.
   * @param otpCode The 6-digit TOTP code from the user's authenticator app.
   * @param context Device / session / network context used to bind the token.
   * @returns A signed elevation JWT valid for {@link ELEVATION_TTL_MINUTES}.
   * @throws {BadRequestError}  If MFA is not enabled / enrolled for the user.
   * @throws {UnauthorizedError} If the TOTP code is invalid.
   *
   * @example
   * const token = await MFAService.verifyAndElevate(user.id, '492817', {
   *   sessionId, deviceId, ipSubnet, scope: 'payment_execute',
   * });
   */
  static async verifyAndElevate(
    userId: string,
    otpCode: string,
    context: { sessionId: string; deviceId: string; ipSubnet: string; scope: string }
  ): Promise<string> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfa_enabled || !user.mfa_secret) {
      throw new BadRequestError('MFA is not enabled for this user.');
    }

    let isValid = false;
    try {
      // TOTP verification against the user's enrolled secret. otplib uses a
      // constant-time comparison internally; epochTolerance: 30 accepts the
      // adjacent time step to absorb client/server clock drift (RFC 6238).
      const result = await verifyTotp({
        token: otpCode,
        secret: user.mfa_secret,
        epochTolerance: 30,
      });
      isValid = result.valid;
    } catch {
      // A malformed stored secret is a permanent configuration fault, not a
      // transient one: treat it as an authentication failure rather than a 500
      // so we never leak details about the secret's state to the caller.
      isValid = false;
    }

    if (!isValid) {
      throw new UnauthorizedError('Invalid MFA code.');
    }

    // Bind the token to the originating device + network so a stolen token
    // cannot be replayed from a different context.
    const riskContextHash = MFAService.computeRiskContextHash(context.deviceId, context.ipSubnet);

    const payload: MFAElevationTokenPayload = {
      user_id: userId,
      session_id: context.sessionId,
      device_id: context.deviceId,
      ip_subnet: context.ipSubnet,
      scope: context.scope,
      risk_context_hash: riskContextHash,
    };

    return jwt.sign(payload, ELEVATION_SIGNING_KEY, {
      expiresIn: `${MFAService.ELEVATION_TTL_MINUTES}m`,
    });
  }

  /**
   * Validates an incoming MFA elevation token against the current request
   * context. Returns false (never throws) so callers can branch on a simple
   * boolean authorisation decision.
   *
   * @param token         The elevation JWT presented by the client.
   * @param expectedScope The scope the protected action requires.
   * @param currentContext The live request context to bind against.
   * @returns true only if the token is valid, unexpired, and context-bound.
   *
   * @example
   * if (!MFAService.validateElevationToken(token, 'payment_execute', ctx)) {
   *   return reply.status(403).send({ error: 'Valid MFA elevation required.' });
   * }
   */
  static validateElevationToken(
    token: string,
    expectedScope: string,
    currentContext: { userId: string; sessionId: string; deviceId: string; ipSubnet: string }
  ): boolean {
    if (!token) return false;

    try {
      const decoded = jwt.verify(token, ELEVATION_SIGNING_KEY) as MFAElevationTokenPayload;

      const currentRiskHash = MFAService.computeRiskContextHash(
        currentContext.deviceId,
        currentContext.ipSubnet
      );

      return (
        decoded.user_id === currentContext.userId &&
        decoded.session_id === currentContext.sessionId &&
        decoded.scope === expectedScope &&
        decoded.risk_context_hash === currentRiskHash
      );
    } catch {
      // Expired / tampered / wrong-key tokens all fail closed.
      return false;
    }
  }

  /**
   * Deterministically hashes the device + network context that binds an
   * elevation token to its origin.
   */
  private static computeRiskContextHash(deviceId: string, ipSubnet: string): string {
    return crypto.createHash('sha256').update(`${deviceId}:${ipSubnet}`).digest('hex');
  }
}
