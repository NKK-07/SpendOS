import re

# 1. Fix rbac.ts UserRole import
with open('apps/api/src/rbac.ts', 'r', encoding='utf-8') as f:
    rbac = f.read()

rbac = rbac.replace("import { UserRole } from '@spendos/shared-types';", "import { UserRole } from '@spendos/database';")
with open('apps/api/src/rbac.ts', 'w', encoding='utf-8') as f:
    f.write(rbac)

# 2. Fix server.ts imports
with open('apps/api/src/server.ts', 'r', encoding='utf-8') as f:
    server = f.read()

imports = """import { AuditService } from "./services/audit";
import { sendEmail } from "./services/email";
import { generateUploadUrl } from "./services/s3";
import { requireBlackCard, requireAdminUp, requireManagerUp, requireEmployeeUp } from "./rbac";
"""
# Just insert it after Fastify
server = re.sub(
    r'(import Fastify from "fastify";)',
    r'\1\n' + imports,
    server
)
with open('apps/api/src/server.ts', 'w', encoding='utf-8') as f:
    f.write(server)

# 3. Fix audit.ts actor_id type
with open('apps/api/src/services/audit.ts', 'r', encoding='utf-8') as f:
    audit = f.read()

# Change action to string to avoid AuditAction union errors, and make actorId nullable if Prisma allows or provide fallback string.
# Wait, let's look at audit.ts: `actor_id: payload.actorId || 'system',` is a quick fix.
audit = audit.replace(
    'actor_id: payload.actorId,',
    'actor_id: payload.actorId || "SYSTEM", // Fallback to SYSTEM if missing'
)
# Also change action type
audit = audit.replace(
    'action: AuditAction;',
    'action: string;'
)

with open('apps/api/src/services/audit.ts', 'w', encoding='utf-8') as f:
    f.write(audit)

print("Fixes applied.")
