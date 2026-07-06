-- Issue #5: JWT session revocation on credential change.
-- token_version is embedded in access + refresh tokens; it is incremented on
-- password change/reset, and a mismatch causes the token to be rejected,
-- invalidating every previously issued session for that user.
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
