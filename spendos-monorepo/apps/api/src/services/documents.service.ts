import { prisma, ExpenseStatus } from "@spendos/database";
import { generateUploadUrl, generateDownloadUrl, s3Client, BUCKET_NAME } from "../services/s3";
import { NotificationsService } from "./notifications.service";
import { NotFoundError } from "../lib/errors";
import { PoliciesService } from "./policies.service";
import { AuditService } from "./audit";
import { ActivityService } from "./activity.service";
import * as fs from "fs";
import * as path from "path";
import { ForbiddenError, BadRequestError } from "../lib/errors";
import { HeadObjectCommand } from "@aws-sdk/client-s3";

export class DocumentsService {
  static async getUploadUrl(actor: any, id: string, filename: string, contentType: string) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense || expense.company_id !== actor.companyId) throw new NotFoundError("Expense not found");
    if (expense.submitted_by !== actor.userId) throw new ForbiddenError("Only the submitter can upload documents");

    const s3Key = `companies/${actor.companyId}/expenses/${id}/${Date.now()}-${filename}`;
    const uploadUrl = await generateUploadUrl(s3Key, contentType);

    return { uploadUrl, s3Key };
  }

  static async confirmUpload(actor: any, id: string, s3Key: string, fileName: string, fileType: string, fileSize: number, docType: string) {
    // Tenant + expense scoping. The upload key is server-authoritative: getUploadUrl
    // issues it as `companies/{companyId}/expenses/{id}/...`. confirmUpload must NOT
    // trust a client-supplied key that points outside the caller's own company/expense
    // path — otherwise a caller could register another tenant's object as their document
    // and later obtain a presigned download URL for it (cross-tenant disclosure).
    const expectedPrefix = `companies/${actor.companyId}/expenses/${id}/`;
    if (!s3Key.startsWith(expectedPrefix)) {
      throw new ForbiddenError("Access denied: s3Key does not match the authorized upload path for this expense.");
    }

    if (process.env.AWS_ACCESS_KEY_ID !== 'mock_access_key' && process.env.AWS_ACCESS_KEY_ID) {
      try {
        const s3Meta = await s3Client.send(new HeadObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key
        }));
        if (s3Meta.ContentLength !== fileSize) {
          throw new BadRequestError("File size mismatch. Upload verification failed.");
        }
      } catch (err: any) {
        if (err instanceof BadRequestError) throw err;
        throw new NotFoundError("File not found on S3 storage server.");
      }
    } else {
      try {
        const baseDir = path.resolve(process.cwd(), "uploads");
        const filePath = path.resolve(baseDir, decodeURIComponent(s3Key));
        if (!filePath.startsWith(baseDir + path.sep)) {
          throw new ForbiddenError("Access denied: Invalid file path traversal.");
        }
        const stats = await fs.promises.stat(filePath);
        if (stats.size !== fileSize) {
          throw new BadRequestError("File size mismatch. Upload verification failed.");
        }
      } catch (err) {
        if (err instanceof ForbiddenError || err instanceof BadRequestError) throw err;
        throw new NotFoundError("File not found on storage server.");
      }
    }

    const documentType = docType === "proof" ? "proof" : "original";
    const result = await prisma.$transaction(async (tx) => {
      const [expense]: any[] = await tx.$queryRaw`
        SELECT * FROM "expenses" WHERE id = ${id}::uuid FOR UPDATE
      `;
      if (!expense || expense.company_id !== actor.companyId) throw new NotFoundError("Expense not found");
      if (expense.submitted_by !== actor.userId) throw new ForbiddenError("Only the submitter can confirm documents");

      if (documentType === "proof" && expense.status !== "proof_requested") {
        throw new BadRequestError("Proof can only be uploaded when status is proof_requested");
      }

      const doc = await tx.expenseDocument.create({
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

      let isAutoApproved = false;

      if (documentType === "proof") {
        await tx.expense.update({ where: { id }, data: { status: "proof_submitted" } });
        const submitter = await tx.user.findUnique({ where: { id: actor.userId }, select: { full_name: true } });
        
        await tx.outboxEvent.create({
          data: {
            aggregate_type: "Expense",
            aggregate_id: id,
            event_type: "proof_submitted",
            payload: {
              companyId: actor.companyId,
              submitterName: submitter?.full_name,
              amountPaise: expense.amount_paise.toString(),
              category: expense.category
            }
          }
        });
      } else if (expense.status === "submitted") {
        // Re-evaluate auto-approval now that a receipt is attached
        const policy = await PoliciesService.getPolicy(actor.companyId);
        const allDocs = await tx.expenseDocument.findMany({ where: { expense_id: id } });
        const evaluation = await PoliciesService.evaluateExpense(expense as any, allDocs, policy);
        isAutoApproved = evaluation.isAutoApproved;
        
        if (isAutoApproved) {
          await tx.expense.update({
            where: { id: expense.id },
            data: {
              status: ExpenseStatus.approved,
              reviewed_at: new Date()
            }
          });
          
          await tx.outboxEvent.create({
            data: {
              aggregate_type: "Expense",
              aggregate_id: id,
              event_type: "expense_approved",
              payload: { 
                actorId: actor.userId, 
                companyId: actor.companyId, 
                submittedBy: expense.submitted_by, 
                amountPaise: expense.amount_paise.toString(), 
                category: expense.category 
              }
            }
          });
        }
      }
      return { doc, isAutoApproved, expenseId: expense.id };
    });

    if (result.isAutoApproved) {
      await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "expense_auto_approved", targetType: "Expense", targetId: result.expenseId });
      // Auto-approval on receipt upload changes velocity + pending counts; evict
      // both the company and submitter pulse entries. Only the submitter can
      // confirm an upload, so actor.userId is the submitter.
      await ActivityService.invalidatePulse(actor.companyId, actor.userId);
    }

    return result.doc;
  }

  static async downloadDocument(actor: any, id: string): Promise<{ downloadUrl: string }> {
    const document = await prisma.expenseDocument.findUnique({
      where: { id },
      include: { expense: true }
    });

    // Tenant Gating
    if (!document || document.company_id !== actor.companyId) {
      throw new NotFoundError("Document not found");
    }

    // Role-based Ownership Gating: Employees can only view their own submissions
    const REVIEWER_ROLES = ["PRINCIPAL", 'ADMIN', 'MANAGER'];
    const isReviewer = REVIEWER_ROLES.includes(actor.role);
    if (!isReviewer && document.expense.submitted_by !== actor.userId) {
      throw new ForbiddenError("Access denied: You do not have permission to download this receipt.");
    }

    const downloadUrl = await generateDownloadUrl(document.s3_key, document.file_name);
    return { downloadUrl };
  }
}
