import { prisma, Expense, ExpenseDocument, SpendPolicy, ExpenseStatus } from "@spendos/database";
import { AuditService } from "./audit";

export class PoliciesService {
  /**
   * Fetches the spend policy for a company.
   * If none exists, returns a default policy (0 means strict human review).
   */
  static async getPolicy(companyId: string): Promise<SpendPolicy | null> {
    return prisma.spendPolicy.findUnique({
      where: { company_id: companyId }
    });
  }

  /**
   * Evaluates if a submitted expense meets the auto-approval policy.
   * Does NOT execute the approval; only returns the evaluation result.
   */
  static async evaluateExpense(
    expense: Expense,
    documents: ExpenseDocument[],
    policy: SpendPolicy | null
  ): Promise<{ isAutoApproved: boolean; violations: string[] }> {
    if (!policy) {
      return { isAutoApproved: false, violations: ["No auto-approve policy active."] };
    }

    const violations: string[] = [];
    let isAutoApproved = true;

    // 1. Check auto-approve threshold
    if (policy.auto_approve_threshold > 0n) {
      if (expense.amount_paise > policy.auto_approve_threshold) {
        isAutoApproved = false;
        violations.push(`Amount exceeds auto-approve threshold (${(policy.auto_approve_threshold / 100n).toString()})`);
      }
    } else {
      isAutoApproved = false;
      violations.push("Auto-approval is disabled.");
    }

    // 2. Check receipt requirement
    if (policy.receipt_required_above > 0n && expense.amount_paise > policy.receipt_required_above) {
      if (documents.length === 0) {
        isAutoApproved = false;
        violations.push(`Receipt required for amounts above ${(policy.receipt_required_above / 100n).toString()}`);
      }
    }

    return { isAutoApproved, violations };
  }

  /**
   * Upsert the policy for a company
   */
  static async updatePolicy(
    actor: any,
    companyId: string,
    autoApproveThreshold: bigint,
    receiptRequiredAbove: bigint
  ): Promise<SpendPolicy> {
    const result = await prisma.spendPolicy.upsert({
      where: { company_id: companyId },
      update: {
        auto_approve_threshold: autoApproveThreshold,
        receipt_required_above: receiptRequiredAbove
      },
      create: {
        company_id: companyId,
        auto_approve_threshold: autoApproveThreshold,
        receipt_required_above: receiptRequiredAbove
      }
    });

    await AuditService.log({
      companyId,
      actorId: actor.userId,
      action: "policy_updated",
      targetType: "SpendPolicy",
      targetId: result.id,
      metadata: { autoApproveThreshold: autoApproveThreshold.toString(), receiptRequiredAbove: receiptRequiredAbove.toString() }
    });

    return result;
  }
}
