import * as jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";

// Lazy getters to prevent boot loops if config sync lags
const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error("Missing JWT_SECRET");
  return process.env.JWT_SECRET;
};
const getRefreshSecret = () => {
  if (!process.env.REFRESH_SECRET) throw new Error("Missing REFRESH_SECRET");
  return process.env.REFRESH_SECRET;
};
const getResetSecret = () => {
  if (!process.env.RESET_PASSWORD_SECRET) throw new Error("Missing RESET_PASSWORD_SECRET");
  return process.env.RESET_PASSWORD_SECRET;
};

export const ACCESS_TOKEN_EXPIRY = "15m";
export const REFRESH_TOKEN_EXPIRY = "7d";

export interface TokenPayload {
  userId: string;
  companyId: string;
  role: UserRole;
  // Session-revocation version. Must match the user's current token_version;
  // bumped on password change/reset to invalidate all previously issued tokens.
  tokenVersion: number;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign({ ...payload, type: "access" }, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, getRefreshSecret(), { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    
    // STRICT ISOLATION: Must be an object and type must be exactly "access"
    if (!decoded || typeof decoded !== 'object' || decoded.type !== "access") {
      return null;
    }
    
    return decoded as TokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, getRefreshSecret()) as TokenPayload;
  } catch {
    return null;
  }
}

export function signResetToken(payload: { sub: string; type: string; jti: string }): string {
  return jwt.sign(payload, getResetSecret(), { expiresIn: "15m" });
}

export function verifyResetToken(token: string): any | null {
  try {
    return jwt.verify(token, getResetSecret());
  } catch {
    return null;
  }
}

export function signMfaToken(payload: { userId: string, companyId: string, role: string }): string {
  return jwt.sign({ ...payload, type: "mfa_pending" }, getJwtSecret(), { expiresIn: "10m" });
}

export function verifyMfaToken(token: string): any | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    
    // STRICT ISOLATION: Must be an object and type must be exactly "mfa_pending"
    if (!decoded || typeof decoded !== 'object' || decoded.type !== "mfa_pending") {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

// Legacy alias — keep so existing imports don't break during migration
export const signToken = signAccessToken;
