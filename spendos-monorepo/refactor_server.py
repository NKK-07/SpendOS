import re

with open('apps/api/src/server.ts', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Imports
imports = """import { AuditService } from "./services/audit";
import { sendEmail } from "./services/email";
import { generateUploadUrl } from "./services/s3";
import { requireBlackCard, requireAdminUp, requireManagerUp, requireEmployeeUp } from "./rbac";
"""
code = code.replace('import { EntryType, TransactionType } from "@prisma/client";', 
                    'import { EntryType, TransactionType } from "@prisma/client";\n' + imports)

# 2. writeAudit -> AuditService.log
code = re.sub(
    r'async function writeAudit\(\{[\s\S]*?\}\) \{[\s\S]*?\}',
    '',
    code
)
code = code.replace('writeAudit(', 'AuditService.log(')

# 3. Add sendEmail
# Forgot password
code = code.replace(
    '// TODO: send email with token (beta: log it)\n    fastify.log.info({ msg: "Password reset token", userId: user.id, token });',
    'await sendEmail({ to: user.email, subject: "Password Reset", html: `Your reset token is: ${token}` });'
)

# Invite
code = code.replace(
    '// TODO: send email with rawToken (beta: return it for testing)\n  fastify.log.info({ msg: "Invite token", email, rawToken });\n  return { message: "Invite sent", inviteToken: rawToken /* remove before prod */ };',
    'await sendEmail({ to: email, subject: "You are invited to SpendOS", html: `Your invite token is: ${rawToken}` });\n  return { message: "Invite sent" };'
)

# 4. Use RBAC middlewares
def add_prehandler(route_def, handler_name):
    return re.sub(
        rf'(fastify\.(?:post|patch|get)\("{route_def}",) async \(request, reply\) => {{',
        rf'\1 {{ preHandler: [{handler_name}] }}, async (request, reply) => {{',
        code
    )

code = add_prehandler('/users/:id/freeze', 'requireAdminUp')
code = code.replace('if (!ADMIN_UP.includes(actor.role)) return reply.status(403).send({ error: "Insufficient permissions" });', '')

code = add_prehandler('/users/:id/unfreeze', 'requireAdminUp')
code = add_prehandler('/users/:id/deactivate', 'requireAdminUp')
code = add_prehandler('/users/:id/reset-password', 'requireAdminUp')
code = add_prehandler('/company', 'requireAdminUp')
code = add_prehandler('/audit-log', 'requireAdminUp')

# For expenses, we have REVIEWER_ROLES which maps to requireManagerUp
code = add_prehandler('/expenses/:id/approve', 'requireManagerUp')
code = add_prehandler('/expenses/:id/reject', 'requireManagerUp')
code = add_prehandler('/expenses/:id/request-proof', 'requireManagerUp')
code = add_prehandler('/expenses/:id/mark-paid', 'requireManagerUp')
code = add_prehandler('/tickets/:id/resolve', 'requireManagerUp')

code = code.replace('if (!REVIEWER_ROLES.includes(actor.role)) return reply.status(403).send({ error: "Insufficient permissions" });', '')

# 5. S3 Routes: Upload URL & Confirm Upload
s3_routes = """
// GET /expenses/:id/upload-url
fastify.get("/expenses/:id/upload-url", async (request, reply) => {
  const actor = (request as any).user;
  const { id } = request.params as any;
  const { filename, contentType } = request.query as any;

  if (!filename || !contentType) return reply.status(400).send({ error: "filename and contentType required" });

  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense || expense.company_id !== actor.companyId) return reply.status(404).send({ error: "Expense not found" });
  if (expense.submitted_by !== actor.userId) return reply.status(403).send({ error: "Only the submitter can upload documents" });

  const s3Key = `companies/${actor.companyId}/expenses/${id}/${Date.now()}-${filename}`;
  const uploadUrl = await generateUploadUrl(s3Key, contentType);

  return { uploadUrl, s3Key };
});

// POST /expenses/:id/confirm-upload
fastify.post("/expenses/:id/confirm-upload", async (request, reply) => {
  const actor = (request as any).user;
  const { id } = request.params as any;
  const { s3Key, fileName, fileType, fileSize, docType } = request.body as any; // docType: "original" | "proof"

  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense || expense.company_id !== actor.companyId) return reply.status(404).send({ error: "Expense not found" });
  if (expense.submitted_by !== actor.userId) return reply.status(403).send({ error: "Only the submitter can confirm documents" });

  const documentType = docType === "proof" ? "proof" : "original";
  if (documentType === "proof" && expense.status !== "proof_requested") {
    return reply.status(400).send({ error: "Proof can only be uploaded when status is proof_requested" });
  }

  const document = await prisma.expenseDocument.create({
    data: {
      expense_id: id,
      company_id: actor.companyId,
      document_type: documentType,
      s3_key: s3Key,
      file_name: fileName,
      file_type: fileType,
      file_size_bytes: fileSize,
      uploaded_by: actor.userId,
    },
  });

  if (documentType === "proof") {
    await prisma.expense.update({ where: { id }, data: { status: "proof_submitted" } });
    const submitter = await prisma.user.findUnique({ where: { id: actor.userId }, select: { full_name: true } });
    const amountRupees = (Number(expense.amount_paise) / 100).toLocaleString("en-IN");
    await notifyReviewers(actor.companyId, "proof_submitted",
      `${submitter?.full_name} uploaded payment proof for their ₹${amountRupees} ${expense.category} expense.`, id);
  }

  return serializeBigInt(document);
});
"""

# Replace old /expenses/:id/documents with new S3 routes
code = re.sub(r'// POST /expenses/:id/documents — upload receipt or proof[\s\S]*?// GET /documents/:id/download — download an attached document', s3_routes + '\n\n// GET /documents/:id/download — download an attached document', code)

with open('apps/api/src/server.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print("Refactoring complete.")
